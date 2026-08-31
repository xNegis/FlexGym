# F31 — Admin User Directory

## Objective

Extend F30's protected Administration screen with a read-only, cursor-paginated directory of every
registered account, showing only email, system role, and registration date.

F31 makes the first administrative area useful for understanding who has registered while retaining
a strict boundary against account actions, private fitness data, subscriptions, and invented
activity metrics.

## Context

F30 introduces the closed `user` / `admin` role model, a backend administrator-authorization
boundary, Profile entry point, `/admin` route, and total registered-user count. It deliberately
defers the directory so role/access foundations and the first administrative projection remain one
coherent increment.

The existing application uses opaque cursor pagination and incremental `Load more` interaction for
large historical collections. F31 applies the same established transport and UI principles to a
global administrative list without exposing cursor internals or adding page-number navigation.

The directory contains account identity metadata, not fitness facts. Administrator status does not
authorize opening another user's application data.

## User Experience

An administrator opens the existing `/admin` route. The F30 `Registered users` summary remains at
the top. Beneath it, a `User directory` section shows accounts newest first.

Each non-interactive row shows:

1. Normalized email address.
2. Friendly role label: `User` or `Administrator`.
3. Registration date and time formatted in the browser's locale.

Administrators appear in the same list as normal users, including the currently authenticated
administrator. There is no separate filter or special pinned row.

The first 20 users load initially. When another page exists, `Load more` appends it while retaining
the confirmed rows. Rows cannot be opened and contain no edit, role, disable, delete, impersonate,
or overflow actions.

## Functional Requirements

### FR-1 — Administrator-only directory

Only an authenticated user whose current persisted role is `admin` can request any directory page.
The endpoint reuses F30's shared backend administrator boundary.

Unauthenticated requests receive `401`. Authenticated normal users receive `403` and cannot infer
the number, identity, order, role, registration time, or cursor position of any account.

### FR-2 — Complete account scope

The directory contains every current `User` row, including normal users, all administrators, and the
requesting administrator. It is not scoped to profile completion, workout activity, deployment,
subscription, or any other domain state.

### FR-3 — Stable newest-first order

Order users by `created_at` descending and then user ID descending as a deterministic tie-breaker.

Pagination uses the final row's ordering key. Accounts registered after the first page was returned
must not cause already returned users to repeat on a later correctly followed page. Every user
appears at most once in one cursor sequence.

### FR-4 — Bounded cursor pagination

The client may request `limit` from 1 through 50. The default and frontend page size is 20.
Booleans, fractional values, repeated values, values outside the range, unknown query parameters,
empty cursors, malformed cursors, and unusable well-formed cursors are rejected with `422`.

`next_cursor` is a non-empty opaque token only when another row exists; otherwise it is `null`.
The cursor is URL-safe, versionable, bounded in length, strictly validated, and does not expose an
email address or treat encoded role/user information as authorization.

### FR-5 — Minimal directory projection

Each item contains only:

* `email`
* `role`
* `created_at`

User IDs, password hashes, storage namespaces, profile existence, latest login, fitness data,
workout data, photo data, and aggregate activity are absent.

The projection is calculated directly from current user records and is not persisted separately.

### FR-6 — Independent summary and directory states

F30's registered-user count and F31's directory are separate request boundaries. A directory
failure leaves a previously validated overview count visible. An overview failure does not permit
the directory to infer or manufacture a count.

The count and list are point-in-time reads. A concurrent registration may make the overview count
differ temporarily from the number discoverable through a previously started cursor sequence; this
is not treated as corruption and does not require a cross-request snapshot transaction.

### FR-7 — Incremental loading

The initial request replaces no content until the complete page has been validated. `Load more`
retains all confirmed items while pending, prevents duplicate requests, and appends a page only
after validating the complete response.

A failed or malformed next page preserves confirmed users and the prior cursor so the administrator
can retry. The client must not infer completion from item count when `next_cursor` is present or
absent.

### FR-8 — Read-only rows

Directory rows are semantic display rows, not links or buttons. Emails are text, not `mailto` links.
F31 introduces no mutation, detail endpoint, or navigation target for an account.

### FR-9 — Existing behaviour preservation

F30 role resolution, promotion, overview count, Profile entry, normal-user denial, and ownership
boundaries remain unchanged. Existing authentication and fitness flows receive no directory-related
query or UI.

## Domain / Data Requirements

F31 introduces no entity, persisted field, aggregate, index requirement, or database migration.

