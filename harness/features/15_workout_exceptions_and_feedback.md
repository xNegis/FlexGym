# F15 — Workout Exceptions and Feedback

## Objective

Allow the user to skip the current set or the remaining work of the current exercise during an
active workout, optionally record a structured reason and note, and undo that decision while the
workout remains active.

F15 extends F14/F14.2's recoverable execution timeline. A skip is not represented as performed
work and is never removed from history: the current exception projection may be reversed, while
the original skip and its reversal remain timestamped observed events.

## Context

F14 introduced immutable workout prescriptions, structured performed-set facts, and an ordered,
append-only event timeline. F14.2 added explicit set starts and separated observed set time from
rest. The current workflow can only perform every prescribed set or cancel the entire workout.

Real sessions also contain smaller exceptions. A user may lack time, become too fatigued, find the
equipment unavailable, or be unable to perform a specific set or exercise. Recording these as
structured facts preserves the distinction between:

* Work that was planned.
* Work that was performed.
* Work that was deliberately skipped.
* An earlier skip that the user later reversed.

Pain and discomfort are intentionally excluded because F16 records them independently whether the
user continues or stops. F15 reasons must therefore not attempt to encode body area, pain
intensity, or medical interpretation.

## User Experience

### Skip the current set

The current set screen exposes `Skip set` as a secondary action in both
`awaiting_set_start` and `set_in_progress`.

Selecting it opens a focused dialog that identifies the exercise and set. The user may confirm
immediately with no feedback, or optionally select one reason:

* `Not enough time`
* `Too fatigued`
* `Equipment unavailable`
* `Unable to perform`
* `Other`

An optional details field permits concise context. Selecting `Other` requires non-empty details so
that it does not become an unstructured empty category. Not selecting a reason is always valid and
does not require details.

Confirmation records the skip at server time. The next unresolved set becomes
`awaiting_set_start`; if no set remains, the exercise is resolved and the normal transition to the
next exercise begins. On the final exercise, the workout overview shows that all sets are resolved,
while workout completion remains assigned to F17.

Any unconfirmed adjustment draft for work covered by a successful skip is discarded. It remains
available if the skip request fails.

If the set had already started, the skip closes that active attempt. The timeline retains the
`set_started` and `set_skipped` timestamps, but creates no `PerformedSet`. Their interval may later
be described as time until the set was skipped; it must not be labelled observed set time or
performed duration.

### Skip the current exercise

`Skip exercise` is a secondary action before an exercise starts and while it is active. It uses the
same optional reason and details dialog and identifies that all remaining sets will be skipped.

Already performed sets remain performed. Existing set-level skips remain intact. One
exercise-level exception resolves every remaining unresolved set without creating one artificial
event per set. The timeline records a single `exercise_skipped` observation at the time the user
made the decision.

After confirmation, the next-exercise transition begins from the exercise-skip timestamp and shows
`Start next exercise` as the sole dominant action. The existing transition timer and the skipped
exercise's snapshotted transition threshold continue to behave as in F14.2. Skipping the final
exercise returns to the workout overview in the all-resolved state.

The first or next unstarted exercise may be skipped without first inventing `exercise_started` or
`set_started` events.

### Undo a skip

While the workout remains active, skipped set and exercise summaries expose `Undo skip` as a
secondary action. The transition immediately following a skip also keeps this recovery action
available without competing with `Start next exercise`.

Undoing a set skip makes that set unresolved again. Undoing an exercise skip restores only the
remaining work covered by that exercise-level exception; previously performed sets and independent
set-level skips do not change.

An undone set that belongs to an already started exercise returns to `awaiting_set_start` and
requires a new `set_started` event before completion. A previously unstarted exercise remains
unstarted. An earlier start is never reused after a skip.

Undo appends a separate reversal event and retains the original exception and reason. Resume then
returns to the earliest unresolved set or exercise in canonical order, consistent with F14's
`Mark incomplete` correction behaviour.

### Timeline and interruption recovery

Every skip and reversal receives a contiguous workout-event sequence and server UTC timestamp.
Refresh, browser Back, screen locking, primary navigation, and app switching reconstruct the same
effective skipped/resolved state from persisted data.

