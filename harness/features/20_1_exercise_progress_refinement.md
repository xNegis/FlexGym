# F20.1 — Exercise Progress Refinement

**Status:** Completed and product-owner validated on 2026-08-13.

## Objective

Refine F20's exercise-performance view so its charts represent weight-based performance rather
than raw repetition quantity, and let the user inspect the complete chart and detailed session
history within a meaningful rolling time period.

F20.1 removes `Total reps` as a selectable progress chart, makes `Estimated 1RM` the default chart,
retains `Heaviest weight` as the direct observed-load alternative, and introduces `1M`, `3M`, `6M`,
`1Y`, and `All` time ranges. The chart represents every qualifying session in the selected period
independently from the paginated textual history.

The feature remains factual and read-only. It does not decide whether a change is good or bad,
identify records or stagnation, infer muscle growth, or propose adaptations.

## Context

F20 established `Progress → Exercises`, a per-exercise session history, and selectable charts for
Total reps, Heaviest weight, and Epley Estimated 1RM. Its first implementation builds the chart from
the currently loaded history page, whose default size is 20 sessions.

Two product corrections are required:

* Total repetitions naturally rise and fall with load, set count, programming, and rep range. They
  are useful session facts but do not describe exercise progression by themselves.
* A time-range chart must represent the complete selected period. It must not initially show only
  the newest 20 sessions and reveal older points as textual pagination advances.

F14 permits an optional performed weight. Existing data may contain either `null` or `0` when no
meaningful external load was entered. For F20.1's weight-based projections, only a strictly positive
performed weight is a usable load observation. Persisted performed-set facts are not rewritten.

This specification supersedes only the affected chart, range, and zero-weight semantics of F20.
F20's ownership, terminal-workout eligibility, snapshot safety, exercise list, set traceability,
history pagination, and read-only boundaries remain in force.

## User Experience

### Canonical exercise-progress route

The existing route remains `/progress/exercises/{slug}`. It contains two independent route-backed
selectors:

1. Metric: `Estimated 1RM` and `Heaviest weight`.
2. Period: `1M`, `3M`, `6M`, `1Y`, and `All`.

`Estimated 1RM` and `3M` are the defaults. Their canonical URL contains neither `metric` nor
`period`:

```text
/progress/exercises/barbell-bench-press
```

Non-default examples are:

```text
/progress/exercises/barbell-bench-press?metric=heaviest_weight
/progress/exercises/barbell-bench-press?period=6m
/progress/exercises/barbell-bench-press?metric=heaviest_weight&period=1y
```

Changing either selector creates a normal browser-history entry. Refresh and Browser Back restore
the selected combination. Selection never mutates workout data.

Legacy `metric=total_reps`, unknown, empty, or repeated metric values normalize with replace
semantics to the default `Estimated 1RM` while preserving one valid period. Unknown, empty, or
repeated period values normalize to `3M` while preserving one valid metric. Unrelated query
parameters are removed. Canonicalization must not create a navigation loop.

### Time-range meaning

The browser supplies its current local calendar date using the same client-local-date convention
established by F13. The backend remains authoritative for calculating and applying the range.

The supported periods are rolling calendar windows ending on that supplied local date:

* `1M`: from one calendar month earlier through the supplied local date.
* `3M`: from three calendar months earlier through the supplied local date.
* `6M`: from six calendar months earlier through the supplied local date.
* `1Y`: from one calendar year earlier through the supplied local date.
* `All`: every eligible session through the supplied local date, with no lower boundary.

Both boundary dates are inclusive. Calendar subtraction preserves the day when possible and clamps
to the final valid day of the destination month when necessary. For example, one month before March
31 is the final day of February.

The chart's horizontal data extent begins at the oldest plotted session actually available inside
the period and ends at the newest. It does not reserve empty leading space back to the theoretical
period boundary. If `6M` is selected but only three months of qualifying data exist, those three
months use the chart's available width. A single qualifying session is shown as one isolated point.

