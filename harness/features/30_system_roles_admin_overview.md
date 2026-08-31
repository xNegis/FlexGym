# F30 — System Roles and Admin Overview

## Objective

Introduce the first explicit system-authorization boundary through two persisted roles, `user` and
`admin`, and provide administrators with a protected, read-only Administration area containing the
total number of registered accounts.

F30 establishes a small end-to-end administrative capability without creating a generic permission
system, subscription tiers, account-management actions, or access to another user's private fitness
data.

## Context

F02 introduced multiple accounts, unique normalized email addresses, and a seven-day JWT that
identifies the current user through an HTTP-only cookie. Every later domain feature scopes private
data to that authenticated user. The current `User` record has no authorization role, and the public
user projection contains only ID and email.

F12 introduced the authenticated application shell, URL-backed navigation, authentication/profile
guards, shared UI primitives, and the permanent mobile-first design contract in
`harness/context/07_UI_DESIGN_SYSTEM.md`. Profile already owns account-level actions and is the
appropriate entry point for a secondary Administration area; the five-item primary navigation must
not grow merely to expose this role-specific destination.

The product may later introduce subscriptions or entitlements. Commercial access and
administrative authority are separate concepts: F30 adds only system role. It must not introduce a
subscription column, tier naming, feature gating, or a generic role-permission schema in
anticipation of unapproved future plans.

## User Experience

### Regular user

A normal user continues to see the existing application exactly as before. Profile contains no
Administration section or link. Opening `/admin` directly returns the user to Profile without
briefly exposing administrative content.

An authenticated normal user who calls an administrative API receives `403`. Unauthenticated
requests receive `401`.

### Administrator

An administrator retains the complete normal user experience and additionally sees an
`Administration` section in Profile. A secondary `Open administration` action navigates to
`/admin`.

The Administration screen is read-only. Its first version shows one factual summary:

* `Registered users` — the total number of persisted user accounts, including administrators.

There is no dominant mutation action. A visible Back action returns to Profile, normal Browser Back
returns to the previous destination, and refresh restores `/admin` after authentication and role
checks.

### Administrative provisioning

Registration never asks for or accepts a role and always creates a normal user. The initial
administrator is granted through a documented, repository-owned backend command that targets one
existing account by exact normalized email. Running the command again for an account that is already
an administrator succeeds without changing unrelated data.

There is no user-facing role-management flow in F30.

## Functional Requirements

### FR-1 — Closed role model

Every user has exactly one persisted system role:

* `user`
* `admin`

No other role value is valid. The model is deliberately closed rather than accepting arbitrary
strings supplied by callers.

### FR-2 — Existing and newly registered users

The migration assigns `user` to every existing account. Every subsequent public registration
explicitly creates a `user`, including when a caller attempts to submit an uncontracted role field.

Registration and login responses include the server-owned role in the public user projection. The
role is not accepted in either request payload.

### FR-3 — Administrator inherits normal-user capability

An administrator is still an ordinary application user for existing fitness flows. Existing
owner-scoped endpoints continue using the administrator's own user ID and do not treat the role as
authority to read or mutate another user's profile, routines, workouts, measurements, photographs,
preferences, or progress.

### FR-4 — Server-authoritative authorization

Administrative endpoints use one focused backend authorization dependency or equivalent shared
boundary that:

1. Resolves the current user through the existing authentication mechanism.
2. Returns `401` when no valid authenticated identity exists.
3. Returns `403` when the current persisted role is not `admin`.
4. Returns the current administrator to downstream application logic only after both checks pass.

Role authorization is enforced on every administrative API request. Frontend visibility and route
guards are usability controls only and never substitute for backend enforcement.

The role is loaded from the current database user record rather than trusted from client state or a
new JWT claim. An operational role promotion therefore takes effect on the next authorized request
without requiring a newly encoded role in the token.

### FR-5 — Protected administrative route

Add canonical route `/admin`.

