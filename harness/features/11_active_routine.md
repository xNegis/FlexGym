# F11 — Active Routine

## Objective

Allow an authenticated user to select the one routine that currently represents their training
plan, switch that selection deliberately, or continue with no active routine.

F11 completes Phase 1 by distinguishing reusable routine drafts from the routine that future
workout-tracking features should use as their planning source. Activation is a lightweight user
selection, not a plan snapshot, commitment period, workout event, or activation-history system.

## Context

F07 introduced multiple user-owned routines. F08 and F09 added training sessions and structured
exercise prescriptions. F10 established a fixed seven-position weekly schedule in which every
persisted training day is assigned exactly once and unassigned positions are derived rest.

Users may keep several routines for alternatives or future use, but Phase 2 needs an unambiguous
answer to which plan is current. F11 provides that answer while keeping draft management flexible:
the active routine remains editable, and activating it does not clone or freeze its contents.

The readiness gate is intentionally small. A routine must contain at least one training day, and
every training day must have its F10 assignment. It does not require every training day to contain a
configured exercise. Exercise completeness and whether a particular scheduled session can be
started belong to the future Start Workout feature.

## User Experience

The Routines section clearly identifies the active routine, if one exists. The user can:

* Activate a routine that contains at least one training day.
* See which routine is active in the list and detail views.
* Switch from the current routine to another after explicit confirmation naming both routines.
* Deactivate the current routine after explicit confirmation.
* Continue creating and editing active and inactive routines.

Activating the first routine is itself an explicit action and does not need a second confirmation.
Activating an already active routine is an idempotent no-op. A routine with no training days shows a
useful explanation and cannot be activated.

Deleting an active routine clears the active selection in the same transaction. Deleting the final
training day from an active routine also clears the selection. Both confirmation dialogs warn about
that effect before deletion.

## Functional Requirements

### FR-1 — Optional singleton active routine

Each user has either zero or one active routine. A routine can be active only for its owner. One
user's activation never affects another user's active routine, even when their routines share the
same name.

The client cannot independently provide or change activation ownership.

### FR-2 — Activation

An authenticated user can activate one owned routine. When the user has no active routine, the
operation creates the active selection. When another routine is active, the same operation replaces
that selection atomically.

Activation does not clone, archive, deactivate in storage, delete, or otherwise mutate either
routine. It does not change routine, training-day, schedule, exercise-configuration, or set
timestamps.

### FR-3 — Lightweight readiness

A routine can be activated only when it contains at least one training day. The service also
defensively verifies that every training day has exactly one weekly assignment before committing
activation.

F11 does not require configured exercises, minimum set totals, target weights, agreement with the
fitness profile, or any other workout-readiness rule. A routine with one assigned but empty training
day is eligible.

An ineligible activation fails without changing the previous active selection or activation
timestamp.

### FR-4 — Idempotent reactivation

Activating the already active routine succeeds and returns the existing active selection. It does
not refresh `activated_at` or any plan timestamp.

This makes retries safe after an uncertain network outcome.

### FR-5 — Explicit switching

When the frontend user activates a routine while another is active, it first shows an
in-application confirmation naming the current and replacement routines. Cancelling issues no
request.

After confirmation, the backend replaces the association atomically. A failed switch preserves the
previous active routine and its original `activated_at` value.

The API operation is itself an explicit replacement request and does not require a separate
confirmation token.

### FR-6 — Deactivation

The user can clear their active routine after an in-application confirmation naming it. The backend
deactivation operation is idempotent: clearing an already absent selection succeeds without side
effects.

Deactivation does not delete or modify the routine or its nested plan.

### FR-7 — Continued plan editing

Active and inactive routines retain the same editing capabilities. Activation does not lock routine
metadata, schedule moves, training-day creation or rename, exercise configuration, or planned sets.

Creating a new empty training day inside an active routine is allowed. F11 does not continuously
re-evaluate exercise completeness because exercise completeness is not part of its activation gate.

### FR-8 — Deletion effects

Deleting the active routine removes both the routine and active selection in the same transaction.
Deleting any inactive routine leaves the active selection unchanged.

Deleting the final training day from the active routine deletes that day and clears the active
selection atomically. Deleting a training day while at least one other training day remains does not
deactivate the routine. A failed deletion changes neither the plan nor active selection.

Existing delete endpoints retain their success status codes. Their services and frontend
confirmations gain the documented activation-aware behaviour.

### FR-9 — Activation timestamp

The active selection records when the current routine became active. First activation and a
successful switch set `activated_at` to the current server time. Deactivation removes it with the
selection. Reactivating a previously deactivated routine creates a new timestamp.

F11 retains no prior activation rows or timestamps after a switch or deactivation.

### FR-10 — Public active state

Every public routine representation gains a derived `is_active` boolean. It is never accepted from
clients and is not stored on the routine row.

