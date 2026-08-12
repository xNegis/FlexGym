# F14 — Live Workout Timeline and Set Tracking

## Objective

Turn the read-only workout snapshot introduced by F13 into a fast, recoverable live-workout flow
that records every meaningful interaction the application can observe without requiring the user to
look at or touch the phone continuously.

The user starts each exercise, performs a set, optionally adjusts its result, and confirms it while
advancing. FlexGym records a server timestamp for each observed action, displays the applicable rest
timing, and reconstructs the complete live state after refresh or interruption.

F14 records performed repetitions, duration or distance, optional load, and optional RIR separately
from the immutable plan. It also establishes a typed, append-only workout timeline suitable for
future history and analysis. It does not claim to measure unobserved facts such as the exact duration
of a set or of an individual repetition.

## Context

F09 introduced structured per-set targets and separate planned rest after a set and after an
exercise. F13 snapshots those prescriptions into an in-progress workout and provides Today, workout
review, resume, and discard. The F13 workout screen is deliberately read-only.

F14 adds observed execution facts:

```text
Started workout snapshot
├── Immutable planned exercises, sets, Tempo, rests and notes
├── Typed timeline of observed user actions
├── Zero or one current performed fact for each planned set
└── Derived live state
    ├── Current exercise and set
    ├── Completed and remaining progress
    ├── Set-rest countdown or overtime
    └── Exercise-transition elapsed time
```

The distinction between an observation and a derivation is mandatory. If set 1 is confirmed at
`T1`, its planned rest is 75 seconds, and set 2 is confirmed at `T2`, the system knows:

```text
elapsed between confirmations = T2 - T1
planned rest end              = T1 + 75 seconds
elapsed after planned rest    = max(0, T2 - planned rest end)
```

The final value may contain extra rest, setup, the performed set, and delay before touching the
phone. It is useful derived timing but is not labelled as exact set duration. Measuring individual
repetitions would require additional interaction or sensors and remains out of scope.

F05 provides concise catalog instructions. F14 snapshots them into new workouts so execution help
does not depend on later catalog changes. Existing snapshots are backfilled where their optional
source exercise remains resolvable and otherwise expose instructions as unavailable.

## User Experience

### Workout review and monitoring start

`Start workout` on Today retains F13 semantics: it atomically creates the workout and records
`WorkoutSession.started_at`. Under F14, the same transaction also appends the first timeline event,
`workout_started`, at exactly that timestamp. This is `T0`, the beginning of the observable workout
timeline.

The canonical workout URL `/workouts/{workoutId}` initially shows the ordered exercise outline so
the user can review the session. For an in-progress workout whose first exercise has not started,
`Start first exercise` is the sole primary action. Pressing it appends `exercise_started` and opens
the first exercise. It does not create a second workout or change `started_at`.

The difference between `workout_started` and the first `exercise_started` is the observed initial
preparation interval.

### Current exercise and set

The canonical execution route is:

`/workouts/{workoutId}/exercises/{exercisePosition}`

It prioritizes:

1. `Exercise 1 of 5` and the exercise name.
2. `Set 2 of 4` as the current set.
3. Planned repetitions, seconds or metres; optional weight; optional RIR; optional four-phase
   Tempo; applicable rest; and notes.
4. `Next set` as the sole dominant action when another set remains.
5. `Finish exercise` as the sole dominant action for the final set.
6. `Adjust set` and `How to do it` as secondary actions.

Completed and upcoming sets remain visible as a compact summary. The current set has the strongest
semantic and visual treatment without reproducing planning-screen density.

### One interaction per set

The user does not start and stop every set separately. They perform the current set and interact
with the phone once afterward.

If the result matches the plan, pressing `Next set` or `Finish exercise` records:

* The planned target value as performed repetitions, seconds, or metres.
* The planned weight as performed weight, including `null` when none was planned.
* The planned RIR as performed RIR, including `null` when none was planned.
* Entry mode `as_planned`.
* A server-generated completion timestamp.
* A typed `set_completed` event at that timestamp.

Tempo, planned rest, and notes remain instructions. F14 does not claim they were measured or
performed because the set was confirmed.