### Complete chart and paginated history

The chart and textual history share the selected period but have separate loading boundaries:

* The chart receives every qualifying chart point in the period, ordered oldest to newest.
* The textual session history receives every eligible performed-repetition session in the period,
  ordered newest to oldest and paginated 20 at a time.
* Loading more textual history never changes or extends an already confirmed chart.
* Changing period clears the prior period presentation, requests the new complete chart and the
  first new history page, and resets pagination.
* Changing metric reuses the validated chart response because it contains both weight-based values;
  it does not need another backend request.

Each chart point remains one terminal workout for the selected exercise slug. Selecting or focusing
a point exposes the workout date, selected metric value, terminal status, session name, and all
ordered performed sets associated with that exercise in the workout. The paginated session history
remains the primary chronological textual record and links to canonical terminal-workout detail.

### Sessions without entered weight

A performed set with `performed_weight_kg = null` or `performed_weight_kg = 0` remains a historical
performed-set fact but supplies no weight-based chart observation.

* A session with no strictly positive performed weight creates no chart point.
* A session containing at least one strictly positive performed weight creates one point for both
  metrics, calculated only from its strictly positive weighted sets.
* Repetitions, RIR, and set ordering remain visible as factual context.
* Progress set detail does not render `0 kg` as though the user entered a meaningful load.
* Sessions without a chart point remain present in the textual history for the selected period.

If the period contains history but no session has a strictly positive weight, the Performance
section shows `No weight data to chart` and explains that a positive performed weight is required.
It does not render an empty axis, a zero line, or fabricated points. The period selector and
session history remain available.

If at least one qualifying session exists, the chart renders all and only the qualifying points.
Non-qualifying sessions do not create gaps connected through zero.

## Functional Requirements

### FR-1 — Metric correction

Remove `Total reps` from the metric selector and every chart-specific type, label, explanation,
axis unit, route, and parser branch. The selectable chart metrics are exactly:

* `estimated_1rm` — labelled `Estimated 1RM`.
* `heaviest_weight` — labelled `Heaviest weight`.

`Estimated 1RM` is the canonical default represented by an absent `metric` query parameter.
`Heaviest weight` uses `metric=heaviest_weight`.

Continue returning and displaying `total_reps` in each textual session summary. Continue displaying
performed repetitions for every performed set. F20.1 changes the interpretation and presentation
of Total reps, not the underlying facts.

Always label the calculated metric `Estimated 1RM`; neither UI nor API documentation may shorten it
to an observed `1RM`, `Max strength`, or personal record.

### FR-2 — Positive observed-weight rule

For F20.1 weight-based metrics, a qualifying weighted set has:

```text
performed_weight_kg > 0
```

Null and zero values are excluded from both calculations.

For one terminal workout and exercise slug:

```text
heaviest_weight_kg = maximum qualifying performed_weight_kg
```

For each qualifying weighted set:

```text
estimated_1rm_kg = performed_weight_kg × (1 + performed_repetitions / 30)
```

The workout's `estimated_1rm_kg` is the maximum result across those qualifying sets. There remains
no repetition-count eligibility threshold and RIR does not adjust the formula. Both public metric
values are null when the session has no strictly positive performed weight. Estimated 1RM is
rounded to two decimals by the backend; UI formatting may show at most one decimal without changing
comparisons.

The projection rule does not mutate `PerformedSet`, change workout capture validation, infer a load
from the plan or catalog, copy another set's load, or globally redefine zero outside Progress.

### FR-3 — Route-backed periods

Support exactly `1m`, `3m`, `6m`, `1y`, and `all` as internal period values, with the user-facing
labels defined in User Experience. `3m` is canonical and represented by an absent `period` query
parameter.

Metric and period are independent URL state. Changing one preserves the other when valid. Changing
period invalidates all currently loaded chart and history data, discards the old pagination cursor,
and requests the new range from its first page. Late responses for an earlier period or exercise
must not replace current content.