F15 exposes the exception context with the workout timeline so F18 can later render chronological
workout history without guessing or inspecting mutable plan data. F15 does not add the completed
workout history destination itself.

## Functional Requirements

### FR-1 — Structured workout exception

Persist an immutable `WorkoutException` for each confirmed skip. It contains:

* Application-generated identity.
* Required owning workout and workout-exercise references.
* Optional workout-planned-set reference for set scope.
* Scope `set` or `exercise`.
* Optional supported reason code.
* Optional trimmed note.
* Required server-generated UTC `occurred_at`.

Set scope requires a planned-set reference belonging to the referenced exercise and workout.
Exercise scope forbids a planned-set reference. An exception is never a performed-set fact and
never mutates the immutable workout prescription.

### FR-2 — Optional structured feedback

Supported reason codes are:

* `not_enough_time`
* `too_fatigued`
* `equipment_unavailable`
* `unable_to_perform`
* `other`

Reason and note are independently optional except that `other` requires a non-empty note. Empty or
whitespace-only notes normalize to `null` when no `other` reason is selected. F15 does not infer a
reason from timing, performance, profile limitations, or earlier events.

### FR-3 — Typed append-only events

Extend `WorkoutEvent` with:

* `set_skipped`
* `set_skip_reverted`
* `exercise_skipped`
* `exercise_skip_reverted`

Each event references the immutable `WorkoutException` to which it belongs. Skip events use the
same timestamp as `WorkoutException.occurred_at`. Reversal events receive their own server
timestamp. Events remain immutable, contiguous, and free of arbitrary JSON payloads.

Set event types require matching exercise, planned-set, and set-scoped exception references.
Exercise event types require an exercise reference, no planned-set reference, and an
exercise-scoped exception. All references must belong to the event's workout.

### FR-4 — Effective exception projection

An exception is active after its skip event and inactive after its first matching reversal event.
This effective state is derived from the ordered timeline; it is not accepted from clients or
stored as a mutable status flag.

Only one active exception may resolve a specific set. An active exercise exception covers its
remaining unperformed sets except those already resolved by their own active set exception.
Duplicate skip or reversal actions return a deliberate conflict and append no event.

### FR-5 — Set skip lifecycle

Only the earliest unresolved set of the current exercise may be skipped. It may be in
`awaiting_set_start` or `set_in_progress`, but it must not have a current performed projection or
already be covered by an active exception.

Confirmation creates the exception and appends `set_skipped` atomically. A `set_skipped` event
closes any preceding unmatched `set_started`; it never creates performance. Failure persists
neither record.

If another unresolved set remains in the exercise, that set becomes current in
`awaiting_set_start`. If none remains, the exercise becomes resolved and either the transition or
all-resolved overview follows.

### FR-6 — Exercise skip lifecycle

The next unresolved exercise may be skipped before it starts or after it starts. The operation
preserves performed sets and existing set exceptions and covers every remaining unresolved set in
that exercise.

Confirmation creates one exercise-scoped exception and appends one `exercise_skipped` event
atomically. It does not create per-set exception rows, performed projections, `set_completed`, or
`exercise_completed` events. If a set was in progress, the exercise skip closes that active attempt
without inventing a performed result.

An already resolved exercise, a later exercise while an earlier exercise remains unresolved, or an
exercise with an active exercise exception cannot be skipped again.

### FR-7 — Reversal

Only an active exception in an owned active workout may be reversed. Reversal appends the matching
typed event atomically and leaves the immutable `WorkoutException` row in place.

Reversal never restores an earlier unmatched set start. Restored work follows the normal F14.2
start lifecycle. Reversing an earlier exception may move current/resume progress backward while
retaining valid later performed facts and timeline events, as already permitted by F14 correction.

### FR-8 — Resolved progress

Extend progress derivation to distinguish performed and skipped work:

* `completed_set_count` continues to count only current performed projections.
* `skipped_set_count` counts planned sets covered by an active set or exercise exception.
* `total_set_count` remains the immutable planned total.
* `all_sets_recorded` remains true only when every set has performance, for compatibility and
  factual accuracy.
* `all_sets_resolved` is true when every planned set is either performed or actively skipped.

