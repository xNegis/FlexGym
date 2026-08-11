# F09 — Routine Exercise Configuration

## Objective

Allow an authenticated user to add catalog exercises to each training day and configure the
ordered, per-set targets that define the planned session.

F09 turns a named training day into a usable workout prescription. Each configured exercise has a
stable identity and display position, general planning notes, an optional transition rest, and one
or more individually configured sets. Actual workout performance remains a separate future fact;
F09 stores targets only.

## Context

F05 introduced the global, read-only exercise catalog. F07 introduced user-owned routines, and F08
introduced ordered training days inside those routines. F09 connects catalog exercises to their
intended training days and adds the minimum detailed prescription needed by future workout
tracking.

The planning hierarchy after F09 is:

```text
User
└── Routine
    └── Ordered training days
        └── Ordered configured exercises
            └── Ordered configured sets
```

A configured set is a plan, not evidence that the set was performed. Its target repetitions,
duration or distance, target load, target Repetitions in Reserve (RIR), tempo, rest, and notes must
remain distinguishable from the actual values recorded during Phase 2.

F09 does not create a weekly schedule or activate a routine. Supersets, circuits, and structurally
modelled drop sets are useful future capabilities but are deliberately outside the current MVP.

## User Experience

From routine detail, the user opens one training day and sees its configured exercises in explicit
order. An empty training day explains that exercises can be selected from the catalog.

To add an exercise, the user searches and filters the existing catalog, chooses one exercise, and
selects the target type. Repetitions are the default. The user enters the initial targets as a
comma-separated shorthand such as `12, 12, 10, 8`. The UI parses that value into four independently
configurable set rows and never persists the delimiter string as domain data.

Each generated set can then receive its own optional target weight, RIR, tempo, rest, and note. The
user can apply a repeated value to all sets as a convenience without changing the underlying
per-set representation.

The user can later:

* Inspect and edit every target in the configured exercise.
* Add or remove sets by editing the comma-separated target shorthand.
* Reorder exercises with keyboard- and touch-usable controls.
* Remove a configured exercise after explicit confirmation.
* Return to training-day management without losing the routine context.

## Functional Requirements

### FR-1 — Training-day exercise configurations

Persist each configured exercise as a child of exactly one training day and as a reference to
exactly one global catalog exercise. Routine and user ownership are inherited through the training
day; clients cannot provide or change either owner independently.

An authenticated user can list, add, edit, reorder, and delete exercise configurations only through
an owned routine and one of that routine's training days. Nested lookup must not permit an exercise
configuration from another training day, routine, or user to be accessed through the wrong path.

### FR-2 — Catalog selection and duplicate rule

Exercise selection uses the existing authenticated catalog, including its search, primary-muscle,
and equipment filters. The catalog itself remains read-only.

The same catalog exercise may appear in different training days, including two days in the same
routine. It may appear at most once within one training day. A duplicate attempt returns a stable
conflict response and does not alter the existing plan.

Changing the catalog exercise of an existing configuration is not supported. The user removes the
configuration and adds the desired exercise instead.

### FR-3 — Exercise ordering and limit

Configured exercises have explicit, stable, contiguous one-based positions within a training day.
New configurations append after all existing exercises. A training day may contain at most 20
configured exercises.

The client submits the complete desired ordered list of configuration IDs when reordering. The
backend validates that it contains every current configuration exactly once, then replaces all
positions atomically. Invalid or stale requests preserve the existing order.

Exercise ordering has no superset, circuit, weekly-schedule, or workout-navigation semantics in
F09.

### FR-4 — Individually configured sets

Every configured exercise contains between 1 and 20 ordered sets. Each set has a one-based position
that is unique and contiguous within its configured exercise.

Each set independently stores:

* A required target value interpreted through the exercise configuration's target type.
* An optional target weight in kilograms.
* An optional target RIR.
* An optional four-phase tempo.
* An optional rest duration after the set.
* An optional user note.

The number of sets is derived from the actual set records. It is never stored or accepted as a
separate declared count.

### FR-5 — Target types

A configured exercise uses exactly one target type for all of its sets:

* `repetitions` — positive whole repetitions.
* `duration_seconds` — positive whole seconds, suitable for isometric work.
* `distance_meters` — positive metres, allowing up to two decimal places, suitable for carries.

Repetitions are selected by default in the UI. The comma-separated shorthand uses the selected
type, so `12, 12, 10, 8` means four repetition targets while `30, 30, 45` may mean three durations
in seconds.