### FR-4 — Authoritative period calculation

Every chart and history request carries the browser's current strict `YYYY-MM-DD` local calendar
date. The backend validates that it is a real date and derives the inclusive lower boundary for the
requested period. Both endpoints return the normalized period, calculated lower boundary or null,
and inclusive through-date so the frontend can validate that both responses describe the requested
window.

Range membership uses `WorkoutSession.local_date`, not UTC terminal timestamps or performed-set
timestamps. Within and across equal local dates, existing terminal timestamp and workout-ID
ordering remains authoritative.

The supplied local date is read context, not a persisted fact or user preference. F20.1 does not
introduce timezone settings or infer a timezone at the backend.

### FR-5 — Complete chart projection

Return one chart item for every owned completed or cancelled workout in the selected period that:

* contains the selected exercise slug in a repetition-target workout snapshot;
* contains at least one performed set for that occurrence; and
* contains at least one strictly positive performed weight among the qualifying sets.

Multiple occurrences of the same slug in one workout aggregate into one item. Include all performed
sets from those repetition-target occurrences as ordered point-detail context, including sets whose
weight is null or zero. Only strictly positive weights influence the two metrics.

Order chart items by local date ascending, terminal timestamp ascending, and workout ID ascending.
The response covers the complete requested period and has no cursor, page size, artificial point
limit, sampling, averaging, or downsampling.

The chart's x-domain is the returned data extent rather than the selected window boundary. It must
not imply that the earliest observed point occurred at the period boundary. Same-day workouts
remain distinct, stably ordered points with their actual date exposed in accessible detail.

### FR-6 — Period-scoped textual history

The existing history projection remains one item per owned terminal workout with at least one
performed repetition set for the slug, whether or not it has positive weight. Apply the selected
inclusive local-date window before ordering and pagination.

Keep newest-first terminal timestamp and workout-ID ordering, a default/frontend page size of 20,
and the accepted limit range of 1 through 50. Cursors must be bound to user, exercise slug, selected
period, supplied through-date, and the page boundary. A cursor issued for a different context is
invalid and returns `422`; it never falls back to a first page.

`total_reps`, every performed repetition, optional RIR, and raw optional performed weight remain in
the API response for factual traceability. Session-level `heaviest_weight_kg` and
`estimated_1rm_kg` follow FR-2 and are therefore null for zero-only or missing-weight sessions.

### FR-7 — Empty and unavailable distinctions

The API/UI must distinguish:

1. Unknown catalog exercise: recoverable not-found state.
2. Valid exercise with no owned eligible history at any date: global exercise-history empty state.
3. Exercise with history, but no sessions inside the selected period: period-empty state.
4. Period with session history but no strictly positive weight: chart-unavailable state with the
   session history still visible.
5. Period with at least one positive-weight session: complete chart plus textual history.

An exercise remains listed on `/progress/exercises` when it has performed repetition facts even if
all of its weights are null or zero.

### FR-8 — Independent request recovery

The complete chart and first textual history page may load independently. The screen frame,
exercise identity when known, both selectors, and the other successfully validated section remain
available when one request fails.

* Chart request or malformed-response failure shows `Unable to load this chart. Please try again.`
  with a chart-owned `Retry`.
* Initial history request or malformed-response failure shows `Unable to load exercise history.
  Please try again.` with a history-owned `Retry`.
* Load-more failure retains all confirmed sessions and shows `Unable to load more history. Please
  try again.` with an inline `Retry`.
* No raw framework validation array, malformed value, or server payload reaches rendered UI.

Content from a prior period must not remain visible under a newly selected period label because it
would misrepresent the selected range. Pending state preserves layout rather than invented facts.

### FR-9 — Read-only and regression safety

F20.1 creates no mutation. It does not edit, correct, reopen, delete, resume, complete, cancel, or
annotate a workout. Later plan edits and deletions must not change historical workout snapshots,
performed-set facts, or calculated points.

