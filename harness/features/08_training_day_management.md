# F08 — Training Day Management

## Objective

Allow an authenticated user to define and manage the ordered training sessions that compose one
personal routine.

F08 introduces training days as stable child records of a routine. A training day represents one
planned workout session, such as `Push`, `Pull`, or `Legs`. It gives the next feature a concrete
container to which configured exercises can be attached.

F08 does not assign training days to weekdays. A later Routine Schedule feature will provide the
routine's fixed seven-position weekly cycle and will distinguish training from rest days.

## Context

F07 introduced user-owned routines as complete training-plan containers but deliberately left them
empty. DEC-013 established that the number of training days must be derived from actual child
records. DEC-014 distinguishes those training sessions from the seven positions of the routine's
future weekly schedule.

The planning hierarchy after F08 is:

```text
User
└── Routine
    └── Ordered training days (0–7)
        └── Configured exercises (future feature)
```

A routine remains an editable draft while it is being built. It need not yet contain a training day
and cannot yet be scheduled or activated.

## User Experience

An authenticated user with completed onboarding opens a routine detail view and sees a Training
days section below the routine metadata.

From that section the user can:

* Inspect the routine's training days in explicit display order.
* Add a named training day at the end of the list.
* Rename an existing training day.
* Move a training day one position up or down.
* Permanently remove a training day after explicit confirmation.

The section explains that weekly placement and rest days will be configured separately. Creating
three training days therefore does not yet mean Monday, Wednesday, and Friday, nor does it create
four persisted rest-day records.

## Functional Requirements

### FR-1 — Routine-owned training days

Persist each training day as a child of exactly one routine. Ownership is inherited through the
routine; the client cannot provide or change a user or routine owner independently.

An authenticated user can list, create, rename, reorder, and delete training days only inside their
own routines. Unknown routines and routines owned by another user produce the same routine-not-found
response.

### FR-2 — Training-day creation

The user creates a training day by providing a required name. Creation appends it after every
existing training day in the routine and assigns the next contiguous one-based position.

Training-day names do not need to be unique inside a routine. Two separate sessions may both be
called `Full Body`; their stable IDs and positions distinguish them.

Creation is atomic. Invalid input, an inaccessible routine, or the seven-training-day limit must not
create a partial record or disturb existing positions.

### FR-3 — Seven-training-day limit

A routine may contain at most seven training days because every training day must later occupy
exactly one position in the routine's seven-position weekly schedule.

The eighth creation attempt is rejected with a stable conflict response. Deleting a training day
makes room for another one.

This limit is independent from the fitness profile's preferred `training_days_per_week`. F08 neither
copies that preference nor requires the routine to match it.

### FR-4 — Ordered listing

Training days are returned in ascending explicit position, with ID as a deterministic defensive
tie-breaker. Positions are public, one-based, unique within the routine, and contiguous from `1` to
the number of training days.

An empty routine returns an empty list rather than placeholder or rest-day records.

### FR-5 — Training-day editing

The user can rename an owned training day in one explicit save operation. Renaming preserves its
identity, parent routine, position, and creation timestamp and refreshes its update timestamp.

Cancelling an edit issues no update request. A failed update retains the entered value and leaves
the editor usable.

### FR-6 — Training-day reordering

The user can move a training day up or down in the display order. The UI disables moving the first
item up and the last item down.

The client submits the complete desired ordered list of training-day IDs. The backend validates that
the list contains every current training day exactly once and no other ID, then replaces all
positions atomically. Invalid ordering requests leave the existing order unchanged.

Reordering changes only training-day display order. It does not imply or persist a weekly schedule.

### FR-7 — Training-day deletion

Deleting a training day requires an explicit in-application confirmation that names the day. After
deletion, later positions are compacted within the same transaction so the remaining sequence stays
contiguous.

F08 permits permanent deletion because training days cannot yet contain configured exercises or
workout history. The next feature that introduces dependent records must revisit deletion semantics
and confirmation copy before implementation.

### FR-8 — Routine deletion with training days