Changing the target type is an explicit edit. Existing target values remain visible for review but
must validate under the new type before the configuration can be saved.

### FR-6 — Repetition and target shorthand

The frontend provides one comma-delimited target field during creation and editing. Commas are the
only supported delimiter. Surrounding whitespace around individual values is ignored.

For example, `12, 12, 10, 8` creates the following structured targets:

```text
Set 1: 12 repetitions
Set 2: 12 repetitions
Set 3: 10 repetitions
Set 4: 8 repetitions
```

Hyphens are not accepted as target delimiters because the hyphenated notation is reserved for
tempo. Empty members, a leading or trailing comma, invalid numbers, and more than 20 values prevent
submission and produce a useful validation message.

The shorthand is a UI input mechanism only. The frontend sends structured ordered sets to the API,
and the backend persists structured set rows rather than a comma-separated string.

When the user edits the shorthand:

* Existing set configurations are matched by position.
* Keeping the same number of values updates targets while preserving the other per-set fields.
* Adding values appends new set configurations with optional fields empty.
* Removing values removes trailing set configurations only after an explicit warning that their
  configuration will be lost.

Saving the complete exercise configuration is atomic.

### FR-7 — Target weight

`target_weight_kg` is an optional planned load for one set. It supports decimal kilograms and is
not an actual workout result. A blank value means that no target load was specified; it must not be
silently converted to zero.

For bodyweight or assisted exercises, the value is simply the load the user intends to see for that
exercise configuration. F09 does not infer body weight, assistance direction, machine calibration,
bar weight, plate combinations, or total system load, and it performs no calculations from this
field.

Future workout tracking may prefill an actual-load input from this target, but it must record the
performed value separately and must not overwrite the routine target without an explicit planning
change.

### FR-8 — Repetitions in Reserve

RIR means **Repetitions in Reserve**: the estimated number of additional repetitions the user could
perform before muscular failure. `target_rir` is optional and independently configurable for each
set.

F09 stores RIR as a user-entered target. It does not calculate RIR, convert it to RPE, assess failure,
or infer whether the target was achieved.

### FR-9 — Tempo and Time Under Tension terminology

The optional four-phase value is modelled and labelled as **Tempo**, because it specifies seconds
for movement phases rather than directly storing total Time Under Tension (TUT).

The phases, in display order, are:

1. Eccentric.
2. Pause in the stretched position.
3. Concentric.
4. Pause in the shortened or peak-contraction position.

The UI uses four explicit numeric inputs and may render the completed value as `3-1-1-0`. All four
components must be provided together or all must be absent. F09 does not persist a separate TUT
field; any future TUT estimate may be derived from structured tempo and repetitions without being
presented as an observed fact.

### FR-10 — Rest targets

Each set may have an optional `rest_after_set_seconds` target. It represents planned rest before
the next set of the same exercise. For the final set, the UI does not apply this value because no
same-exercise set follows.

Each configured exercise may also have an optional `rest_after_exercise_seconds` target. It
represents the transition before the next configured exercise. For the final exercise, the UI does
not apply this value because no next exercise follows.

The two values are never added together. After a non-final set, the set rest applies; after the
final set, the exercise-transition rest applies when another exercise follows. F09 stores targets
only and introduces no running timer.

### FR-11 — Notes

A configured exercise may have optional general notes, for example grip or setup preferences. Each
configured set may additionally have an optional note, for example `warm-up`, `back-off`, or a
user-defined instruction.

Notes remain unstructured user-authored planning facts. Their wording does not create a formal set
type, superset, drop set, progression rule, or AI interpretation.

### FR-12 — Editing and convenience actions

The user edits an exercise configuration in one explicit save operation. The complete target type,
exercise-level fields, and ordered set collection are submitted together and validated atomically.
Cancelling does not mutate persisted data.

The UI may offer `Apply to all sets` for target weight, RIR, tempo, or set rest. This copies the
chosen value into each editable set row before save. It remains a client-side convenience; the API
and database continue to receive independent per-set values.

A failed save preserves every entered value and the selected exercise context for correction or
retry.

### FR-13 — Exercise removal and parent deletion

Removing a configured exercise requires explicit in-application confirmation naming the exercise
and warning that all of its planned sets and notes will be permanently deleted. Remaining exercise
positions are compacted atomically.

