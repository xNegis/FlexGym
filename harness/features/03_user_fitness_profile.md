# F03 — User Fitness Profile

## Objective

Allow an authenticated user to complete an initial fitness profile containing the personal,
training, and availability information required by future training and nutrition features.

F03 introduces profile creation as a required onboarding step. It records user-provided facts but
does not derive recommendations, calculate targets, or allow later profile editing.

## Context

F01 established the application infrastructure and F02 introduced authenticated user identity.
An authenticated user currently reaches a minimal shell containing their email and a logout action.

Future training planning, nutrition, analytics, and adaptation functionality will require stable,
structured user context. The initial profile must therefore belong explicitly to its user and keep
facts separate from future derived signals and AI interpretations.

The application is personal-first and uses metric units initially. The data model must still use a
normal user-to-profile relationship rather than global profile state.

## User Experience

After registration, or after login when the authenticated user has no fitness profile, the user is
shown a fitness-profile onboarding form.

The form collects:

* Date of birth.
* Biological sex.
* Height.
* Current body weight.
* Optional body-fat percentage.
* Training experience.
* Primary fitness goal.
* Available training days per week.
* Preferred workout duration.
* Training environment.
* Optional physical limitations.

The form identifies metric units explicitly. The user can log out without completing it, but cannot
reach the post-onboarding authenticated state until a valid profile has been created.

After successful submission, the user sees a simple confirmation that their profile is ready,
together with their authenticated email and logout action. Inspecting or changing saved profile
values belongs to F04.

Reloading or logging in again must detect the persisted profile and skip onboarding when it already
exists.

## Functional Requirements

### FR-1 — User-owned fitness profile

The backend must persist at most one fitness profile for each user. A profile belongs to exactly one
user and cannot exist without that user.

### FR-2 — Profile onboarding detection

After restoring authenticated identity, the frontend must determine whether the current user has a
fitness profile.

An authenticated user without a profile is shown onboarding. An authenticated user with a profile
is shown the post-onboarding authenticated state.

### FR-3 — Profile creation

An authenticated user without a profile can create one by submitting all required fields and any
optional fields they choose to provide.

Creation must be atomic. Invalid submissions must not create a partial profile.

### FR-4 — Single creation

An authenticated user who already has a profile cannot create another profile. A repeated creation
request must fail explicitly and must not mutate the existing profile.

### FR-5 — Authentication boundary

Profile retrieval and creation require authenticated identity. The user associated with the
authentication cookie is always the profile owner; clients cannot provide or select a user ID.

### FR-6 — Frontend form behaviour

The onboarding form must:

* Present understandable labels and options rather than internal enum values.
* Identify height as centimetres, weight as kilograms, and body fat as a percentage.
* Mark optional fields clearly.
* Show actionable validation and request errors.
* Prevent repeated submission while a request is pending.
* Preserve entered values after a failed submission.
* Allow the user to log out.

### FR-7 — Architectural boundaries

HTTP endpoints must remain thin. Profile creation and lookup belong in an application service or
equivalent non-HTTP boundary. React components must use the frontend API layer rather than calling
backend URLs directly.

## Domain / Data Requirements

F03 introduces `FitnessProfile` with:

* Application-generated primary key.
* Owning user reference, unique and required.
* Date of birth.
* Biological sex.
* Height in centimetres.
* Current body weight in kilograms.
* Optional body-fat percentage.
* Training experience.
* Primary fitness goal.
* Available training days per week.
* Preferred workout duration in minutes.
* Training environment.
* Optional physical-limitations text.
* Creation timestamp.
* Last-updated timestamp, established now for future F04 changes.

The owning user relationship must be protected by both a foreign key and a uniqueness constraint.
Deleting a user must not leave an orphaned fitness profile.

Height, weight, body-fat percentage, and duration must retain the submitted precision required by
their validation rules. Numeric fitness facts must not be stored as formatted strings.

The supported structured values are:

### Biological sex

* `male`
* `female`

### Training experience

* `beginner`
* `intermediate`
* `advanced`

### Primary fitness goal

* `build_muscle`
* `lose_fat`
* `increase_strength`
* `general_fitness`

### Training environment

* `full_gym`
* `home_gym`
* `minimal_equipment`
* `bodyweight_only`

These values are user-provided profile facts. F03 does not infer a user's experience, goals,
equipment, health status, or suitability for any exercise.

## API Requirements

### `GET /api/fitness-profile`

Requires authentication.

Responses:

* `200` with the current user's fitness profile when it exists.
* `404 {"detail":"Fitness profile not found"}` when the authenticated user has no profile.
* `401` when unauthenticated.

### `POST /api/fitness-profile`

Requires authentication.

Accepts:

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

* `201` with the created profile.
* `409 {"detail":"Fitness profile already exists"}` when the user already has a profile.
* `422` when input validation fails.
* `401` when unauthenticated.

The profile response includes all persisted profile fields, including profile ID and timestamps,
but does not expose a client-selectable owner ID. Dates and timestamps use ISO 8601 JSON values.

The existing authentication endpoints and public health endpoint retain their current behaviour.

## UI Requirements

The frontend application state must distinguish:

* Initial application loading.
* Backend unavailable.
* Registration.
* Login.
* Authenticated profile check.
* Fitness-profile onboarding.
* Profile submission pending.
* Authenticated profile-complete state.

The form must use appropriate native input types and controls where practical:

* Date input for date of birth.
* Numeric inputs with visible units for height, weight, body fat, training days, and duration.
* Single-choice controls for biological sex, experience, goal, and training environment.
* Multiline text input for physical limitations.

Backend validation remains authoritative even when equivalent browser-side validation is present.

If the initial profile check fails because of a network, protocol, or unexpected server error, the
frontend must show the existing backend-unavailable experience and allow retry. A profile `404` is
an expected onboarding state, not an unavailable-backend error.