Current exercise, current set, transition, and resume derive from the earliest unresolved work.
Workflow decisions must use `all_sets_resolved`, not `all_sets_recorded`. A set cannot be both
performed and effectively skipped.

Each exercise exposes performed, skipped, and total counts, `is_resolved`, and derived execution
status: `pending`, `in_progress`, `completed`, `partial`, or `skipped`. `completed` means every set
was performed; `skipped` means none was performed; `partial` means the resolved exercise contains
both performed and skipped sets.

### FR-9 — Timing preservation

All skip and reversal times come from server UTC and appear in the ordered timeline. No client
submits elapsed time.

For a set skipped after start, the latest effective `set_started` and `set_skipped` timestamps close
that attempt. The interval is not attached to a `PerformedSet` and does not contribute to observed
performed-set duration.

An exception that resolves an exercise establishes the transition start timestamp. If a later
reversal makes the exercise unresolved, the old transition remains historical but is no longer the
effective live transition. Re-resolving the exercise establishes a new effective timestamp.

### FR-10 — Existing behaviour preservation

Preserve F14/F14.2 workout snapshots, explicit starts, performed-set creation and editing,
`Mark incomplete`, instructions, timers, server offset, cancellation, ownership isolation, and
malformed-response protection.

Skipping and undoing never change routine configuration, workout snapshot targets, previously
performed values, or unrelated exception facts.

### FR-11 — Request safety

Skip and reversal controls prevent duplicate submission. Confirmed state changes only after a
strictly validated complete-workout response. Failure keeps the dialog selections, current timer,
adjustment draft, and prior confirmed workout available for retry.

Frontend API boundaries validate reason codes, notes, exception scopes, expanded progress, exercise
status, planned-set exception projections, and all new event types. Unexpected or malformed bodies
produce a safe generic error and never advance the workflow locally.

## Domain / Data Requirements

Add `WorkoutException` as the immutable structured fact described in FR-1. It belongs to the
workout snapshot and cascades only with its owning workout. Nested exercise/set references must not
allow plan changes or performed-set deletion to remove it.

Add a nullable `workout_exception_id` reference to `WorkoutEvent` and expand its event-type check
constraint. Existing event rows retain a null exception reference. Service validation enforces the
event-specific reference and ownership rules that cannot be expressed portably through simple
checks.

No performed value, skipped count, resolved flag, current cursor, reason label, duration, or
reversal status is stored redundantly. Reasons use stable internal codes; English labels are
frontend content.

The migration does not backfill exceptions or skip events. Existing F14.2 workouts retain their
current progress and timeline exactly and derive `skipped_set_count: 0`.

## API Requirements

All endpoints require authentication. IDs and positions are strict positive integers; booleans are
invalid. Bodies reject unknown fields. Unknown and inaccessible resources remain indistinguishable.

### Exception request

Both skip endpoints accept the same strict body. An empty object is valid:

```json
{}
```

Optional structured feedback is submitted as:

```json
{
  "reason_code": "equipment_unavailable",
  "note": "Cable station occupied"
}
```

Both properties default to `null`; explicit null is also accepted. `other` requires a non-empty
note. Reversal endpoints accept no body.

### Extended planned-set representation

Each planned set adds an active nullable exception projection:

```json
{
  "position": 2,
  "performance": null,
  "exception": {
    "scope": "set",
    "reason_code": "too_fatigued",
    "note": null,
    "occurred_at": "2026-08-14T10:22:05Z"
  }
}
```

A set covered by an exercise-level exception exposes the same projection with `scope: "exercise"`.
After reversal, `exception` is null unless another active exception still covers the set.

Each workout exercise additionally exposes `skipped_set_count`, `is_resolved`,
`execution_status`, and its nullable active exercise-level `exception`.

The workout root adds:

```json
{
  "completed_set_count": 6,
  "skipped_set_count": 2,
  "total_set_count": 12,
  "all_sets_recorded": false,
  "all_sets_resolved": false
}
```

### Extended timeline representation

Skip and reversal events expose their immutable structured context:

```json
{
  "sequence": 9,
  "event_type": "set_skipped",
  "exercise_position": 2,
  "set_position": 3,
  "occurred_at": "2026-08-14T10:22:05Z",
  "exception": {
    "scope": "set",
    "reason_code": "too_fatigued",
    "note": null
  }
}
```