Deleting a training day now also deletes its exercise configurations and configured sets. The
training-day confirmation introduced by F08 must warn about that effect. Deleting a routine deletes
its days, configurations, and sets, and the routine confirmation must also be updated accordingly.

Deleting a fitness profile continues to leave routines and all their nested planning data intact.

### FR-14 — Derived exercise count

Every public training-day representation gains `exercise_count`, derived from actual configured
exercise records. It is never accepted from a client and is not stored as independent training-day
metadata.

Adding or deleting a configured exercise changes the count. Editing or reordering does not.

### FR-15 — Plan timestamps

Adding, editing, reordering, or deleting a configured exercise refreshes the parent training day's
and routine's `updated_at` timestamps in the same transaction. A failed mutation changes neither
timestamp.

### FR-16 — Authentication and onboarding boundary

Every configured-exercise endpoint requires authenticated identity. The frontend exposes the flow
only inside routine management after fitness-profile onboarding is complete.

The API does not require an existing fitness profile. The data remains reachable through its owned
routine if the user deletes and later recreates the profile.

### FR-17 — Request-state and error behaviour

The UI distinguishes exercise-list loading, empty, loaded, catalog selection, create, edit,
reorder-pending, destructive-change warning, delete confirmation, mutation-pending, and recoverable
failure states.

Mutation controls prevent duplicate submission while pending. Expected failures and malformed or
unexpected server responses are normalized at the frontend API boundary; React components never
render raw response values.

### FR-18 — Architectural boundaries

HTTP endpoints remain thin. Nested ownership checks, catalog lookup, duplicate and limit
enforcement, structured set replacement, ordering, position compaction, derived counts, cascades,
and parent timestamp updates live in an application service or equivalent non-HTTP boundary.

React components use the frontend API layer rather than calling configured-exercise URLs directly.
The comma-separated shorthand is parsed in a small testable frontend boundary rather than inside a
render path.

## Domain / Data Requirements

F09 introduces a training-day exercise configuration with:

* Application-generated primary key.
* Required parent training-day reference.
* Required global exercise reference.
* One-based display position.
* Target type.
* Optional rest-after-exercise target.
* Optional general notes.
* Creation and last-update timestamps.

It also introduces configured sets with:

* Application-generated primary key.
* Required parent exercise-configuration reference.
* One-based set position.
* Required target value.
* Optional target weight in kilograms.
* Optional target RIR.
* Four nullable tempo components that are present or absent as one value.
* Optional rest-after-set target.
* Optional set note.

The persistence model must enforce uniqueness for `(training_day_id, position)`,
`(training_day_id, exercise_id)`, and `(exercise_configuration_id, position)`. Cascades must remove
configured sets with their exercise configuration and nested planning data with a deleted training
day, routine, or user. Catalog exercises remain global reference records and are never copied into
user-owned configuration rows.

Configured-set primary keys are internal persistence identities in F09. The public contract
identifies sets by their one-based position and replaces the complete ordered set configuration
atomically. Future workout sessions must snapshot the applicable planned targets into workout facts
rather than depend on mutable configured-set rows for historical truth.

Target values and weights must use fixed-precision numeric storage where decimals are permitted;
binary floating-point storage is not suitable for persisted kilograms or metres.

## API Requirements

All endpoints require authentication. Request bodies reject unknown fields. Every resource is
resolved through the complete owned routine/training-day path.

The public configured-exercise representation is:

```json
{
  "id": 91,
  "position": 1,
  "exercise": {
    "slug": "barbell-bench-press",
    "name": "Barbell Bench Press",
    "primary_muscle": "chest",
    "secondary_muscles": ["triceps", "shoulders"],
    "equipment": "barbell",
    "movement_pattern": "horizontal_push",
    "execution_type": "bilateral"
  },
  "target_type": "repetitions",
  "rest_after_exercise_seconds": 180,
  "notes": "Use the middle rack height",
  "sets": [
    {
      "position": 1,
      "target_value": 12,
      "target_weight_kg": 40,
      "target_rir": 3,
      "tempo": {
        "eccentric_seconds": 3,
        "stretched_pause_seconds": 1,
        "concentric_seconds": 1,
        "peak_contraction_seconds": 0
      },
      "rest_after_set_seconds": 90,
      "notes": "Warm-up"
    },
    {
      "position": 2,
      "target_value": 10,
      "target_weight_kg": 45,
      "target_rir": 2,
      "tempo": null,
      "rest_after_set_seconds": null,
      "notes": null
    }
  ],
  "created_at": "2026-08-13T09:30:00",
  "updated_at": "2026-08-13T09:30:00"
}
```

