# F20 — Progress Area and Exercise Performance History

## Objective

Introduce `Progress` as the permanent home for historical and analytical views, preserve the
existing workout-history capability inside it, and add an exercise-focused view that lets the user
inspect how recorded repetitions, weight, and estimated strength have changed across terminal
workouts.

F20 is descriptive. It exposes observed workout facts and three deterministic per-session metrics;
it does not decide whether a change is good or bad, infer muscle growth or fat loss, score the user,
or tailor an interpretation to the current fitness goal.

## Context

F18 introduced a fifth authenticated navigation destination, `History`, at `/history`. It makes
completed and cancelled workouts discoverable but has no broader home for the exercise, workout,
and body perspectives planned for Phase 3.

F13–F17 already persist the facts F20 needs:

* Immutable exercise identity and target-type snapshots inside each workout.
* Ordered planned sets and their observed performed-set values.
* Optional observed weight and RIR.
* Workout ownership, local date, terminal status, and terminal timestamp.

The product needs to answer a simple historical question before it attempts goal-dependent
analysis: “What have I recorded for this exercise over time?” F20 answers that question and creates
the information architecture on which later workout statistics, body tracking, charts, and
deterministic signals can build.

## User Experience

### Main navigation and Progress structure

Replace the `History` main-navigation item with `Progress`. The authenticated destinations remain
exactly five:

1. `Today`
2. `Progress`
3. `Plan`
4. `Exercises`
5. `Profile`

`Progress` opens `/progress/workouts`. Within the Progress screen, a compact route-backed section
selector offers exactly:

* `Workouts`
* `Exercises`

`Workouts` contains the complete F18 workout-history experience without changing its status
filtering, pagination, facts, or terminal-detail behaviour. `Exercises` contains the new F20
exercise-performance experience. Future `Body` or other sections are not displayed until their
features exist.

`/progress` redirects with replace semantics to `/progress/workouts`. Existing `/history` URLs
redirect with replace semantics to `/progress/workouts` while preserving a valid `status` query so
bookmarks and direct links remain useful. Invalid query values continue to receive the F18 safe
canonicalization behaviour.

### Exercise history list

`/progress/exercises` lists the user's exercises that have at least one performed set in a terminal
workout whose snapshotted target type is `repetitions`. It does not display the complete catalog,
exercises that were only planned or skipped, or exercises seen only in an in-progress workout.

Each row is one navigation target and shows:

1. The exercise's most recent snapshot name.
2. The most recent local workout date on which it had a performed set.
3. The number of distinct terminal workouts contributing performed repetition facts.

Order the list by the most recent contributing terminal timestamp descending, then exercise slug
ascending as a deterministic tie-breaker. The personal list is bounded by the curated catalog and
is returned in one response; F20 adds no list pagination or search.

Selecting a row opens `/progress/exercises/{slug}`.

### Exercise performance detail

The detail header shows the most recent snapshot name and a Back action to `/progress/exercises`.
It presents a route-backed metric selector with:

* `Total reps`
* `Heaviest weight`
* `Estimated 1RM`

`Total reps` is the default and canonical state, represented by the absence of a `metric` query
parameter. The other URLs are:

* `/progress/exercises/{slug}?metric=heaviest_weight`
* `/progress/exercises/{slug}?metric=estimated_1rm`

Changing the metric creates a normal browser-history entry. Refresh and Browser Back restore the
selected metric. Unknown, empty, or repeated `metric` values are normalized with replace semantics
to the canonical Total reps URL and never become invalid backend requests.

The screen contains:

1. Exercise identity and concise descriptive copy.
2. The metric selector.
3. A chronological line chart of the selected metric.
4. A concise explanation of exactly what one point means.
5. Newest-first session history showing the observed sets behind every point.
6. `Load more` when older sessions exist.

The chart is a summary, not the sole representation. Selecting or focusing a point exposes its
date, metric value, terminal status, and session name. The textual session history remains present
and fully usable without interpreting the chart visually.

### Session history and traceability

One history item represents one terminal workout for the selected exercise slug, even if the same
exercise appears more than once inside that workout. All qualifying occurrences and performed sets
are combined into the workout's metric point, while the underlying sets remain grouped and ordered
by workout-exercise position and then planned-set position.