If another set remains, the next set becomes current and its rest display begins automatically. If
the completed set was last, the same transaction also appends `exercise_completed` and opens the
transition to the next exercise. The action is never split into a separate `Done` followed by
`Next`.

### Adjusting a set

`Adjust set` reveals a compact editor prefilled from the plan. The user may change:

* Performed repetitions, seconds, or metres according to target type.
* Optional performed weight.
* Optional performed RIR.

The dominant advance action remains `Next set` or `Finish exercise`. Submitting adjusted values
records entry mode `adjusted` in the same atomic completion flow.

Closing the editor does not persist anything. Invalid values remain visible for correction. A
failed request preserves the entered values and the last confirmed workout state.

### Rest between sets

After a non-final set is confirmed, its snapshotted `rest_after_set_seconds` applies before the next
set of the same exercise.

When rest is configured, the next-set screen shows a circular countdown derived from:

```text
previous set completion time + planned set rest
```

The countdown requires no action. It does not block the user from inspecting or adjusting the next
set. At zero it changes into an ascending overtime display such as `+0:18`. Overtime uses the
approved warning treatment and a non-color status cue; it is not presented as danger or failure.

The user puts down the phone, performs the next set when ready, and presses `Next set` afterward.
The overtime display may therefore include preparation, extra rest, set execution, and delay before
confirmation. It remains an elapsed indicator, not an exact set-duration measurement.

When set rest is `null`, no countdown or overtime is shown. A configured zero-second rest begins
directly in overtime at `+0:00`. Rest on the final set is not applied because exercise-transition
rest has separate semantics.

### Transition between exercises

After `Finish exercise`, the screen shows:

* The next exercise name and compact prescription preview.
* `Start next exercise` as the sole dominant action.
* An open-ended ascending timer beginning at `0:00` from the server timestamp of
  `exercise_completed`.

This timer is deliberately not a countdown. It shows total elapsed transition time continuously.
When the previous exercise has configured `rest_after_exercise_seconds`, crossing that threshold
changes the timer to the approved warning treatment. No visible copy such as `18 sec over planned
transition` is shown; the displayed value remains total elapsed time.

Because the shared UI contract forbids status conveyed by color alone, the over-threshold state also
changes a compact clock/status icon and exposes an accessible name such as `Planned transition time
exceeded`. It adds no visible explanatory sentence and does not use danger red.

If transition rest is `null`, the timer remains neutral indefinitely because there is no threshold.
A configured zero-second transition uses the warning state immediately. The timer never blocks,
ends, or starts the next exercise automatically.

Pressing `Start next exercise` appends `exercise_started` for the next exercise. The exact observed
transition is derived from the previous `exercise_completed` and next `exercise_started`
timestamps. The applicable planned transition remains available in the immutable workout snapshot.

No transition screen is shown after the final exercise. The user returns to the workout overview in
an `All sets recorded` state. Completing the workout belongs to F17.

### Review, correction, and instructions

Completed sets show their performed values and whether they were accepted as planned or adjusted.
While the workout remains active, the user may edit a completed set or use `Mark incomplete` to
correct an accidental confirmation. Edits append `set_updated`; undo appends
`set_marked_incomplete`. The append-only timeline retains what the application observed even though
the current performed-set projection changes.

If undo reopens an earlier set, resume returns to the earliest incomplete set in canonical order.
An exercise previously started does not require another start action. Completing its last reopened
set appends another `exercise_completed` event only when the exercise becomes complete again.

`How to do it` opens the existing responsive `Dialog` with snapshotted concise catalog
instructions. An unresolvable pre-F14 snapshot shows `Instructions unavailable for this workout`
without fetching mutable catalog content.

### Navigation and interruption recovery

Previous and next exercise controls permit browsing without recording a cursor or changing
progress. Browser Back from execution returns to the workout overview. Primary navigation, browser
Back, refresh, screen locking, and temporary app switching never cancel the workout.

All timers are renderings of persisted server timestamps and immutable planned durations. They do
not persist a tick each second and do not depend on a JavaScript interval having run continuously.
The API supplies server time so the client can calculate a session offset and avoid treating an
incorrect device clock as authoritative.

Today and overview resume derive their destination from persisted timeline/performed state. A
cancelled workout remains readable but exposes no execution mutations.

## Functional Requirements