* An unauthenticated visitor is redirected through the existing login flow.
* An authenticated profiled `user` is redirected to `/profile` with replace navigation.
* An authenticated profiled `admin` may open the route.
* The route must not render the summary until authenticated identity and role are known.

F30 retains the existing requirement that the authenticated application shell is entered after
fitness-profile onboarding. It does not redesign the onboarding/profile guard for profile-less
administrator accounts.

Profile remains the contextual primary destination while `/admin` is open. Administration does not
become a sixth bottom-navigation item.

### FR-6 — Profile entry point

Profile renders an `Administration` section only when the validated authenticated user has role
`admin`. The section is separate from fitness facts, workout settings, account mutations, and the
danger area. It contains concise explanatory copy and the `Open administration` secondary action.

The section is absent, rather than disabled, for normal users.

### FR-7 — Registered-user count

The Administration overview reports the total number of rows in `users`, including the requesting
administrator and any other administrator accounts.

The count is a non-negative integer calculated at read time. It is not cached or persisted as a new
aggregate. It does not break down users by role, profile completion, activity, subscription, or any
other dimension.

### FR-8 — Read-only boundary

F30 introduces no administrative mutation endpoint. The screen cannot change a role, create,
disable, suspend, delete, impersonate, or otherwise modify an account.

### FR-9 — Operational administrator promotion

Provide a repository-owned backend CLI operation for promoting one existing user to `admin` by
exact email. The operation must:

* Use the normal configured database connection.
* Normalize the supplied email with the same rule as authentication.
* Require an exact existing account.
* Commit one atomic role update.
* Succeed idempotently when the account is already `admin`.
* Exit non-zero with a concise message when the account does not exist or configuration/database
  access fails.
* Never accept a password, create an account, mint a token, select the first user implicitly, or
  alter another user.

Document local and deployed Compose invocation without including a real account email. F30 does not
add a corresponding HTTP endpoint or frontend control and does not support demotion.

### FR-10 — Existing behaviour preservation

Authentication, registration, login, logout, profile onboarding and management, normal navigation,
and every owner-scoped application flow retain their existing behaviour apart from the added public
role field and administrator-only entry point.

## Domain / Data Requirements

Add a required `role` field to `User`.

* Persisted values are exactly `user` and `admin`.
* Existing records become `user` during migration.
* New records default safely to `user` at both the application and database boundary.
* The database enforces the supported value set through an appropriate constraint.
* The field is not nullable.

A focused Python enum or equivalent closed application type should represent the supported values.
Do not introduce `Role`, `Permission`, `UserRole`, `Subscription`, `Plan`, or `Entitlement` tables.

Role is current authorization state, not an append-only fact or audit history. F30 does not retain
role-change history because its only supported mutation is the deliberate operational promotion.

## API Requirements

### Existing authentication responses

`POST /api/auth/register`, `POST /api/auth/login`, and `GET /api/auth/me` extend their successful
public user response to:

```json
{
  "id": 1,
  "email": "user@example.com",
  "role": "user"
}
```

For an administrator, `role` is `admin`.

The frontend validates the complete response as untrusted runtime input. A missing, unknown, or
non-string role makes the success response invalid and follows the existing safe authentication
failure/unavailable boundary; it must not default to `admin` or infer authorization from email or
ID.

Authentication request contracts and existing non-success responses remain unchanged. `role` is not
part of a public authentication request and can never influence the persisted or returned role. F30
does not otherwise redefine the existing handling of unrelated extra authentication fields.

### `GET /api/admin/overview`

Requires an authenticated administrator.

Returns `200`:

```json
{
  "registered_user_count": 12
}
```

Responses:

* `200` with a validated non-negative integer count for an administrator.
* `401` when unauthenticated.
* `403 {"detail":"Administrator access required"}` for an authenticated normal user.

The response contains no email addresses, IDs, password hashes, profile facts, activity data,
storage details, configuration, secrets, or infrastructure diagnostics.

