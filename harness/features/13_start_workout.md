# F13 — Start Workout

## Objective

Allow an authenticated user to see the session planned for their current local day, deliberately
choose another executable session from the active routine when needed, and start a persistent
workout from that selection.

F13 establishes the boundary between mutable training plans and workout facts. Starting a workout
captures an immutable snapshot of the applicable routine, scheduled session, selected session,
ordered exercises, and planned sets. The feature supports starting, resuming, inspecting, and
cancelling that workout, but the workout remains read-only. Recording actual performance begins in
a later feature.

## Context

F09 introduced structured exercise prescriptions and explicitly required future workout facts to
remain separate from mutable planned targets. F10 established the fixed Monday-to-Sunday schedule,
where an unassigned position is derived rest. F11 introduced the user's optional active routine as
the plan future workout flows should resolve. F12 established the mobile-first UI system and
reserved a future `Today` destination for a real workout entry flow.

An active routine may contain training days with no configured exercises because exercise
completeness is deliberately not part of F11 activation. F13 therefore introduces session-level
start readiness without changing routine activation rules.

The relevant distinction is:

```text
Mutable plan
└── Active routine
    └── Scheduled training day
        └── Configured exercises and planned sets

Workout fact created at start
└── Scheduled session at that moment, or rest
└── Session actually selected by the user
    └── Immutable exercise and planned-set snapshot
```

Choosing another session records what the user decided to perform on that date. It does not move
the selected training day, replace the scheduled session, or otherwise mutate the routine.

## User Experience

### Today

`Today` becomes an authenticated primary destination. It uses the browser's current local calendar
date to resolve the corresponding ISO weekday in the active routine.

When an executable session is scheduled, Today prioritizes:

1. The scheduled training-day name.
2. The active routine name and weekday as supporting context.
3. A compact, ordered list of exercise names and set counts.
4. `Start workout` as the single dominant action.
5. `Change session` as a secondary action that opens the complete session selector.

F13 does not reproduce the dense planning editor. It shows enough information to confirm which
session will be started, but no editable targets or performed-value controls.

### Change session

The user can choose any training day in the active routine that contains at least one configured
exercise. `Change session` always reopens the complete selector, including the scheduled session,
so returning to it uses the same interaction as every other change. The selection surface lists
sessions in weekly order and shows each session's weekday, name, exercise count, and compact
exercise/set-count preview.

Empty training days remain visible but unavailable, with an explanation that exercises must be
configured first. Selecting another session updates the Today preview and dominant start action but
does not persist anything until the user starts the workout. The routine schedule remains
unchanged.

### Exceptional Today states

* With no active routine, Today explains that a routine must be activated and offers `Go to Plan`.
* On a rest day, Today shows an explicit `Rest day` state and offers `Choose another session` when
  the active routine contains an executable session.
* When the scheduled training day is empty, Today names it, explains why it cannot be started,
  offers `Configure session`, and permits selection of another executable session when available.
* When every training day in the active routine is empty, Today offers `Configure routine` and no
  start action.
* Loading never briefly presents no active routine, rest, or an empty session before that state is
  confirmed.

### Started workout

Starting navigates to the canonical workout URL `/workouts/{workoutId}`. The initial workout screen
is deliberately read-only and shows:

* Selected session name.
* Routine name.
* Local workout date and start time.
* Whether the scheduled session was followed, another session was chosen, or training occurred on
  a scheduled rest day.
* Ordered exercise names and planned set counts.
* Compact planned set values, including target load, RIR, and four-phase Tempo when configured.
* A secondary `Discard workout` action.

The screen does not contain actual repetitions, loads, duration, distance, completion controls,
exercise navigation, skip controls, feedback, or timers.

### Resume and discard

When a workout is already in progress, Today makes `Resume workout` the dominant action and does
not offer another start flow. Refreshing Today or the canonical workout URL recovers the persisted
workout.