### FR-1 — Typed append-only timeline

Persist an ordered timeline for every workout. Each event contains:

* Application-generated identity.
* Required owning workout.
* Contiguous one-based sequence within the workout.
* A supported event type.
* Optional workout-exercise and workout-planned-set references when required by that type.
* Required server-generated UTC `occurred_at`.

F14 event types are:

* `workout_started`
* `exercise_started`
* `set_completed`
* `set_updated`
* `set_marked_incomplete`
* `exercise_completed`
* `workout_cancelled`

Events are immutable and never deleted individually. They contain no arbitrary JSON payload. The
structured snapshot and performed-set projection remain the authoritative representation of plan
and current results; the timeline preserves observed actions and their order.

### FR-2 — Workout-start and cancellation events

New workout creation appends `workout_started` atomically with the F13 snapshot and active-workout
association. Its timestamp equals `WorkoutSession.started_at`.

The F13 discard transaction appends `workout_cancelled` at the same timestamp stored in
`cancelled_at`, then clears the active association. A failed start or cancellation appends no event.

The migration backfills these events for existing workouts from their F13 timestamps, preserving
`workout_started` as sequence 1 and adding `workout_cancelled` as sequence 2 where applicable.

### FR-3 — Exercise lifecycle

The first exercise requires `Start first exercise`. Each later exercise requires
`Start next exercise` after every preceding exercise is currently complete. Starting appends
`exercise_started` using server time.

An exercise is complete when every planned set currently has a performed fact. Completing its final
incomplete set appends `set_completed` and `exercise_completed` atomically with the performed fact.
An exercise with a reopened set is incomplete until that set is recorded again.

An exercise cannot be started twice through the normal forward flow. Resuming a previously started
exercise, including one reopened by correction, appends no new start event.

### FR-4 — Performed-set projection

Persist at most one current `PerformedSet` for each `WorkoutPlannedSet`. It contains performed
target-type value, nullable performed weight, nullable performed RIR, entry mode, original
completion timestamp, and last-update timestamp.

It belongs to the workout through its immutable planned-set parent. It cannot reference mutable F09
configured sets, move to another planned set, or cross workout/user ownership.

### FR-5 — Planned and performed separation

Completing, editing, or undoing a set never changes source planning data, F13 schedule/selection
facts, snapshotted targets, or plan timestamps. Missing performance means incomplete; reads never
materialize planned values as performed data implicitly.

### FR-6 — As-planned and adjusted completion

An `as_planned` request accepts no performed values. The backend copies snapshotted target value,
weight, and RIR. An `adjusted` request requires the complete performed value shape, with explicit
`null` for absent weight or RIR, and validates it using the snapshotted target type.

Completing an incomplete set is permitted only when it is the earliest incomplete set of an already
started exercise. It creates the performed fact and `set_completed` event atomically. If it makes
the exercise complete, it also appends `exercise_completed` in the same transaction.

### FR-7 — Edit and mark incomplete

Submitting valid values for a completed set replaces its editable performed values and entry mode,
preserves its original `completed_at`, updates `updated_at`, and appends `set_updated` atomically.

`Mark incomplete` removes the current performed projection and appends `set_marked_incomplete`.
Repeating it for an incomplete set returns a conflict. Historical timeline events remain intact.

Only active in-progress workouts permit either correction. F14 does not define editing after F17
completion.

### FR-8 — Derived progress and resume

Derive total/completed counts for the workout and each exercise, whether all sets are recorded, and
the earliest incomplete exercise/set positions in canonical snapshot order.

Resume rules are:

* No exercise started: workout overview with `Start first exercise`.
* An exercise-transition state exists: transition screen for the next unstarted exercise.
* Otherwise: earliest incomplete set in an already started exercise.
* All sets recorded: workout overview.

Counts, current positions, current transition, and resume URL are not accepted from clients or
stored as independent mutable cursors.

### FR-9 — Timing derivation

Set-rest state derives from the preceding set's latest effective completion event and its immutable
planned set rest. Exercise-transition state derives from the previous exercise's latest effective
completion event and the next exercise's first start event, plus the previous exercise's immutable
planned transition rest.

The service exposes the timestamps and planned durations required to reconstruct timing. Timer
ticks and threshold-reached events are never persisted. A threshold is a deterministic instant, not
an observed server event.

