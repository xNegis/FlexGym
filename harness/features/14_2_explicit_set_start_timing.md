# F14.2 — Explicit Set Start and Accurate Set Timing

## Objective

Correct F14's live set lifecycle so the user explicitly starts every set and confirms it only after
performing it. This separates rest from active work, prevents an accidental `Next set` during the
rest period, and gives FlexGym an observed start and completion timestamp for each performed set.

F14.2 is a corrective follow-up to F14, not the next Phase 2 product area. It supersedes F14 wherever
F14 states or implies that a set becomes active immediately after the preceding set is completed,
that rest does not gate set start, or that one interaction per set is sufficient.

The intended interaction is:

```text
Start set 1 ───────────── S1
    user performs set 1
Next set / Finish exercise ── C1

    rest timer for set 2

Start set 2 ───────────── S2
    user performs set 2
Next set / Finish exercise ── C2
```

The application can now derive observed set duration as `C2 - S2` and observed rest as `S2 - C1`.
It still cannot measure individual repetition timing or guarantee that the user physically began
or ended at precisely the declared instants.

## Context

F14 introduced immutable workout prescriptions, performed-set projections, a typed append-only
timeline, set-rest countdowns, exercise-transition timers, corrections, and interruption recovery.
Its implemented state machine incorrectly presents the next incomplete set and `Next set`
immediately after completion of the preceding set, while also showing the rest timer. Pressing that
button records the next set even though the user has not declared that they started it.

The faulty flow is:

```text
Complete set 1
→ rest countdown and set 2 shown
→ Next set remains available
→ pressing it completes set 2 without a set-start observation
```

F14.2 replaces it with explicit phases:

```text
awaiting_set_start
→ set_in_progress
→ awaiting_set_start for the next set
→ exercise_transition after the final set
```

The existing F14 distinction between facts, events, and derived state remains valid. F14.2 adds a
`set_started` observation and makes set lifecycle a first-class invariant.

## User Experience

### Starting the first exercise and first set

The workout overview retains `Start first exercise` as its sole primary action. To avoid two
consecutive start screens, this action atomically starts both the first exercise and its first set,
appending `exercise_started` followed by `set_started` with the same server timestamp. It then opens
the first exercise in `set_in_progress` state.

The user sees the prescription and performs the set. No rest timer is shown because no preceding
set exists. When finished, they use:

* `Next set` when another set remains in the exercise.
* `Finish exercise` for the final set.

The execution route may still expose `Start exercise` as recovery for a valid unstarted exercise
URL, but that action also starts its first incomplete set atomically. The normal overview flow does
not require a second start tap.

### Completing a non-final set

`Next set` confirms only the currently in-progress set. It records the performed values and appends
`set_completed`. It does not start or complete the next set.

The screen then enters `awaiting_set_start` for the next set and shows:

1. `Set 2 of 4` and its prescription.
2. The rest timer derived from the previous set completion and planned rest.
3. `Start set 2` as the sole primary action.
4. `Adjust set` as a secondary action, when adjustment before starting is useful.

`Next set` and `Finish exercise` are absent in this phase. The user cannot complete set 2 until
`Start set 2` has succeeded.

### Set-rest timer and start

When planned set rest is positive, the timer counts down and then continues as warning-treated
`+M:SS`. The timer never starts the set automatically and never blocks `Start set 2`; the user may
begin earlier or later than planned.

When planned set rest is zero, the screen immediately shows `+0:00`. When it is `null`, no timer is
shown, but `Start set 2` remains required.

Pressing `Start set 2`:

* Appends `set_started` using server UTC time.
* Ends the observed rest interval.
* Switches the UI to `set_in_progress`.
* Removes the rest timer and start action.
* Keeps the set prescription visible.
* Shows `Next set` or `Finish exercise` as appropriate.
* Does not show an ascending active-set timer; the start timestamp remains an internal fact for
  later history and analytics.

The action does not persist performed values and does not complete the set.

### Active set timing