Preserve the Progress exercise list, workout-history section and filters, terminal-workout detail,
old `/history` redirects, Today and live-workout flows, catalog Exercises, and ownership isolation.

## Domain / Data Requirements

F20.1 adds no entity, persisted aggregate, event type, column, table, or database migration.

Time ranges, Heaviest weight, and Estimated 1RM remain deterministic read-time projections over
owned workout snapshots and performed facts. Calculation and filtering belong in the backend
Progress service, not HTTP endpoints or React components. The frontend validates metric invariants
but does not become the authoritative calculator.

The complete chart query loads only workouts and performed-set facts required for the selected
exercise and period. It must not load full workout event timelines, exceptions, unrelated
exercises, or current routine graphs. The paginated history query remains independently bounded.

One workout remains the aggregation identity even when the slug occurs multiple times. No separate
analytics-session or time-range entity is persisted.

## API Requirements

All endpoints use existing cookie authentication and return `401` when unauthenticated. Query
parameters are accepted at most once. Unknown, repeated, empty, or unsupported parameters return
framework-compatible `422` validation detail.

### `GET /api/progress/exercises/{exercise_slug}/chart`

Required query parameters:

* `period`: exactly one of `1m`, `3m`, `6m`, `1y`, or `all`.
* `local_date`: a strict real calendar date in `YYYY-MM-DD` format.

Returns `200`:

```json
{
  "exercise": {
    "slug": "barbell-bench-press",
    "name": "Barbell Bench Press"
  },
  "range": {
    "period": "3m",
    "from_local_date": "2026-05-13",
    "through_local_date": "2026-08-13"
  },
  "has_any_history": true,
  "items": [
    {
      "workout_id": 42,
      "routine_name": "Upper / Lower",
      "selected_training_day_name": "Upper A",
      "local_date": "2026-08-12",
      "status": "completed",
      "terminal_at": "2026-08-12T18:41:15Z",
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
  ]
}
```

For `all`, `from_local_date` is null. `items` is oldest first and contains only positive-weight
chart sessions. `has_any_history` is based on eligible performed-repetition history at any date and
is not restricted by period or positive weight.

Responses:

* `200` with empty `items` for valid global-empty, period-empty, or weight-unavailable cases; the
  combination of `has_any_history` and the history response distinguishes them.
* `404 {"detail": "Exercise not found"}` for an unknown catalog slug.
* `422` for missing, malformed, repeated, unsupported, or unknown parameters.

### `GET /api/progress/exercises/{exercise_slug}/history`

Required query parameters:

* `period`: exactly one supported period.
* `local_date`: a strict real calendar date in `YYYY-MM-DD` format.

Optional query parameters:

* `cursor`: an opaque non-empty token issued for this exact history context.
* `limit`: a strict integer from 1 through 50; defaults to 20.

The F20 response gains `range` and `has_any_history`; its `exercise`, `items`, and `next_cursor`
remain. Items are newest first, scoped to the selected period, and include zero/null-weight sessions:

```json
{
  "exercise": {
    "slug": "barbell-bench-press",
    "name": "Barbell Bench Press"
  },
  "range": {
    "period": "3m",
    "from_local_date": "2026-05-13",
    "through_local_date": "2026-08-13"
  },
  "has_any_history": true,
  "items": [],
  "next_cursor": null
}
```

Responses preserve F20's `401`, safe catalog `404`, and cursor `422` contracts. A valid exercise
with history outside the period returns empty `items`, `next_cursor: null`, and
`has_any_history: true`. A valid exercise with no owned eligible history returns the same empty page
with `has_any_history: false`.

### `GET /api/progress/exercises`

Preserve F20's no-query list contract and eligibility. Do not remove zero/null-weight exercises or
change their session counts merely because they cannot currently produce a weight-based chart.

### Existing APIs

