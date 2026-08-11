# F02 — User Authentication

## Objective

Allow FlexGym users to register, log in, remain authenticated, inspect their identity, and log out.
This establishes user ownership for future features without introducing fitness profile data or
production-grade authentication infrastructure.

## Context

F01 established the React frontend, FastAPI backend, REST API, and SQLite persistence.

FlexGym is currently personal-first but permits multiple independent user accounts so a hosted
installation is not restricted to a single person. Authentication uses a single signed JWT in an
HTTP-only cookie; there are no persisted sessions, refresh tokens, or revocation mechanisms.

## User Experience

An unauthenticated visitor sees login and can follow a visible registration link. Submitting a valid
email and password creates an account and authenticates it immediately.

The registration screen links back to login. Incorrect login credentials produce a generic error
that does not reveal whether the email exists.

An authenticated user sees a minimal FlexGym shell containing their email and a logout action.
Logout returns them to login. Fitness-profile fields and a dashboard belong to later features.

## Functional Requirements

### FR-1 — Registration

Any unauthenticated visitor can create an account with an email and password that is not already
registered. Multiple accounts may coexist, but normalized email addresses remain unique.

### FR-2 — Login

The registered user can log in with their email and password. Successful registration and login
create the authentication JWT and set its cookie.

Unknown-email and incorrect-password attempts return the same public status and message.

### FR-3 — Authenticated identity

A valid authentication cookie identifies the current user. Missing, invalid, expired, or
incorrectly signed JWTs are treated as unauthenticated without exposing decoding details.

### FR-4 — Logout

Logout removes the authentication cookie and is idempotent.

Logout does not revoke a JWT copied outside the browser. It remains valid until expiry; this is
an accepted proof-of-concept limitation.

### FR-5 — Frontend states

The responsive frontend provides loading, registration, login, authenticated, and
backend-unavailable states. It preserves the health retry behaviour introduced by F01.

### FR-6 — Boundaries

HTTP endpoints remain thin. User operations, password hashing, and JWT handling live outside
route functions. React components access authentication through the frontend API layer.

## Domain / Data Requirements

F02 introduces `User` with:

* Application-generated primary key.
* Normalized unique email.
* Argon2id password hash, including salt and algorithm parameters.
* Creation timestamp.

Plaintext passwords are never persisted. No `Session` entity or table is introduced.

## API Requirements

* `POST /api/auth/register`
  * Accepts `{"email": string, "password": string}`.
  * Returns `201` with the public user and authentication cookie.
  * Returns `409 {"detail":"Email is already registered"}` when the normalized email already
    exists and `422` for invalid input.
* `POST /api/auth/login`
  * Accepts `{"email": string, "password": string}`.
  * Returns `200` with the public user and authentication cookie.
  * Returns `401` with the generic credentials error or `422` for invalid input.
* `GET /api/auth/me`
  * Returns `200` with the current public user or `401` when unauthenticated.
* `POST /api/auth/logout`
  * Always returns `204` and removes the authentication cookie.

The public user representation is:

```json
{
  "id": 1,
  "email": "user@example.com"
}
```

Password hashes never appear in API responses.

## UI Requirements

* Registration requests email, password, and password confirmation.
* Login requests email and password.
* Login includes a “No account yet? Register” action and registration includes an “Already have an
  account? Log in” action.
* Forms show actionable validation and request errors and prevent repeated submission while
  pending.
* Password confirmation is validated by the frontend; the API does not receive it.
* Fields support password-manager autofill and paste through appropriate `autocomplete` values.
* Reloading the page restores authenticated state through `/api/auth/me`.
* The authenticated shell displays the normalized email and logout action only.
* Every state works at common mobile widths without horizontal overflow.

## Business Rules

* Multiple accounts can be registered, and each normalized email is unique.
* Registration and login authenticate immediately.
* The JWT uses `HS256`, expires after seven days, and contains only `sub`, `iat`, and `exp`.
* `sub` identifies the user; the backend still loads that user from the database.
* The JWT is transported in a cookie and is not read or decoded by frontend JavaScript.
* A token referencing a missing user is treated as unauthenticated.
* F02 protects only `/api/auth/me`; health, registration status, registration, and login remain
  public.

## Validation

* Email is trimmed, syntax-validated, lowercased, stored in normalized form, and compared
  case-insensitively.
* Password length is 15–128 Unicode characters, including spaces, with no character-composition
  rules. Password whitespace is not trimmed.
* The signing secret comes from runtime configuration and is not committed. Development may use
  a documented local-only default; other environments reject that default.
* The cookie uses `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` outside local HTTP
  development.
* Frontend authentication requests include browser credentials.

## Acceptance Criteria

* [x] An unauthenticated visitor can navigate between login and registration.
* [x] Multiple accounts with distinct normalized emails can be registered.
* [x] Registration rejects an email that is already registered without changing the existing user.
* [x] Registration persists normalized email and an Argon2id hash, never the plaintext password.
* [x] Registration authenticates immediately and displays the authenticated shell.
* [x] The user can log in irrespective of email casing.
* [x] Unknown-email and incorrect-password attempts return the same public error.
* [x] Email and password validation follows the documented rules.
* [x] A valid cookie lets `/api/auth/me` return the public user.
* [x] Missing, invalid, expired, and unknown-user JWTs receive `401` without internal details.
* [x] Reloading while authenticated restores authenticated state.
* [x] Logout removes the cookie, returns to login, and also succeeds without a valid cookie.
* [x] The backend-unavailable and retry experience from F01 still works.
* [x] All UI states work at a mobile viewport without horizontal overflow.
* [x] Existing health, CORS, quality, and automated validations continue to pass.

## Tests

Keep a small backend test suite covering only the essential behaviour:

* Argon2id hash and verification.
* JWT creation, validation, and rejection of an invalid token.
* Multiple-account registration and duplicate normalized-email rejection.
* Successful login and the shared generic credentials error.
* Authenticated identity and unauthenticated access.
* Idempotent logout.

Prefer one coherent test per behaviour over separate tests for every field, token variant, or
cookie attribute. Tests use isolated persistence and do not depend on execution order.

## Out of Scope

* Fitness profile, dashboard, and final navigation or visual design.
* Invitations, administration, roles, and permissions.
* Email verification or delivery; forgotten-password and password-change flows.
* OAuth, social login, passkeys, and multi-factor authentication.
* Refresh tokens, rotation, persisted sessions, revocation, and device/session management.
* Rate limiting, lockout, bot protection, security auditing, additional CSRF mechanisms, and
  comprehensive production hardening.
* End-to-end and browser automation tests; these are deferred until the product flows are more
  stable.

## Dependencies

* F01 — Project Infrastructure.

## Notes

Use maintained JWT and Argon2id libraries. Keep both behind focused backend components so the
implementation can evolve without changing endpoints or domain entities.