While a set is in progress, do not show an elapsed timer. The execution surface shows only the set
position, prescription, applied draft adjustments, help and lifecycle actions. This avoids asking
the user to monitor the phone while performing the set.

The persisted `set_started` timestamp still survives refresh and remains available for deriving the
observed duration after completion. No timer ticks are persisted or rendered.

When the user confirms the set, its observed duration is derived from the effective `set_started`
and `set_completed` timestamps. The duration is labelled `Observed set time` in later history or
analytics. It must not be presented as measured repetition tempo or sensor-verified work time.

### Adjusting and completing

The user may open `Adjust set` during `awaiting_set_start` or `set_in_progress`. Planned values remain
prefilled. Saving adjustments before start affects only local editable state; performed values are
persisted when the set is completed.

If the adjustment surface is currently designed as completion-on-save, F14.2 must change it. The
dialog action becomes `Apply adjustments`, closes back to the same lifecycle phase, and does not
append `set_completed`. The dominant lifecycle action remains `Start set N`, `Next set`, or
`Finish exercise` on the main execution screen.

When completion succeeds, the submitted values use `adjusted`; otherwise the backend copies the
plan using `as_planned`.

### Final set and exercise transition

`Finish exercise` is available only while the final incomplete set is `set_in_progress`. It
atomically appends `set_completed` and `exercise_completed` with the same server timestamp.

The existing exercise-transition flow then applies unchanged:

* Open-ended ascending timer from exercise completion.
* Warning color and status icon after the previous exercise's planned transition threshold.
* No visible overtime explanatory text.
* `Start next exercise` as the sole primary action.

`Start next exercise` atomically appends `exercise_started` and `set_started` for the next
exercise's first incomplete set using the same timestamp. The next exercise therefore opens
directly in `set_in_progress`, without another `Start set 1` screen.

### Corrections

Editing a completed set continues to update its current performed projection and append
`set_updated`; it does not change the historical set-start or set-completion timestamps.

`Mark incomplete` removes its performed projection and appends `set_marked_incomplete`. The set then
requires a new start before it can be completed again. Starting the reopened set appends another
`set_started`; completing it appends another `set_completed`. The most recent unmatched start and
subsequent completion form the current effective timing interval, while the full timeline retains
the earlier observations.

If a currently in-progress set is marked incomplete through a future capability, that lifecycle
requires a separate abandonment event. F14.2 does not introduce that action; `Mark incomplete`
continues to apply only to completed sets.

### Refresh, navigation, and resume

Refresh, screen locking, app switching, browser Back, and primary navigation preserve confirmed
state.

Resume destinations are derived as follows:

* Before the first exercise starts: workout overview.
* During `awaiting_set_start`: the exercise containing that set.
* During `set_in_progress`: the exercise containing that set.
* During exercise transition: the completed exercise's transition screen.
* After all sets are recorded: workout overview.

Returning to an awaiting set reconstructs the rest timer. Returning to an in-progress set restores
the prescription and lifecycle actions without an elapsed timer. Refresh never turns one phase into
the other.

## Functional Requirements

### FR-1 — Set-start timeline event

Add `set_started` to the supported `WorkoutEvent` types. It requires both workout-exercise and
workout-planned-set references belonging to its owning workout.

It records a server-generated UTC timestamp and participates in the same append-only, contiguous
per-workout sequence as existing F14 events. It has no arbitrary JSON payload.

### FR-2 — Derived set lifecycle

For the earliest incomplete set of the current started exercise, derive exactly one phase:

* `awaiting_set_start` when it has no effective unmatched `set_started` event.
* `set_in_progress` when its latest relevant lifecycle event is `set_started`.

A `set_completed` closes the latest start. `set_marked_incomplete` reopens the set but does not
reuse its previous start. A subsequent start creates a new timing attempt.

Lifecycle phase is not stored as a mutable status column or client-owned cursor.

### FR-3 — Atomic exercise and first-set start

Starting an exercise appends, in order and in one transaction:

1. `exercise_started`.
2. `set_started` for its earliest incomplete set.

Both use the same server timestamp. Failure appends neither. Normal forward flow starts an exercise
only after all previous exercises are complete.