Discarding requires explicit confirmation. Success records the workout as cancelled, clears the
active-workout selection, and replaces the current route with `/today`. Cancellation does not
delete the snapshot. A failed cancellation leaves the workout active and the confirmation open for
retry or cancellation.

## Functional Requirements

### FR-1 — Today destination

Add `/today` as a canonical authenticated route and `Today` as a primary navigation destination in
the shared application shell. Today must not render for unauthenticated users or users who have not
completed profile onboarding.

F13 changes the authenticated default destination from Plan to Today. Successful login,
registration followed by onboarding, direct navigation to the authenticated root, and authenticated
access to an auth-only route open Today unless an originally requested valid protected destination
is being restored. Existing `/plan`, `/exercises`, and `/profile` destinations remain unchanged.

### FR-2 — Local-date input

The browser supplies its current local calendar date as an ISO `YYYY-MM-DD` value when requesting
Today context or starting a workout. The backend parses the date strictly and derives the fixed ISO
weekday position itself. The client cannot submit a weekday or scheduled training-day identity as
authoritative input.

The date is stored on the workout independently from the UTC start timestamp. F13 does not add a
profile timezone, infer timezone from locale, or attempt to validate the browser's local date
against the server's UTC date.

### FR-3 — Start context

The backend exposes one application boundary that resolves, for the authenticated user and supplied
local date:

* Any current in-progress workout.
* The active routine, when present.
* The schedule slot corresponding to the date.
* Whether that slot was rest or contained a training day.
* Whether the scheduled training day is executable.
* Every training day in the active routine, in weekly order, with start readiness and a compact
  exercise/set-count preview.

An in-progress workout takes precedence over current plan state. It remains resumable even if its
source routine has since been edited, deactivated, switched, or deleted.

### FR-4 — Executable session

A training day is executable when it belongs to the user's current active routine and contains at
least one configured exercise. Existing F09 invariants guarantee that each configured exercise has
at least one planned set.

This is a workout-start rule only. It does not modify F11 activation readiness and does not
automatically deactivate a routine containing empty training days.

### FR-5 — Alternative session selection

The user may select an executable training day other than the session scheduled for the supplied
date. This includes selecting a session on a rest day.

The selected training day must belong to the active routine at the moment of start. A training day
from an inactive routine, a deleted or moved stale selection, or an empty training day is rejected
without creating a workout. The frontend refreshes or preserves a usable selection flow after the
failure.

Alternative selection never changes the routine schedule or plan timestamps.

### FR-6 — One in-progress workout

Each user may have at most one workout in progress. Different users may have independent in-progress
workouts.

Persistence must enforce the singleton selection through a dedicated `ActiveWorkout` association
or an equivalently portable relational constraint. Frontend checks alone and a SQLite-specific
partial unique index are insufficient.

If the user already has an in-progress workout, no start request may create another one. The
response identifies the existing workout in a stable typed shape so the frontend can offer or
perform safe resume behaviour.

### FR-7 — Atomic workout start

Starting a workout atomically:

1. Rechecks that no active workout exists.
2. Resolves the user's current active routine.
3. Resolves the scheduled slot from the submitted local date.
4. Validates that the selected training day still belongs to that routine and is executable.
5. Creates the workout session and its schedule/selection snapshot.
6. Copies every selected configured exercise and planned set in canonical order.
7. Creates the active-workout association.

Any validation or persistence failure leaves no workout, partial snapshot, or active-workout
association.

### FR-8 — Schedule and selection facts

The workout records both what was scheduled and what was selected at start time.

Required facts include:

* Local workout date and its derived weekly position.
* Active routine identity and name at start.
* Whether the corresponding schedule slot was rest or training.
* Scheduled training-day identity and name when the slot was training.
* Selected training-day identity, name, and weekly position at start.
* Selection kind: `scheduled` or `alternate`.

`alternate` applies when the selected session differs from the scheduled session, including when
the scheduled slot was rest. This is an observed user choice, not an adherence score, derived
pattern, or recommendation.