A dedicated active-routine resource returns the selected routine together with `activated_at`, or
`null` when the user has none. It is the boundary future workout features should use to locate the
current plan rather than scanning routine lists or trusting client state.

### FR-11 — Authentication and onboarding boundary

Every active-routine endpoint requires authentication. Unknown routine IDs and IDs owned by another
user produce the same routine-not-found response.

The frontend exposes activation controls after profile onboarding, consistently with routine
management. The API does not require a current fitness profile. Deleting and later recreating a
fitness profile preserves the user's active selection; deleting the owning user removes it.

### FR-12 — Request-state and error behaviour

The UI distinguishes active-state loading, no-active, active, activation-unavailable, switch
confirmation, deactivation confirmation, mutation-pending, and recoverable failure states.

Activation controls prevent duplicate or conflicting submissions while pending. The UI changes its
confirmed active state only after a validated success response. Expected, malformed, and unexpected
responses are normalized at the frontend API boundary; React never renders raw server values.

### FR-13 — Architectural boundaries

Endpoints remain thin. Ownership checks, readiness, idempotency, atomic switching, deletion effects,
timestamps, and active-state lookup live in an application service or equivalent non-HTTP boundary.

Routine and training-day deletion services own the required active-selection changes so existing
endpoints cannot bypass the invariant. React components use the frontend API layer.

## Domain / Data Requirements

F11 introduces one current `ActiveRoutine` association with:

* Required owning user reference, unique so a user has at most one selection.
* Required routine reference, unique so one routine has at most one active association.
* Required activation timestamp.

Persistence must ensure that the selected routine belongs to the same user identified by the
association, in addition to service-level ownership validation. The routine table may gain the
minimal composite uniqueness needed to support this ownership-preserving foreign key.

The association is deleted when its user or routine is deleted. There is no nullable routine
reference, active boolean on `Routine`, activation status enum, deactivation timestamp, end date,
reason, history row, or copied plan content.

Existing data migrates with no active selections. F11 must not guess which existing routine should
be active.

## API Requirements

All endpoints require authentication. Request bodies reject unknown fields. IDs are strict positive
integers.

Every existing routine response gains `is_active`:

```json
{
  "id": 12,
  "name": "Push Pull Legs",
  "objective": "build_muscle",
  "description": null,
  "training_day_count": 3,
  "is_active": true,
  "created_at": "2026-08-11T15:30:00",
  "updated_at": "2026-08-12T10:15:00"
}
```

This applies consistently to routine list, create, detail, and update responses. Creating a routine
always returns `is_active: false`. Updating routine metadata preserves its active state.

The active-routine representation is:

```json
{
  "routine": {
    "id": 12,
    "name": "Push Pull Legs",
    "objective": "build_muscle",
    "description": null,
    "training_day_count": 3,
    "is_active": true,
    "created_at": "2026-08-11T15:30:00",
    "updated_at": "2026-08-12T10:15:00"
  },
  "activated_at": "2026-08-13T08:00:00"
}
```

### `GET /api/active-routine`

Returns:

* `200` with the active-routine representation when one exists.
* `200` with JSON `null` when the user has no active routine.
* `401` when unauthenticated.

### `PUT /api/active-routine`

Accepts:

```json
{
  "routine_id": 12
}
```

Returns:

* `200` with the resulting active-routine representation after first activation, switch, or
  idempotent reactivation.
* `404 {"detail":"Routine not found"}` when the routine does not exist or belongs to another user.
* `409 {"detail":"Routine must contain at least one training day before activation"}` when the
  routine has no training days.
* `409 {"detail":"Routine schedule is incomplete"}` when any persisted training day lacks exactly
  one assignment.
* `422` for a missing, unknown, wrongly typed, boolean, or non-positive `routine_id`.
* `401` when unauthenticated.

A `404`, `409`, `422`, authentication failure, or unexpected failure preserves the prior active
selection.

### `DELETE /api/active-routine`

Returns:

* `204` with no response body whether or not a selection existed.
* `401` when unauthenticated.

### Changes to existing delete endpoints

`DELETE /api/routines/{routine_id}` retains its existing response contract and additionally removes
the selection when deleting the active routine.

`DELETE /api/routines/{routine_id}/days/{day_id}` retains its existing response contract and
additionally removes the selection when the deleted day was the active routine's final training
day.

### Error normalization

Frontend parsing validates the complete nested active-routine shape, requires the nested routine to
have `is_active: true`, and accepts only literal JSON `null` for the no-active result. Existing
routine parsing requires a boolean `is_active`.

The API layer handles string-detail errors, FastAPI array-shaped `422` details, malformed JSON,
empty bodies where JSON is expected, and invalid successful payloads. Components receive stable
messages or deliberate typed not-found/readiness outcomes.

