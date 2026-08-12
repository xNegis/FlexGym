# F10 — Routine Schedule

## Objective

Give every training day in a routine exactly one position in a fixed Monday-to-Sunday weekly cycle.

F10 introduces schedule assignments as the relationship between a configured training session and
the weekday on which it is planned. Weekly placement becomes the canonical display order for
training days; there is no separate manually managed training-day order.

The seven weekly positions always exist conceptually. A position with an assignment is `training`;
a position without one is `rest`. Rest is derived and is not persisted as a training day, a
sentinel ID, or an assignment with a nullable training-day reference.

## Context

F07 introduced user-owned routines. F08 introduced up to seven training-day records, and F09
attached configured exercises and planned sets to them. DEC-014 separated a training session from a
weekly position and established that rest is the absence of a training-day assignment.

F10 deliberately supersedes one part of F08 and DEC-014: training days no longer retain a display
order independent from weekly placement. Their order is derived from their assigned
Monday-to-Sunday positions.

The planning hierarchy after F10 is:

```text
User
└── Routine
    ├── Weekly cycle (Monday through Sunday)
    │   ├── assigned TrainingDay, or
    │   └── derived Rest
    └── TrainingDay
        └── Ordered configured exercises
            └── Ordered configured sets
```

Routine state or activation does not govern schedule consistency. From F10 onward, a training day
and its assignment are created and deleted together. A routine with no training days exposes seven
derived rest positions.

## User Experience

Routine detail presents a seven-position weekly schedule labelled Monday through Sunday. Each
position shows either its assigned training day, including exercise count, or a clear Rest state.

Creating a training day automatically places it in the earliest free position, scanning Monday
through Sunday. The user does not select a weekday during creation.

The user can later move a training day:

* Moving it to a rest position leaves its previous position as rest.
* Moving it to an occupied position swaps the two training days atomically.

Renaming a training day or editing its exercises preserves its placement. Deleting it removes its
assignment, so its former position becomes rest.

## Functional Requirements

### FR-1 — Fixed weekly cycle

Every routine exposes exactly seven ordered positions in fixed ISO weekday order:

1. Monday
2. Tuesday
3. Wednesday
4. Thursday
5. Friday
6. Saturday
7. Sunday

Weekday identity is derived from position and is not user-configurable. Locale-dependent week starts
are out of scope.

### FR-2 — Schedule assignments

A schedule assignment associates exactly one training day with exactly one weekly position in the
same routine. Only training positions have persisted assignments. A position without an assignment
is derived as `rest`; no placeholder rest row or special rest training day is created.

Every persisted training day has exactly one assignment. No supported operation may leave an
existing training day unassigned.

### FR-3 — Atomic creation and automatic placement

Creating a training day also creates its assignment in the same transaction. The backend assigns
the first free position in ascending order from Monday to Sunday.

For example, if Monday and Tuesday are occupied, a new training day is assigned to Wednesday. This
does not depend on names, routine state, or profile preferences.

The operation remains subject to the seven-training-day limit. If no position is free, creation
returns the documented limit conflict and persists neither record. Invalid input or persistence
failure also leaves both absent. The client cannot provide a position during creation.

### FR-4 — Canonical training-day order

Training days are listed in ascending assigned weekly position, with ID as a defensive tie-breaker.
Their former independent `position` is removed from the domain and public API.

The F08 training-day reorder operation and its frontend controls are removed. Changing weekly
placement is the only supported way to change training-day order. Exercise order inside a training
day remains unchanged.

### FR-5 — Move to rest

The user can move an owned training day to any weekly position in the same owned routine. If the
target is rest, its assignment changes to that position and the source becomes derived rest.

The training-day identity, name, configured exercises, planned sets, and creation timestamp remain
unchanged.

### FR-6 — Swap occupied positions

If the target position contains another training day, both assignments swap positions in one
transaction. Neither training day is deleted, cloned, or recreated.

The implementation must use a collision-free strategy compatible with immediate uniqueness checks.
A failed move or swap preserves both prior assignments and all relevant timestamps.

### FR-7 — Training-day deletion

Deleting a training day also deletes its assignment in the same transaction. Its former position
becomes rest. No remaining training day moves automatically.

The confirmation names the training day and weekday, warns that configured exercises and planned
sets will be permanently deleted, and explains that the weekday will become rest. A later creation
may reuse the freed position because it is then the earliest available weekday.

### FR-8 — Parent deletion