Existing events return `"exception": null`. A reversal event returns the same exception context
and its own `occurred_at`, allowing F18 to show both observations chronologically.

### `POST /api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/skip`

Returns:

* `200` with the complete updated workout.
* `404 {"detail":"Workout not found"}` for unknown or inaccessible workout.
* `404 {"detail":"Workout set not found"}` when positions do not resolve.
* `409 {"detail":"Workout is not active"}` when mutation is unavailable.
* `409 {"detail":"Exercise has not been started"}` when the exercise is not current/started.
* `409 {"detail":"Workout set is not current"}` for a later unresolved set.
* `409 {"detail":"Workout set is already complete"}` when performance exists.
* `409 {"detail":"Workout set is already skipped"}` when already covered by an exception.
* `422` for invalid paths or feedback body.
* `401` when unauthenticated.

### `DELETE /api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/skip`

Returns `200` with the complete updated workout, the documented ownership-safe `404` outcomes,
`409 {"detail":"Workout is not active"}`, or
`409 {"detail":"Workout set is not skipped"}`. It accepts no body.

Only a set-scoped active exception can be reversed through this endpoint. A set covered by an
exercise-level exception must use the exercise reversal endpoint.

### `POST /api/workouts/{workout_id}/exercises/{exercise_position}/skip`

Returns:

* `200` with the complete updated workout.
* The documented workout/exercise ownership-safe `404` outcomes.
* `409 {"detail":"Workout is not active"}` when mutation is unavailable.
* `409 {"detail":"Exercise cannot be skipped yet"}` when an earlier exercise is unresolved.
* `409 {"detail":"Exercise is already resolved"}` when no work remains.
* `409 {"detail":"Exercise is already skipped"}` for an active exercise exception.
* `422` for invalid paths or feedback body.
* `401` when unauthenticated.

### `DELETE /api/workouts/{workout_id}/exercises/{exercise_position}/skip`

Returns `200` with the complete updated workout, the documented ownership-safe `404` outcomes,
`409 {"detail":"Workout is not active"}`, or
`409 {"detail":"Exercise is not skipped"}`. It accepts no body.

## UI Requirements

F15 follows `harness/context/07_UI_DESIGN_SYSTEM.md` and adds no local visual language.

### Actions and hierarchy

The existing state-specific action remains the sole dominant action: `Start set N`, `Next set`,
`Finish exercise`, or `Start next exercise`. `Skip set`, `Skip exercise`, and `Undo skip` use
secondary or ghost treatment and never danger styling.

Reuse `Button`, `Card`, `Badge`, `Dialog`, `Field`, `Select`, `TextArea`, `Alert`, `LoadingState`,
and existing responsive workout compositions. No new shared primitive is required.

Skipped state is explicit through text such as `Skipped`, optional reason labels, and an icon where
useful; color is not its only cue. A partially completed exercise is labelled `Partial`, not
`Completed`.

### Skip dialog

The dialog:

* Names the set or exercise being skipped.
* Explains that exercise skip applies only to remaining sets.
* Makes the reason visibly optional.
* Shows a short optional details field.
* Requires details only when `Other` is selected.
* Uses `Keep set` / `Keep exercise` and `Skip set` / `Skip exercise` actions.
* Keeps entered values and an inline error after a failed request.

Opening or cancelling the dialog records nothing. Escape and Browser Back close the dialog safely,
restore focus to the trigger, and do not skip work. Successful confirmation moves focus to the next
set, transition heading, or all-resolved heading.

### Skipped and undo states

Compact set summaries distinguish performed, skipped, current, and upcoming work. Active exception
feedback is shown when present but an absent reason does not produce an empty placeholder.

Undo is available from the affected set/exercise summary and immediately following transition. It
uses a pending label `Undoing…`, prevents duplicates, and requires no confirmation because it
restores planned work. Failure preserves the skipped state and returns focus to `Undo skip`.

### Overview and availability

The workout overview reports performed and skipped counts separately. When every set is performed
or skipped, it shows `All sets resolved`; it must not claim `All sets recorded` or `Workout
complete` when skips exist. F17 remains responsible for workout completion.