Current live responses include server UTC time. The frontend calculates remaining or elapsed time
from the server-relative offset and continues rendering locally between responses.

### FR-10 — Exercise instructions snapshot

New workout starts copy the catalog exercise's non-empty concise `instructions` into each
`WorkoutExercise`. Reads use the snapshot rather than joining to the current catalog.

The migration attempts to backfill existing workout exercises from their optional source exercise.
The field may remain `null` only for pre-F14 rows whose source cannot be resolved. Editing or
deleting source records never changes a snapshot.

### FR-11 — Active ownership boundary

Only the authenticated owner of a workout with status `in_progress` and the matching active-workout
association may start exercises or mutate performed sets. Unknown and other-user resources are
indistinguishable.

A race between execution mutation and cancellation commits one complete transaction before the
other. No event, performed row, status, or active association may be partially updated.

### FR-12 — Request-state and response safety

Actions prevent duplicate submission while pending and keep confirmed exercise context visible.
Only validated server responses change confirmed progress. Failures keep adjustments for retry.

Frontend API boundaries parse bodies as `unknown`, validate discriminated and nested response
shapes, normalize string and FastAPI array validation details, and return safe fallback messages.
Components never render raw server payloads.

### FR-13 — Architectural boundaries

Endpoints remain thin. Ownership, active-state validation, sequence allocation, event invariants,
exercise lifecycle, planned-value copying, target-type validation, performed projection changes,
progress/resume derivation, timing derivation, and instruction snapshotting live in an application
service or equivalent non-HTTP boundary.

React components use the frontend API layer. They do not maintain authoritative progress or timer
state independently from persisted timestamps.

## Domain / Data Requirements

F14 extends `WorkoutExercise` with nullable snapshotted `instructions`. The service requires a
non-empty value for every workout created after F14; null exists only for migration compatibility.

F14 introduces `PerformedSet` with:

* Application-generated primary key.
* Required unique parent `WorkoutPlannedSet`.
* Required fixed-precision performed value.
* Nullable fixed-precision performed weight in kilograms.
* Nullable performed RIR.
* Entry mode `as_planned` or `adjusted`.
* Required server-generated UTC `completed_at` and `updated_at`.

F14 introduces `WorkoutEvent` with the fields and supported types defined in FR-1. Persistence
enforces unique `(workout_session_id, sequence)` and one `workout_started` event per workout. The
service enforces event-specific reference requirements and sequencing that depend on related rows.

Performed sets cascade with their planned set and workout. Timeline events cascade only with their
owning workout and must use non-cascading or nullable references to nested snapshot rows so that
`Mark incomplete` never deletes an event. Source plan/catalog deletion affects neither entity.

No timer tick, rest deadline, elapsed duration, overtime amount, current cursor, progress count, or
all-recorded flag is persisted. These are deterministic projections of timestamps, plan snapshots,
and current performed rows.

## API Requirements

All endpoints require authentication. IDs and positions are strict positive integers; booleans are
invalid. Bodies reject unknown fields. Ownership failures do not disclose other users' resources.

### Extended workout representation

Each planned set gains nullable `performance`:

```json
{
  "position": 1,
  "target_value": 10,
  "target_weight_kg": 60,
  "target_rir": 2,
  "tempo": {
    "eccentric_seconds": 3,
    "stretched_pause_seconds": 1,
    "concentric_seconds": 1,
    "peak_contraction_seconds": 0
  },
  "rest_after_set_seconds": 75,
  "notes": null,
  "performance": {
    "performed_value": 10,
    "performed_weight_kg": 60,
    "performed_rir": 2,
    "entry_mode": "as_planned",
    "completed_at": "2026-08-14T10:15:30Z",
    "updated_at": "2026-08-14T10:15:30Z"
  }
}
```

Incomplete sets return `"performance": null`.

Each workout exercise gains `instructions`, `started_at`, `latest_completed_at`,
`completed_set_count`, `total_set_count`, and derived `is_complete`. `started_at` and
`latest_completed_at` are nullable event projections.

The workout root gains:

```json
{
  "server_now": "2026-08-14T10:16:48Z",
  "completed_set_count": 1,
  "total_set_count": 12,
  "all_sets_recorded": false,
  "current_exercise_position": 1,
  "current_set_position": 2,
  "transition_to_exercise_position": null,
  "resume_url": "/workouts/42/exercises/1"
}
```

Current positions are both integers or both null. `transition_to_exercise_position` is non-null only
while waiting for `Start next exercise`; current positions are then null. Existing F13 workout
reads, active lookup, creation, and start-context active branch return compatible extended shapes.
Cancelled workouts expose their timeline and results read-only.

### Timeline representation

The complete workout includes ordered typed events:

```json
{
  "sequence": 3,
  "event_type": "set_completed",
  "exercise_position": 1,
  "set_position": 1,
  "occurred_at": "2026-08-14T10:15:30Z"
}
```

Exercise/set positions are nullable only when the event type does not require them. Internal
snapshot-row IDs are not exposed.

### `POST /api/workouts/{workout_id}/exercises/{exercise_position}/start`

Accepts no body and returns:

* `200` with the complete updated workout after starting the correct next exercise.
* `404 {"detail":"Workout not found"}` for an unknown or inaccessible workout.
* `404 {"detail":"Workout exercise not found"}` for an invalid position inside it.
* `409 {"detail":"Workout is not active"}` when mutation is unavailable.
* `409 {"detail":"Exercise cannot be started yet"}` when earlier exercises are incomplete.
* `409 {"detail":"Exercise is already started"}` for a duplicate start.
* `422` for invalid path values.
* `401` when unauthenticated.

### `PUT /api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/performance`

Accepts one strict discriminated body.

As planned:

```json
{"entry_mode": "as_planned"}
```

Adjusted:

```json
{
  "entry_mode": "adjusted",
  "performed_value": 8,
  "performed_weight_kg": 57.5,
  "performed_rir": 1
}
```

For `adjusted`, all performed keys are required; weight and RIR may explicitly be null. For
`as_planned`, performed keys are rejected.

Returns:

* `200` with the complete updated workout after completion or edit.
* `404 {"detail":"Workout not found"}` for an unknown or inaccessible workout.
* `404 {"detail":"Workout set not found"}` when positions do not resolve inside it.
* `409 {"detail":"Workout is not active"}` when mutation is unavailable.
* `409 {"detail":"Exercise has not been started"}` when applicable.
* `409 {"detail":"Workout set is not current"}` when attempting to complete a later incomplete
  set out of order.
* `422` for invalid paths, discriminator, shape, types, or target-specific values.
* `401` when unauthenticated.

### `DELETE /api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/performance`

Accepts no body and returns:

* `200` with the complete updated workout.
* The documented workout/set `404` outcomes.
* `409 {"detail":"Workout is not active"}` when mutation is unavailable.
* `409 {"detail":"Workout set is already incomplete"}` when no projection exists.
* `422` for invalid path values.
* `401` when unauthenticated.

No timer endpoint exists. Clients never report that a countdown reached zero and never submit an
elapsed duration as authoritative data.

## UI Requirements

F14 follows `harness/context/07_UI_DESIGN_SYSTEM.md` and extends no visual language locally.

### Routes and dominant actions

The overview remains `/workouts/:workoutId`; live execution uses
`/workouts/:workoutId/exercises/:exercisePosition`.

The overview offers exactly one applicable primary action:

* `Start first exercise` before execution.
* `Resume workout` during an exercise or transition.
* No completion action when all sets are recorded; F17 introduces it.

Execution offers `Next set`, `Finish exercise`, or `Start next exercise` according to derived state.
Only one is visually dominant at a time.

### Set and transition composition

Reuse `AppShell`, `Page`, `Card`, `Badge`, `Button`, `IconButton`, `Field`, `Alert`, `LoadingState`,
`EmptyState`, and `Dialog`. Feature-specific set and timer compositions reuse semantic tokens.

The frequent advance action is 48–56 CSS pixels high. Numeric fields have visible labels/units,
appropriate `inputmode`, at least 16-pixel text, and 44-pixel controls. Planned and performed values
are explicitly labelled. Tempo exposes all four phase names and is never communicated only as a
bare numeric string.

