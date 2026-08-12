# F18 — Workout History

## Objective

Allow an authenticated user to browse completed and cancelled workouts in reverse chronological
order and open each workout's existing canonical read-only detail.

F18 makes terminal workout facts discoverable after their immediate execution flow. It does not
introduce analytics, historical editing, calendar planning, recommendations, or a second workout
summary representation.

## Context

F13 introduced persisted workout snapshots, explicit cancellation, and the canonical
`/workouts/{workoutId}` URL. F14 through F15.1 added performed sets, timing, skips, feedback, and an
append-only timeline. F17 added explicit completion and a deterministic read-only summary for
completed workouts.

Completed and cancelled workouts already remain retrievable by their owner when their ID is known,
but the application provides no way to discover them later. F18 adds that browsing surface and
reuses the existing snapshot and projection boundaries. In-progress workouts remain part of Today
and live execution, not history.

## User Experience

### Main navigation

Add `History` as a fifth permanent destination in the authenticated bottom navigation. Its
canonical route is `/history`. It uses the approved Lucide icon family and is selected for
`/history` and terminal workout detail opened from history.

The five destinations remain `Today`, `History`, `Plan`, `Exercises`, and `Profile`. At all required
mobile widths, labels and targets remain readable without horizontal scrolling or reducing any
interactive target below 44 by 44 CSS pixels.

### History list

`/history` presents terminal workouts newest first. Each row is one navigation target and shows:

1. The workout's local calendar date.
2. Selected session name and routine name from the immutable workout snapshot.
3. Explicit `Completed` or `Cancelled` status.
4. Performed, skipped, and total set counts.
5. Workout duration for completed workouts only.

The initial view includes all terminal statuses. A compact single-select filter offers `All`,
`Completed`, and `Cancelled`. Changing the filter resets the result set and loads its first page.
The current filter is represented in the URL as an optional `status` query parameter so refresh,
direct navigation, and Browser Back restore it. `All` is canonical without a query parameter.

Rows open `/workouts/{workoutId}`. Browser Back returns to the same history URL, filter, and loaded
position when normal browser restoration permits it. The application must not replace the history
entry during row navigation.

### Incremental loading

The first page is useful without another action. When more results exist, `Load more` is the single
dominant action for the list. It appends the next page without replacing confirmed rows or moving
focus unexpectedly. While pending it reads `Loading…`, prevents duplicate requests, and retains the
existing list.

The API uses opaque cursor pagination with a stable newest-first ordering. The UI does not expose
page numbers or cursor contents.

### Empty and error states

With no terminal workouts, History explains that completed and cancelled workouts will appear here.
It offers `Go to Today` as the dominant action.

When a selected filter has no matches but other historical workouts may exist, the empty state says
that no workouts match the filter and offers `Show all` as the dominant action.

An initial load failure shows a recoverable page-level error with `Retry`. A `Load more` failure
keeps all confirmed rows visible and shows an inline retryable error beside the loading action.
Malformed success responses use the same safe recovery states and never render untrusted values.

### Historical detail

Completed workouts continue to use the F17 summary at `/workouts/{workoutId}` without historical
editing controls.

Cancelled workouts at the same canonical URL receive a read-only terminal summary suitable for
history. It shows snapshot context, local date, start and cancellation times, elapsed workout
duration, performed/skipped/total counts, scheduled or alternate-session context, and ordered
exercise results. Unresolved sets remain explicitly distinguishable from performed and skipped
sets. No live, resume, correction, skip, completion, or cancellation actions appear.

The detail header provides a visible `Back to History` action that navigates to `/history`; normal
Browser Back remains unchanged. If the detail was reached from another route, `Back to History`
still provides a deterministic destination.

## Functional Requirements

### FR-1 — Owned terminal history

Return only workouts owned by the authenticated user whose status is `completed` or `cancelled`.
Never include `in_progress` workouts, even when they were started on an earlier local date.

Ownership filtering occurs in the database query, not after pagination. A user cannot infer another
user's workout IDs, counts, dates, or cursors.

### FR-2 — Stable ordering

Order results by terminal timestamp descending and then workout ID descending as a deterministic
tie-breaker. The terminal timestamp is `completed_at` for completed workouts and `cancelled_at` for
cancelled workouts.

Pagination uses an opaque cursor representing the final row's ordering key and selected status
scope. Newer workouts created between requests must not cause already returned rows to repeat in a
later page. Each item appears at most once in a correctly followed cursor sequence.

### FR-3 — Status filter

Support exactly `completed` and `cancelled` as optional server filters. Omitting the filter returns
both statuses. Unsupported, empty, repeated, or malformed filter parameters are rejected rather
than silently interpreted.