These facts remain stable if the plan later changes. Workout History and Phase 3 may later present
or derive signals from them, but F13 provides no history list or analytics.

### FR-9 — Immutable plan snapshot

Each workout exercise snapshots:

* Stable workout-local position.
* Catalog exercise identity when available.
* Exercise slug and display name.
* Target type.
* Planned rest after the exercise.
* Planned exercise note.

Each workout planned set snapshots:

* Stable workout-local position.
* Target value.
* Optional target weight in kilograms.
* Optional target RIR.
* Optional structured four-phase tempo.
* Optional planned rest after the set.
* Optional planned set note.

The complete snapshot is authoritative historical plan data for that workout. Subsequent edits,
reorders, or deletion of routines, training days, exercise configurations, configured sets, or
catalog records do not mutate or delete it. Optional source references may be retained for
traceability, but the workout must never require those source records to render correctly.

### FR-10 — Workout lifecycle in F13

F13 supports two persisted workout statuses:

* `in_progress`
* `cancelled`

Creation records `started_at` using server UTC time and leaves `cancelled_at` null. Cancellation
changes only an in-progress workout to `cancelled`, records `cancelled_at`, and removes the
active-workout association atomically.

Cancelled workouts and snapshots remain persisted but are not listed by F13. Completion and its
status/timestamp belong to a later feature.

### FR-11 — Resume and direct access

The authenticated owner can retrieve an in-progress or cancelled workout by ID. Unknown and
other-user IDs use the same not-found response.

The active-workout resource returns the complete current snapshot or JSON `null`. Direct refresh of
an owned `/workouts/{workoutId}` route restores the workout. A cancelled workout URL renders a
read-only cancelled state with a route back to Today and cannot be resumed or cancelled again.

### FR-12 — Plan mutation independence

Starting a workout does not lock the routine. Plan editing, routine switching, and deactivation
remain available through their existing flows.

Deleting a routine, training day, exercise configuration, configured set, or catalog exercise must
not cascade into workout sessions or snapshot rows. Deleting the owning user removes their workouts
and active-workout association. Deleting and recreating a fitness profile preserves workouts.

### FR-13 — Request-state and response safety

Start and cancellation controls prevent duplicate or conflicting submissions while pending.
Confirmed UI state changes only after a validated server response. Failures preserve the current
Today context, selected alternative, or workout snapshot as appropriate.

Frontend API functions treat response bodies as `unknown`, validate discriminated success shapes,
normalize string-detail and FastAPI array-shaped validation errors, and use a safe generic fallback
for malformed, empty, or unexpected bodies. Components never render raw response values.

### FR-14 — Architectural boundaries

Endpoints remain thin. Local-date parsing, ISO weekday derivation, active-plan resolution, session
readiness, scheduled-versus-selected classification, singleton enforcement, snapshot construction,
ownership, and atomic lifecycle changes live in an application service or equivalent non-HTTP
boundary.

React components use the frontend API layer rather than constructing workout API calls directly.
Plan response objects are not reused as mutable workout state.

## Domain / Data Requirements

F13 introduces `WorkoutSession` with:

* Application-generated primary key.
* Required owning user.
* Optional source routine and training-day references used only for traceability.
* Snapshotted routine and selected training-day names.
* Local workout date.
* Derived scheduled weekly position from that date.
* Snapshotted indication that the scheduled slot was rest or training.
* Optional scheduled training-day identity and snapshotted name.
* Selected training-day identity and snapshotted weekly position.
* Selection kind: `scheduled` or `alternate`.
* Status: `in_progress` or `cancelled`.
* Required UTC start timestamp.
* Nullable UTC cancellation timestamp.

Source identifiers must not be the only representation of historical identity. If foreign keys are
used, deletion uses `SET NULL` or equivalent non-cascading behaviour while snapshot values remain.

F13 introduces ordered `WorkoutExercise` rows containing the exercise/configuration snapshot and
ordered `WorkoutPlannedSet` rows containing the complete F09 planned-set snapshot. Positions are
one-based, unique within their parent, and contiguous at creation. Numeric values use the same
fixed-precision semantics as F09.