Unexpected failures use the existing safe server boundary and expose no database detail. The
frontend normalizes expected and malformed error bodies before rendering a stable message.

## UI Requirements

F30 follows `harness/context/07_UI_DESIGN_SYSTEM.md` completely and introduces no parallel visual
language.

Reuse `AppShell`, `AppHeader`, `Page`, `Section`, `Card` or `KeyValueList`, `Button`, `Alert`, and
`LoadingState`. No new reusable primitive is required.

### Profile Administration section

The section hierarchy is:

1. `Administration` section title.
2. One concise sentence explaining that system administration is available for this account.
3. `Open administration` as a secondary action.

The existing `Edit profile` action remains the dominant Profile action. Administration must not
compete with it or move account deletion out of its established danger boundary.

### Administration overview

The screen hierarchy is:

1. Contextual header with Back and title `Administration`.
2. Concise description that this area contains system-level information.
3. Read-only summary card labelled `Registered users` with the validated count.

There is no primary mutation action. The count remains understandable without iconography or color.

Applicable states:

* Role/bootstrap loading does not flash the Profile Administration section or protected screen.
* Overview loading preserves the expected summary shape and does not display zero as a placeholder.
* Success shows the validated count.
* Initial request failure shows a contained `Unable to load administration overview.` alert and a
  `Retry` action.
* A `401` ends local authenticated state and follows the existing login recovery flow.
* A `403`, including one caused by stale frontend role state, removes administrative content and
  returns to Profile without exposing prior overview values.
* A malformed success response is treated as a recoverable overview failure and never renders raw
  content.

Browser Back returns to Profile when entered from Profile. The visible Back action navigates to
`/profile`. Refresh and direct navigation restore `/admin` for a valid administrator. No dialog,
confirmation, success toast, empty state, or destructive state is introduced.

Validate Profile and `/admin` at 360 px, 390 px, 430 px, a representative tablet/small desktop, and
a wide desktop width. Verify visible keyboard focus, 44 px touch targets, logical headings,
screen-reader labels, Browser Back, direct refresh, 200% zoom, safe areas, long localized counts,
and absence of document-level horizontal overflow.

## Business Rules

* Every user has exactly one role: `user` or `admin`.
* Registration always creates `user` and never accepts client-selected authority.
* Existing users are not promoted implicitly by migration order, ID, email convention, or being the
  first registered account.
* Administrative authority and future commercial entitlement are independent concepts.
* `admin` includes ordinary application use but does not bypass user ownership.
* Only the backend decides whether an administrative request is authorized.
* The initial promotion mechanism is operational, exact, deliberate, and idempotent.
* The registered-user count includes all accounts and is calculated from current persisted state.
* Administration is read-only in F30.

## Validation

Role input accepts only the exact internal values `user` and `admin` at trusted application
boundaries. Public registration accepts no role field. The overview count must be a non-negative
integer; booleans and non-finite or fractional values are invalid at the frontend parser.

F30 adds a database migration. Before completion, validation must include:

* Applying the complete Alembic history to a new isolated database and verifying the required role
  column, default, non-nullability, and supported-value constraint.
* Creating or migrating an isolated database to the previously committed head, inserting
  representative existing users, applying F30, and verifying every existing user becomes `user`.
* Proving registration after migration creates `user` and unsupported database role values are
  rejected.
* Exercising the promotion command twice against an isolated migrated database and verifying the
  exact target becomes `admin` without duplicate or unrelated changes.
* Exercising `GET /api/auth/me` and `GET /api/admin/overview` through a real authenticated API flow
  against the migrated database as both a normal user and the promoted administrator.
* Comparing `alembic current` and `alembic heads` for the actual configured local development
  database. If it is behind, apply the migration safely or report the exact pending command and do
  not claim local operation.
* Re-running the supported migration command and confirming it is safe and does not alter roles or
  create reference data.

Tests that create tables from ORM metadata do not satisfy these migration gates.

## Acceptance Criteria