Frontend labels remain friendly `All`, `Completed`, and `Cancelled`; internal enum values are not
shown as raw error content.

### FR-4 — Bounded page size

The client may request a page size from 1 through 50. The default and frontend page size is 20.
Booleans, fractional values, repeated values, and values outside the range are invalid.

The response supplies `next_cursor` only when another matching row exists. An absent next page is
represented by `null`, not an empty string or inferred from page length.

### FR-5 — Compact list projection

Each history item contains only facts needed by the list:

* Workout ID.
* Snapshot routine and selected-session names.
* Local workout date.
* `completed` or `cancelled` status.
* Server-owned start and terminal timestamps.
* Non-negative elapsed `duration_seconds`.
* Performed, actively skipped, unresolved, and total set counts.
* Scheduled or alternate selection kind.

Counts and duration are deterministic projections of existing persisted facts. Do not store list
rows, aggregate counts, terminal timestamps, or durations again. The projection must preserve
`performed + skipped + unresolved = total`.

### FR-6 — Terminal duration

For a completed workout, derive duration from `started_at` through `completed_at`. For a cancelled
workout, derive duration from `started_at` through `cancelled_at`. Clamp corrupted negative elapsed
values to zero at the public projection boundary consistently with the existing completed summary.

The UI labels this `Workout duration`; it does not imply active training time.

### FR-7 — Canonical detail reuse

History items link to the existing owned-workout endpoint and canonical route. The detail continues
to derive its content from immutable workout snapshots, performed sets, active exceptions, and
events. Later plan changes or deletions must not change historical names, targets, results, or
selection context.

F18 must not introduce a separate history-detail endpoint or duplicate full workout response.

### FR-8 — Cancelled read-only projection

Cancelled workout retrieval remains terminal and non-resumable. Its `resume_url`, current
exercise/set fields, current set phase/start, and transition target are null regardless of stored
pre-cancellation progress.

The existing full workout response exposes enough information to render performed, skipped, and
unresolved results for a cancelled session. F18 may extend a shared terminal projection only when a
field required by both terminal summaries is genuinely missing; it must not synthesize skip facts
for unresolved work.

### FR-9 — Navigation state

`History` is active on `/history`. A terminal workout detail is associated with History for main
navigation highlighting, while an in-progress workout and its execution routes remain associated
with Today. The distinction is based on validated loaded workout status, not merely the generic
`/workouts` path prefix.

While terminal detail is loading, the main navigation must avoid announcing a false destination.
The implementation may show neither contextual item selected until status is known.

### FR-10 — URL-backed filter

`/history` means all statuses. `/history?status=completed` and
`/history?status=cancelled` select the corresponding filter. Unknown, repeated, or empty UI query
values are normalized with a replace navigation to canonical `/history` and do not trigger an
invalid API request.

Changing filters creates a normal history entry. Browser Back restores the prior filter and reloads
that filter's first page. Refresh restores the selected filter but need not persist additional pages
previously loaded.

### FR-11 — Request and response safety

The frontend parses list response bodies as `unknown` and validates the entire page before changing
confirmed content. It validates IDs, enums, timestamps, local dates, counts, duration, selection
kind, cursor nullability, and count invariants.

Invalid initial data produces `Unable to load workout history. Please try again.` Invalid appended
data keeps the existing rows and produces `Unable to load more workouts. Please try again.` Raw
server values and framework validation arrays never reach rendered UI.

### FR-12 — Existing behaviour preservation

Today, workout start/resume, live execution, cancellation, completion, corrections, skips, direct
workout retrieval, ownership isolation, and terminal mutation rejection retain their established
behaviour. History browsing performs no mutation.

## Domain / Data Requirements

F18 introduces no entity, persisted aggregate, status, event type, or database migration.

Use `WorkoutSession` terminal lifecycle timestamps and the existing workout facts. Query and
projection code belongs in the workout application/service boundary rather than the HTTP endpoint.
The list query must avoid loading the full event timeline and full exercise graph for every row;
derive counts with a bounded query strategy suitable for a page of 20–50 workouts.

Opaque cursors are transport tokens, not domain facts. They must be URL-safe, versionable, strictly
validated, and treated as untrusted input. They must not expose or accept user identity as client
authority. A cursor is valid only for the filter scope under which it was issued.

## API Requirements

All endpoints require authentication. Existing cookie-authentication behaviour applies.

### `GET /api/workouts/history`

Query parameters:

* `status`: optional; exactly `completed` or `cancelled`.
* `cursor`: optional opaque non-empty string issued by this endpoint.
* `limit`: optional strict integer from 1 through 50; defaults to 20.