F13 introduces `ActiveWorkout` with:

* One required unique user reference.
* One required unique workout-session reference.
* An ownership-preserving relational constraint ensuring the workout belongs to that user.

The association cascades with its user or workout. A workout snapshot cascades only with its parent
workout or owning user, never with planning records.

The status/timestamp relationship must enforce or validate:

* `in_progress` implies `cancelled_at` is null.
* `cancelled` implies `cancelled_at` is present.
* Only an `in_progress` workout may have an `ActiveWorkout` association.

F13 does not add actual-performance columns to planned snapshot rows.

## API Requirements

All endpoints require authentication. Request bodies reject unknown fields. IDs are strict positive
integers. Ownership failures do not disclose other users' resources.

### Session preview

A start-session preview contains only the information needed to choose a session:

```json
{
  "id": 31,
  "name": "Pull",
  "week_position": 3,
  "exercise_count": 3,
  "set_count": 10,
  "can_start": true,
  "exercises": [
    {
      "position": 1,
      "name": "Lat Pulldown",
      "set_count": 4
    }
  ]
}
```

`can_start` is derived and never accepted from clients. Empty sessions return zero counts, an empty
exercise array, and `can_start: false`.

### `GET /api/workouts/start-context?local_date=YYYY-MM-DD`

Returns one validated discriminated state:

* `active_workout` with the current workout summary and resume URL when one exists.
* `no_active_routine` when no plan is selected.
* `rest_day` with active-routine context and all session previews when the date's slot is rest.
* `scheduled_session` with active-routine context, the scheduled preview, and all session previews
  when the date's slot is training.

The scheduled-session response represents empty scheduled sessions through `can_start: false`
rather than a separate transport error.

Returns:

* `200` with exactly one valid state.
* `401` when unauthenticated.
* `422` for a missing, repeated, malformed, or invalid calendar date.

### `POST /api/workouts`

Accepts:

```json
{
  "training_day_id": 31,
  "local_date": "2026-08-12"
}
```

The client does not submit routine identity, scheduled-session identity, weekly positions, selection
kind, snapshot content, status, owner, or timestamps.

Returns:

* `201` with the complete created workout snapshot.
* `404 {"detail":"Training day not found"}` when the selected day is unknown, inaccessible, or no
  longer belongs to the active routine.
* `409 {"detail":"No active routine"}` when no routine is active.
* `409 {"detail":"Training day has no configured exercises"}` when it is empty.
* `409` with a deliberate typed `active_workout` body when a workout is already in progress.
* `422` for missing, unknown, wrongly typed, boolean, non-positive, or invalid date fields.
* `401` when unauthenticated.

The frontend handles the active-workout conflict by offering resume and never retries creation
blindly.

### `GET /api/workouts/active`

Returns:

* `200` with the complete active workout snapshot.
* `200` with JSON `null` when none exists.
* `401` when unauthenticated.

### `GET /api/workouts/{workout_id}`

Returns:

* `200` with the complete owned workout snapshot, including cancelled state.
* `404 {"detail":"Workout not found"}` when unknown or inaccessible.
* `422` for an invalid ID.
* `401` when unauthenticated.

### `POST /api/workouts/{workout_id}/cancel`

Accepts no body and returns:

* `200` with the complete cancelled workout snapshot.
* `404 {"detail":"Workout not found"}` when unknown or inaccessible.
* `409 {"detail":"Workout is not in progress"}` when already cancelled.
* `422` for an invalid ID.
* `401` when unauthenticated.

## UI Requirements

F13 follows `harness/context/07_UI_DESIGN_SYSTEM.md` and extends no visual language locally.

### Navigation and routes

The authenticated primary destinations become Today, Plan, Exercises, and Profile. Today uses a
calendar/check or equivalent existing Lucide icon with visible text. The current destination uses
text and non-color state. Mobile bottom navigation retains safe-area padding and must remain usable
with four destinations at 360 px.