Each session item shows:

* Local workout date.
* Snapshotted routine and selected-session names.
* Explicit `Completed` or `Cancelled` status.
* Total repetitions.
* Heaviest observed weight when available.
* Estimated 1RM when available.
* Every performed set as repetitions, optional weight, and optional RIR.

The item links to the existing canonical `/workouts/{workoutId}` terminal detail. Normal Browser
Back returns to the same metric URL and loaded position when normal browser restoration permits it.

Cancelled workouts contribute their performed sets because those sets remain observed facts. Their
cancelled status is always explicit. Skipped and unresolved sets do not contribute to metrics and
are not fabricated as performed work.

## Functional Requirements

### FR-1 — Progress information architecture

Replace History with Progress in the authenticated main navigation without adding a sixth item.
Progress is selected for:

* `/progress/workouts`
* `/progress/exercises`
* `/progress/exercises/{slug}`
* A validated terminal workout detail at `/workouts/{workoutId}`

An in-progress workout detail remains associated with Today. While a workout detail is loading and
its status is unknown, the shell must not announce either Today or Progress as selected merely from
the generic workout path.

The catalog destination remains `Exercises` and continues to own `/exercises` and
`/exercises/{slug}`. `Exercises` is for discovering definitions and instructions; `Progress →
Exercises` is for the user's observed performance history. Labels and route selection must keep
those purposes distinguishable.

### FR-2 — Existing workout history preservation

Move the F18 History screen to `/progress/workouts` and change its screen context from History to
Progress / Workouts. Preserve:

* All, Completed, and Cancelled status filters.
* The existing `/api/workouts/history` endpoint and response contract.
* Cursor pagination and ordering.
* Loading, empty, initial-error, malformed-response, pagination-pending, and pagination-error states.
* Completed and cancelled terminal summaries.
* Ownership isolation and terminal immutability.

The deterministic terminal-detail action becomes `Back to workouts` and targets
`/progress/workouts`. Normal Browser Back remains unchanged and may restore a filtered list.

### FR-3 — Owned eligible exercise list

Return one summary for each exercise slug that has at least one `PerformedSet` joined through a
`WorkoutExercise` with `target_type = repetitions` in a workout owned by the authenticated user and
with status `completed` or `cancelled`.

Ownership and eligibility are applied in the database query before grouping. In-progress workouts,
planned-only exercises, skipped sets, unresolved sets, other users' facts, duration-target
occurrences, and distance-target occurrences do not affect the list, its counts, or its ordering.

Use the exercise name from the most recent eligible workout snapshot; when that workout contains
the slug more than once, use the lowest workout-exercise position as the deterministic name source.
Later routine or catalog changes must not rewrite historical set facts. F20 relies on the
established stable exercise slug to correlate snapshots across workouts.

### FR-4 — Stable session history

Return contributing workouts newest first by terminal timestamp descending and workout ID
descending. The terminal timestamp is `completed_at` for a completed workout and `cancelled_at` for
a cancelled workout.

The detail endpoint uses opaque cursor pagination with a default and frontend page size of 20 and an
accepted range of 1–50. A cursor is versioned, URL-safe, strictly validated, user-bound, and
exercise-slug-bound. Following a correctly issued cursor after a newer workout is added must not
repeat a previously returned session. An unusable cursor returns `422`; it never falls back to the
first page.

### FR-5 — Total repetitions

For one workout and exercise slug, `total_reps` is the sum of `performed_value` across every
performed set whose snapshotted target type is `repetitions`.

The existing workout execution boundary guarantees valid repetition values. The projection returns
the result as a non-negative whole number. Skipped and unresolved planned sets contribute nothing.
No average, target comparison, set-count normalization, or goal-dependent adjustment is applied.

### FR-6 — Heaviest weight

For one workout and exercise slug, `heaviest_weight_kg` is the maximum non-null
`performed_weight_kg` across its qualifying performed sets.

A recorded zero is an available observed value and remains zero. If every qualifying performed set
has null weight, the metric is null. Missing weight is never converted to zero, copied from current
planning data, inferred from equipment, or filled using another session.

### FR-7 — Estimated one-repetition maximum