The set-rest timer uses a circular countdown in evergreen/accent treatment. At zero it renders
ascending `+M:SS` overtime with warning color plus a clock/status icon. It includes a concise
accessible status.

The exercise-transition timer always counts upward as `M:SS`. Before its configured threshold it is
neutral/accent; after the threshold it uses warning color and the changed status icon. It does not
display visible `over`, `late`, excess-duration, warning, or failure copy. Danger red is not used.

This icon is required by the non-color accessibility contract even though the intentionally quiet
visual design relies primarily on the timer color change.

### Instructions dialog

`How to do it` opens the shared `Dialog`, names the exercise, shows snapshotted instructions, traps
focus, closes with Escape, and restores focus. No video or new sheet primitive is introduced.

### States and request behaviour

Exercise and validate:

* Overview with no exercise started, active exercise, active transition, and all sets recorded.
* Exercise loading; current, completed, and upcoming sets; first and last exercise.
* Exercise-start pending, success, conflict, and recoverable failure.
* As-planned and adjusted completion pending, success, validation failure, conflict, and unexpected
  failure.
* Countdown before zero, exact zero, overtime, null rest, and zero-second rest.
* Exercise transition below threshold, exact threshold, above threshold, null threshold, and
  zero-second threshold.
* Refresh and background/interruption recovery for both timer types.
* Completed-set edit and mark-incomplete correction states.
* Instructions available and unavailable.
* Cancelled, not-found, invalid-position, ownership-safe, and malformed-response states.

Pending controls use explicit labels such as `Starting…`, `Saving…`, and
`Marking incomplete…`. Confirmed exercise, set, entered values, and timer context remain visible.
Errors appear at the smallest recoverable boundary.

### Navigation, focus, and announcements

Browser Back from execution returns to the overview without mutation. Refresh restores the route and
server-derived state. Automatic advance after successful set completion moves focus to the next set,
transition heading, or all-recorded heading. Failures restore focus to the affected action or first
invalid field.

Timer updates must not announce every second. Assistive technology receives state changes at rest
completion or threshold crossing and can query the current accessible timer value. Current,
completed, upcoming, and over-threshold states do not rely solely on color.

### Responsive behaviour

Validate overview, exercise, adjustment editor, instructions dialog, set countdown/overtime, and
exercise transition at 360 px, 390 px, 430 px, a representative tablet/small desktop width, and a
wide desktop width. Support 200% zoom, safe areas, reduced motion, and on-screen keyboards without
document-level horizontal overflow or navigation-obscured actions.

## Business Rules

* The workout timeline begins when F13 creates the workout, not when the first exercise starts.
* Only actions observed by the backend become events; timer thresholds are derived instants.
* All authoritative event timestamps come from the server.
* Timeline sequence is append-only, one-based, unique, and contiguous per workout.
* A planned set has zero or one current performed projection.
* Planned values never imply completion without a set-completion action.
* `as_planned` copies value, weight, and RIR on the server; `adjusted` records explicit values.
* Tempo, planned rest, and notes remain instructions, not measured performance.
* `Next set` atomically completes the current set and advances derived state.
* `Finish exercise` atomically completes the last set and records exercise completion.
* Set rest applies after a non-final set; exercise rest applies after the final set when another
  exercise follows. They are never added.
* Set rest counts down then counts overtime; exercise transition always counts upward.
* A timer never advances workflow automatically or blocks user action.
* Exercise-transition overtime has no visible explanatory copy and is not a danger state.
* Exact set duration and individual repetition timing are unknown in the one-interaction flow.
* Timers, progress, and resume state survive interruption through deterministic reconstruction.
* Only an owned active in-progress workout may accept execution mutations.
* All sets recorded does not complete the workout in F14.
* Execution never changes planning records or plan timestamps.
* F14 makes no adherence, quality, discomfort, or progression judgment.

## Validation

* Workout IDs and exercise/set positions are strict positive integers; booleans are invalid.
* `entry_mode` accepts only `as_planned` or `adjusted`.
* Repetition performance is a whole integer from 1 through 1,000.
* Duration performance is a whole number of seconds from 1 through 86,400.
* Distance performance is greater than zero, no more than 100,000 metres, and has at most two
  decimal places.