If profile submission fails, the error must be shown within the onboarding form without discarding
the user's input. If a `409` occurs because the profile was created concurrently or by a repeated
request, the frontend must re-check the profile and proceed to the completed state when it exists.

Every state must be usable at common mobile viewport widths without horizontal overflow.

## Business Rules

* A user has either zero or one fitness profile.
* Profile creation is available only to the authenticated owner.
* Date of birth is stored instead of a mutable age value. F03 does not persist a calculated age.
* All persisted measurements use metric units: centimetres, kilograms, and percentages.
* Biological sex represents the physiological input intended for potential future calculations; it
  is not a gender-identity field.
* Only one primary goal is selected in F03.
* Training environment is a broad availability category, not an exercise-equipment inventory.
* Physical limitations are recorded as user-provided text and are not interpreted as a diagnosis or
  as permission to prescribe training.
* Completing the profile does not generate a routine, nutrition target, recommendation, signal, or
  AI interpretation.
* Existing profiles cannot be changed or replaced through the F03 API.

## Validation

* `date_of_birth` must be a real calendar date earlier than the current date and must not imply an
  age greater than 120 years.
* `biological_sex` must be one of the documented values.
* `height_cm` must be between 50 and 250 inclusive and may contain one decimal place.
* `weight_kg` must be between 20 and 500 inclusive and may contain one decimal place.
* `body_fat_percentage`, when provided, must be between 2 and 75 inclusive and may contain one
  decimal place.
* `training_experience` must be one of the documented values.
* `primary_goal` must be one of the documented values.
* `training_days_per_week` must be an integer between 1 and 7 inclusive.
* `preferred_workout_duration_minutes` must be an integer between 15 and 300 inclusive.
* `training_environment` must be one of the documented values.
* `physical_limitations` is optional, is trimmed when provided, and must not exceed 1,000
  characters. An empty or whitespace-only value is stored as absent.
* JSON numeric booleans must not be accepted as numeric profile values.
* Unknown request fields must be rejected rather than silently ignored.

Validation rules must be enforced by the backend and represented consistently in frontend controls.

## Acceptance Criteria

* [x] An authenticated user without a profile is shown fitness-profile onboarding.
* [x] Registration still authenticates immediately and proceeds into profile onboarding.
* [x] The user can submit every required profile field and omit the optional fields.
* [x] A valid profile is persisted with metric numeric values and belongs to the authenticated user.
* [x] Reloading or logging in after profile creation skips onboarding.
* [x] Profile retrieval and creation return `401` when unauthenticated.
* [x] A missing profile returns the documented `404` without being treated as a backend failure.
* [x] A second creation request returns `409` and leaves the original profile unchanged.
* [x] Invalid dates, measurements, enum values, availability, duration, and limitation text are
  rejected without partial persistence.
* [x] The frontend shows useful validation and request errors while preserving entered values.
* [x] The user can log out before or after completing onboarding.
* [x] Existing health, registration, login, identity restoration, logout, CORS, and unavailable
  backend behaviour continue to work.
* [x] All UI states work at a mobile viewport without horizontal overflow.
* [x] The database migration applies cleanly to a new database and one upgraded from F02.
* [x] Backend formatting, linting, type checking, and tests pass.
* [x] Frontend formatting, linting, and type checking pass.

## Tests

Keep the automated coverage deliberately small and focused on ordinary backend unit/API behaviour,
consistently with DEC-008. F03 is not an exhaustive validation-testing exercise.

Add only the following small set of tests, combining related assertions where practical:

* One normal authenticated creation-and-retrieval test.
* One unauthenticated-access test covering retrieval and creation together.
* One missing-profile retrieval test.
* One duplicate-creation test confirming that the original profile is unchanged.
* One representative invalid-payload test confirming rejection without persistence.

Tests must use isolated persistence and must not depend on execution order or the developer's local
database.

Do not create a separate test for every field, boundary value, enum member, optional-field variant,
HTTP status, timestamp, serialization detail, database constraint, or UI state. Do not add broad
parameterized test matrices merely to exercise all validation combinations. Validation rules still
need to be implemented, but one representative invalid request is sufficient for F03 automation.

No frontend unit, component, integration, browser, Playwright, or end-to-end tests are required for
F03. Existing tests must continue to pass, and frontend quality checks must still validate
TypeScript, lint, and formatting.

## Out of Scope

* Viewing a detailed saved profile after onboarding.
* Editing, replacing, or deleting a fitness profile; these belong to F04.
* Unit-system preferences or imperial-unit input and display.
* Gender identity or additional demographic fields.
* Exact equipment inventories, exercise preferences, disliked exercises, or schedule-day selection.
* Multiple goals, goal priority, target weight, or goal deadlines.
* Historical body-weight, measurement, or body-fat tracking.
* Medical screening, diagnoses, injury workflows, or clinical advice.
* Calculated age persistence, BMI, basal metabolic rate, calorie targets, macronutrient targets, or
  training-volume calculations.
* Exercise catalogs, routines, workout generation, or training schedules.
* Deterministic signals, adaptations, AI interpretation, or recommendations.
* Final application navigation, dashboard design, and full design-system work.
* End-to-end or Playwright coverage.

## Dependencies

* F01 — Project Infrastructure.
* F02 — User Authentication.

## Notes

Use a database migration for the profile table and keep enum serialization explicit and stable.
Database constraints should protect the one-profile-per-user invariant in addition to application
checks.

Use decimal-capable database columns for measurements rather than binary floating-point columns
where practical. Convert values intentionally at the API boundary so response serialization remains
predictable.

Do not add generic profile frameworks or abstractions for hypothetical future profile types. A
focused fitness-profile service and model are sufficient for F03.