## UI Requirements

### Active state loading

The Routines screen must not briefly show every routine as inactive while active state is loading.
It may obtain the state from a validated routine list and need not issue `GET /api/active-routine`
solely to render the list. The dedicated endpoint must still be integrated into the frontend API
boundary for future use and focused manual verification.

A routine-list failure remains recoverable through the existing Retry action and does not render a
stale active badge as confirmed state.

### Routine list

The active routine has a clear `Active` badge or equivalent text that does not rely only on color.
Inactive routines do not show an ambiguous selected state. Existing routine name, objective, and
training-day count remain visible.

The screen shows a concise no-active message when routines exist but none is selected. No dashboard,
today card, workout action, adherence warning, or recommendation is introduced.

### Routine detail

Detail clearly shows whether the routine is active and provides the appropriate action:

* `Activate routine` when no other routine is active.
* `Switch to this routine` when a different routine is active.
* `Deactivate routine` when this routine is active.

An empty routine cannot be activated. Its disabled action or adjacent explanation says that at
least one training day is required. The UI does not claim exercises are required.

### Switch confirmation

Switching uses an explicit in-application confirmation that names both routines and explains that
the replacement becomes the plan selected for future workouts. It exposes separate Cancel and
Switch routine actions. Browser-native `window.confirm` is not sufficient.

Success updates validated list and detail state. Failure preserves the prior active badge and the
confirmation context, shows a normalized message, and permits retry or cancellation.

### Deactivation confirmation

Deactivation uses an explicit in-application confirmation naming the routine and explaining that no
routine will be selected for future workouts. It does not imply deletion of the plan. Failure keeps
the routine active and permits retry or cancellation.

### Deletion confirmations

The existing active-routine deletion confirmation states that deleting it also leaves the user with
no active routine. The existing final-training-day deletion confirmation states the same when that
day belongs to the active routine. The copy remains accurate about nested exercise and set deletion.

After either successful deletion, list/detail state refreshes so no stale active badge or action
remains.

### Responsive and accessible behaviour

Active labels, actions, and confirmation controls remain keyboard-usable and do not cause horizontal
overflow at a common mobile viewport. Pending labels are explicit, and status is understandable
without color alone.

## Business Rules

* A user has zero or one active routine.
* An active routine always belongs to the same user as its selection.
* Multiple users choose active routines independently.
* Activation is an explicit current-plan selection, not evidence that a workout occurred.
* A routine needs at least one training day to be activated.
* Every training day must have exactly one weekly assignment at activation time.
* Configured exercises and exercise completeness are not F11 activation requirements.
* Activation and deactivation do not change the selected routine's plan timestamps.
* Activating the current routine is idempotent and preserves `activated_at`.
* Switching changes the selection and activation timestamp atomically.
* Active routines remain editable; no snapshot or locked version is created.
* Deleting the active routine clears the selection.
* Deleting the final training day from the active routine clears the selection.
* Deleting an inactive routine or a non-final day does not change the selection.
* Deleting a fitness profile preserves routines and active selection.
* No routine is activated automatically after registration, creation, profile changes, deletion,
  or deactivation.

## Validation

* `routine_id` is a strict positive integer; booleans are invalid.
* Activation accepts no owner, active flag, timestamp, or additional fields.
* The selected routine belongs to the authenticated user.
* The selected routine contains at least one persisted training day.
* Every selected routine training day has exactly one same-routine schedule assignment.
* Failed activation and switch attempts preserve the previous association and timestamp.
* Supported mutations never leave an active association pointing to a deleted routine or to a
  routine with zero training days.
* Active state in routine responses is derived from the authenticated user's association.

Migration validation must include:

* Complete migration history against a fresh isolated database, verifying ownership-preserving
  foreign keys, uniqueness, cascades, and the absence of invented active rows.
* Upgrade from previous head `c31f5a8d2e04` with multiple users, routines, schedules, configured
  exercises, and sets, verifying all existing plan data and IDs remain unchanged and no routine is
  automatically activated.
* Real authenticated first activation, switch, lookup, and deactivation flows against the upgraded
  database, plus routine or final-day deletion clearing the association.
* Comparison of `alembic current` and `alembic heads` for the configured local development database
  and safe upgrade before reporting F11 locally operational.
* Safe rerun of the supported migration command without duplicate associations or changed plan
  data.

Tests based only on `Base.metadata.create_all()` do not satisfy this migration gate.

## Acceptance Criteria

* [ ] An authenticated user with no active routine receives JSON `null` from the active-routine
  resource.