Numeric values are returned as JSON numbers. Optional values are returned as `null`, not omitted.
Catalog instructions are not duplicated in the configured-exercise response; the existing detail
endpoint remains the source for execution guidance.

Training-day representations introduced by F08 gain:

```json
{
  "id": 31,
  "name": "Push",
  "position": 1,
  "exercise_count": 4,
  "created_at": "2026-08-12T09:30:00",
  "updated_at": "2026-08-13T09:30:00"
}
```

### Exercise-configuration write shape

Creation and complete update use structured sets:

```json
{
  "exercise_slug": "barbell-bench-press",
  "target_type": "repetitions",
  "rest_after_exercise_seconds": 180,
  "notes": "Use the middle rack height",
  "sets": [
    {
      "target_value": 12,
      "target_weight_kg": 40,
      "target_rir": 3,
      "tempo": {
        "eccentric_seconds": 3,
        "stretched_pause_seconds": 1,
        "concentric_seconds": 1,
        "peak_contraction_seconds": 0
      },
      "rest_after_set_seconds": 90,
      "notes": "Warm-up"
    }
  ]
}
```

Set positions are derived from array order and are not accepted in write bodies. Update uses the
same shape except that `exercise_slug` is omitted because catalog identity is immutable.

### `GET /api/routines/{routine_id}/days/{day_id}/exercises`

Returns:

* `200` with the complete ordered configured-exercise array, including `[]`.
* `404 {"detail":"Routine not found"}` when the routine is inaccessible.
* `404 {"detail":"Training day not found"}` when the owned routine does not contain the day.
* `401` when unauthenticated.
* Framework validation `422` for invalid path IDs.

### `POST /api/routines/{routine_id}/days/{day_id}/exercises`

Returns:

* `201` with the created configuration.
* `404 {"detail":"Routine not found"}` when the routine is inaccessible.
* `404 {"detail":"Training day not found"}` when the day is inaccessible through that routine.
* `404 {"detail":"Exercise not found"}` for an unknown catalog slug.
* `409 {"detail":"Exercise is already configured for this training day"}` for a duplicate.
* `409 {"detail":"Training day already has 20 exercises"}` at the limit.
* `422` for invalid, missing, or unknown fields or invalid nested IDs.
* `401` when unauthenticated.

### `PUT /api/routines/{routine_id}/days/{day_id}/exercises/order`

This static route must not be shadowed by the configuration-ID route.

Accepts:

```json
{
  "exercise_configuration_ids": [91, 34, 72]
}
```

Returns:

* `200` with the complete reordered configured-exercise array.
* `404` with the documented routine or training-day detail when either parent is inaccessible.
* `422 {"detail":"Exercise order must contain every configured exercise exactly once"}` when IDs
  are missing, duplicated, extra, stale, or belong elsewhere.
* `422` for invalid IDs, member types, or unknown fields.
* `401` when unauthenticated.

### `PUT /api/routines/{routine_id}/days/{day_id}/exercises/{configuration_id}`

Accepts the complete editable write shape without `exercise_slug` and returns:

* `200` with the updated configuration.
* `404` with the documented routine or training-day detail when either parent is inaccessible.
* `404 {"detail":"Configured exercise not found"}` when the configuration is not inside the
  selected day, including an ID belonging elsewhere.
* `422` for invalid IDs, an invalid target type, invalid set configuration, or unknown fields.
* `401` when unauthenticated.

### `DELETE /api/routines/{routine_id}/days/{day_id}/exercises/{configuration_id}`

Returns:

* `204` with no response body after deleting its sets and compacting exercise positions.
* `404` with the documented routine, training-day, or configured-exercise detail.
* `401` when unauthenticated.
* Framework validation `422` for invalid path IDs.

### Error normalization

Frontend API functions explicitly handle string-detail errors, FastAPI array-shaped `422` details,
malformed JSON, empty bodies where JSON is expected, and unexpected successful payloads. Components
receive stable strings or deliberate typed not-found/conflict outcomes, never arbitrary response
values.

## UI Requirements

### Training-day entry and counts

Each training-day item in routine detail displays a friendly derived count such as `No exercises`,
`1 exercise`, or `4 exercises` and exposes a clear action to manage that day's exercises.