Preserve `/api/workouts/history`, owned workout retrieval, exercise catalog endpoints, workout
execution mutations, and all existing status and validation contracts. F20.1 must not duplicate the
complete terminal-workout representation or change performed-set persistence.

## UI Requirements

F20.1 follows `harness/context/07_UI_DESIGN_SYSTEM.md` completely and introduces no parallel visual
language.

Reuse `AppShell`, `AppHeader` or `ScreenHeader`, `Page`, `Section`, `Stack`, `Inline`, `SectionNav`,
`Badge`, `Button`, `Alert`, `EmptyState`, and `LoadingState`. Reuse the existing exercise chart
component and improve it where required. If the existing `SectionNav` cannot present five compact
time ranges with 44 px targets, wrapping, keyboard focus, and no document overflow, introduce one
small shared time-range navigation primitive suitable for F21 and F23 rather than a feature-local
control.

The mobile hierarchy is:

1. Exercise identity and Back action.
2. Time-range selector.
3. Metric selector.
4. Performance chart or contained unavailable state.
5. Explanation of the selected metric.
6. Newest-first session history and stable Load more location.

This read-only screen has no mutation or dominant submit action. In empty/error states, `Retry`,
`View all history`, or `Back to exercises` may become the single dominant recovery action at the
boundary that owns it.

### Loading and range changes

Initial loading preserves the expected selector, chart, and history shapes without showing false
empty content. On a period change, immediately reflect the new route state and replace old-period
facts with contained loading states. A metric change updates the validated chart locally without
resetting history or focus unexpectedly.

Chart and history requests may resolve independently. Confirmed history remains visible during a
chart retry; a confirmed chart remains visible during a history retry. Load more retains both.

### Empty, unavailable, and error states

* Global empty: `No recorded performance for this exercise`, with `Back to exercises`.
* Period empty: `No sessions in this period`, with a short explanation and `View all history` when
  `All` is not already selected.
* Weight unavailable: `No weight data to chart`, explaining that no positive performed weight was
  recorded in the period. Keep period selection and factual session history visible.
* Unknown exercise: existing recoverable not-found state with `Back to exercises`.
* Chart failure: contained Alert and chart-owned `Retry`.
* Initial history failure: contained Alert and history-owned `Retry`.
* Pagination pending/failure: preserve confirmed data and the existing stable recovery location.

### Chart semantics and accessibility

Both metrics use kilograms and retain a data-adaptive vertical range. The chart never substitutes
zero for missing weight, anchors a positive-weight series to zero, or uses a zero-only session to
create a point.

Every returned session is represented without sampling. The oldest returned item is the first
point and the newest is the last. The visible chart begins at the first actual point, not the
selected period boundary. It does not apply smoothing, forecasts, regression, goal ranges,
positive/negative colors, trend arrows, percentage changes, records, or claims of progress.

The chart remains supplementary to semantic data. It provides:

* A visible title naming the exercise and selected metric.
* Explicit date context and `kg` y-axis units.
* Keyboard and touch access, or an equivalent adjacent semantic control/list, for every point in
  chronological order even when visual points are too dense for distinct 44 px targets.
* A selected/focused state that does not rely on color.
* Point detail available without hover and containing all performed sets.
* Reduced-motion support and no animation required for comprehension.

Dense histories, same-day workouts, long names, decimal kilograms, isolated points, mixed terminal
statuses, 200% zoom, and every period must remain usable without document-level horizontal
overflow. The chart adapts to content width; core meaning must not require horizontal panning.

Validate direct navigation, refresh, Browser Back, legacy Total reps URLs, metric changes, period
changes, empty/unavailable/error states, and pagination at 360, 390, and 430 px, representative
tablet/small desktop, and wide desktop widths. Verify visible focus, logical headings and landmarks,
44 px controls, touch operation, safe areas, reduced motion, and absence of document-level
horizontal overflow.

## Business Rules

* Estimated 1RM is the default because it combines observed load and repetitions; it remains a
  deterministic estimate, not an observed maximum lift.
