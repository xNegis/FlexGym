# F04 — Profile Management

## Objective

Allow an authenticated user to inspect, edit, and delete their existing fitness profile.

Together with the profile creation introduced in F03, this feature completes the CRUD lifecycle for
the user's fitness profile. Profile changes remain explicit user actions and update the current
profile facts without introducing history, recommendations, derived signals, or AI interpretation.

## Context

F03 introduced a required, user-owned fitness profile and the onboarding flow used to create it.
After onboarding, the authenticated application currently shows only a profile-ready confirmation.
The persisted profile already has a last-updated timestamp intended for later changes.

F04 replaces that placeholder post-onboarding state with a useful profile-management screen. The
application remains personal-first, uses metric units, and preserves the existing authentication and
one-profile-per-user boundaries.

The user must remain in control of profile mutation. Editing requires an explicit save action, and
deletion requires deliberate confirmation because it removes persisted data, signs the user out,
and requires them to log in before completing onboarding again.

## User Experience

An authenticated user with a fitness profile sees a readable summary of every saved profile field,
with friendly labels and metric units rather than internal enum values.

From this screen the user can:

* Enter edit mode.
* Change any profile field using a form pre-populated with the current values.
* Save a valid update or cancel without changing the saved profile.
* Begin profile deletion.
* Confirm or cancel deletion.
* Log out.

After a successful update, the refreshed profile summary is shown. After a successful deletion, the
user is signed out and returned to the login screen. After logging in again, the existing onboarding
flow allows them to create a new profile.

## Functional Requirements

### FR-1 — Profile inspection

An authenticated user with a fitness profile can inspect all of its user-editable values.

Structured values must be presented as understandable labels. Numeric values must identify their
metric units. Optional absent values must have a clear, human-readable representation rather than
appearing as raw `null` values.

### FR-2 — Profile editing

An authenticated user with an existing profile can enter edit mode with every current profile value
pre-populated.

All user-editable profile fields are replaced together when the user saves. The profile identity,
owner, and creation timestamp cannot be changed by the client.

### FR-3 — Explicit save and cancel

Changes are persisted only after the user explicitly saves a valid form.

Cancelling edit mode discards unsaved changes and returns to the saved profile summary. Cancelling
must not issue an update request or mutate persisted data.

### FR-4 — Atomic update

A valid update replaces the current profile values atomically and refreshes its last-updated
timestamp. Invalid input must not partially update the profile.

### FR-5 — Profile deletion

An authenticated user with an existing profile can permanently delete it only after an explicit
confirmation step that clearly states the consequence.

Cancelling confirmation leaves the profile unchanged. While deletion is pending, repeated mutation
requests from the UI must be prevented.

### FR-6 — Post-deletion logout

After successful deletion, the authentication cookie is removed and the user is returned to the
login screen.

After logging in again, the user has no profile and is therefore shown the existing onboarding flow.
They can subsequently create a new profile through the existing F03 flow.

### FR-7 — Authentication and ownership boundary

Profile retrieval, creation, update, and deletion require authenticated identity. Every operation
targets only the profile belonging to the authenticated user. Clients cannot provide or select a
user ID or profile ID for mutation.

### FR-8 — Missing-profile handling

Update and delete requests made when the authenticated user has no profile fail explicitly and do
not create or mutate data.

If the frontend discovers during an edit or deletion flow that the profile no longer exists, it must
end the session and return the user to login rather than leaving the management screen in a broken
state.

### FR-9 — Request-state behaviour

The management UI must prevent repeated save, delete, and logout actions while the corresponding
request is pending. A failed update must preserve the entered values and keep the editing flow usable.
A failed deletion must leave the current profile available and allow the user to retry or cancel.

### FR-10 — Architectural boundaries

HTTP endpoints must remain thin. Profile update and deletion belong in the fitness-profile
application service or an equivalent non-HTTP boundary. React components must use the frontend API
layer rather than calling backend URLs directly.

## Domain / Data Requirements

F04 does not introduce a new persisted entity.

The existing `FitnessProfile` remains the current snapshot of user-provided profile facts. Updating
it changes that snapshot in place:

* The profile primary key remains unchanged.
* The owning user remains unchanged.
* `created_at` remains unchanged.
* `updated_at` reflects the successful update.

Deleting the profile removes the current snapshot. It does not delete or log out the owning user.

F04 does not retain previous values, change events, deletion tombstones, or an audit history. Future
body-weight and body-composition history must be represented separately rather than inferred from
profile updates.

## API Requirements

The existing `GET /api/fitness-profile` and `POST /api/fitness-profile` contracts from F03 remain
unchanged.

### `PUT /api/fitness-profile`

Requires authentication and an existing profile.

Accepts the complete set of user-editable profile fields using the same request shape and validation
rules as `POST /api/fitness-profile`:

```json
{
  "date_of_birth": "1990-06-15",
  "biological_sex": "male",
  "height_cm": 178.5,
  "weight_kg": 81.2,
  "body_fat_percentage": 17.5,
  "training_experience": "intermediate",
  "primary_goal": "build_muscle",
  "training_days_per_week": 4,
  "preferred_workout_duration_minutes": 60,
  "training_environment": "full_gym",
  "physical_limitations": "Previous left shoulder irritation"
}
```

Returns:

* `200` with the complete updated profile.
* `404 {"detail":"Fitness profile not found"}` when the authenticated user has no profile.
* `422` when input validation fails, including missing or unknown fields.
* `401` when unauthenticated.

The endpoint uses full-replacement semantics for user-editable fields. Optional fields are cleared by
sending `null`; omitting a declared field is invalid. Profile ID, user ID, and timestamps are not
accepted as request fields.

### `DELETE /api/fitness-profile`

Requires authentication and an existing profile.

Returns:

* `204` with no response body after successful deletion. The response expires the authentication
  cookie.
* `404 {"detail":"Fitness profile not found"}` when the authenticated user has no profile.
* `401` when unauthenticated.

The API does not require or accept the profile owner or profile ID in the request.

### Response handling

The profile response shape remains the F03 shape and does not expose the owner ID.

Frontend API functions must treat all response bodies as untrusted runtime values. A successful
profile response must be validated before being returned to UI components. Expected error bodies,
including FastAPI's array-shaped `422 detail`, must be normalized to a stable string message.
Malformed or unexpected response bodies must produce a safe generic error and must never be rendered
directly by a React component.

## UI Requirements

### Profile summary

The authenticated profile-complete state must show:

* Date of birth.
* Biological sex.
* Height in centimetres.
* Current body weight in kilograms.
* Body-fat percentage or an explicit not-provided value.
* Training experience.
* Primary fitness goal.
* Available training days per week.
* Preferred workout duration in minutes.
* Training environment.
* Physical limitations or an explicit no-limitations value.
* An edit action.
* A delete-profile action.
* The authenticated email and logout action.

Database identifiers and timestamps do not need to be displayed.

### Edit mode

The edit form must reuse the labels, option labels, units, appropriate native controls, and validation
constraints established by F03. It must be pre-populated from the saved profile and expose Save and
Cancel actions.

The form must:

* Mark optional fields clearly.
* Prevent repeated submission while saving.
* Preserve all entered values after a failed save.
* Show normalized, actionable validation or request errors.
* Allow an optional field to be cleared.
* Return to the profile summary with updated values after success.

### Delete confirmation

Activating Delete profile must first show an explicit confirmation within the application. The
confirmation must communicate that the saved fitness profile will be permanently removed, the user
will be signed out, and they will need to log in and complete onboarding again.

The confirmation exposes separate Cancel and Delete profile actions. The final deletion action must
be visually and textually distinguishable as destructive and disabled while pending.

Browser-native `window.confirm` is not sufficient because the flow must support an accessible
pending state and inline failure recovery.

### Loading and failure states

The existing initial authenticated profile check remains the loading boundary for the management
screen. Network, protocol, malformed-response, or unexpected server failures during that check use
the existing backend-unavailable experience and retry action.

An update or deletion failure is shown within the current management flow and does not send the user
to the global unavailable screen. A normalized `404` during either mutation ends the session and
returns the user to login. Other failures leave the screen usable for retry or cancellation.

Every summary, edit, confirmation, pending, error, and onboarding state must be usable at common
mobile viewport widths without horizontal overflow.

## Business Rules

* A user has either zero or one fitness profile.
* Only the authenticated owner can inspect, create, update, or delete their profile.
* Profile update replaces all user-editable profile facts in one atomic operation.
* Profile deletion does not delete the user account, but it ends the current authentication session.
* Deleting a profile returns the user to login; logging in again restores the existing no-profile
  onboarding state.
* Updates and deletions never create a missing profile implicitly.
* The current profile is a snapshot, not an append-only history.
* Changing current weight or body-fat percentage does not create body-progress history.
* Profile changes do not generate routines, nutrition targets, recommendations, signals, or AI
  interpretation.

## Validation

Profile updates use exactly the F03 field validation rules:

* `date_of_birth` must be a real calendar date earlier than the current date and must not imply an
  age greater than 120 years.
* `biological_sex` must be `male` or `female`.
* `height_cm` must be between 50 and 250 inclusive and may contain one decimal place.
* `weight_kg` must be between 20 and 500 inclusive and may contain one decimal place.
* `body_fat_percentage`, when provided, must be between 2 and 75 inclusive and may contain one
  decimal place.
* `training_experience` must be `beginner`, `intermediate`, or `advanced`.
* `primary_goal` must be `build_muscle`, `lose_fat`, `increase_strength`, or `general_fitness`.
* `training_days_per_week` must be an integer between 1 and 7 inclusive.
* `preferred_workout_duration_minutes` must be an integer between 15 and 300 inclusive.
* `training_environment` must be `full_gym`, `home_gym`, `minimal_equipment`, or
  `bodyweight_only`.