* [ ] Fresh and upgraded databases require exactly one supported role for every user.
* [ ] Every pre-F30 account becomes `user`; no account becomes administrator implicitly.
* [ ] New registration returns and persists role `user` and cannot select another role.
* [ ] Login and `/api/auth/me` return the current persisted role through the public user projection.
* [ ] The documented promotion command promotes one exact existing account atomically and is
  idempotent.
* [ ] Missing-account and configuration failures make promotion fail clearly without partial data
  changes.
* [ ] A normal user sees no Profile Administration entry and cannot render administrative content
  through direct navigation.
* [ ] An administrator retains normal application access and sees the Administration entry.
* [ ] `/admin` restores on refresh for an administrator and Back returns predictably to Profile.
* [ ] The Administration overview shows the total number of accounts, including administrators.
* [ ] The overview returns `401` when unauthenticated and `403` for an authenticated normal user.
* [ ] Frontend role and overview parsers reject malformed or unknown values without rendering raw
  response content or granting access.
* [ ] A representative administrator request for another user's normal private resource remains
  ownership-scoped and does not gain access because of role.
* [ ] Profile and Administration loading, success, error, retry, stale-role, Back, refresh, focus,
  zoom, safe-area, and responsive states meet the shared UI contract.
* [ ] The configured local database is at repository head and a real migrated API flow passes.
* [ ] Backend tests and backend/frontend format, lint, type, and build checks pass.

## Tests

Backend tests cover:

* Registration, login, and identity responses for `user` and promoted `admin` roles.
* An attempted client-supplied role cannot change the normal persisted registration role, and
  unsupported trusted/database role values are rejected.
* `401`, `403`, and successful administrator overview access.
* A count containing both normal and administrator accounts.
* Promotion success, repeated idempotent promotion, missing email, and isolation from other users.
* One representative owner-scoped resource proving admin does not bypass ownership.

Migration validation uses Alembic as described above, not ORM table creation.

Frontend format, lint, type checking, and production build cover the extended strict authentication
parser, role-aware Profile composition, protected route, and overview parser. Code inspection or a
focused existing unit runner verifies that an unknown role never receives administrator treatment
and a malformed count cannot replace confirmed content.

Per DEC-019, do not add automated browser coverage. Focused manual UI validation covers role
bootstrap loading, normal-user direct navigation, admin Profile entry, overview loading/success/
failure/retry, `401`, stale-role `403`, malformed response, Back/refresh, keyboard focus, touch,
safe areas, 200% zoom, and overflow at every required width.

## Out of Scope

* Subscription plans, tiers, billing status, entitlements, purchases, trials, or feature gates.
* Generic RBAC tables, arbitrary roles, per-permission configuration, or organization/team roles.
* Frontend or HTTP role promotion, demotion, assignment, invitation, or approval flows.
* User directory, search, filters, pagination, account detail, or role breakdown; F31 owns the first
  directory.
* Account suspension, deletion, impersonation, password reset, email verification, session
  revocation, or security hardening.
* Access to another user's profile, routines, workouts, measurements, photos, progress, or other
  private data.
* Usage, engagement, workout, subscription, revenue, storage, or product analytics.
* Internal service health, uptime monitoring, logs, alerts, infrastructure configuration, or S3
  diagnostics.
* Role history or a general security audit log.
* A sixth primary-navigation item or a separate permanent admin design system.

## Dependencies

* F02 — User Authentication.
* F03 — User Fitness Profile.
* F04 — Profile Management.
* F12 — Mobile-first UI System and Phase 1 UX Refresh.

## Notes

Prefer one explicit `require_admin`-style backend boundary over repeated endpoint conditionals. Keep
the count query and role-promotion operation in application/service code rather than HTTP functions.

Do not encode the role into the existing JWT as client-carried authorization state. The current
authentication dependency already loads the user for every request, so consulting its persisted
role keeps promotion effects immediate and avoids stale privileges inside a seven-day token.