Deleting a routine deletes its assignments together with its training days and nested plans.
Deleting a fitness profile continues to leave routines and their assignments intact. Deleting the
owning user deletes both.

### FR-9 — Derived slot type

The public contract exposes a closed `ScheduleSlotType` vocabulary:

* `training`
* `rest`

The type is derived in responses, never accepted from clients, and never stored. A slot is
`training` exactly when an assignment exists; otherwise it is `rest`.

### FR-10 — Plan timestamps

Creating a training day and assignment refreshes the routine timestamp in the existing creation
transaction. Moving a training day refreshes that day and its routine. A swap refreshes both days
and the routine. Deletion refreshes the routine. Failed mutations refresh no timestamp.

### FR-11 — Authentication and ownership

Every schedule endpoint requires authentication. Unknown and other-user routine IDs produce the
same routine-not-found response. A training-day ID outside the selected owned routine produces
training-day-not-found without revealing its owner or parent.

The frontend exposes schedule management only after profile onboarding. The API does not require a
current fitness profile; deleting and recreating a profile does not affect the schedule.

### FR-12 — Request and error states

The UI distinguishes loading, all-rest, populated, move-pending, delete-confirmation,
mutation-pending, and recoverable failure states. Conflicting controls are disabled while a move is
pending.

The UI commits a placement only after a validated success response, or restores the last confirmed
schedule after failure. Expected, malformed, and unexpected server responses are normalized at the
frontend API boundary; React never renders raw response values.

### FR-13 — Architectural boundaries

Endpoints remain thin. Schedule construction, ownership checks, first-free placement,
same-routine validation, move and swap behaviour, derived rest slots, canonical ordering, cascades,
and timestamps live outside the HTTP layer.

Training-day creation and deletion services own assignment changes so the invariant cannot be
bypassed through existing endpoints. React components use the frontend API layer.

## Domain / Data Requirements

F10 introduces `RoutineScheduleAssignment` with:

* Required parent routine reference.
* Required training-day reference.
* Required one-based weekly position.

It has no user-facing name, nullable training-day reference, rest flag, slot type, weekday string,
notes, or timestamps.

Persistence must enforce:

* Uniqueness of `(routine_id, week_position)`.
* Uniqueness of `training_day_id`.
* `week_position` between 1 and 7.
* Cascading removal with its training day or routine.
* Prevention of an association between a training day and a different routine through a suitable
  relational constraint, in addition to service validation.

Supported writes enforce the complementary invariant that every persisted training day has an
assignment. `TrainingDay.position` and its `(routine_id, position)` uniqueness constraint are
removed. Weekly position exists only on the assignment.

### Migration of existing data

Create one assignment for every existing training day using its current F08 display position as
`week_position`. Existing constraints already make these values unique and between one and seven,
so this preserves visible order without inventing placement.

Only after successful backfill and integrity verification may the migration remove the old position
column and constraint. Training-day IDs, exercise configurations, and configured sets remain
unchanged.

## API Requirements

All endpoints require authentication. Request bodies reject unknown fields. IDs are strict positive
integers where applicable.

### Schedule response

The response is a discriminated seven-slot array in Monday-to-Sunday order. A training slot is:

```json
{
  "position": 1,
  "weekday": "monday",
  "type": "training",
  "training_day": {
    "id": 31,
    "name": "Push",
    "week_position": 1,
    "exercise_count": 5,
    "created_at": "2026-08-12T09:30:00",
    "updated_at": "2026-08-12T10:15:00"
  }
}
```

A rest slot has no `training_day` member:

```json
{
  "position": 2,
  "weekday": "tuesday",
  "type": "rest"
}
```

Training-day representations returned by existing endpoints replace `position` with
`week_position` and are ordered by that value.

### `GET /api/routines/{routine_id}/schedule`

Returns:

* `200` with exactly seven ordered slots; an empty routine returns seven rest slots.
* `404 {"detail":"Routine not found"}` when inaccessible.
* `401` when unauthenticated.
* Framework `422` when `routine_id` is not a positive integer.

### `PUT /api/routines/{routine_id}/schedule`

Moves one training day and applies the documented swap when its target is occupied.

Accepts:

```json
{
  "training_day_id": 31,
  "week_position": 2
}
```

Returns:

* `200` with the complete updated schedule, including a no-op targeting the current position.
* `404 {"detail":"Routine not found"}` when inaccessible.
* `404 {"detail":"Training day not found"}` when the owned routine does not contain the day.
* `422` for missing, unknown, wrongly typed, or invalid fields, including positions outside 1–7.
* `401` when unauthenticated.