Use existing `User.email`, `User.role`, `User.created_at`, and internal ID for deterministic query
ordering. The internal ID may be encoded as part of an opaque ordering cursor but is not returned as
directory content and is never client authority.

Directory query/projection logic belongs in a focused administration application/service boundary,
not directly in the HTTP endpoint. The query retrieves only the bounded fields required for one
page and must not load relationships or private domain records.

## API Requirements

### `GET /api/admin/users`

Requires an authenticated administrator.

Query parameters:

* `cursor`: optional opaque non-empty cursor previously issued by this endpoint.
* `limit`: optional strict integer from 1 through 50; defaults to 20.

Each supported parameter may occur at most once. Unknown parameters are rejected.

Returns `200`:

```json
{
  "items": [
    {
      "email": "recent@example.com",
      "role": "user",
      "created_at": "2026-08-31T14:25:40Z"
    },
    {
      "email": "owner@example.com",
      "role": "admin",
      "created_at": "2026-08-10T08:00:00Z"
    }
  ],
  "next_cursor": "opaque-token-or-null"
}
```

Responses:

* `200` with `items: []` and `next_cursor: null` when no row exists for a valid request.
* `401` when unauthenticated.
* `403 {"detail":"Administrator access required"}` for an authenticated normal user.
* `422` with framework-compatible validation detail for invalid, repeated, unknown, malformed, or
  unusable pagination parameters.

Malformed cursors never fall back to the first page. Errors expose no decoded cursor, query,
database, password, or internal user detail.

The frontend parses the entire response from `unknown`. It validates exact supported roles,
normalized non-empty email strings, valid timestamps, cursor nullability, array shape, and absence
of duplicate email values within the accumulated sequence before committing a page. Unexpected
properties may be ignored only at the parser boundary; no unapproved property is rendered.

## UI Requirements

F31 follows `harness/context/07_UI_DESIGN_SYSTEM.md` and extends F30's Administration composition.

Reuse `AppShell`, `AppHeader`, `Page`, `Section`, `Card` or a semantic display-list composition,
`Badge`, `Button`, `Alert`, `EmptyState`, and `LoadingState`. A data table is not required and must
not force horizontal scrolling on mobile. No new reusable primitive is expected.

### Information hierarchy

The complete `/admin` hierarchy becomes:

1. Administration header and description.
2. F30 `Registered users` summary.
3. `User directory` section.
4. Initial loading, directory rows, or contained error/empty state.
5. `Load more` when another page exists.

The directory has no dominant action while fully loaded. `Load more` is the dominant action within
the directory only when another page exists.

### Directory rows

Rows present email as the primary text. Friendly role label and localized registration date/time
are supporting information. `Administrator` and `User` remain understandable through text; badge
styling must not rely on color.

Long email addresses wrap without truncating essential identity, overlapping the role, or producing
document-level horizontal overflow. Dates use browser locale and the server timestamp; the UI does
not invent relative activity wording such as `Active recently`.

Rows have no hover/cursor treatment suggesting navigation and no nested controls. Selection,
checkboxes, bulk actions, and row menus are absent.

### States

* Initial directory loading preserves the expected list shape and does not display a false empty
  state.
* Populated success shows the validated first page and optional `Load more`.
* Although a valid administrator normally guarantees at least one user row, a valid empty response
  renders `No registered users found.` without an action rather than crashing or inventing data.
* Initial directory failure leaves the F30 summary intact, shows
  `Unable to load the user directory.` and provides `Retry`.
* Load-more pending changes the stable action label to `Loading…`, disables duplicate submission,
  and retains confirmed rows.
* Load-more failure or malformed appended data retains confirmed rows and shows an inline retryable
  error beside the action.
* `401` follows the existing logout/login recovery boundary.
* `403` clears directory content and leaves the F30 stale-role recovery responsible for returning
  to Profile.

Appending content must not move focus to the page top. If another page exists, focus remains on
`Load more`; when the final page removes that action, a stable status announcement reports that all
users are loaded without producing a keyboard trap.

Browser Back, visible Back, refresh, direct `/admin` navigation, and Profile contextual navigation
retain F30 behaviour. Pagination state and loaded additional pages need not be represented in the
URL or restored after refresh.

Validate zero, one, twenty, and multi-page directories at 360 px, 390 px, 430 px, a representative
tablet/small desktop, and a wide desktop width. Verify long emails, both role labels, localized
dates, loading/error/retry/pending states, visible focus, announcements, 44 px actions, 200% zoom,
safe areas, and no document-level horizontal overflow.

## Business Rules