Opening exercise management keeps the routine and training-day names visible and provides an
explicit return action. Initial loading must not briefly render the empty state. A list failure
shows a normalized message and Retry without losing the surrounding routine context.

### Empty and loaded states

The empty state explains that the user can construct the session from catalog exercises and
includes `Add exercise`.

The loaded state shows exercises in position order with a compact summary of their target type,
number of sets, and configured targets. Each item exposes Edit, Delete, Move up, and Move down.
Ordering controls must remain usable by keyboard and at a common mobile viewport; drag-and-drop is
neither required nor sufficient.

At 20 exercises, the add action is disabled or hidden with a useful explanation. It becomes
available after deletion.

### Catalog picker

The add flow reuses the existing catalog query behaviour and friendly labels. It supports search,
primary-muscle filtering, equipment filtering, loading, no-results, and recoverable request failure.
Already-configured exercises are visibly unavailable rather than allowing a predictable conflict.
The backend remains authoritative about duplicates.

Selecting an exercise proceeds to configuration; it does not mutate the plan until a valid
configuration is explicitly saved.

### Target shorthand and set editor

The configuration form includes:

* Target-type selection, defaulting to Repetitions.
* A comma-separated target input with an example appropriate to the selected type.
* Generated ordered set rows or cards.
* Per-set target weight, RIR, four-part tempo, rest, and note controls.
* Exercise-level rest and notes.
* Apply-to-all convenience controls for repeated optional values.
* Explicit Save/Add and Cancel actions.

Although a wide table may be used on larger screens, the common mobile layout must not require
horizontal scrolling to edit a set. A stacked set-card layout is acceptable and preferred where a
table would overflow.

Client-side parsing gives immediate feedback, but the API remains authoritative. Failed create or
edit requests preserve the shorthand, generated set configuration, notes, and catalog selection.

### Destructive set reduction

When editing the target shorthand would remove trailing sets, the UI explicitly warns that those
sets' weight, RIR, tempo, rest, and notes will be lost. Cancel restores the current editable set
collection without issuing a request. Confirming changes only local form state; persistence still
requires Save.

### Exercise deletion

Deletion uses an explicit in-application confirmation naming the exercise and explaining that all
planned sets and notes will be permanently deleted. It provides separate Cancel and Delete exercise
actions and prevents duplicate submission.

After success, the training day remains open with compacted exercise positions and a refreshed
count. Failure preserves the current configuration and allows retry or cancellation.

### Updated parent deletion copy

Training-day deletion warns that every configured exercise and planned set inside it will also be
deleted. Routine deletion warns that every training day, configured exercise, and planned set will
be deleted. Browser-native `window.confirm` remains insufficient.

## Business Rules

* A configured exercise belongs to one training day and references one canonical catalog exercise.
* One catalog exercise may be configured at most once per training day and may appear in other days.
* A training day contains zero to 20 configured exercises.
* A configured exercise contains one to 20 ordered configured sets.
* Exercise and set positions are explicit, one-based, unique within their parent, and contiguous.
* The set count and training-day exercise count are derived from child records.
* One target type applies to every set in one configured exercise.
* Targets are planned values; future performed values are separate workout facts.
* RIR means Repetitions in Reserve and is optional.
* Four-phase movement timing is Tempo; F09 does not persist total Time Under Tension.
* Target weight, RIR, tempo, rest, and notes can differ between sets.
* Set rest applies only before a following set; exercise rest applies only before a following
  exercise. They are not cumulative.
* Notes create no formal programming semantics.
* Child mutations refresh the training-day and routine update timestamps atomically.
* F09 provides no schedule, active routine, running timer, performed set, or workout history.

## Validation

* `routine_id`, `day_id`, and `configuration_id` must be positive integers.
* `exercise_slug` must identify an existing catalog exercise.
* `target_type` accepts only `repetitions`, `duration_seconds`, or `distance_meters`.
* Every write contains between 1 and 20 sets.
* Repetition targets are whole integers from 1 through 1,000.
* Duration targets are whole seconds from 1 through 86,400.
* Distance targets are greater than zero, no more than 100,000 metres, and have at most two decimal
  places.
* `target_weight_kg` is optional, from 0 through 5,000, with at most two decimal places.
* `target_rir` is an optional whole integer from 0 through 10.
* Each tempo component is a whole number of seconds from 0 through 60. All four components are
  required together, and at least one must be greater than zero.