The client cannot submit type, weekday, source position, replacement ID, or owner. The backend
derives the source and any training day occupying the target.

### Changes to existing training-day endpoints

`POST /api/routines/{routine_id}/days` keeps its request and status contract, creates the first-free
assignment atomically, and returns `week_position` instead of `position`.

`GET /api/routines/{routine_id}/days` orders by and exposes `week_position`.

`PUT /api/routines/{routine_id}/days/{day_id}` preserves placement while renaming.

`DELETE /api/routines/{routine_id}/days/{day_id}` deletes the assignment with the day.

`PUT /api/routines/{routine_id}/days/order` is removed, and the frontend no longer calls it.

### Error normalization

Frontend parsing validates all seven unique positions, fixed weekday mapping, discriminant, and
conditional training-day shape. It handles string-detail errors, FastAPI array-shaped `422`
details, malformed JSON, empty expected bodies, and invalid successful payloads. Components receive
stable messages or deliberate typed outcomes.

## UI Requirements

### Weekly schedule

Routine detail replaces the independently ordered training-day list with a Weekly schedule section
showing Monday through Sunday. Training positions show weekday, session name, exercise count, and
actions for exercises, rename, move, and delete. Rest positions show weekday and Rest.

Loading must not briefly render rest. Failure provides a normalized message and Retry without
hiding routine metadata or existing navigation. The layout remains usable on a common mobile
viewport without horizontal scrolling.

### Creation

The Add training day form remains available below seven sessions and explains automatic placement
in the earliest available weekday. After success, the session appears there and the routine count
refreshes. Failure preserves the name and confirmed schedule. No weekday selector is shown during
creation.

### Moving and swapping

Each training slot has a keyboard- and touch-usable weekday selector. The UI explains that an
occupied target swaps sessions and a rest target moves the session. It prevents conflicting
schedule mutations while pending.

Success renders the validated server response. Failure restores the confirmed schedule, shows a
recoverable message, and permits retry. Drag-and-drop is neither required nor sufficient.

### Existing actions and deletion

Rename and exercise management retain the stable training-day ID and show weekday context instead
of independent position. Deletion confirmation includes the weekday, nested-data warning, and
resulting rest state. Failure leaves the confirmation and schedule usable.

The old Move up and Move down controls and independent reorder-pending behaviour are removed.

## Business Rules

* Every routine exposes seven fixed positions from Monday through Sunday.
* A training day is a configured session, not a weekday or rest record.
* A routine contains zero to seven training days.
* Every training day has exactly one assignment; every position has at most one.
* Missing assignment means rest; slot type is derived and never persisted.
* Creation assigns the earliest free position atomically.
* Training-day display order is ascending weekly position.
* Moving to rest changes one assignment; moving to an occupied position swaps two.
* Placement changes preserve training-day identity and nested exercise configuration.
* Rename and exercise edits preserve placement.
* Deletion removes the assignment and creates a derived rest position.
* Schedule rules do not depend on profile preferences or routine activation state.
* Placement is mutable plan data, not workout-performance data.

## Validation

* `week_position` is a strict integer from 1 through 7; booleans are invalid.
* Submitted IDs are strict positive integers.
* Request bodies reject unknown fields.
* The submitted day belongs to the selected owned routine.
* Creation selects exactly the earliest free position.
* Every successful mutation leaves every remaining training day assigned once.
* Failed mutations preserve assignments, nested plan data, and timestamps.
* Responses contain positions 1–7 exactly once in order with matching weekdays.
* Only training slots contain a training-day object.

Migration validation must include:

* Complete history against a fresh isolated database, verifying foreign keys, cascades, uniqueness,
  position checks, cross-routine integrity, and absence of the obsolete position.
* Upgrade from previous head `273789964714` with representative existing positioned days and nested
  plans, verifying position backfill and stable training-day and nested-record IDs.
* Real authenticated retrieval, first-free creation, and move or swap flows against the upgraded
  database.
* Comparison of `alembic current` and `alembic heads` for the configured local database and safe
  upgrade before reporting F10 locally operational.
* Safe rerun of the supported migration command without duplicate assignments or data.

`Base.metadata.create_all()` tests do not satisfy this migration gate.

## Acceptance Criteria