* Heaviest weight is a direct observation of the greatest strictly positive external load recorded
  in one session.
* Total repetitions are session activity facts, not a standalone exercise-progress chart.
* Only performed repetition-target sets in owned terminal workouts are eligible.
* Performed facts in a subsequently cancelled workout remain eligible; status stays explicit.
* Positive performed weight means `performed_weight_kg > 0`. Null and zero mean no usable entered
  load for these Progress metrics.
* A session with mixed positive, zero, and null weights is calculated only from positive weights;
  all performed sets remain contextual facts.
* Every chart point is one workout, never one set or a smoothed time bucket.
* The chart covers every qualifying workout in the selected range independently of textual
  pagination.
* Period membership uses the workout's captured local date and inclusive rolling calendar bounds.
* The visible data extent starts at the oldest available plotted workout, not the theoretical range
  boundary.
* A metric increase or decrease has no built-in positive, negative, warning, or success meaning.
* All Progress data remains read-only, snapshot-safe, and user-owned.

## Validation

* `period` accepts exactly `1m`, `3m`, `6m`, `1y`, or `all`; booleans, case variants, whitespace,
  unsupported values, duplicates, and empty values are invalid.
* `local_date` is exactly one real `YYYY-MM-DD` date; timestamps and impossible dates are invalid.
* Returned range boundaries match calendar subtraction and are inclusive.
* Every chart item has at least one positive-weight performed set, belongs to the authenticated
  user, falls inside the returned range, and comes from a terminal workout.
* Chart items are strictly ordered by local date, terminal timestamp, and workout ID ascending with
  no duplicate workout IDs.
* History items are newest first by terminal timestamp and workout ID and fall inside the same
  range.
* `heaviest_weight_kg` is null exactly when a history session has no positive performed weight;
  otherwise it equals the maximum positive weight.
* `estimated_1rm_kg` is null on the same condition; otherwise it equals the maximum positive-weight
  Epley result rounded to two decimals.
* Raw set weights remain finite and non-negative; zero remains permitted as a raw historical field
  but cannot produce or affect a chart metric.
* Each chart point's complete ordered set facts reproduce its returned metrics under the positive
  weight rule.
* Chart responses contain the complete qualifying period without pagination or downsampling.
* History cursors cannot cross user, slug, period, through-date, or page-boundary context.
* Malformed responses cannot replace confirmed frontend state.
* F20.1 adds no migration. Before completion, compare the configured local database revision with
  repository Alembic head; no fresh/upgrade migration gate is introduced by this feature.

## Acceptance Criteria

* [ ] Exercise charts offer exactly Estimated 1RM and Heaviest weight.
* [ ] Estimated 1RM and 3M are canonical defaults and survive refresh and Browser Back.
* [ ] Total reps is absent from chart selection but remains visible in factual session history.
* [ ] Legacy `metric=total_reps` safely normalizes to Estimated 1RM.
* [ ] The period selector offers exactly 1M, 3M, 6M, 1Y, and All.
* [ ] Metric and period changes preserve each other's valid URL state and create useful browser
  history entries.
* [ ] Both chart and session history use the same backend-calculated inclusive local-date range.
* [ ] The chart includes every qualifying session in the period even before any Load more action.
* [ ] The first plotted point is the oldest qualifying session actually present in the period, with
  no empty leading span to the theoretical period boundary.
* [ ] Loading more session history never changes a confirmed chart.
* [ ] Changing period resets history pagination and stale responses cannot replace the new period.
* [ ] Null and zero weights create no chart observation or visible `0 kg` Progress load.
* [ ] Mixed sessions calculate both metrics only from strictly positive weights.
* [ ] A zero/null-only period shows `No weight data to chart` while retaining session facts.
* [ ] At least one positive-weight session produces a chart containing all qualifying points and no
  fabricated zeros.