* Rest values are optional whole seconds from 0 through 3,600.
* Exercise notes are optional, trimmed, and at most 1,000 characters.
* Set notes are optional, trimmed, and at most 500 characters.
* Empty or whitespace-only notes are persisted and returned as `null`.
* Request bodies reject unknown fields.
* An invalid complete update, order, limit violation, duplicate, or ownership failure causes no
  partial mutation or timestamp change.

Frontend shorthand validation additionally requires:

* Comma delimiters only.
* No empty members or leading/trailing comma.
* Between 1 and 20 valid values.
* Values matching the selected target type and backend ranges.

The migration must be validated by:

* Applying the complete migration history to a new isolated database and verifying the new tables,
  foreign keys, cascades, fixed-precision columns, uniqueness constraints, and position constraints.
* Creating an isolated database at the previously committed Alembic head `b61961abf6a5`, applying
  the F09 migration, and exercising configuration creation and ordered retrieval against the
  upgraded database.
* Comparing `alembic current` and `alembic heads` for the actual configured local development
  database and safely upgrading it before reporting F09 as locally operational.
* Exercising at least one authenticated configured-exercise API flow against a migrated database
  rather than a schema created directly from ORM metadata.
* Confirming that rerunning the supported migration command is safe and creates no duplicate schema
  objects or data.

Tests that use `Base.metadata.create_all()` remain useful for service and endpoint behaviour but do
not satisfy the migration-validation gate.

## Acceptance Criteria

* [ ] An authenticated user can select a catalog exercise and add a valid per-set configuration to
  an owned training day.
* [ ] Entering `12, 12, 10, 8` produces four ordered structured sets rather than persisted delimited
  text.
* [ ] Repetition, duration, and distance targets validate and render with their correct units.
* [ ] Each set independently preserves its target, optional weight, RIR, tempo, rest, and note.
* [ ] Exercise-level notes and transition rest persist separately from per-set values.
* [ ] Apply-to-all changes editable set values without collapsing them into one shared persisted
  configuration.
* [ ] Adding or removing shorthand values creates or removes trailing sets as documented, and a
  reduction requires the destructive-change warning.
* [ ] Duplicate catalog exercises in one training day are rejected without mutation, while the same
  exercise can be configured in another day.
* [ ] New exercises append with stable IDs and contiguous positions, and the twenty-exercise limit
  is enforced without partial mutation.
* [ ] Full reorder succeeds atomically; partial, duplicate, foreign, extra, or stale orders fail and
  preserve the previous ordering.
* [ ] Editing replaces the complete configuration atomically while preserving exercise
  configuration identity, catalog exercise, parent, position, and creation timestamp.
* [ ] Removing an exercise requires confirmation, deletes its configured sets, and compacts later
  exercise positions.
* [ ] Training-day representations expose an accurate derived `exercise_count` and never accept it
  from clients.
* [ ] Every successful child mutation refreshes both training-day and routine `updated_at` in the
  same transaction; failed mutations refresh neither.
* [ ] Other-user routine IDs are indistinguishable from unknown routines, and nested foreign day or
  configuration IDs return the documented not-found response.
* [ ] Training-day and routine deletion confirmations describe the newly cascading planning data.
* [ ] Deleting a fitness profile leaves routines, days, exercise configurations, and configured
  sets available after profile recreation.
* [ ] Loading, empty, selection, form, warning, delete-confirmation, pending, and failure states are
  distinct and recoverable.
* [ ] All new endpoints return `401` when unauthenticated.
* [ ] Invalid or unexpected fields return `422` without partial mutation.
* [ ] Malformed success and error responses are not rendered directly by the UI.
* [ ] No target is represented as actual performance, and no future workout fact overwrites a plan.
* [ ] F09 persists no supersets, circuits, formal drop sets, set types, progression rules, schedules,
  activation state, timers, workout results, or history.
* [ ] Registration, login, authentication restoration, onboarding, profile management and deletion,
  logout, exercise catalog and detail, routine CRUD, training-day CRUD and reorder, health, CORS,
  and backend-unavailable flows retain their documented behaviour.
* [ ] Exercise and set configuration remains usable at a common mobile viewport without horizontal
  overflow and with keyboard-accessible controls.
* [ ] The full migration history works on a fresh database, upgrade from `b61961abf6a5` works, and
  the actual local development database is at repository head.