* [ ] Every schedule returns seven Monday-to-Sunday positions.
* [ ] Assigned positions are `training`; missing assignments are `rest` without null or sentinel IDs.
* [ ] Creation atomically assigns the earliest free weekday.
* [ ] Failed or eighth creation persists neither a day nor an assignment.
* [ ] Training days are listed by weekly position without an independent display position.
* [ ] Moving to rest preserves the training day and makes its source rest.
* [ ] Moving to an occupied position swaps sessions atomically without cloning either.
* [ ] Invalid or foreign moves preserve the complete schedule and timestamps.
* [ ] Rename and exercise editing preserve placement.
* [ ] Deletion removes the assignment, makes its weekday rest, and preserves other assignments.
* [ ] Deletion confirmation names the weekday and describes its resulting rest state.
* [ ] Constraints prevent duplicate occupancy, duplicate day assignment, invalid positions, and
  cross-routine associations.
* [ ] Schedule mutations refresh the documented timestamps atomically.
* [ ] Ownership failures have the documented non-disclosing behaviour.
* [ ] Loading, all-rest, populated, move, swap, deletion, and failure states are recoverable.
* [ ] Malformed responses are normalized and never rendered directly.
* [ ] Controls are keyboard-accessible and usable at mobile width.
* [ ] No rest record, persisted slot type, nullable/sentinel assignment, activation state, calendar
  date, recurrence, workout fact, or profile-derived recommendation is introduced.
* [ ] Existing authentication, profile, catalog, routine, exercise-configuration, health, CORS, and
  backend-unavailable flows retain their behaviour apart from the explicit ordering change.
* [ ] Fresh migration, upgrade from `273789964714`, and actual local database revision checks pass.
* [ ] Backend and frontend formatting, linting, type checking, and relevant tests pass.

## Tests

Keep automated coverage focused, consistently with DEC-008.

Backend tests cover:

* Empty schedule returning seven rest slots.
* Successive creations selecting Monday, Tuesday, then the next free position atomically.
* Deletion followed by creation reusing the earliest newly free position.
* Correct discriminated training/rest response shapes.
* Move-to-rest and occupied swap with stable IDs, nested data, ordering, and timestamps.
* One invalid move preserving assignments and timestamps.
* Ownership isolation, including foreign days from another owned routine and another user.
* Day and routine cascade behaviour, and profile deletion preserving assignments.
* Seven-day limit leaving both day and assignment tables unchanged.
* One combined unauthenticated schedule-endpoint test.
* Fresh and previous-head migration paths preserving days, exercises, sets, and old positions as
  assignments, including a real authenticated migrated-database flow.

Do not add one test per weekday, swap pair, parser failure, or UI state.

Frontend automated and browser-level tests remain deferred. Manual execution or code inspection must
verify loading/all-rest/populated/failure states, automatic placement, move, swap, failed move,
rename and exercise placement preservation, deletion copy, removal of old reorder controls and API,
safe response parsing, duplicate-submission prevention, keyboard use, and mobile layout.

Existing tests must be updated for the intentional ordering change and otherwise continue to pass.

## Out of Scope

* Active routine, activation readiness, plan switching, or archival.
* Calendar dates, rotating or alternating schedules, recurrence, and configurable week starts.
* Persisted rest records, rest IDs or notes, or persisted rest/training types.
* Unassigned persisted training days.
* Choosing a weekday during creation or distributing by profile availability.
* Profile-derived validation or recommendations.
* Routine/day duplication, templates, import/export, sharing, or collaboration.
* Workout execution, today's-workout selection, facts, timers, feedback, history, analytics,
  adaptation, suggestions, or AI.
* Changes to exercise/set ordering, custom exercises, or the global catalog.
* Frontend automated or browser-level testing.

## Dependencies

* F01 — Project Infrastructure.
* F02 — User Authentication.
* F03 — User Fitness Profile.
* F04 — Profile Management.
* F05 — Exercise Catalog.
* F07 — Routine Creation.
* F08 — Training Day Management.
* F09 — Routine Exercise Configuration.

F06 was intentionally skipped and adds no dependency.

## Notes

Do not encode rest with a reserved training-day ID. The absence of an assignment is its complete
persistence representation.

Move and swap writes must account for SQLite's immediate uniqueness checking with a collision-free
atomic strategy.

Construct seven response slots from the fixed weekday mapping and stored assignments. Do not store
seven schedule rows solely to produce the public cycle.

Because this changes an implemented F08 contract, update models, services, schemas, frontend types,
response validators, UI controls, and existing tests together so no obsolete independent position
remains as a second source of truth.