For each qualifying performed set with non-null performed weight, calculate Epley estimated 1RM:

```text
estimated_1rm_kg = performed_weight_kg × (1 + performed_repetitions / 30)
```

The workout's `estimated_1rm_kg` is the maximum result across those sets. There is deliberately no
minimum or maximum repetition-count eligibility rule beyond the existing validity of a performed
repetition value. Do not introduce a special branch for high-repetition sets or use RIR to adjust
the estimate.

If no qualifying set has observed weight, the workout estimated 1RM is null. Calculate the value
deterministically at read time; do not persist it. The public API returns it rounded consistently to
two decimal places, and the UI may format it to at most one decimal place without changing the
underlying comparison. It is always labelled `Estimated 1RM`, never `1RM`, `Max strength`, or a
personal record.

### FR-8 — Metric chart semantics

Each chart point represents exactly one contributing workout:

* Total reps uses `total_reps` and always has a point.
* Heaviest weight uses `heaviest_weight_kg`; null sessions create no plotted value.
* Estimated 1RM uses `estimated_1rm_kg`; null sessions create no plotted value.

Do not substitute zero for null or connect a line in a way that visually asserts an observed value
where none exists. Points are ordered oldest to newest on the chart among the currently loaded
sessions. Loading an older page extends the series into the past while preserving already confirmed
facts.

The chart does not apply smoothing, forecasts, regression, goal ranges, positive/negative colors,
trend arrows, percentage change, records, or claims of progress. Axis labels and point details state
the metric and unit explicitly.

### FR-9 — Factual set detail

Return every contributing performed set needed to explain the metrics:

* Workout-exercise position.
* Planned-set position.
* Performed repetitions.
* Optional performed weight in kilograms.
* Optional performed RIR.
* Server-owned set completion timestamp.

Order facts by workout-exercise position and then planned-set position. RIR remains contextual set
data and is not aggregated or offered as a chart metric. Entry mode, planned targets, tempo, notes,
and workout events are not needed by this compact history response; full terminal detail remains
available through the existing workout endpoint.

### FR-10 — Read-only and snapshot-safe behaviour

Progress endpoints and screens perform no mutation. They do not edit, correct, reopen, delete,
resume, complete, cancel, or annotate a workout. Later routine edits, activation changes, training
day moves, prescription changes, or routine deletion must not alter the historical workout/session
identity or performed values returned by F20.

### FR-11 — Request and response safety

Frontend API functions parse every response body as `unknown` and validate the complete response
before changing confirmed content. Validate IDs, slugs, names, enums, dates, timestamps, positions,
whole-number repetitions and counts, finite non-negative weights and estimates, nullability,
ordering-relevant fields, set arrays, cursor nullability, and metric invariants.

Malformed initial exercise-list data produces `Unable to load exercise progress. Please try again.`
Malformed initial detail data produces `Unable to load exercise history. Please try again.` A
malformed appended page retains all confirmed sessions and produces `Unable to load more history.
Please try again.` Raw server values and framework validation arrays never reach rendered UI.

## Domain / Data Requirements

F20 introduces no entity, persisted aggregate, status, event type, or database migration.

Exercise summaries, per-workout metrics, and estimated 1RM are read-time projections over existing
workout snapshots and performed facts. Query and projection logic belongs in a Progress or workout
application/service boundary rather than HTTP endpoints or React components. The backend is the
authoritative metric calculator so all clients receive identical definitions.

The exercise list query must aggregate without loading complete workout graphs. The detail query
must load only the bounded page of relevant terminal workouts and the performed repetition facts
required for those workouts; it must not load full event timelines, exceptions, or unrelated
exercises.

One workout is the aggregation boundary even if the same slug appears in multiple workout-exercise
snapshots. Do not create or persist a separate analytics-session identity.

Opaque cursors are transport tokens, not domain facts or client authority. They must not expose
decoded identity or database detail in errors.

## API Requirements

All endpoints use existing cookie authentication and return `401` when unauthenticated.

### `GET /api/progress/exercises`

Accept no query parameters. Unknown or repeated parameters return `422`.

Returns `200`:

```json
{
  "items": [
    {
      "exercise_slug": "barbell-bench-press",
      "exercise_name": "Barbell Bench Press",
      "session_count": 8,
      "last_local_date": "2026-08-12",
      "last_performed_at": "2026-08-12T18:05:00Z"
    }
  ]
}
```

`session_count` counts distinct terminal workouts, not exercise occurrences or sets.
`last_performed_at` is the latest qualifying performed-set completion timestamp and is display
context; list ordering is based on the terminal workout timestamp defined by FR-3.

An authenticated user with no eligible exercise facts receives `200` with `{"items": []}`.

### `GET /api/progress/exercises/{exercise_slug}/history`

Query parameters:

* `cursor`: optional opaque non-empty string issued by this endpoint.
* `limit`: optional strict integer from 1 through 50; defaults to 20.

Each supported query parameter may occur at most once. No other query parameter is accepted.

Returns `200`:

```json
{
  "exercise": {
    "slug": "barbell-bench-press",
    "name": "Barbell Bench Press"
  },
  "items": [
    {
      "workout_id": 42,
      "routine_name": "Upper / Lower",
      "selected_training_day_name": "Upper A",
      "local_date": "2026-08-12",
      "status": "completed",
      "terminal_at": "2026-08-12T18:41:15Z",
      "total_reps": 34,
      "heaviest_weight_kg": 60.0,
      "estimated_1rm_kg": 80.0,
      "sets": [
        {
          "exercise_position": 1,
          "set_position": 1,
          "performed_reps": 10,
          "performed_weight_kg": 60.0,
          "performed_rir": 2,
          "completed_at": "2026-08-12T17:42:10Z"
        }
      ]
    }
  ],
  "next_cursor": "opaque-token-or-null"
}
```

Responses:

* `200` with empty `items` and `next_cursor: null` when the slug is a valid catalog exercise but the
  user has no eligible history for it.
* `404 {"detail": "Exercise not found"}` when the catalog slug is unknown, preserving the catalog's
  safe existence contract.
* `422` with framework-compatible validation detail for malformed, empty, repeated, unsupported, or
  unknown parameters; invalid limits; malformed cursors; or a cursor issued for another user or
  exercise slug.

The route must be registered so literal progress endpoints cannot be consumed by an unrelated
dynamic route.

### Existing APIs

Preserve `/api/workouts/history`, owned workout retrieval, exercise catalog endpoints, workout
execution mutations, and all their existing status and validation contracts. F20 must not duplicate
the complete terminal-workout representation in its compact exercise-history endpoint.

## UI Requirements

F20 follows `harness/context/07_UI_DESIGN_SYSTEM.md` and extends no parallel visual language.

Reuse `AppShell`, `AppHeader` or `ScreenHeader`, `Page`, `Section`, `Stack`, `Inline`, `ListRow`,
`Badge`, `Button`, `Alert`, `EmptyState`, and `LoadingState`. The Progress section selector is
route-backed navigation and must use links with native navigation semantics, even if visually
presented as a compact segmented control. If the existing shared filter treatment cannot express
linked sections accessibly, add one small shared section-navigation primitive rather than a
feature-local substitute.

The first data chart may remain an exercise-progress feature component until another feature proves
a reusable abstraction. It must use semantic design tokens, the approved typography, and no raw
feature colors or decorative gradients. A charting dependency may be introduced only when it is
small, maintained, compatible with React 19, and materially reduces accessible interaction or
responsive implementation risk; do not add a dashboard framework.

### Progress / Workouts states

Preserve every state and recovery path required by F18. The Progress section selector remains
visible during owned content loading and errors so the other implemented section stays reachable.

### Exercise list states

* Initial loading preserves expected row shape and does not flash empty content.
* Populated success shows all validated eligible exercises.
* Empty state says `No exercise progress yet` and explains that exercises appear after performed
  repetition sets are recorded in a completed or cancelled workout. Its dominant action is `Go to
  Today`.
* Initial unavailable, request, or malformed-response failure shows a page-owned Alert and `Retry`.
* Confirmed content is never replaced by an unvalidated payload.

### Exercise detail states

* Initial loading preserves header, selector, chart, and session-history shape without displaying
  invented values.