### FR-4 — Start subsequent set

An authenticated owner may start only the earliest incomplete set of the current started exercise
when its derived phase is `awaiting_set_start`.

Starting appends `set_started` and returns the complete updated workout. It does not create or update
a performed-set row. Duplicate start returns a deliberate conflict without appending an event.

### FR-5 — Completion requires an active start

Creating performance for an incomplete set is permitted only when that set is the earliest
incomplete set of the current exercise and its phase is `set_in_progress`.

Completion creates `PerformedSet` and appends `set_completed` atomically. Completing without a
matching effective start, completing a later set, or completing a set in another exercise returns a
conflict and leaves persistence unchanged.

Editing an already completed performed projection remains permitted without another start and
appends `set_updated`.

### FR-6 — Adjustment draft boundary

Pre-completion adjusted values are frontend draft state only. Opening, editing, applying, or
closing the adjustment surface does not call a performance mutation endpoint.

The current draft survives the local transition from `awaiting_set_start` to `set_in_progress` and
is submitted on completion. A full page refresh may restore plan-prefilled values; persistence of
unconfirmed form drafts is not required.

### FR-7 — Effective timing projections

For each current completed performance, derive:

* Effective `set_started_at`.
* `completed_at` from the current performance.
* Observed duration in seconds: non-negative `completed_at - set_started_at`.

For an awaiting set after a previous completed set, derive observed rest from the previous
completion until the new `set_started`. While awaiting, render against server-relative current time.

API responses expose source timestamps, not client-submitted duration values. No tick, elapsed
duration, countdown deadline, or overtime value is persisted.

### FR-8 — Progress and resume

Completed counts and `all_sets_recorded` continue to derive from current performed projections.
Current exercise/set identifies the earliest incomplete set once its exercise is started, regardless
of whether it awaits start or is in progress.

The response additionally exposes the derived phase and effective set-start timestamp. Resume URL
must return to the corresponding exercise for either set phase.

### FR-9 — Existing F14 preservation

Preserve:

* Workout and exercise snapshot immutability.
* Structured performed-set facts.
* Server-owned timestamps and server-time offset handling.
* Event sequence and ownership isolation.
* Instructions snapshot and help dialog.
* As-planned versus adjusted values.
* Completed-set editing and `Mark incomplete` history.
* Set-rest countdown/overtime presentation.
* Exercise-transition timing and warning treatment.
* Cancellation retaining timeline and performed facts read-only.

F14.2 changes only the set lifecycle and interactions necessary to represent it correctly.

### FR-10 — Request safety

Start and completion controls prevent duplicate submission. Confirmed phase changes only after a
validated server response. Failure keeps the prior phase, applicable rest timer, and adjustment
draft available for retry.

Frontend API boundaries strictly validate the added event type, lifecycle phase, timestamps, and
extended workout response. Malformed responses never advance lifecycle locally.

## Domain / Data Requirements

F14.2 does not introduce a new table. It extends `WorkoutEvent.event_type` with `set_started` and
the corresponding database check constraint.

The migration must safely rebuild or alter that constraint using the repository's supported SQLite
migration approach. Existing F14 events and performed sets remain unchanged.

No backfilled `set_started` events are invented for existing completed sets because the historical
start instant was not observed. Existing pre-F14.2 active workouts require compatibility handling:

* A completed set without a historical start remains readable with `set_started_at: null` and
  observed duration `null`.
* The earliest incomplete set of a started exercise begins as `awaiting_set_start` after upgrade.
* An unstarted exercise remains unstarted.
* A transition between completed and unstarted exercises remains a transition.

New completions after the migration always require a real `set_started` event.

## API Requirements

All endpoints require authentication. IDs and positions are strict positive integers; booleans are
invalid. Bodies reject unknown fields. Ownership failures remain indistinguishable from unknown
resources.

### Extended workout representation

The workout root adds:

```json
{
  "current_exercise_position": 1,
  "current_set_position": 2,
  "current_set_phase": "awaiting_set_start",
  "current_set_started_at": null,
  "resume_url": "/workouts/42/exercises/1"
}
```