* [ ] A user can activate an owned routine containing at least one assigned training day.
* [ ] A routine with an assigned but exercise-free training day can be activated.
* [ ] A routine with no training days cannot be activated and the previous selection is preserved.
* [ ] Activating the current routine is idempotent and preserves `activated_at` and plan timestamps.
* [ ] Switching atomically selects the replacement routine and records a new activation timestamp.
* [ ] Cancelling a switch or deactivation performs no request or mutation.
* [ ] A failed switch leaves the previous routine visibly and persistently active.
* [ ] Deactivation is idempotent and never deletes or changes routine plan data.
* [ ] Routine list, create, detail, and update responses expose an accurate derived `is_active`.
* [ ] Different users' active selections and routine visibility remain isolated.
* [ ] Foreign and unknown routine IDs have the same documented non-disclosing response.
* [ ] Active routines remain editable, including adding a new empty training day.
* [ ] Deleting the active routine clears its selection atomically; deleting another routine does
  not.
* [ ] Deleting the active routine's final training day clears its selection atomically; deleting a
  non-final day does not.
* [ ] Routine and final-day deletion confirmations describe the deactivation effect when relevant.
* [ ] Deleting and recreating a fitness profile preserves the active selection.
* [ ] Loading, no-active, active, unavailable, confirmation, pending, and failure UI states are
  distinct and recoverable.
* [ ] Malformed success and error responses are normalized and never rendered directly.
* [ ] Active state is understandable without color and controls work at mobile width and by
  keyboard.
* [ ] No automatic activation, exercise-completeness gate, plan snapshot, history, commitment,
  archive, workout fact, recommendation, or AI behaviour is introduced.
* [ ] Existing authentication, profile, catalog, routine CRUD, schedule, exercise configuration,
  health, CORS, and backend-unavailable flows retain their documented behaviour apart from explicit
  active-state additions and deletion effects.
* [ ] Fresh migration, upgrade from `c31f5a8d2e04`, real migrated-database flows, and actual local
  database revision checks pass.
* [ ] Backend and frontend formatting, linting, type checking, and relevant tests pass.

## Tests

Keep automated coverage focused, consistently with DEC-008.

Backend tests cover:

* No-active lookup, first activation, active lookup, and deactivation for one user.
* Activation followed by list and detail, verifying derived `is_active` and unchanged plan
  timestamps.
* Idempotent reactivation preserving `activated_at`.
* Successful switch and one failed switch preserving the original selection and timestamp.
* Empty-routine rejection and successful activation of a routine whose only training day contains
  no configured exercises.
* Ownership isolation and the common not-found response for unknown and other-user routines.
* Active-routine deletion, inactive-routine deletion, final-day deletion, and non-final-day deletion
  effects.
* Profile deletion preserving the active selection and user deletion cascading it.
* One combined unauthenticated test covering active lookup, activation, and deactivation.
* One representative invalid request leaving selection and timestamps unchanged.
* Fresh and previous-head migration paths, including the required real authenticated flows against
  a migrated database.

Do not add one test per malformed payload variant, routine count, edit type, or UI state.

Frontend automated and end-to-end tests remain deferred. Manual execution or focused code inspection
must verify:

* No-active, first activation, active badge, detail actions, and deactivation.
* Empty-routine activation explanation without an exercise requirement.
* Switch confirmation, cancellation, success, and one failed switch preserving the prior badge.
* Editing the active routine and adding an empty training day without forced deactivation.
* Active routine and final-day deletion copy and refreshed state.
* Safe parsing of active-routine, `null`, updated routine, validation-error, and malformed payloads.
* Duplicate-submission prevention, keyboard use, non-color status, and mobile layout.

Existing tests must be updated for the intentional `is_active` response addition and otherwise
continue to pass.

## Out of Scope

* Workout start, today's-workout selection, workout execution, navigation, timers, feedback, or
  history.
* Requiring exercises or particular prescription fields before activation.
* Routine snapshots, immutable versions, drafts separate from active versions, or edit locking.
* Activation history, deactivation history, commitment periods, adherence, streaks, or analytics.
* Automatic activation, fallback selection, profile-derived choices, recommendations, or AI.
* Start or end dates, calendar recurrence, schedule exceptions, rotating weeks, or configurable week
  starts.
* Routine archive, duplication, templates, import/export, sharing, or collaboration.
* Notifications, reminders, dashboard, or dedicated home screen.
* Changes to catalog, routine metadata vocabulary, schedule movement, exercise configuration, or set
  semantics.
* Frontend automated or end-to-end testing.

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

F06 was intentionally skipped and adds no dependency.

## Notes

Prefer a dedicated association over a mutable `is_active` flag on each routine. The persistence
shape should make one-current-routine ownership explicit and avoid SQLite-specific partial indexes.

Activation is not a routine-plan edit. Do not refresh routine or nested `updated_at` timestamps when
the selection changes.

Future workout tracking should resolve the active plan through the active-routine service boundary.
F11 does not decide whether workout creation later snapshots prescriptions or references plan
records directly.