* [ ] Backend formatting, linting, type checking, migrations, and tests pass.
* [ ] Frontend formatting, linting, and type checking pass.

## Tests

Keep automated coverage focused, consistently with DEC-008.

Add backend tests covering:

* Authenticated creation followed by ordered retrieval, including the complete structured set
  configuration and an accurate training-day `exercise_count`.
* Repetition, duration, and distance target success plus one representative invalid conditional
  target that leaves persistence unchanged.
* Per-set optional weight, RIR, tempo, rest, and notes plus nullable exercise-level fields.
* Same-day duplicate rejection, same-exercise success in another day, and the 20-exercise limit
  without mutation on the twenty-first attempt.
* Complete atomic update of target type and sets, confirming stable configuration identity,
  catalog exercise, position, and creation timestamp plus refreshed parent timestamps.
* Successful full reorder and one invalid reorder, confirming atomic preservation of the previous
  order.
* Deletion followed by configured-set cascade, position compaction, and count update.
* Ownership isolation across list, create, update, reorder, and deletion, including day and
  configuration IDs from different owned and other-user parents.
* Training-day and routine deletion cascading through configurations and sets, and fitness-profile
  deletion leaving them intact.
* One representative invalid request that leaves nested records and parent timestamps unchanged.
* One combined unauthenticated test covering every configured-exercise endpoint.
* The required fresh and previous-head migration paths, including one real authenticated API flow
  against a migrated database.

Do not add one backend test for every numeric boundary, nullable field combination, target type,
catalog exercise, or malformed payload variant.

No frontend unit, component, browser, Playwright, or end-to-end tests are required for F09. Because
they remain deferred, focused manual execution or code inspection must verify:

* Empty, populated, loading, list-failure, picker, no-results, and catalog-failure states.
* Parsing `12, 12, 10, 8`, rejecting invalid delimiters and empty members, and generating four rows.
* Set-field editing, apply-to-all, cancellation, destructive set reduction, and failed-save state
  preservation.
* Add, edit, reorder, delete-confirmation, and successful-deletion flows.
* Duplicate and exercise-limit messaging and recovery after deletion.
* One reorder failure and one other mutation failure preserving the last confirmed state.
* Safe handling of malformed configuration, updated-training-day, and error payloads.
* Accurate exercise counts and updated parent-deletion warnings.
* Absence of actual-performance, schedule, activation, superset, circuit, drop-set, and timer
  controls.
* Mobile-width and keyboard usability without horizontal overflow.

Existing automated tests must continue to pass, and all backend and frontend quality checks remain
required.

## Out of Scope

* Actual set completion, performed repetitions, performed load, observed RIR, or workout facts.
* Workout start, live navigation, rest timer execution, skipping, completion, or history.
* Supersets, paired exercises, circuits, giant sets, rounds, or linked-rest semantics.
* Structurally modelled drop sets, warm-up sets, working sets, back-off sets, AMRAP sets, or other set
  types. Free-text notes may describe them without creating domain behaviour.
* Per-set exercise substitutions or alternative exercise groups.
* Percentage-of-1RM targets, RPE, velocity, heart rate, calories, progression rules, or automatic
  load changes.
* Deriving suitability or prescriptions from goals, experience, equipment, availability, or
  physical limitations.
* Assigning training days to weekly positions, rest-day scheduling, active-routine selection, or
  activation readiness.
* Routine or training-day duplication, templates, imports, exports, sharing, or collaboration.
* Custom exercises or mutation of the curated exercise catalog.
* Analytics, adaptation signals, suggestions, or AI reasoning.
* Frontend automated or end-to-end testing.

## Dependencies

* F01 — Project Infrastructure.
* F02 — User Authentication.
* F03 — User Fitness Profile.
* F04 — Profile Management.
* F05 — Exercise Catalog.
* F07 — Routine Creation.
* F08 — Training Day Management.

F06 was intentionally skipped and introduces no implementation dependency.

## Notes

Use explicit collision-free position updates because SQLite checks uniqueness immediately during
naive swaps. Apply this to configured-exercise ordering and to any ordered-set replacement strategy
that updates existing rows in place.

The static `/exercises/order` route must be registered before a dynamic
`/exercises/{configuration_id}` route or otherwise structured so `order` is never parsed as an ID.

Do not persist comma-separated targets, hyphenated tempo strings, copied exercise metadata, derived
counts, or actual workout values in the planning records. Structured persistence is required even
when the UI offers compact textual entry and display.