`current_set_phase` is `awaiting_set_start`, `set_in_progress`, or `null` when there is no current
set. `current_set_started_at` is present only for `set_in_progress`; otherwise it is `null`.

Each performed set adds its effective start timestamp and observed duration:

```json
{
  "performed_value": 10,
  "performed_weight_kg": 60,
  "performed_rir": 2,
  "entry_mode": "as_planned",
  "set_started_at": "2026-08-14T10:16:45Z",
  "completed_at": "2026-08-14T10:17:18Z",
  "observed_duration_seconds": 33,
  "updated_at": "2026-08-14T10:17:18Z"
}
```

Legacy performance may return both `set_started_at` and `observed_duration_seconds` as `null`.
Observed duration is never negative.

Timeline responses accept `set_started` as a supported typed event with non-null exercise and set
positions.

### `POST /api/workouts/{workout_id}/exercises/{exercise_position}/start`

Retains the F14 route but now atomically starts the exercise and its earliest incomplete set.

Returns:

* `200` with the complete workout in `set_in_progress`.
* Existing ownership-safe workout/exercise `404` outcomes.
* `409 {"detail":"Workout is not active"}` when unavailable.
* `409 {"detail":"Exercise cannot be started yet"}` when prior exercises are incomplete.
* `409 {"detail":"Exercise is already started"}` for duplicate start.
* `409 {"detail":"Exercise has no incomplete sets"}` when applicable.
* `422` for invalid path values.
* `401` when unauthenticated.

### `POST /api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/start`

Accepts no body and returns:

* `200` with the complete workout in `set_in_progress`.
* `404 {"detail":"Workout not found"}` for unknown or inaccessible workout.
* `404 {"detail":"Workout set not found"}` when positions do not resolve.
* `409 {"detail":"Workout is not active"}` when unavailable.
* `409 {"detail":"Exercise has not been started"}` when applicable.
* `409 {"detail":"Workout set is not current"}` for a later incomplete set.
* `409 {"detail":"Workout set is already started"}` for duplicate start.
* `409 {"detail":"Workout set is already complete"}` when applicable.
* `422` for invalid path values or any body.
* `401` when unauthenticated.

### `PUT /api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/performance`

Retains F14's unified create-or-replace contract.

Creating an incomplete performance additionally requires `set_in_progress`. It appends
`set_completed`. Replacing an existing performance appends `set_updated` and does not require or
append another set start.

Adds:

* `409 {"detail":"Workout set has not been started"}` when an incomplete current set is awaiting
  start.

All F14 body discrimination, numeric validation, ownership, atomicity, and response behaviour remain
unchanged.

### `DELETE .../performance`

Retains F14 behaviour. Success reopens the set in `awaiting_set_start`; it does not automatically
append `set_started` or reuse the previous start.

## UI Requirements

F14.2 follows `harness/context/07_UI_DESIGN_SYSTEM.md`.

### Dominant actions by state

Exactly one dominant action appears:

| State | Primary action |
| --- | --- |
| Workout overview, no exercise started | `Start first exercise` |
| Set awaiting start | `Start set N` |
| Non-final set in progress | `Next set` |
| Final set in progress | `Finish exercise` |
| Exercise transition | `Start next exercise` |
| All sets recorded | None until F17 |

`Next set` and `Finish exercise` must never render during `awaiting_set_start`. `Start set N` must
never render during `set_in_progress`.

### Awaiting-set screen

Keep the next set prescription visible. Show its applicable rest countdown/overtime above or beside
the primary start action. With null rest, preserve the same layout without an empty timer shell.

`Adjust set` remains secondary and does not complete the set. The primary action remains 48–56 CSS
pixels high on mobile.

### In-progress-set screen

Remove the rest timer and do not replace it with an active-set timer. Keep the set position,
prescription and applied draft adjustments visible. `Next set` or `Finish exercise` is the only
dominant action. The persisted start timestamp is deliberately not exposed as a live counter.

### Transition screen