Canonical routes are:

* `/today`
* `/workouts/:workoutId`

Browser Back from a workout returns to Today without cancelling it. Leaving through primary
navigation also preserves it. Refresh restores both routes after authentication/profile guards.
After successful cancellation, route replacement opens Today so Back does not present the cancelled
workout as though it were active.

### Today hierarchy and dominant actions

For a scheduled executable session, `Start workout` is the sole primary action. `Choose another
session` is secondary. After another session is selected, the preview clearly distinguishes
`Selected` from the originally scheduled session without relying on color.

For an active workout, `Resume workout` is the sole primary action. No competing start action is
shown.

For no-active, scheduled-empty, and all-empty states, the relevant Plan/configuration navigation is
the sole primary action. Rest day has no dominant action unless another executable session can be
chosen; choosing is then secondary in visual treatment because rest is a valid confirmed state.

### Workout outline

The workout screen prioritizes selected session identity, active status, and the compact ordered
exercise/set-count outline. It does not copy planning-card density or expose disabled future
tracking controls.

`Discard workout` remains visually secondary until its confirmation opens. The confirmation names
the selected session and explains that the started workout will be recorded as cancelled and can no
longer be resumed. Only the confirmed action uses the danger treatment.

### Reused primitives

Reuse `AppShell`, `Page`, `ScreenHeader`, `Section`, `Card`, `Badge`, `Button`, `Alert`, `EmptyState`,
`LoadingState`, and `Dialog`. Use the existing responsive `Dialog` rather than adding a BottomSheet
solely for session selection. A feature-specific session preview composes these primitives and does
not introduce a generic visual convention.

### States and request behaviour

Exercise and validate:

* Today loading.
* No active routine.
* Rest day with and without executable alternatives.
* Scheduled executable session.
* Scheduled empty session.
* Alternative-session selection.
* All sessions empty.
* Start pending, success, stale-selection failure, active-workout conflict, and unexpected failure.
* Active-workout loading and resume.
* Workout loading, loaded, cancelled, not-found, and malformed-response states.
* Cancellation confirmation, pending, success, and recoverable failure.

Pending actions keep confirmed context visible, prevent duplicates, and use explicit labels such as
`Starting…` and `Discarding…`. Errors appear at the smallest recoverable boundary and never replace
a usable Today context with a global failure screen.

### Accessibility and responsive behaviour

All controls have visible focus, keyboard access, and at least 44 by 44 CSS-pixel targets. The
frequent Start and Resume actions are 48–56 pixels high on mobile. Selection and workout status are
announced and understandable without color. Dialog focus is contained and restored according to
the shared contract.

Validate Today, the session selector, workout outline, and cancellation dialog at 360 px, 390 px,
430 px, a representative tablet/small desktop width, and a wide desktop width. They must support
200% zoom, safe areas, reduced motion, and the on-screen keyboard where applicable, with no
document-level horizontal overflow or navigation-obscured final action.

## Business Rules

* Today is based on the browser-supplied local calendar date and fixed ISO weekday mapping.
* The active routine is the only source from which a new workout may be started.
* A session requires at least one configured exercise to be started.
* A user may choose another executable session without changing the routine schedule.
* Each user has at most one in-progress workout.
* Starting records both the scheduled state and the selected session as immutable facts.
* Selecting the scheduled session records `scheduled`; any other selection records `alternate`.
* A rest-day workout is an `alternate` selection with no scheduled training day.
* Starting snapshots the complete selected prescription atomically.
* Plan edits and deletion never rewrite or delete workout snapshots.
* Starting, resuming, and cancelling do not change plan timestamps.
* Cancelling retains the workout and snapshot as a fact but clears the active selection.
* Deleting a fitness profile preserves workout data; deleting the user removes it.
* F13 records no actual performance and makes no adherence judgment.

## Validation

