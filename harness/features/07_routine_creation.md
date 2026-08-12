# F07 — Routine Creation

## Objective

Allow an authenticated user to create and manage multiple personal training routines.

F07 introduces the routine as the stable top-level container for a complete training plan. A routine
will later contain ordered training days, and those days will contain configured exercises. This
feature establishes only the routine lifecycle and metadata so later planning features can build on
a clear ownership and identity boundary.

## Context

F05 introduced a curated global exercise catalog. F06 intentionally skipped user-created exercises
for the current MVP sequence. The next Phase 1 increment begins representing the user's training
plan.

In FlexGym, a routine means a complete plan such as `Push/Pull/Legs` or `Hypertrophy 4 days`, not one
individual workout session. Training days, exercise selection and configuration, active-routine
state, and scheduling remain separate roadmap areas.

Users may create as many routines as they find useful. F07 does not yet require them to commit to
one routine because activation and adherence semantics belong to a later feature.

## User Experience

An authenticated user with a completed fitness profile can open a Routines section from the main
application navigation.

The section shows the user's routines in a deterministic list. From it, the user can:

* Create a routine by providing a name, objective, and optional description.
* Open a routine to inspect its metadata.
* Edit its name, objective, and description.
* Permanently delete it after explicit confirmation.
* Create additional routines without activating or replacing an existing one.

A newly created routine contains no training days. F07 does not display or persist a manually
declared number of days. A future training-day feature will create the actual child records, and the
displayed day count will then be derived from those records.

## Functional Requirements

### FR-1 — User-owned routines

Persist routines as user-owned records. Every routine belongs to exactly one user and is never
global or shared.

An authenticated user can list, inspect, update, and delete only their own routines. A client cannot
select or change routine ownership.

### FR-2 — Routine creation

The user can create a routine with:

* A required name.
* A required objective.
* An optional free-text description.

Creation is atomic. Invalid input or a duplicate name must not create a partial record.

After successful creation, the UI opens the created routine's detail view.

### FR-3 — Multiple routines

A user may own any number of routines. Creating a routine does not activate, deactivate, replace,
archive, or otherwise alter any other routine.

Different users may use the same routine name.

### FR-4 — Routine listing

The user can retrieve and view all of their routines. Results are ordered by display name using
case-insensitive ascending order, with routine ID as a deterministic tie-breaker.

F07 does not require search, filters, or pagination because a personal routine collection is
expected to remain small during the MVP.

### FR-5 — Routine detail

The user can open one owned routine and inspect its name, friendly objective label, and optional
description.

Unknown routine IDs and IDs owned by another user produce the same not-found response. The API must
not reveal whether another user's routine exists.

### FR-6 — Routine editing

The user can replace all editable routine fields in one explicit save operation. A successful update
preserves the routine identity, owner, and creation timestamp and refreshes the update timestamp.

Cancelling an edit discards unsaved changes without issuing an update request. A failed update
preserves the entered values and leaves the form usable.

### FR-7 — Routine deletion

The user can permanently delete an owned routine only after explicit in-application confirmation.
Cancelling confirmation does not issue a deletion request.

F07 can use permanent deletion because routines cannot yet contain days, exercises, workout history,
or other dependent records. A later feature must revisit deletion semantics before introducing data
that must survive removal from the user's current planning view.

### FR-8 — Authentication and onboarding boundary

Every routine endpoint requires authenticated identity. The frontend exposes routine management only
after fitness-profile onboarding is complete.

The API does not require an existing fitness profile because routine ownership is an authentication
boundary rather than a profile relationship. Deleting and later recreating a fitness profile does
not delete the user's routines.

### FR-9 — Request-state and error behaviour

The UI has explicit loading, empty, loaded, create, detail, edit, confirmation, pending, and
request-failure states.

Create, save, and delete controls prevent duplicate submissions while pending. Expected failures and
malformed or unexpected server responses are normalized at the frontend API boundary; React
components never render raw response values.

### FR-10 — Architectural boundaries

HTTP endpoints remain thin. Routine ownership checks, normalized-name uniqueness, creation, listing,
lookup, update, and deletion live in an application service or equivalent non-HTTP boundary.

React components use the frontend API layer rather than calling routine URLs directly.

## Domain / Data Requirements