Permanently deleting a routine also deletes all of its training days through the persistence
relationship. The existing routine-deletion confirmation must state that its training days will
also be permanently deleted.

Deleting a fitness profile continues to leave routines and their training days intact. Deleting the
owning user eventually deletes both.

### FR-9 — Derived training-day count

Every public routine representation gains `training_day_count`, derived from its actual training-day
records. It is never accepted from a client and is not stored as independent routine metadata.

Creating or deleting a training day changes the count. Renaming or reordering does not.

### FR-10 — Routine plan update timestamp

Creating, renaming, reordering, or deleting a training day refreshes the parent routine's
`updated_at` timestamp because the routine plan has changed. The mutation and timestamp update occur
in the same transaction.

### FR-11 — Authentication and onboarding boundary

Every training-day endpoint requires authenticated identity. The frontend exposes training-day
management only within routine management after fitness-profile onboarding is complete.

The API does not require an existing fitness profile. Training days remain reachable through their
owned routine if the user deletes and later recreates the profile.

### FR-12 — Request-state and error behaviour

The UI distinguishes initial training-day loading, empty, loaded, create, edit, reorder-pending,
delete-confirmation, mutation-pending, and request-failure states.

Mutation controls prevent duplicate submission while pending. Expected failures and malformed or
unexpected server responses are normalized at the frontend API boundary; React components never
render raw response values.

### FR-13 — Architectural boundaries

HTTP endpoints remain thin. Routine ownership checks, limit enforcement, creation, ordered listing,
lookup, rename, atomic reorder, position compaction, deletion, derived counts, and parent timestamp
updates live in an application service or equivalent non-HTTP boundary.

React components use the frontend API layer rather than calling training-day URLs directly.

## Domain / Data Requirements

F08 introduces `TrainingDay` with:

* Application-generated primary key.
* Required parent routine reference.
* User-facing name.
* One-based display position.
* Creation timestamp.
* Last-update timestamp.

The routine relationship must efficiently retrieve its ordered training days and delete them when
the routine is deleted. A database uniqueness constraint on `(routine_id, position)` protects the
ordering invariant. The service must perform reorder operations in a way that is compatible with
that constraint and SQLite's immediate uniqueness checks.

Training days do not store a direct user reference, normalized name, description, weekday, date,
rest flag, exercise list, schedule slot, or copied profile preference.

### Repeated sessions

Every training day represents one session occurrence in the future seven-day schedule. If a user
wants two equivalent sessions in one week, they create two distinct records. Those records may use
the same name and can later receive independently configured exercises.

### Weekly-cycle boundary

F08 persists no weekly schedule. The later scheduling model will always contain exactly seven
ordered positions. A position will either reference one training day or represent rest through the
absence of an assignment. Every training day will need exactly one assignment before activation.

## API Requirements

All endpoints require authentication. Request bodies reject unknown fields. Nested resources are
always resolved through an owned routine.

The public training-day representation is:

```json
{
  "id": 31,
  "name": "Push",
  "position": 1,
  "created_at": "2026-08-12T09:30:00",
  "updated_at": "2026-08-12T09:30:00"
}
```

Routine representations introduced by F07 gain:

```json
{
  "id": 12,
  "name": "Push Pull Legs",
  "objective": "build_muscle",
  "description": null,
  "training_day_count": 3,
  "created_at": "2026-08-11T15:30:00",
  "updated_at": "2026-08-12T09:30:00"
}
```

Training-day responses do not expose routine IDs, owner IDs, future schedule data, or internal
relationship data.

### `GET /api/routines/{routine_id}/days`

Returns:

* `200` with an ordered JSON array of training days, including `[]` when none exist.
* `404 {"detail":"Routine not found"}` when the routine does not exist or belongs to another user.
* `401` when unauthenticated.
* Framework validation `422` when `routine_id` is not a positive integer.

### `POST /api/routines/{routine_id}/days`

Accepts:

```json
{
  "name": "Push"
}
```

Returns:

* `201` with the created training day.
* `404 {"detail":"Routine not found"}` when the routine does not exist or belongs to another user.
* `409 {"detail":"Routine already has 7 training days"}` when the routine is full.
* `422` for invalid, missing, or unknown fields or an invalid routine ID.
* `401` when unauthenticated.