Cancelled, inaccessible, stale, and malformed-response states remain read-only/recoverable. A
cancelled workout displays persisted skipped states and timeline data but no skip or undo actions.

### Responsive and accessible behaviour

Validate awaiting and in-progress set skips, unstarted and partial exercise skips, both undo paths,
the skip dialog, transition, and all-resolved overview at 360 px, 390 px, 430 px, representative
tablet/small desktop, and wide desktop widths.

Support keyboard operation, visible focus, 44-pixel targets, 48–56-pixel dominant workout actions,
safe areas, 200% zoom, reduced motion, and the on-screen keyboard without document-level horizontal
overflow. Dialog fields have labels and described-by relationships; pending and error states are
announced without repeatedly announcing timers.

## Business Rules

* A reason is optional for every skip.
* `other` is valid only with non-empty details.
* Pain and discomfort are not F15 reason categories.
* Only the earliest unresolved set may be skipped individually.
* The current exercise may be skipped before start or after partial performance.
* Exercise skip preserves performed sets and resolves only remaining work.
* A skip never creates or implies performed values.
* A skipped in-progress set or exercise closes the active attempt without reusing its start later.
* Set and exercise skips are separate structured facts and typed events.
* Exercise skip emits one exercise event rather than fabricated events for every remaining set.
* Undo changes effective progress but never deletes the original exception or timeline event.
* A reversed exception requires normal explicit-start behaviour before restored work can complete.
* Performed and skipped counts are mutually exclusive and never exceed the planned total.
* All-resolved does not complete the workout in F15.
* All timestamps and event sequences remain server-owned.
* No timer tick, derived duration, progress count, or current cursor is persisted.
* Planning records and workout snapshots remain immutable.

## Validation

* Scope accepts only `set` or `exercise` internally and matches its references.
* Reason accepts only the supported code or null.
* Note is null or trimmed text of at most 500 characters.
* `other` requires a non-empty note; other reasons and no reason permit a null note.
* Paths use strict positive integers and reject booleans.
* Bodies reject unknown fields and invalid types.
* Exception, exercise, planned set, event, and workout references share one owning workout.
* A set cannot simultaneously have performance and an active exception.
* An exception has exactly one skip event and at most one reversal event.
* Failed skip, reversal, start, completion, correction, or cancellation leaves exceptions,
  performance, timeline, and active association atomically unchanged.

Migration validation must include:

* Applying the complete history to a fresh isolated database and verifying the exception table,
  constraints, foreign keys, cascades, new event types, and existing F14/F14.2 data.
* Creating an isolated database at previous head `f14_2_set_started`, with representative active,
  partial, all-recorded, corrected, transitioned, and cancelled workouts, then applying F15.
* Verifying existing timeline sequences, performed sets, observed timing, current phases, and resume
  destinations remain unchanged and expose zero skips.
* Exercising real authenticated set skip, in-progress skip, exercise skip, reversal, resume,
  transition, completion enforcement, and cancellation flows against the upgraded database.
* Comparing `alembic current` and `alembic heads` for the configured local database and safely
  upgrading it before reporting F15 locally operational.
* Confirming the supported migration command can be rerun without duplicate schema objects,
  exceptions, or events.

Schemas created directly from ORM metadata do not satisfy this migration gate.

## Acceptance Criteria

* [ ] The user can skip the current awaiting or in-progress set without recording performance.
* [ ] Skipping an in-progress set preserves its start and skip timestamps and closes that attempt.
* [ ] The user can skip an unstarted or partially performed current exercise while preserving
  performed sets.
* [ ] Set skip advances to the next unresolved set or exercise transition.
* [ ] Exercise skip creates one exercise exception/event and resolves its remaining sets.
* [ ] The user may omit both reason and details and still confirm a skip.
* [ ] Supported reasons and optional notes persist as structured data.
* [ ] Selecting `Other` without details is rejected while preserving the dialog.
* [ ] Pain/discomfort fields or reason categories are not introduced.
* [ ] Every skip and reversal appears in chronological timeline order with a server timestamp and
  its immutable optional feedback.
* [ ] Undo restores covered work without deleting historical exception data or reusing a set start.
* [ ] Performed, skipped, total, all-recorded, and all-resolved projections remain internally
  consistent after skip, reversal, correction, and refresh.