F07 introduces `Routine` with:

* Application-generated primary key.
* Required owning user reference.
* User-facing name.
* Private normalized name used to enforce per-user uniqueness.
* Objective.
* Optional user-provided description.
* Creation timestamp.
* Last-update timestamp.

The ownership relationship must support efficient retrieval of one user's routines and must delete
routines if their owning user is eventually deleted. Deleting only a fitness profile does not affect
routines.

The normalized name is derived from the trimmed name using Unicode-aware case normalization. It is
not returned through the API. A database uniqueness constraint covering owner and normalized name
must protect against concurrent duplicate creation or update; an application-only pre-check is not
sufficient.

### Objective vocabulary

F07 deliberately reuses the existing fitness-profile goal vocabulary:

* `build_muscle` — Build muscle
* `lose_fat` — Lose fat
* `increase_strength` — Increase strength
* `general_fitness` — General fitness

The routine objective is an explicit property of that routine. It is initialized from the user's
selection and is not dynamically linked to the current fitness-profile goal. Changing either value
does not silently change the other.

The UI may preselect the user's current profile goal when opening the create form, but the user must
be able to choose a different value before submission.

### Day count

F07 introduces no `number_of_days`, `training_days_per_week`, or equivalent routine field. A stated
day count would duplicate future child data and could disagree with the actual routine structure.

The API does not return a placeholder day count in F07. Once training days exist, a later feature
may add a derived count to routine representations.

## API Requirements

All endpoints require authentication. Routine request bodies reject unknown fields.

The public routine representation is:

```json
{
  "id": 12,
  "name": "Hypertrophy 4 days",
  "objective": "build_muscle",
  "description": "A general hypertrophy plan",
  "created_at": "2026-08-11T15:30:00",
  "updated_at": "2026-08-11T15:30:00"
}
```

`description` is `null` when absent. Owner IDs, normalized names, activation state, day counts, and
internal relationship data are not public.

### `GET /api/routines`

Returns:

* `200` with a JSON array of owned routines in the documented order, including `[]` when none exist.
* `401` when unauthenticated.

F07 defines no list query parameters. Unused query parameters do not affect routine selection and
need not be rejected explicitly.

### `POST /api/routines`

Accepts:

```json
{
  "name": "Hypertrophy 4 days",
  "objective": "build_muscle",
  "description": "A general hypertrophy plan"
}
```

Returns:

* `201` with the created routine.
* `409 {"detail":"Routine name already exists"}` when the authenticated user already owns a
  routine with the same normalized name.
* `422` for invalid, missing, or unknown fields.
* `401` when unauthenticated.

The client cannot provide an ID, owner, normalized name, timestamps, activation state, or day count.

### `GET /api/routines/{routine_id}`

Returns:

* `200` with the owned routine.
* `404 {"detail":"Routine not found"}` when it does not exist or belongs to another user.
* `401` when unauthenticated.
* Framework validation `422` when `routine_id` is not a valid positive integer.

### `PUT /api/routines/{routine_id}`

Accepts the complete create request shape and replaces every editable field.

Returns:

* `200` with the updated routine.
* `404 {"detail":"Routine not found"}` when it does not exist or belongs to another user.
* `409 {"detail":"Routine name already exists"}` when another routine owned by the same user has
  the requested normalized name.
* `422` for an invalid ID or invalid, missing, or unknown fields.
* `401` when unauthenticated.

### `DELETE /api/routines/{routine_id}`

Returns:

* `204` with no response body after deletion.
* `404 {"detail":"Routine not found"}` when it does not exist or belongs to another user.
* `401` when unauthenticated.
* Framework validation `422` when `routine_id` is not a valid positive integer.

### Error normalization

Frontend API functions explicitly handle string-detail errors, FastAPI array-shaped `422` details,
malformed JSON, empty bodies where JSON is expected, and unexpected successful payloads. Components
receive stable string messages or typed not-found/conflict outcomes, never arbitrary server values.

## UI Requirements

### Authenticated navigation

After onboarding, the main navigation includes:

* Profile.
* Exercises.
* Routines.

The navigation identifies the current section and remains usable without horizontal overflow at a
common mobile viewport. F07 does not introduce final application navigation or a dashboard.

### Routine list

The Routines screen includes:

* Heading `Routines`.
* `Create routine` action.
* One compact item per routine showing its name and friendly objective label.
* A clear affordance to open routine detail.

Initial loading must not briefly display the empty state. A successful empty list shows a useful
message explaining that the user has no routines and includes the create action. A list failure shows
a normalized message and Retry action.

### Create and edit form

Both flows use the same field rules and friendly objective labels. The form includes:

* Name text input.
* Objective single-choice control.
* Optional description textarea.
* Explicit Save/Create and Cancel actions.

The create form may preselect the current profile goal. The edit form is pre-populated with the
persisted routine. Client validation may improve feedback, but the backend remains authoritative.

A duplicate-name conflict leaves the entered values intact and presents a useful inline message. A
validation, network, protocol, or malformed-response failure also leaves the form available for
correction, retry, or cancellation.

### Routine detail

Detail shows:

* Routine name.
* Friendly objective label.
* Description or `No description provided`.
* Edit action.
* Delete action.
* Back-to-routines action.

Detail does not show a fake day count or an unusable training-day editor. Because the list response
already contains the complete F07 representation, the UI may open detail from its validated list
state without issuing a redundant detail request. The detail API remains available for direct
retrieval and future flows.

### Delete confirmation

Deletion uses an explicit in-application confirmation naming the routine and explaining that the
action is permanent. It exposes separate Cancel and Delete routine actions and prevents repeated
submission while pending. Browser-native `window.confirm` is not sufficient.

After successful deletion, the UI returns to the refreshed routine list. A failed deletion preserves
the routine detail and permits retry or cancellation.

## Business Rules

* A routine represents a complete training plan, not an individual training day or workout session.
* Every routine has exactly one owner.
* Users may own multiple routines; F07 imposes no maximum.
* Routine names are unique per owner after trimming and case normalization.
* Routine names need not be unique across different users.
* Creation and update do not change other routines.
* No routine is active, scheduled, archived, or preferred in F07.
* The routine objective is independent from the user's current profile goal after creation.
* Routine descriptions are user-provided facts, not AI interpretations or derived signals.
* Deleting a fitness profile does not delete routines.
* Deleting a routine is permanent in F07.

## Validation

* `name` is trimmed, required, non-empty, and at most 120 characters.
* Names that differ only by surrounding whitespace or Unicode-aware case normalization conflict for
  the same owner.
* Internal whitespace in a name is preserved and is not collapsed for uniqueness.
* `objective` accepts only the four documented persisted values.
* `description` is optional, trimmed when provided, and at most 1,000 characters.
* `null`, an empty string, or a whitespace-only description is persisted and returned as `null`.
* Request bodies reject unknown fields.
* `routine_id` path parameters must be positive integers.

The migration must be validated by:

* Applying the complete migration history to a new isolated database and verifying the routine
  schema, foreign key, and uniqueness constraint.
* Creating an isolated database at the previously committed Alembic head `4a0245aea892`, applying
  the F07 migration, and exercising routine creation and retrieval against the upgraded database.
* Comparing `alembic current` and `alembic heads` for the actual configured local development
  database and safely upgrading it before reporting F07 as locally operational.
* Exercising at least one authenticated routine API flow against a migrated database rather than a
  schema created directly from ORM metadata.
* Confirming that rerunning the supported migration command is safe and creates neither duplicate
  schema objects nor data.

Tests that use `Base.metadata.create_all()` remain useful for service and endpoint behaviour but do
not satisfy the migration-validation gate.

## Acceptance Criteria

* [ ] An authenticated user can create multiple routines with valid names, objectives, and optional
  descriptions.
* [ ] Creating a routine persists it and returns the documented public representation.
* [ ] The routine list contains only the authenticated user's routines in deterministic order.
* [ ] A user can open an owned routine and inspect friendly metadata without owner or normalized-name
  fields leaking through the API or UI.
* [ ] A valid edit persists every changed field, preserves identity and creation timestamp, and
  refreshes the update timestamp.
* [ ] Cancelling create or edit performs no mutation.
* [ ] Duplicate normalized names for one user return the documented `409` and leave the form usable.
* [ ] Different users can use the same routine name.
* [ ] Unknown and other-user routine IDs return the same documented `404` for detail, update, and
  deletion.