Every supported parameter may occur at most once. No other query parameter is accepted.

Returns `200`:

```json
{
  "items": [
    {
      "id": 42,
      "routine_name": "Upper / Lower",
      "selected_training_day_name": "Upper A",
      "local_date": "2026-08-12",
      "status": "completed",
      "selection_kind": "scheduled",
      "started_at": "2026-08-12T17:30:00Z",
      "terminal_at": "2026-08-12T18:41:15Z",
      "duration_seconds": 4275,
      "completed_set_count": 11,
      "skipped_set_count": 1,
      "unresolved_set_count": 0,
      "total_set_count": 12
    }
  ],
  "next_cursor": "opaque-token-or-null"
}
```

Responses:

* `200` with an empty `items` array and `next_cursor: null` when no workouts match.
* `401` when unauthenticated.
* `422` with framework-compatible validation detail for invalid, repeated, unsupported, or unknown
  query parameters, invalid limits, malformed cursors, or cursor/filter mismatch.

An expired or otherwise unusable well-formed cursor is also rejected with `422`; it never falls back
to the first page. Error responses expose no decoded cursor content or database detail.

### Existing `GET /api/workouts/{workout_id}`

Preserve its success, ownership, `404`, path validation, and authentication contracts. F18 relies on
it for both completed and cancelled detail. Terminal workouts return non-resumable current-state
fields as required by FR-8.

Route registration must ensure the literal `/api/workouts/history` path cannot be consumed as a
dynamic workout ID.

## UI Requirements

F18 follows `harness/context/07_UI_DESIGN_SYSTEM.md` and adds no feature-local visual language.

Reuse `AppShell`, `AppHeader`, `Page`, `Section`, `Card` or `ListRow`, `Badge`, `Button`, `Alert`,
`EmptyState`, and `LoadingState`. A compact shared single-select/segmented filter may be added only if
the existing primitives cannot express the three status choices accessibly; if added, it belongs in
the shared UI layer and defines keyboard, focus, selected, disabled, and overflow behaviour.

The screen hierarchy is:

1. `History` heading and concise explanation.
2. Status filter.
3. Chronological workout list or its loading/empty/error state.
4. `Load more` when applicable.

There is no dominant action while populated unless another page is available, in which case `Load
more` is dominant within the list. Each history row has one primary navigation target and no nested
actions.

Dates and times use browser locale while preserving the server-provided local workout date. Duration
uses the existing compact accessible format, such as `1 hr 11 min`; under one minute may show `Less
than 1 min`. Counts use explicit text and do not rely on color. Zero unresolved sets may be omitted
from completed rows; cancelled rows explicitly show unresolved work when non-zero.

Applicable states:

* Initial loading preserves expected list shape and does not flash an empty state.
* Populated success shows validated rows and optional next-page action.
* Global empty and filtered empty use the distinct flows described above.
* Initial error replaces no confirmed content and offers `Retry`.
* Filter loading does not mislabel old rows as belonging to the new filter; it may show the loading
  shape until the new validated page arrives.
* Load-more pending/error retains confirmed rows and stable action placement.
* Backend unavailable and malformed responses remain recoverable.
* Completed and cancelled detail are explicitly read-only; unresolved cancelled sets are not styled
  as performed or skipped.

Changing filters and opening rows are keyboard operable and visibly focused. Status selection is
announced by native semantics. Appended content is announced without moving focus away from `Load
more`; on success the action remains focused if more pages exist, otherwise focus moves to a nearby
stable status message or remains logically positioned without jumping to the page top.

Validate `/history`, each filter, pagination, and both terminal detail states at 360, 390, and
430 px, representative tablet/small desktop, and wide desktop widths. Verify five-item navigation,
44 px targets, logical headings, visible focus, 200% zoom, safe areas, reduced motion, long snapshot
names, localized dates, and no document-level horizontal overflow.

## Business Rules

* History contains terminal workouts only.
* Completed and cancelled are equally discoverable but remain visibly distinct.
* A cancelled workout may contain performed, skipped, and unresolved sets.
* Unresolved work never becomes an inferred skip or failure.
* History facts come from workout snapshots and observations, not the current routine.
* Newest terminal fact appears first; local workout date is display context, not ordering authority.
* Pagination is stable and user-scoped.
* Browsing and filtering never mutate workouts.
* Terminal workouts remain immutable and non-resumable.
* Duration is elapsed wall-clock time, not active training time.
* Counts, cursor contents, ordering timestamps, and ownership are never client-authoritative.

## Validation