Retain F14's ascending exercise timer and warning change after the threshold. Do not add visible
overtime explanatory copy. `Start next exercise` starts both the exercise and its first set.

### States and recovery

Exercise and validate:

* First exercise start atomically reaching first-set in-progress.
* Awaiting next set with positive, zero, and null rest.
* Start-set pending, success, duplicate conflict, stale-current conflict, and unexpected failure.
* Set in progress before and after refresh/background interruption.
* As-planned and adjusted completion from in-progress only.
* Adjustment draft applied before start and completed afterward.
* Final-set completion and next-exercise atomic start.
* Mark incomplete followed by required restart.
* Legacy completed set with unavailable start/duration.
* Cancelled, not-found, malformed-response, and ownership-safe states.

Pending and failed actions preserve the relevant timer and draft. Browser Back never starts,
completes, or cancels a set.

### Accessibility and responsive behaviour

Timer phase is understandable without color. Focus moves after successful actions to the new phase
heading or dominant action. Failed start returns focus to `Start set N`; invalid adjustment returns
focus to its first invalid field.

Validate all changed states at 360 px, 390 px, 430 px, representative tablet/small desktop, and wide
desktop widths. Support keyboard, visible focus, 44-pixel targets, safe areas, 200% zoom, reduced
motion, and the on-screen keyboard without document-level horizontal overflow.

## Business Rules

* Every newly completed set must have an effective preceding `set_started` event.
* Starting a set and completing a set are different observed actions.
* Starting an exercise starts its first incomplete set atomically.
* Completing a non-final set opens the next set in `awaiting_set_start`.
* Completing the final set completes the exercise atomically.
* Rest begins at previous set completion and ends at next set start.
* Observed set time begins at set start and ends at set completion.
* No timer advances the workflow automatically.
* Active-set elapsed time is recorded through timestamps but is not shown live in the UI.
* Applied adjustment drafts do not persist until completion.
* Editing completed values does not rewrite historical lifecycle timestamps.
* Marking incomplete requires a new start before recompletion.
* Legacy performances without observed start retain null timing rather than invented timestamps.
* Individual repetitions remain unmonitored in F14.2.
* All F14 ownership, snapshot, cancellation, and plan-independence rules remain in force.

## Validation

* Event type accepts `set_started` and preserves all existing F14 types.
* Set-start event requires valid exercise and planned-set references from the same workout.
* Only the earliest incomplete set of the current exercise can start.
* Duplicate or completed-set start is rejected without a new event.
* Completion of an incomplete set without an effective start is rejected without mutation.
* `current_set_phase` and `current_set_started_at` are internally consistent.
* Observed duration is null for legacy no-start performance or a non-negative whole number.
* Failed exercise start, set start, completion, edit, undo, or cancellation preserves timeline,
  projections, and active association atomically.
* Existing adjusted-body strictness and numeric bounds remain unchanged.

Migration validation must include:

* Fresh complete migration history with the expanded event constraint and all F14 schema intact.
* Isolated upgrade from F14 head `693e3945d24a` containing active, partial, fully recorded, corrected,
  transitioned, and cancelled workouts.
* Verification that no historical `set_started` timestamp is invented.
* Real authenticated flows for exercise+set start, subsequent set start, completion enforcement,
  correction/restart, transition, resume, and cancellation against the upgraded database.
* Actual configured local database `alembic current` versus `alembic heads`, followed by safe upgrade
  before reporting F14.2 locally operational.
* Safe rerun of the supported migration command without duplicate schema objects or events.

Metadata-created test schemas do not satisfy the migration gate.

## Acceptance Criteria

* [ ] `Start first exercise` atomically records exercise and first-set start before navigation.
* [ ] Completing set 1 displays set 2 in `awaiting_set_start` with `Start set 2`.
* [ ] `Next set` and `Finish exercise` are absent while awaiting set start.
* [ ] Positive rest counts down then displays warning-treated `+M:SS` without automatic start.
* [ ] Zero rest begins at `+0:00`; null rest shows no timer but still requires Start.
* [ ] Starting a set ends observed rest, hides its rest timer, and shows the set prescription without
  an ascending active-set timer.