* `physical_limitations` is optional, is trimmed when provided, and must not exceed 1,000
  characters. `null`, an empty string, or a whitespace-only value clears it.
* JSON numeric booleans must not be accepted as numeric profile values.
* Unknown request fields must be rejected rather than silently ignored.

Backend validation remains authoritative even when equivalent browser-side validation is present.

## Acceptance Criteria

* [x] An authenticated user with a profile sees every saved profile value with friendly labels and
  metric units.
* [x] Optional absent values are displayed clearly and raw enum values, `null`, IDs, and timestamps
  are not exposed as profile content.
* [x] The user can enter edit mode with every current value pre-populated.
* [x] Cancelling an edit returns to the unchanged saved profile without issuing an update.
* [x] Saving a valid complete profile update persists every changed value, preserves profile identity
  and `created_at`, and refreshes `updated_at`.
* [x] Reloading or logging in again displays the updated values.
* [x] Optional body fat and physical limitations can be cleared.
* [x] An invalid update is rejected atomically and leaves the original persisted profile unchanged.
* [x] A failed update shows a safe, useful error while preserving the entered form values and
  allowing retry or cancellation.
* [x] The user must pass through explicit in-application confirmation before deletion.
* [x] Cancelling deletion leaves the profile unchanged.
* [x] Confirming deletion removes only the fitness profile, ends the current session, and returns the
  user to login.
* [x] Reloading after deletion remains unauthenticated. Logging in again shows onboarding, and the
  user can create a new profile through the F03 flow.
* [x] A failed deletion leaves the profile-management flow usable and permits retry or cancellation.
* [x] Retrieval, creation, update, and deletion return `401` when unauthenticated.
* [x] Updating or deleting a missing profile returns the documented `404`; the frontend ends the
  session and returns to login if this occurs during an active management flow.
* [x] Unexpected or malformed profile and error responses are not rendered directly and degrade to
  safe UI behaviour.
* [x] Existing registration, login, identity restoration, profile onboarding, duplicate-creation,
  logout, health, CORS, and unavailable-backend flows retain their documented behaviour.
* [x] All profile-management states work at a common mobile viewport without horizontal overflow.
* [x] Backend formatting, linting, type checking, and tests pass.
* [x] Frontend formatting, linting, and type checking pass.

## Tests

Keep automated coverage small and focused, consistently with DEC-008.

Add backend tests covering:

* One authenticated update followed by retrieval, confirming changed values, stable profile identity
  and creation timestamp, and a refreshed update timestamp.
* One representative invalid update confirming that the original profile remains unchanged.
* One authenticated deletion confirming the session is ended, followed by login and creation of a
  replacement profile.
* One combined missing-profile test for update and delete.
* One combined unauthenticated test for update and delete.

Do not add a test for every field, enum value, validation boundary, timestamp detail, or UI state.

No frontend unit, component, integration, browser, Playwright, or end-to-end tests are required for
F04. Because those tests are deferred, focused manual execution or code inspection must verify:

* Summary labels and optional-value rendering.
* Edit pre-population, cancellation, successful save, and optional-field clearing.
* Preservation of edits after one representative validation failure.
* Delete confirmation cancellation, successful deletion, post-deletion login, and onboarding after
  logging in again.
* One representative failed deletion leaving the UI usable.
* Safe behaviour for a malformed success or error response at the frontend API boundary.
* Mobile-width layout without horizontal overflow.

Existing automated tests must continue to pass, and all backend and frontend quality checks remain
required.

## Out of Scope

* Account email, password, session, or account-deletion management.
* Profile change history, audit logs, versioning, undo, soft deletion, or recovery.
* Optimistic concurrency control or conflict merging across multiple editing clients.
* Unit-system preferences or imperial-unit input and display.
* Additional profile fields or changes to the F03 structured option sets.
* Body-weight, body-measurement, or body-fat history and progress charts.
* Medical screening, diagnoses, injury workflows, or clinical advice.
* BMI, basal metabolic rate, calorie targets, macronutrient targets, or training calculations.
* Exercise catalogs, routines, workout generation, or training schedules.
* Deterministic signals, adaptations, AI interpretation, or recommendations.
* Final application navigation, dashboard design, and full design-system work.
* Frontend automated or end-to-end testing.

## Dependencies

* F01 — Project Infrastructure.
* F02 — User Authentication.
* F03 — User Fitness Profile.

## Notes

Prefer sharing one backend request schema or validation boundary between profile creation and full
update so their rules cannot drift. Keep distinct service operations for create, update, and delete
because their missing-profile and conflict behaviour differs.

The existing table and timestamps are sufficient; F04 should not require a database migration.

The frontend may reuse profile form controls between onboarding and editing when that improves
clarity, but should not introduce a generic form framework solely for this feature.