* IDs are strict positive integers and booleans are invalid.
* Status accepts exactly one supported value or is omitted.
* Limit is a strict whole integer from 1 through 50.
* Unknown and repeated query parameters are rejected.
* Cursors are non-empty, bounded in length, URL-safe, structurally and semantically validated, and
  bound to their original filter scope.
* Every returned item is owned, terminal, and satisfies
  `performed + skipped + unresolved = total`.
* `terminal_at` matches the lifecycle timestamp for the returned status.
* Duration is a non-negative whole number.
* Results follow terminal timestamp descending and ID descending.
* Following `next_cursor` produces no duplicate from the previous page.

Because F18 adds no migration, the migration validation gate is not applicable. Existing configured
database and repository-head consistency should still be checked before final feature validation so
the exercised history uses the established F17 schema.

## Acceptance Criteria

* [ ] `History` is a fifth permanent authenticated navigation destination and remains usable at all
  required widths.
* [ ] `/history` shows the owner's completed and cancelled workouts newest first.
* [ ] In-progress and other-user workouts never appear or influence pagination.
* [ ] All, Completed, and Cancelled filters are URL-backed and restore correctly on refresh and Back.
* [ ] Rows show snapshot identity, local date, explicit status, counts, and terminal duration.
* [ ] Empty history, empty filter, initial failure, malformed response, pagination pending, and
  pagination failure all leave a clear usable recovery path.
* [ ] `Load more` appends a stable next page without duplicates or loss of confirmed rows.
* [ ] Opening a completed row restores the existing F17 read-only summary.
* [ ] Opening a cancelled row shows a read-only summary that distinguishes performed, skipped, and
  unresolved work.
* [ ] Terminal detail provides deterministic navigation to History and remains non-resumable and
  immutable.
* [ ] Later routine changes or deletion do not alter historical list or detail identity/results.
* [ ] Invalid filters, limits, cursors, repeated/unknown parameters, unauthenticated requests, and
  malformed frontend responses fail safely.
* [ ] Today, start, resume, execution, cancellation, completion, direct retrieval, and ownership
  isolation regressions pass.
* [ ] Backend tests, frontend format/lint/type checks, and focused manual responsive/accessibility
  validation pass.

## Tests

Backend tests cover mixed completed/cancelled ordering; status filters; empty history; user
isolation; in-progress exclusion; default/custom limits; deterministic tie ordering; cursor next
pages without duplication; new terminal rows inserted between pages; cursor/filter mismatch;
malformed cursor; invalid, repeated, and unknown parameters; authentication; count invariants;
cancelled unresolved projection; and representative snapshot independence after plan changes.

Existing workout endpoint tests cover completed and cancelled direct retrieval, terminal
non-resumability, ownership, invalid IDs, and mutation rejection. Add focused regression coverage
where the cancelled terminal projection changes.

Frontend format, lint, and type checks cover the new route, strict response parser, contextual main
navigation, and URL-query handling. Code inspection verifies that malformed initial and appended
responses cannot replace confirmed content or render raw payloads.

Per DEC-019, F18 adds no automated browser or other automated browser/browser-level tests. Focused manual UI
validation covers initial loading, both empty states, all filters, populated and long-value rows,
pagination success/pending/failure, malformed/unavailable responses, completed/cancelled detail,
Back/refresh/direct navigation, contextual nav selection, keyboard/focus/announcements, touch,
safe-area/reduced-motion/200% zoom, and overflow at every required width.

## Out of Scope

* Calendar, heat map, grouped month view, search, date range, routine, session, exercise, or outcome
  filters.
* Exercise-specific history, progress charts, volume, personal records, statistics, comparisons,
  streaks, adherence, or other Phase 3 analytics.
* Editing, reopening, deleting, duplicating, or adding notes to terminal workouts.
* Changing historical local dates, snapshots, performed values, skips, reasons, or feedback.
* Export, sharing, print views, social feeds, recommendations, derived signals, adaptations, or AI.
* Showing recent history on Today or Profile.
* Persisting filter preferences or loaded pages outside the URL/browser session.
* Infinite scroll, virtualized lists, background prefetching, or offline history caching.

## Dependencies

* F13 — Start Workout.
* F14 — Live Workout Timeline and Set Tracking.
* F14.2 — Explicit Set Start and Accurate Set Timing.
* F15 — Workout Exceptions and Feedback.
* F15.1 — Pain or Discomfort Skip Reason.
* F17 — Workout Completion.

## Notes

Keep F18 a browsing feature. Its compact list is a projection optimized for discovery; the canonical
workout response remains the single detailed representation. The pagination contract deliberately
uses terminal timestamps rather than local dates because lifecycle facts provide a stable total
ordering across completed and cancelled workouts.