### `PUT /api/routines/{routine_id}/days/{day_id}`

Accepts the complete editable shape:

```json
{
  "name": "Upper body"
}
```

Returns:

* `200` with the updated training day.
* `404 {"detail":"Routine not found"}` when the routine is inaccessible.
* `404 {"detail":"Training day not found"}` when the routine is owned but the day does not exist
  inside it, including when the ID belongs to another routine.
* `422` for invalid IDs or invalid, missing, or unknown fields.
* `401` when unauthenticated.

### `PUT /api/routines/{routine_id}/days/order`

This static route must not be shadowed by the `day_id` route.

Accepts the complete desired order:

```json
{
  "day_ids": [31, 12, 18]
}
```

Returns:

* `200` with the complete reordered training-day array.
* `404 {"detail":"Routine not found"}` when the routine is inaccessible.
* `422 {"detail":"Day order must contain every training day exactly once"}` when IDs are missing,
  duplicated, extra, or do not all belong to the owned routine.
* `422` for invalid ID types, non-positive IDs, unknown fields, or an invalid routine ID.
* `401` when unauthenticated.

An empty `day_ids` list is valid only when the routine currently has no training days.

### `DELETE /api/routines/{routine_id}/days/{day_id}`

Returns:

* `204` with no response body after deletion and position compaction.
* `404 {"detail":"Routine not found"}` when the routine is inaccessible.
* `404 {"detail":"Training day not found"}` when the owned routine does not contain the day.
* `401` when unauthenticated.
* Framework validation `422` when either ID is not a positive integer.

### Error normalization

Frontend API functions explicitly handle string-detail errors, FastAPI array-shaped `422` details,
malformed JSON, empty bodies where JSON is expected, and unexpected successful payloads. Components
receive stable string messages or deliberate typed not-found/limit outcomes, never arbitrary server
values.

## UI Requirements

### Routine list

Each routine item additionally displays a friendly derived count such as `No training days`,
`1 training day`, or `3 training days`. The count must come from the validated routine response.

### Routine detail and loading

Routine detail retains the existing metadata and actions and adds a Training days section. Opening
detail loads the selected routine's training days. While that request is pending, the section shows
a loading state rather than an empty state.

A list failure displays a normalized message and Retry action without hiding the routine metadata or
its existing Back, Edit, and Delete actions. An inaccessible routine returns the user to a stable
not-found or routine-list state.

### Empty and loaded states

An empty section explains that training days are workout sessions and includes `Add training day`.
It must not display seven empty weekday slots or infer rest days.

The loaded state shows each day name and one-based position in order. Each item exposes Rename,
Delete, Move up, and Move down actions. Reorder controls remain keyboard-accessible and usable at a
common mobile viewport; drag-and-drop is neither required nor sufficient.

At seven training days the add action is disabled or hidden with a useful explanation. It becomes
available after deletion.

### Create and rename

Create and rename use a name input with explicit Save/Add and Cancel actions. The rename form is
pre-populated. Cancelling performs no mutation.

A validation, limit, network, protocol, or malformed-response failure leaves the entered value and
current routine context available for correction, retry, or cancellation.

### Reordering

Moving an item submits the complete resulting order and prevents concurrent reorder mutations until
the request finishes. The UI commits the new order only after a validated success response, or
restores the last confirmed order after a failure. A failed reorder shows a normalized recoverable
message.

### Delete confirmation

Training-day deletion uses an explicit in-application confirmation naming the day and explaining
that the action is permanent. It exposes separate Cancel and Delete training day actions and
prevents repeated submission while pending. Browser-native `window.confirm` is not sufficient.

After successful deletion, the detail remains open with the refreshed compacted list and derived
count. A failed deletion preserves the detail and permits retry or cancellation.

The existing routine deletion confirmation must warn that every training day in the routine will
also be permanently deleted.

### Weekly scheduling explanation