* The directory is available only to current administrators.
* It contains all accounts, including administrators and the requesting account.
* Newest registration appears first with ID as the deterministic tie-breaker.
* Directory content is read-only and limited to email, role, and registration timestamp.
* Pagination is stable and bounded.
* The overview count and directory are independent point-in-time projections.
* No absence of workout or profile data is interpreted as inactivity.
* Administrative directory access does not imply access to private fitness data.

## Validation

* `limit` is a strict whole integer from 1 through 50; booleans and fractions are invalid.
* Supported query parameters occur at most once and unknown parameters are rejected.
* Cursors are bounded, URL-safe, structurally and semantically validated, and usable only for this
  directory ordering.
* Every returned role is exactly `user` or `admin`.
* Every email is the current non-empty normalized persisted address.
* Every timestamp is a valid serialized `created_at` value.
* Results follow `created_at` descending and ID descending.
* Following a valid cursor produces no duplicate from the prior page.
* Returned JSON contains no password hash, internal ID, storage namespace, profile data, or private
  domain relationship.

F31 adds no migration. Before completion, compare the configured local database revision with
`alembic heads` and exercise the endpoint against a genuinely migrated database; ORM-created test
tables do not prove the configured schema is ready.

## Acceptance Criteria

* [ ] An administrator sees a `User directory` below the existing registered-user count.
* [ ] A normal user cannot see or request any directory content.
* [ ] The first page contains at most 20 users newest first and includes normal users and admins.
* [ ] Every row shows only email, friendly role, and localized registration date/time.
* [ ] The current administrator appears through normal ordering without a special row or filter.
* [ ] Stable `Load more` pagination appends every remaining user without duplicate confirmed rows.
* [ ] A new registration between pages does not cause a prior item to repeat.
* [ ] Invalid, repeated, unknown, malformed, and unusable query inputs fail with the documented
  response and expose no cursor internals.
* [ ] Initial loading, valid empty, initial failure, retry, load-more pending/failure, malformed
  response, final-page announcement, `401`, and stale-role `403` remain usable.
* [ ] A directory failure preserves the validated F30 registered-user summary.
* [ ] Long emails, both roles, dates, focus, touch targets, safe areas, zoom, Back, refresh, and all
  required responsive widths meet the shared UI contract without horizontal overflow.
* [ ] No row offers navigation or any account mutation.
* [ ] No response or UI exposes IDs, password hashes, storage identifiers, profile state, activity,
  subscription, or private fitness facts.
* [ ] The configured local database is at repository head and the real authenticated directory flow
  passes against it.
* [ ] Backend tests and backend/frontend format, lint, type, and build checks pass.

## Tests

Backend tests cover:

* `401`, normal-user `403`, and administrator success.
* Empty, one-user, default-limit, custom-limit, and multi-page results.
* Mixed roles and inclusion of the requesting administrator.
* Newest-first order with deterministic timestamp ties.
* Cursor continuation without duplicates and insertion of a newer user between pages.
* Invalid bounds, booleans, fractions, repeated/unknown parameters, malformed cursor, and unusable
  cursor.
* Minimal response shape proving private/internal fields are absent.

Frontend format, lint, type checking, and production build cover the strict directory parser,
independent overview/directory request states, incremental append behaviour, and semantic
non-interactive rows. Focused unit coverage may be added only where an existing runner can directly
verify cursor-page accumulation or parser rejection without introducing browser infrastructure.

Per DEC-019, do not add automated browser coverage. Focused manual UI validation covers initial and
incremental states, mixed roles, long emails, malformed responses, access loss, Back/refresh,
keyboard focus and announcement behaviour, touch, safe areas, 200% zoom, and overflow at every
required width.

## Out of Scope

* Search, filters, sorting controls, page numbers, infinite scroll, export, or bulk selection.
* Account detail routes or opening another user's Profile.
* Role promotion/demotion, account creation, invitation, verification, suspension, disabling,
  deletion, impersonation, password reset, or session management.
* Profile-completion, last-login, last-active, workout, progress, photo, storage, subscription,
  revenue, retention, engagement, or growth metrics.
* Access to any other user's private application data.
* Health checks, uptime, logs, alerts, infrastructure state, dependency status, or operational
  monitoring.
* Subscription plans, tiers, entitlements, billing, purchases, or feature gating.
* A dedicated desktop-only table or a new admin visual system.

## Dependencies

* F30 — System Roles and Admin Overview.

## Notes

Reuse the established cursor and `Load more` principles, but keep the administration query separate
from workout/progress services. The user list is an account-directory projection, not a reason to
create a generic analytics subsystem.