* [ ] Every point exposes its date, value, status, session identity, and ordered performed sets by
  keyboard and touch.
* [ ] Global empty, period empty, chart unavailable, not found, independent request failure,
  malformed response, pagination pending, and pagination failure each provide clear recovery.
* [ ] Completed and cancelled statuses remain explicit, and in-progress/planned/skipped/unresolved
  work does not become performed performance.
* [ ] Exercise list eligibility and counts continue to include historical performed-repetition
  sessions without positive weight.
* [ ] Today, live workout execution, workout completion/cancellation, Progress Workouts, terminal
  detail, catalog Exercises, and ownership isolation regressions pass.
* [ ] Backend tests, backend/frontend static checks, and focused manual UI validation pass.

## Tests

Backend tests cover:

* Default supported period values at the service boundary and strict endpoint parameter validation.
* Calendar-month/year subtraction, end-of-month clamping, inclusive lower/upper dates, and `all`.
* Complete oldest-first chart ordering across more than 20 eligible sessions.
* The chart beginning at the oldest actual qualifying session when data covers less than the
  selected period.
* One-point, same-day multi-workout, completed, and partially performed cancelled histories.
* Null-only, zero-only, mixed null/zero, and mixed zero/positive sessions.
* Positive-only Heaviest weight and unrestricted Epley calculations, including decimal weights and
  high repetitions.
* Textual history including zero/null-only sessions while chart items exclude them.
* Period-empty versus global-empty responses and unknown catalog slug.
* History pagination within a period and rejection of cursor reuse across user, slug, period, or
  through-date.
* User isolation, snapshot independence, target-type exclusion, and preservation of the exercise
  list contract.

Frontend format, lint, and type checks cover:

* Metric and period URL parsing/canonicalization, including legacy Total reps links.
* Strict validation of range metadata, complete chart items, positive-weight metric invariants,
  history pages, cursors, and error fallbacks.
* Removal of Total reps chart branches while retaining session totals and performed repetitions.
* Independent chart/history request state, stale-response protection, range resets, and metric
  switching without refetching.

Per DEC-019, F20.1 adds no automated browser or other browser-level tests. Focused manual validation
covers every responsive, accessibility, navigation, loading, empty, unavailable, error, malformed,
pagination, dense-chart, same-day, and zero-weight state defined above. Code inspection verifies
that zero is not converted to a chart point, the frontend does not calculate authoritative metrics,
all-period chart data is not silently paginated/downsampled, and raw errors cannot render.

## Out of Scope

* Max-repetition charts, Total reps charts, volume, set volume, tonnage, or workload scores.
* Personal records, percentage comparisons, trend judgements, stagnation detection, or exercise
  ranking.
* Smoothing, forecasts, regression, goal ranges, recommendations, adaptation signals, or AI.
* RIR-adjusted Estimated 1RM or repetition-count eligibility thresholds.
* Bodyweight-adjusted, assisted-load, duration, distance, pace, or isometric analytics.
* Workout statistics, consistency, adherence, body weight, body progress, or the Progress dashboard.
* Custom date ranges, calendar-period filters, routine/session filters, exports, or sharing.
* Editing historical workouts or performed sets, changing workout capture, or converting persisted
  zero values to null.
* Timezone profile settings or backend timezone inference.

## Dependencies

* F05 — Exercise Catalog.
* F12 — Mobile-first UI System and Phase 1 UX Refresh.
* F13 — Client-local workout date convention.
* F14 and F14.2 — Performed sets and observed weight facts.
* F15 and F15.1 — Workout exceptions and skip feedback.
* F17 — Workout Completion.
* F18 — Workout History.
* F20 — Progress Area and Exercise Performance History.

## Notes

The complete chart response is deliberately separate from paginated textual history. This keeps
each contract honest: the chart answers for the whole selected period, while the list remains
incrementally readable on mobile. Future optimization must preserve every point or introduce a new,
explicitly specified aggregation model; it must not silently sample the series.