* Performed weight is nullable, from 0 through 5,000 kilograms, with at most two decimal places.
* Performed RIR is nullable and a whole integer from 0 through 10.
* Adjusted bodies require every performed key and explicit nulls for absent optional values.
* As-planned bodies reject performed keys.
* Request bodies reject unknown fields.
* Event references and sequence must match their type and parent workout.
* Failed start, completion, edit, undo, or cancellation leaves snapshot, projection, timeline, and
  active association unchanged.

Migration validation must include:

* Applying complete history to a fresh isolated database and verifying instruction snapshot,
  performed-set and timeline tables, uniqueness, foreign keys, cascades, fixed precision, type
  constraints, timestamps, and event sequence.
* Creating an isolated database at previous F13 head `5f6392b90798`, creating representative active
  and cancelled workouts, applying F14, and verifying deterministic start/cancel event backfill and
  resolvable/unresolvable instruction handling.
* Confirming existing users, profiles, plans, schedules, active selections, workout snapshots,
  statuses, and timestamps remain otherwise unchanged.
* Exercising real authenticated start-exercise, as-planned completion, adjusted completion, edit,
  undo, transition, resume, and cancellation paths against the upgraded migrated database.
* Comparing `alembic current` and `alembic heads` for the configured local development database and
  safely upgrading it before reporting F14 locally operational.
* Confirming the supported migration command can be rerun without duplicate objects or events.

`Base.metadata.create_all()` tests do not satisfy the migration gate.

## Acceptance Criteria

* [ ] Starting from Today creates `workout_started` at the same timestamp as F13 `started_at`.
* [ ] The overview shows all exercises before `Start first exercise` records exercise start.
* [ ] The live screen clearly presents current exercise/set and all applicable prescription data.
* [ ] One `Next set` interaction records an as-planned or adjusted result and advances state.
* [ ] The final-set action records set and exercise completion atomically.
* [ ] Planned and performed facts remain separate and plan data/timestamps never change.
* [ ] Set rest counts down from its configured value and shows warning-treated `+M:SS` after zero.
* [ ] Exercise transition counts upward from zero without a limit or automatic advance.
* [ ] Crossing configured exercise rest changes warning color and icon without visible overtime
  explanatory text.
* [ ] Null and zero set/exercise rest have the documented distinct behaviour.
* [ ] `Start next exercise` records the next exercise timestamp and therefore the exact observed
  transition interval.
* [ ] The system never labels elapsed-after-rest as exact set duration or claims repetition timing.
* [ ] Timeline order and timestamps survive refresh, screen locking, navigation, and app switching.
* [ ] Timers reconstruct correctly without persisted ticks or trusting the device clock.
* [ ] The user can edit a completed set or mark it incomplete while retaining append-only events.
* [ ] Progress, active transition, current set, and resume URL derive correctly after corrections.
* [ ] `How to do it` presents immutable instructions or a stable unavailable state.
* [ ] Cancel retains performed facts and timeline, appends cancellation, and prevents further
  execution mutations.
* [ ] Unknown, foreign, stale, and cancelled resources do not leak ownership or partially mutate.
* [ ] Failed and malformed responses preserve confirmed state and entered adjustments.
* [ ] All sets recorded returns to the overview but does not complete the workout.
* [ ] No skips, substitutions, exception reasons, discomfort, pain, workout completion, history UI,
  analytics, recommendations, or AI are introduced.
* [ ] Existing Today, alternative start, resume, discard, planning, and authentication flows retain
  their documented behaviour.
* [ ] All relevant UI states satisfy keyboard, focus, touch, safe-area, zoom, reduced-motion, and
  responsive contracts with no document-level overflow.
* [ ] Fresh/upgrade migrations, real migrated-database flows, local revision checks, automated
  checks, and focused manual UI validation pass.

## Tests

Backend tests cover:

* Atomic F13 start plus sequence-1 `workout_started` timestamp equality.
* First and subsequent exercise starts, invalid order, duplicate start, and derived transition.
* As-planned completion copying exact snapshot values without modifying planning data.
* Adjusted repetition, duration, and distance completion, including decimal distance/weight.
* One invalid target-type value leaving projection and timeline unchanged.
* Final-set completion atomically appending `set_completed` then `exercise_completed` in sequence.
* Set edit preserving original completion time, changing update time, and appending `set_updated`.
* Mark-incomplete plus already-incomplete conflict and deterministic resume recalculation.
* Derived counts, current positions, active transition, all-recorded state, and resume URL across
  zero, partial, corrected, and fully recorded progress.