* [ ] Deletion requires explicit confirmation, removes only the selected owned routine, and returns
  the UI to the refreshed list.
* [ ] Loading, empty, list failure, conflict, and mutation-failure states are distinct and
  recoverable.
* [ ] All routine endpoints return `401` when unauthenticated.
* [ ] Invalid or unexpected request fields return `422` without partial mutation.
* [ ] Malformed success and error responses are not rendered directly by the UI.
* [ ] F07 persists no day count, training days, exercises, activation state, or schedule.
* [ ] Deleting a fitness profile leaves owned routines intact; after profile recreation, the user can
  access them again.
* [ ] Profile, Exercises, and Routines navigation works after onboarding at a common mobile viewport
  without horizontal overflow.
* [ ] Registration, login, authentication restoration, onboarding, profile management and deletion,
  logout, exercise catalog and detail, health, CORS, and backend-unavailable flows retain their
  documented behaviour.
* [ ] The full migration history works on a fresh database, upgrade from `4a0245aea892` works, and
  the actual local development database is at the repository head.
* [ ] Backend formatting, linting, type checking, migrations, and tests pass.
* [ ] Frontend formatting, linting, and type checking pass.

## Tests

Keep automated coverage focused, consistently with DEC-008.

Add backend tests covering:

* Authenticated creation followed by listing and detail retrieval, including trimming and nullable
  description behaviour.
* Update followed by retrieval, confirming stable identity and creation timestamp and changed
  editable values.
* Same-user normalized-name conflict on creation or update, plus same-name success for another user.
* Ownership isolation across list, detail, update, and deletion, with foreign IDs behaving as not
  found.
* Authenticated deletion followed by a not-found lookup.
* One representative invalid request that leaves persisted data unchanged.
* One combined unauthenticated test covering list, create, detail, update, and deletion.
* The required fresh and previous-head migration paths, including one real authenticated API flow
  against a migrated database.

Do not add one automated test per goal value, validation boundary, malformed payload variant, or UI
state.

No frontend unit, component, browser, automated browser, or browser-level tests are required for F07. Because
they are deferred, focused manual execution or code inspection must verify:

* Navigation among Profile, Exercises, and Routines.
* Empty-list, create, detail, edit, cancellation, delete-confirmation, and successful-deletion flows.
* One duplicate-name failure preserving form values.
* One list failure and one mutation failure leaving the current screen recoverable.
* Safe handling of malformed routine success and error payloads.
* Friendly objective and missing-description labels.
* Absence of a fake day count, activation controls, or schedule controls.
* Mobile-width layout without horizontal overflow.

Existing automated tests must continue to pass, and all backend and frontend quality checks remain
required.

## Out of Scope

* Training-day creation, naming, ordering, editing, or deletion.
* Routine exercise selection, ordering, configuration, or substitutions.
* Sets, repetitions, rep ranges, loads, percentages, tempo, RIR, RPE, rest targets, notes, or
  progression rules.
* Manual or persisted routine day counts and weekly availability validation.
* Active-routine selection, activation history, commitment periods, adherence, or plan switching.
* Calendar weekdays, schedules, recurrence, start dates, end dates, or reminders.
* Routine duplication, templates, imports, exports, sharing, collaboration, or public routines.
* Routine archiving, recovery, versioning, or change history.
* Exercise suitability inference from profile data or physical limitations.
* Automatic routine generation, deterministic adaptations, suggestions, or AI reasoning.
* Custom exercises or changes to the curated exercise catalog.
* Workout execution, tracking, feedback, or history.
* Frontend automated or browser-level testing.

## Dependencies

* F01 — Project Infrastructure.
* F02 — User Authentication.
* F03 — User Fitness Profile.
* F04 — Profile Management.
* F05 — Exercise Catalog.

F06 was intentionally skipped and introduces no implementation dependency.

## Notes

Prefer a composite database uniqueness constraint on owner and normalized name so concurrent writes
cannot produce ambiguous routine names. Convert constraint failures into the documented conflict at
the service boundary rather than exposing persistence errors.

Keep the routine-to-user relationship explicit even though the initial product is personal-first.
Do not couple routine lifecycle to fitness-profile lifecycle.

Training-day management should precede routine-exercise configuration so exercises can be attached
directly to their intended day rather than temporarily attached to a routine and migrated later.