* `local_date` is a strict real ISO calendar date in `YYYY-MM-DD` form.
* Workout, routine, and training-day IDs are strict positive integers; booleans are invalid.
* Request bodies reject unknown fields.
* The selected training day belongs to the authenticated user's active routine at commit time.
* The selected training day has at least one configured exercise at commit time.
* Snapshot exercise and set positions preserve canonical plan order.
* Snapshot numeric and nullable values preserve F09 semantics and precision.
* Scheduled/selected identity, selection kind, status, and timestamps are internally consistent.
* Failed start and cancellation operations leave all persisted state unchanged.

Migration validation must include:

* Applying the complete migration history to a fresh isolated database and verifying workout,
  snapshot, and active-workout tables, ownership constraints, uniqueness, status/timestamp checks,
  fixed precision, positions, and cascade/non-cascade behaviour.
* Creating an isolated database at the previously committed Alembic head, applying the F13
  migration, and verifying existing users, profiles, routines, active selections, schedules,
  configurations, and sets remain unchanged.
* Exercising authenticated scheduled start, alternate start, resume, and cancellation through real
  API paths against a migrated upgraded database.
* Editing and deleting source planning records after start and verifying the workout remains fully
  readable from its snapshot.
* Comparing `alembic current` and `alembic heads` for the actual configured local development
  database and safely upgrading it before reporting F13 locally operational.
* Confirming that rerunning the supported migration command is safe and creates no duplicate schema
  objects or data.

Tests using `Base.metadata.create_all()` do not satisfy the migration-validation gate.

## Acceptance Criteria

* [ ] Today is an authenticated primary destination and the default authenticated landing route.
* [ ] Today resolves the active routine's scheduled slot from a valid browser-local date.
* [ ] A scheduled executable session shows routine/session context and ordered exercise/set-count
  preview before start.
* [ ] No-active, rest-day, scheduled-empty, all-empty, loading, and failure states are distinct and
  recoverable.
* [ ] The user can select another executable session in weekly order without modifying the plan.
* [ ] Empty, stale, inactive-routine, foreign, and other-user training days cannot be started.
* [ ] Starting atomically creates one workout, its complete immutable snapshot, and active selection.
* [ ] The workout records what was scheduled and what was selected, including rest-day alternatives.
* [ ] A user cannot create a second in-progress workout and can safely resume the first.
* [ ] Different users may have independent in-progress workouts and cannot inspect each other's.
* [ ] Refresh and direct navigation restore Today and owned workout routes correctly.
* [ ] The workout outline is read-only and exposes no performed-value or set-completion controls.
* [ ] Editing, switching, deactivating, or deleting source plan records does not change or remove the
  workout snapshot.
* [ ] Discard confirmation records cancellation, retains the snapshot, clears active selection, and
  returns to Today.
* [ ] Failed start or cancellation preserves confirmed UI and persistence state and permits recovery.
* [ ] Malformed success/error payloads are normalized and never rendered directly.
* [ ] Browser Back or primary navigation never implicitly cancels a workout.
* [ ] Today, selection, outline, and confirmation flows meet keyboard, focus, touch, safe-area, zoom,
  reduced-motion, and responsive contracts with no document-level overflow at required widths.
* [ ] No set tracking, actual performance, exercise navigation, skip, timer, feedback, completion,
  history list, analytics, adaptation, recommendation, or AI behaviour is introduced.
* [ ] Existing authentication, onboarding, profile, catalog, routine CRUD, active routine, schedule,
  and exercise-configuration flows retain their documented behaviour except for the intentional
  authenticated default-route and navigation additions.
* [ ] Fresh and previous-head migrations, real migrated-database flows, and actual local database
  revision checks pass.
* [ ] Backend and frontend formatting, linting, type checking, builds, relevant automated tests, and
  the focused manual UI validation pass.

## Tests

Backend tests cover:

* Start-context resolution for no active routine, rest, executable scheduled session, empty
  scheduled session, and an existing active workout.