* Timing projections for set countdown, exact zero, overtime, transition below/at/above threshold,
  null rest, and zero rest using fixed timestamps rather than sleeping.
* Refresh reads returning sufficient server-relative state to reproduce timers.
* Ownership and active-workout enforcement, including cancelled and stale-association cases.
* Representative competing mutation preserving performed uniqueness and contiguous event sequence.
* Instruction snapshot, migration backfill/fallback, and source edit/deletion independence.
* Atomic cancellation event, retention of performance/timeline, and read-only cancelled response.
* User deletion cascading F14 data and fitness-profile deletion preserving it.
* One combined unauthenticated test covering new endpoints.
* Required fresh and previous-head migrations with real authenticated API flows.

Do not add one test per second, numeric boundary, event sequence length, nullable combination, or
malformed response variant.

The frontend has no focused unit runner. Type checking and focused inspection verify extended
workout/timeline parsers, nullable performance, progress invariants, discriminated write bodies,
server-time offset logic, timer formatting, threshold states, normalized validation detail, and
malformed fallbacks. F14 does not introduce a runner solely for itself.

Focused manual UI validation exercises:

* Today start, overview, first-exercise start, repeated one-interaction set flow, exercise
  transition, next-exercise start, all-recorded overview, and refresh.
* Adjusted repetition and one non-repetition set using mobile numeric input.
* Set countdown before/at/after zero and transition timer below/at/after configured threshold.
* Null and zero rest variants for both timer types.
* Lock/background/refresh recovery while each timer is running.
* Completed-set edit and mark-incomplete correction.
* Available/unavailable instructions and dialog focus containment/restoration.
* Start, completion, edit, undo, and cancellation failures preserving context.
* Invalid/foreign routes and cancelled execution behaviour.
* No overflow at 360, 390, and 430 px plus representative tablet and wide desktop inspection.
* Focus, touch targets, non-color timer state, restrained announcements, 200% zoom, safe areas,
  reduced motion, and on-screen keyboard access.

In accordance with DEC-019, F14 adds no automated browser or other automated browser-level tests.

## Out of Scope

* Per-repetition taps, exact set-duration claims, motion sensing, camera analysis, wearables, heart
  rate, velocity, calories, or passive physiological monitoring.
* Pausing, extending, skipping, or manually resetting rest; alerts, sound, vibration,
  notifications, background workers, or wake locks.
* Skipping sets/exercises, substitutions, equipment availability, fatigue, lack of time, and other
  exception reasons. These belong to F15.
* Pain/discomfort area, intensity, effect, or feedback while continuing. These belong to F16.
* Workout completion/status, completion timestamp, immediate summary, and duration. These belong to
  F17.
* Historical list/filter/navigation and editing completed workouts. These belong to F18.
* Performed Tempo, actual rest entered by the client, performed notes, RPE, assistance direction,
  body weight, machine calibration, bar weight, or plate calculations.
* Adding, removing, reordering, or substituting snapshot exercises/sets during execution.
* Updating plans from results, analytics, signals, adaptations, recommendations, or AI.
* Offline writes, background sync, service workers, or install prompts.

## Dependencies

* F05 — Exercise Catalog.
* F09 — Routine Exercise Configuration.
* F13 — Start Workout.

F13 carries the indirect authentication, profile, planning, schedule, active-routine, and UI-system
dependencies. F06 remains intentionally skipped.

## Notes

Use a separate performed-set table rather than nullable actual fields on `WorkoutPlannedSet`; a
missing child then means incomplete without mutating the plan snapshot.

Use immutable workout-local exercise/set positions in public paths. Persist timeline references by
internal keys while returning positions.

Allocate event sequence within the same transaction as its domain mutation. A unique constraint is
necessary but not sufficient; representative contention must leave a complete result or a
recoverable conflict without gaps or duplicate sequence.

Do not persist timer ticks or accept client elapsed values. F15 and F16 must extend the typed
timeline and structured facts rather than replace them with arbitrary event JSON.