* Populated success shows the selected metric chart and all loaded session facts.
* If the selected weight or estimated-1RM metric has no available points, keep the metric selector
  and factual session history visible and show a contained message explaining that no performed
  weight was recorded. Do not treat the entire exercise history as empty.
* A valid catalog exercise with no eligible history shows `No recorded performance for this
  exercise` with `Back to exercises` as the dominant action.
* Unknown exercise uses a recoverable not-found state with `Back to exercises`.
* Initial failure shows `Retry` without false chart or history content.
* Load-more pending retains the chart and confirmed sessions, prevents duplicate requests, and reads
  `Loading…`.
* Load-more failure retains confirmed data and presents an inline `Retry` beside the stable loading
  action location.
* A successfully appended page updates the chart and textual list without moving focus
  unexpectedly. If more pages remain, focus stays on Load more; otherwise a nearby status announces
  that older sessions were loaded.

### Chart accessibility and interaction

The chart is supplementary to the semantic session list. It must provide:

* A visible chart title naming the exercise and selected metric.
* Explicit x-axis date context and y-axis unit (`reps` or `kg`).
* Keyboard-focusable points or an equivalent adjacent semantic data representation that exposes
  every plotted date and value in the same order.
* Touch targets large enough to select points without precision tapping.
* A visible selected/focused state that does not rely on color.
* No hover-only information.
* No animation required to understand values and full reduced-motion support.

Long exercise and session names, localized dates, decimal kilograms, isolated points, missing
weight points, same-day sessions, one-session histories, and mixed completed/cancelled sessions must
remain readable. The chart must not cause document-level horizontal scrolling; it adapts to the
content width rather than requiring the user to pan for core meaning.

Validate `/progress/workouts`, every workout status filter, `/progress/exercises`, every metric,
exercise detail, pagination, old `/history` redirects, and terminal workout Back behaviour at 360,
390, and 430 px, representative tablet/small desktop, and wide desktop widths. Verify five-item
navigation, 44 px targets, logical headings and landmarks, visible focus, keyboard and touch use,
200% zoom, safe areas, reduced motion, Browser Back, refresh, direct navigation, and absence of
document-level horizontal overflow.

## Business Rules

* Progress displays facts and deterministic calculations; it does not interpret the user's goal.
* Only performed sets are metric inputs. Planned, skipped, and unresolved sets are not performance.
* Performed sets remain facts when their workout is later cancelled.
* F20 exercise metrics apply only to repetition-target workout snapshots.
* Total reps describes quantity, heaviest weight describes the largest observed external load, and
  estimated 1RM describes an Epley calculation from the strongest estimated set. None is a universal
  measure of hypertrophy, fat loss, health, or workout quality.
* A metric increase or decrease receives no positive, negative, warning, or success meaning.
* Metrics compare the same stable exercise slug over time and never combine different exercises.
* Missing weight remains missing and never becomes zero.
* RIR is historical context, not an F20 aggregate metric.
* All Progress data is read-only and user-owned.

## Validation

* Exercise slugs follow the existing catalog route constraints and safe `404` behaviour.
* Session counts, workout IDs, positions, repetitions, and dates have their documented types and
  ranges; booleans are invalid numeric values.
* All public numeric metric values are finite and non-negative.
* `total_reps` equals the sum of returned qualifying set repetitions for the workout.
* `heaviest_weight_kg` is null exactly when all returned qualifying weights are null; otherwise it
  equals their maximum, including a recorded zero.
* `estimated_1rm_kg` is null exactly when no qualifying set has weight; otherwise it equals the
  maximum Epley result, rounded to two decimal places, with no repetition-count restriction.
* Each history item has at least one performed repetition set and belongs to an owned terminal
  workout.
* Results and cursors follow terminal timestamp and workout-ID ordering without duplicates.
* Unknown and repeated API query parameters are rejected.
* The existing configured database must be at repository Alembic head before final feature
  validation. F20 adds no migration, so fresh/upgrade migration testing is not a new F20 gate.

## Acceptance Criteria

* [ ] `Progress` replaces `History` without adding a sixth main-navigation item.
* [ ] Progress exposes route-backed Workouts and Exercises sections and no unimplemented Body
  section.
* [ ] Existing workout history, filters, pagination, terminal detail, ownership, and error states
  work from `/progress/workouts`.