* Scheduled start with an exact ordered snapshot of all F09 exercise and set fields.
* Alternate start on another training day and on a rest day, preserving scheduled and selected facts
  without changing the schedule or plan timestamps.
* Empty, stale, inactive-routine, same-user wrong-routine, and other-user selection rejection without
  partial persistence.
* Singleton active-workout enforcement, including a representative competing or duplicate start,
  plus independent active workouts for different users.
* Active lookup, direct owned lookup, cancelled lookup, and ownership-isolated not-found behaviour.
* Cancellation preserving snapshot data and atomically clearing the active association.
* Source plan edit and deletion after start, confirming the snapshot remains unchanged and readable.
* Fitness-profile deletion preserving workout data and user deletion cascading it.
* One representative invalid body/date and one simulated snapshot failure, both leaving persistence
  unchanged.
* One combined unauthenticated test covering every new endpoint.
* Required fresh and previous-head migration paths with real authenticated API flows.

The frontend currently has no focused unit-test runner. Type checking and focused code inspection
must therefore verify the discriminated start-context variants, complete workout snapshot, literal
active-workout `null`, typed conflict, FastAPI validation detail, and malformed success/error
fallbacks. A future frontend unit runner may automate these boundaries when separately justified;
F13 does not introduce one.

Focused manual UI validation exercises:

* Scheduled Today preview, start, workout URL, refresh, navigation away, and resume.
* Rest day followed by selection and start of another session.
* No-active and scheduled-empty recovery actions.
* Existing active workout preventing another start.
* Cancellation confirmation success and one failure that remains recoverable.
* Direct foreign/unknown workout URL not-found behaviour.
* Browser Back preserving the active workout.
* No document-level overflow for Today, selection, workout outline, and cancellation dialog at 360,
  390, and 430 px, plus representative desktop inspection.
* Keyboard-visible focus, dialog containment/Escape/restoration, non-color selected/active state,
  and usable touch-target sizes.

Do not add one test per weekday, exercise count, nullable snapshot combination, or malformed payload
variant. In accordance with DEC-019, F13 adds no Playwright or other automated browser/end-to-end
tests, and existing browser-test execution is not a completion gate.

## Out of Scope

* Recording actual repetitions, load, duration, distance, RIR, tempo, or notes.
* Completing, editing, undoing, reordering, or otherwise tracking performed sets.
* Current-exercise state, next/previous exercise navigation, exercise skipping, or substitutions.
* Running rest timers, notifications, background timers, or wake locks.
* Exercise difficulty, pain/discomfort, skip reasons, or other workout feedback.
* Workout completion, summary, history list, historical editing, or deletion.
* Statistics, adherence scores, streaks, progress charts, derived signals, adaptations, or AI.
* Starting from an inactive routine or an empty training day.
* Automatically modifying the weekly schedule because another session was selected.
* Calendar recurrence, schedule exceptions, rotating weeks, timezone preferences, or backdated
  workout creation UI.
* Offline creation, background synchronization, service workers, or install prompts.
* Changes to F09 prescription semantics or F11 routine activation readiness.

## Dependencies

* F01 — Project Infrastructure.
* F02 — User Authentication.
* F03 — User Fitness Profile.
* F04 — Profile Management.
* F05 — Exercise Catalog.
* F07 — Routine Creation.
* F08 — Training Day Management.
* F09 — Routine Exercise Configuration.
* F10 — Routine Schedule.
* F11 — Active Routine.
* F12 — Mobile-first UI System and Phase 1 UX Refresh.

F06 remains intentionally skipped and introduces no dependency.

## Notes

Prefer a dedicated `ActiveWorkout` association, matching the explicit singleton approach used for
`ActiveRoutine`, over a mutable active flag on every workout or a SQLite-specific filtered unique
index.

Store snapshot values as workout-owned data even when optional source identifiers are retained.
Never render a historical workout by joining back to mutable planning rows.

The `scheduled` / `alternate` classification records the user's start choice. It must not be named
or presented as compliance, adherence, success, failure, or a recommendation in F13.