* [ ] Transition timing derives from the latest event that effectively resolves the exercise.
* [ ] All-resolved overview distinguishes skipped work and does not complete the workout.
* [ ] Failed, duplicate, stale, foreign, cancelled, and malformed requests do not partially mutate
  or lose the current UI context.
* [ ] Existing explicit set start, completion, adjustment, edit, mark-incomplete, timers,
  instructions, cancellation, Today, and resume flows retain their documented behaviour.
* [ ] Changed UI satisfies responsive, keyboard, focus, touch, safe-area, zoom, reduced-motion, and
  overflow requirements.
* [ ] Fresh/upgrade migrations, real migrated-database flows, automated checks, and focused manual
  UI validation pass.

## Tests

Backend tests cover:

* Awaiting and in-progress current-set skip, including no performed projection and active-start
  closure.
* Non-final and final set skip deriving the next awaiting set, exercise transition, or all-resolved
  state.
* Unstarted, active, and partially performed exercise skip with one exception/event and preserved
  performance.
* Empty feedback, each stable reason collectively, optional note normalization, and `other`
  validation through representative cases rather than one test per enum value.
* Set and exercise reversal retaining immutable history and requiring a new set start when
  applicable.
* Reversing an earlier skip after later progress and deriving the earliest unresolved resume state.
* Performed/skipped/total counts, exercise execution status, all-recorded, and all-resolved
  invariants.
* Timeline ordering and timestamp equality between exception and skip event; reversal timestamp and
  immutable feedback retention.
* Exercise transition timing after skip and after skip/reversal/re-resolution using fixed
  timestamps without sleeps.
* Conflicts for later, completed, already-skipped, already-reversed, and exercise-covered sets,
  grouped proportionally.
* Ownership, active association, cancellation, invalid paths, strict bodies, and combined
  unauthenticated coverage for new endpoints.
* Migration upgrade preserving F14.2 workouts and real authenticated skip/reversal flows on the
  upgraded database.

Frontend static validation and focused inspection verify strict exception/event parsing, optional
feedback bodies, resolved-progress invariants, action visibility, normalized errors, draft/timer
preservation, and absence of pain/discomfort UI. Do not add a new test runner solely for F15.

Focused manual UI validation covers:

* Set skip before and after start, with no reason, a predefined reason, note, and `Other`
  validation.
* Exercise skip before start and after partial performance.
* Immediate transition, all-resolved overview, refresh, navigation away/back, and resume.
* Set and exercise undo, including required restart and later-progress correction.
* Pending, duplicate/stale conflict, unexpected failure, malformed response, inaccessible workout,
  and cancelled read-only states.
* Dialog focus containment/restoration, keyboard operation, touch targets, status without color,
  200% zoom, safe areas, reduced motion, and on-screen keyboard access.
* No overflow at 360, 390, and 430 px plus representative tablet and wide desktop inspection.

In accordance with DEC-019, F15 adds no Playwright or other automated end-to-end tests.

## Out of Scope

* Pain or discomfort area, intensity, sensation, effect, continuation decision, or medical advice
  (F16).
* Workout completion, completion timestamp, immediate summary, or final duration (F17).
* Completed/cancelled workout browsing and chronological history UI (F18).
* Exercise substitution, adding/removing/reordering snapshot work, changing the plan, or editing a
  skip reason after confirmation.
* Rest skip/extension controls, active-set pause/resume, notifications, sound, vibration, sensors,
  wearables, or offline writes.
* Analytics, derived adherence signals, adaptations, recommendations, or AI interpretation.

## Dependencies

* F14 — Live Workout Timeline and Set Tracking.
* F14.2 — Explicit Set Start and Accurate Set Timing.

## Notes

Keep exception facts separate from `PerformedSet`. A skipped set has no performance, and a missing
performance alone is insufficient because it cannot distinguish pending from deliberately skipped.

Retain exceptions after reversal and connect timeline events through explicit relational
references. Do not place reason/note data in arbitrary event JSON and do not delete history to make
the current projection easier to query.

Use `all_sets_resolved` for forward execution and reserve `all_sets_recorded` for the factual
all-performed condition. This prevents F17/F18 from later having to reinterpret an established
field whose name no longer matches its meaning.