The Training days section contains concise explanatory copy that these sessions will be distributed
across the seven-day routine cycle in a later scheduling step. F08 presents no weekday selector,
seven-slot calendar, rest-day control, or activation action.

## Business Rules

* A routine is a complete training plan; a training day is one workout session inside it.
* A training day is not a weekday, calendar date, or rest day.
* A routine contains between zero and seven training days while being designed.
* Training-day names may repeat within and across routines.
* Training-day identity is stable and independent from its name and position.
* Positions are explicit, one-based, unique per routine, and contiguous.
* New training days are appended.
* Reordering never changes identity and has no weekly-schedule meaning.
* Deletion compacts later positions atomically.
* The public training-day count is derived, never accepted or stored independently.
* Child mutations refresh the parent routine's update timestamp.
* Rest days will be schedule positions without an assigned training day, not training-day records.
* Every training day must later be scheduled exactly once before routine activation.
* F08 does not compare the training-day count with the user's profile availability.

## Validation

* `name` is trimmed, required, non-empty, and at most 120 characters.
* Internal whitespace and Unicode characters in names are preserved.
* Duplicate names are accepted.
* Request bodies reject unknown fields.
* `routine_id`, `day_id`, and every submitted `day_ids` member must be positive integers.
* `day_ids` contains the exact current set of the routine's training-day IDs, each once.
* An eighth training day is rejected without mutation.

The migration must be validated by:

* Applying the complete migration history to a new isolated database and verifying the training-day
  schema, routine foreign key, cascade behaviour, and position uniqueness constraint.
* Creating an isolated database at the previously committed Alembic head `a7b2c3d4e5f6`, applying
  the F08 migration, and exercising training-day creation and ordered retrieval against the upgraded
  database.
* Comparing `alembic current` and `alembic heads` for the actual configured local development
  database and safely upgrading it before reporting F08 as locally operational.
* Exercising at least one authenticated training-day API flow against a migrated database rather
  than a schema created directly from ORM metadata.
* Confirming that rerunning the supported migration command is safe and creates neither duplicate
  schema objects nor data.

Tests that use `Base.metadata.create_all()` remain useful for service and endpoint behaviour but do
not satisfy the migration-validation gate.

## Acceptance Criteria

* [ ] An authenticated user can add up to seven named training days to an owned routine.
* [ ] New training days append with stable IDs and contiguous one-based positions.
* [ ] Duplicate training-day names are accepted and remain distinct records.
* [ ] An eighth creation returns the documented conflict without changing existing data.
* [ ] Training-day lists contain only days from the selected owned routine in deterministic order.
* [ ] Unknown and other-user routine IDs produce the same documented routine-not-found response.
* [ ] A day ID outside the selected owned routine produces the documented training-day-not-found
  response without revealing its owner or parent.
* [ ] A valid rename persists the new name and preserves identity, position, and creation timestamp.
* [ ] Cancelling create or rename performs no mutation.
* [ ] Move-up and move-down actions persist a complete valid ordering without changing identities.
* [ ] Invalid, partial, duplicate, foreign, or stale order submissions are rejected atomically.
* [ ] Deletion requires confirmation, removes only the selected day, and compacts remaining
  positions.
* [ ] Routine representations expose an accurate derived `training_day_count` and never accept it
  from clients.
* [ ] Every training-day mutation refreshes the parent routine's `updated_at` in the same
  transaction.
* [ ] Deleting a routine deletes its training days and the UI confirmation warns about that effect.
* [ ] Deleting a fitness profile leaves routines and training days accessible after profile
  recreation.
* [ ] Loading, empty, loaded, form, reorder-failure, delete-confirmation, and mutation-failure states
  are distinct and recoverable.
* [ ] All training-day endpoints return `401` when unauthenticated.
* [ ] Invalid or unexpected fields return `422` without partial mutation.
* [ ] Malformed success and error responses are not rendered directly by the UI.
* [ ] F08 persists no weekdays, seven-slot schedule, rest-day records, exercises, activation state,
  or copied profile availability.
