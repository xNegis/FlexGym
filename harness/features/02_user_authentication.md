# F02 — User Authentication

## Objective

Allow the owner of FlexGym to register, log in, remain authenticated, inspect their identity,
and log out. This establishes user ownership for future features without introducing fitness
profile data or production-grade authentication infrastructure.

## Context

F01 established the React frontend, FastAPI backend, REST API, and SQLite persistence.

FlexGym is currently personal-first. F02 allows creation of one account but models `User`
normally so multi-user support can be added later. Authentication uses a single signed JWT in an
HTTP-only cookie; there are no persisted sessions, refresh tokens, or revocation mechanisms.

## User Experience

On a new installation, the visitor sees registration. Submitting a valid email and password
creates the account and authenticates it immediately.

Once the account exists, unauthenticated visitors see login. Incorrect credentials produce a
generic error that does not reveal whether the email exists.

An authenticated user sees a minimal FlexGym shell containing their email and a logout action.
Logout returns them to login. Fitness-profile fields and a dashboard belong to later features.

## Functional Requirements

### FR-1 — Registration

The first visitor can create an account with an email and password. Registration is unavailable
after an account exists. The backend exposes registration availability so the frontend can show
the correct screen.

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

* `GET /api/auth/registration-status`
  * `200 {"registration_available": true|false}`.
* `POST /api/auth/register`
  * Accepts `{"email": string, "password": string}`.
  * Returns `201` with the public user and authentication cookie.
  * Returns `403` when registration is no longer available and `422` for invalid input.
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
* Forms show actionable validation and request errors and prevent repeated submission while
  pending.
* Password confirmation is validated by the frontend; the API does not receive it.
* Fields support password-manager autofill and paste through appropriate `autocomplete` values.
* Reloading the page restores authenticated state through `/api/auth/me`.
* The authenticated shell displays the normalized email and logout action only.
* Every state works at common mobile widths without horizontal overflow.

## Business Rules

* Only the first account can be registered in F02.
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

* [ ] A new installation reports registration as available and can create its first account.
* [ ] Further registration is unavailable after that account exists.
* [ ] Registration persists normalized email and an Argon2id hash, never the plaintext password.
* [ ] Registration authenticates immediately and displays the authenticated shell.
* [ ] The user can log in irrespective of email casing.
* [ ] Unknown-email and incorrect-password attempts return the same public error.
* [ ] Email and password validation follows the documented rules.
* [ ] A valid cookie lets `/api/auth/me` return the public user.
* [ ] Missing, invalid, expired, and unknown-user JWTs receive `401` without internal details.
* [ ] Reloading while authenticated restores authenticated state.
* [ ] Logout removes the cookie, returns to login, and also succeeds without a valid cookie.
* [ ] The backend-unavailable and retry experience from F01 still works.
* [ ] All UI states work at a mobile viewport without horizontal overflow.
* [ ] Existing health, CORS, quality, and automated validations continue to pass.

## Tests

Keep a small backend test suite covering only the essential behaviour:

* Argon2id hash and verification.
* JWT creation, validation, and rejection of an invalid token.
* First-account registration and closure of further registration.
* Successful login and the shared generic credentials error.
* Authenticated identity and unauthenticated access.
* Idempotent logout.

Prefer one coherent test per behaviour over separate tests for every field, token variant, or
cookie attribute. Tests use isolated persistence and do not depend on execution order.

## Out of Scope

* Fitness profile, dashboard, and final navigation or visual design.
* Additional users, invitations, administration, roles, and permissions.
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