* [ ] Existing `/history` links safely redirect and preserve a valid status filter.
* [ ] `/progress/exercises` lists only owned exercises with performed repetition facts in terminal
  workouts, newest activity first.
* [ ] Selecting an exercise shows route-backed Total reps, Heaviest weight, and Estimated 1RM
  metrics.
* [ ] Every chart point is reproducible from the displayed performed sets and one point represents
  one workout.
* [ ] Estimated 1RM uses the Epley formula with no repetition-count eligibility branch.
* [ ] Missing weight removes only the unavailable weight-derived point and never becomes zero.
* [ ] Completed and cancelled sessions remain explicitly distinguishable; in-progress, skipped, and
  unresolved work never contributes.
* [ ] Session history exposes exact repetitions, optional weight, and optional RIR and links to the
  canonical terminal workout.
* [ ] Chart content remains understandable by keyboard, touch, screen-reader-oriented text, and at
  every required responsive width.
* [ ] Loading, global empty, metric unavailable, not found, initial error, malformed response,
  pagination pending, and pagination failure all leave a clear recovery path.
* [ ] Later plan changes or deletion do not alter historical metrics or set facts.
* [ ] Today, catalog Exercises, workout execution, workout completion/cancellation, direct terminal
  retrieval, and user isolation regressions pass.
* [ ] Relevant backend tests, backend and frontend static checks, and focused manual UI validation
  pass.

## Tests

Backend tests cover:

* Exercise-list eligibility, ordering, latest snapshot name/date, and distinct session count.
* Empty list, authentication, ownership isolation, and in-progress/planned/skipped-only exclusion.
* Completed and partially performed cancelled workout inclusion.
* Multiple same-slug occurrences in one workout aggregating into one session.
* Exact total reps, heaviest weight, and Epley estimated-1RM calculations.
* Missing and zero weight, optional RIR, decimal weight, and unrestricted high-repetition Epley
  calculation.
* Newest-first detail ordering, default/custom limits, cursor continuation, and no duplication after
  insertion of a newer terminal workout.
* User/slug cursor mismatch, malformed cursor, invalid/repeated/unknown parameters, unknown catalog
  slug, and valid exercise with no owned history.
* Snapshot independence after routine changes or deletion.
* Duration/distance occurrences and other users' facts not influencing repetition analytics.

Frontend format, lint, and type checks cover the new routes, strict response parsers, metric URL
normalization, main-navigation selection, and preserved History redirect. Code inspection verifies
that null weight is not converted to zero, metric calculations are backend-owned, malformed initial
or appended data cannot replace confirmed content, and raw error payloads cannot render.

Per DEC-019, F20 adds no automated browser or other browser-level tests. Focused manual validation
covers all UI, responsive, navigation, chart-accessibility, loading, empty, unavailable, malformed,
error, pending, pagination, and Back/refresh states defined above.

## Out of Scope

* Goal-dependent interpretation, progress scores, recommendations, deterministic adaptation
  signals, AI analysis, or positive/negative trend classification.
* Session volume, set volume, estimated 1RM adjusted by RIR, personal records, percentages,
  comparisons, smoothing, forecasts, streaks, or achievements.
* Duration, distance, pace, assisted-load, or bodyweight-adjusted analytics.
* Body weight, measurements, photos, body composition, or a visible Body section.
* Exercise-history search, date ranges, routine/session filters, metric customization, exports, or
  sharing.
* Editing or deleting historical workouts or performed sets.
* Changes to workout capture, routine prescriptions, catalog definitions, or profile goals.

## Dependencies

* F05 — Exercise Catalog.
* F12 — Mobile-first UI System and Phase 1 UX Refresh.
* F13 — Start Workout.
* F14 and F14.2 — Performed sets and accurate set lifecycle.
* F15 and F15.1 — Workout exceptions and skip feedback.
* F17 — Workout Completion.
* F18 — Workout History.

## Notes

F20 intentionally establishes a factual analytical surface before defining what progress means for
strength, hypertrophy, fat loss, endurance, or another goal. Later features may add metrics or
interpretations, but they must continue to distinguish observed facts, deterministic projections,
and goal-dependent conclusions.