* [ ] Registration, login, authentication restoration, onboarding, profile management and deletion,
  logout, exercise catalog and detail, routine CRUD, health, CORS, and backend-unavailable flows
  retain their documented behaviour.
* [ ] Training-day controls and routine navigation remain usable at a common mobile viewport without
  horizontal overflow.
* [ ] The full migration history works on a fresh database, upgrade from `a7b2c3d4e5f6` works, and
  the actual local development database is at the repository head.
* [ ] Backend formatting, linting, type checking, migrations, and tests pass.
* [ ] Frontend formatting, linting, and type checking pass.

## Tests

Keep automated coverage focused, consistently with DEC-008.

Add backend tests covering:

* Authenticated creation followed by ordered listing, including trimming, append positions, and an
  accurate routine `training_day_count`.
* Duplicate-name success and the seven-day limit with no mutation on the eighth attempt.
* Rename followed by retrieval, confirming stable identity, position, and creation timestamp plus a
  refreshed day and parent-routine update timestamp.
* Successful full reorder and representative invalid reorder, confirming atomic preservation of the
  previous order.
* Deletion followed by position compaction and count update.
* Ownership isolation across list, create, rename, reorder, and deletion, including a day ID from a
  different routine.
* Routine deletion cascading to its training days and fitness-profile deletion leaving them intact.
* One representative invalid request that leaves persisted data unchanged.
* One combined unauthenticated test covering every training-day endpoint.
* The required fresh and previous-head migration paths, including one real authenticated API flow
  against a migrated database.

Do not add one automated test per name boundary, malformed payload variant, list size, or UI state.

No frontend unit, component, browser, automated browser, or browser-level tests are required for F08. Because
they remain deferred, focused manual execution or code inspection must verify:

* Routine detail loading, empty, populated, and list-failure states.
* Create, rename, cancellation, reorder, delete-confirmation, and successful-deletion flows.
* Seven-day limit messaging and recovery after deletion.
* One reorder failure and one other mutation failure preserving the last confirmed UI state.
* Safe handling of malformed training-day and updated-routine success and error payloads.
* Accurate count labels and updated routine-deletion warning.
* Absence of weekday, rest-day, exercise-configuration, schedule, and activation controls.
* Mobile-width and keyboard usability of ordering controls.

Existing automated tests must continue to pass, and all backend and frontend quality checks remain
required.

## Out of Scope

* Assigning training days to any of the routine's seven weekly positions.
* Weekday names, locale-dependent week starts, calendar dates, recurrence, or schedule rotation.
* Persisted rest days or manually declared work/rest counts.
* Active-routine selection, activation readiness, commitment periods, adherence, or plan switching.
* Exercise selection, ordering, configuration, substitutions, or per-exercise notes.
* Sets, repetitions, rep ranges, loads, percentages, tempo, RIR, RPE, rest targets, or progression
  rules.
* Validation or suggestions based on profile availability, preferred duration, equipment, goals, or
  physical limitations.
* Routine or training-day duplication, templates, imports, exports, sharing, or collaboration.
* Routine archiving, recovery, versioning, or change history.
* Custom exercises or changes to the curated exercise catalog.
* Workout execution, tracking, feedback, history, analytics, adaptations, or AI reasoning.
* Frontend automated or browser-level testing.

## Dependencies

* F01 — Project Infrastructure.
* F02 — User Authentication.
* F03 — User Fitness Profile.
* F04 — Profile Management.
* F07 — Routine Creation.

F05 provides the exercise catalog required by the following routine-exercise feature but is not
directly consumed by F08. F06 was intentionally skipped and introduces no dependency.

## Notes

Keep weekly schedule semantics out of the F08 persistence model even though the seven-day limit is
motivated by that future feature. In particular, do not add seven nullable columns to `routines` or
create placeholder rest-day records.

The uniqueness constraint on `(routine_id, position)` is valuable, but naive position swaps can
violate it midway through a transaction on SQLite. Use an explicit collision-free update strategy
while preserving the atomic external behaviour.

The static `/days/order` route should be registered before a dynamic `/days/{day_id}` route, or be
otherwise structured so `order` is never parsed as a day identifier.