* [ ] A set cannot be completed before its start succeeds.
* [ ] A non-final in-progress set exposes `Next set`; a final in-progress set exposes
  `Finish exercise`.
* [ ] Observed set duration and rest derive from server timestamps and survive interruption.
* [ ] Adjustment before start does not complete the set and is submitted only on completion.
* [ ] `Start next exercise` atomically starts the exercise and its first incomplete set.
* [ ] Marking a completed set incomplete requires another explicit set start.
* [ ] Resume restores awaiting-set, set-in-progress, transition, and all-recorded states correctly.
* [ ] Existing F14 workouts upgrade without invented set-start facts or lost data.
* [ ] Completed legacy sets expose null observed timing when no start was observed.
* [ ] F14 timeline, performance editing, instructions, cancellation, ownership, and malformed-response
  protection continue to work.
* [ ] No skip, discomfort, completion, history, analytics, sensor, wearable, or per-repetition
  behaviour is introduced.
* [ ] Changed UI meets responsive, focus, keyboard, touch, safe-area, zoom, reduced-motion, and
  overflow requirements.
* [ ] Fresh/upgrade migrations, real migrated-database flows, automated checks, and focused manual UI
  validation pass.

## Tests

Backend tests cover:

* Exercise start appending ordered `exercise_started` and `set_started` with equal timestamps.
* Subsequent set start success, duplicate start, later-set rejection, and no performed mutation.
* Completion before start rejection and successful completion after start.
* Non-final completion deriving next set as `awaiting_set_start`.
* Final completion atomically appending set and exercise completion.
* Observed rest and set-duration projections using fixed timestamps without sleeps.
* Positive, zero, and null rest source behaviour.
* Refresh/read projections for awaiting and in-progress phases.
* Adjusted completion after draft-equivalent input and unified replacement of completed performance.
* Mark incomplete, required restart, recompletion, and effective latest timing.
* Transition followed by atomic next exercise and first-set start.
* Ownership, cancellation, stale active association, malformed IDs, and combined unauthenticated
  coverage for the new route.
* Migration upgrade preserving legacy performance with null timing and active-state compatibility.
* Fresh and previous-head migration paths with real authenticated API flows.

Avoid one test per second, set position, event count, or nullable combination.

Frontend static validation and focused inspection verify strict response parsing, derived phase
handling, server-offset rest and transition timers, absence of a live active-set timer, draft
adjustment behaviour, and normalized errors. Do not add a new test runner solely for F14.2.

Focused manual UI validation covers the complete first-set, rest, next-set start, active set,
transition, correction, refresh, failure, accessibility, and responsive flows described above. In
accordance with DEC-019, do not add Playwright or automated E2E coverage.

## Out of Scope

* Per-repetition timing or interaction.
* Sensor, camera, wearable, heart-rate, velocity, or passive monitoring.
* Pause, abandon, or restart controls for an actively running set.
* Rest extensions, skips, notifications, sound, vibration, background workers, or wake locks.
* Set/exercise skipping, substitutions, exception reasons, discomfort, or pain.
* Workout completion, summary, history UI, analytics, adaptation, recommendations, or AI.
* Persisting unconfirmed frontend adjustment drafts across a full refresh.
* Retrofitting invented set starts onto pre-F14.2 historical performance.

## Dependencies

* F14 — Live Workout Timeline and Set Tracking.

F14.2 supersedes F14's set-start and one-interaction lifecycle semantics. All unaffected F14
requirements remain normative.

## Notes

Do not model set lifecycle as a mutable status field when the event sequence already determines it.
The latest relevant lifecycle event for the current incomplete set is sufficient to distinguish
awaiting start from in progress.

Use one server timestamp for compound exercise/set starts and final-set/exercise completion. Event
sequence still records their logical order.

The phrase `Observed set time` is deliberate. It represents user-declared boundaries and must not
be renamed to exact repetition duration, Tempo compliance, time under tension, or sensor-measured
work.
