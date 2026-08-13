# F21 — Workout Statistics and Activity Trends

## Objective

Add a factual Statistics perspective to Progress. It lets the user review recorded workout
outcomes, performed and skipped work, elapsed session time, structured skip reasons, weekly
activity, and days with recorded workout activity over a selected rolling period.

F21 reports what was recorded. It does not decide whether the amount, frequency, duration,
completion ratio, or temporal change is good, bad, sufficient, adherent, or actionable.

## Context

F18 provides terminal-workout history. F20 and F20.1 establish Progress as the home for
user-owned, read-time historical projections and the route-backed `1M`, `3M`, `6M`, `1Y`, and
`All` range convention. F15 and F15.1 provide effective structured skips, including
`pain_or_discomfort`; F17 establishes terminal workout outcomes.

DEC-024 defines the F21 analytical population and meanings. F21 must not reconstruct expected
workouts or reinterpret terminal-session completion as plan adherence.

## User Experience

`/progress/statistics` is a third route-backed Progress section alongside Workouts and Exercises.
It defaults to the canonical `3M` period. As in F20.1, the default omits `period` from the URL;
valid non-default periods are preserved. Refresh and Browser Back restore the selected period.

The screen presents a selected-period summary, weekly workout outcomes, weekly recorded work,
skip-reason distribution, and a compact activity calendar. It has no mutation or dominant submit
action; the range selector and contained Retry controls are the relevant actions.

## Functional Requirements

### FR-1 — Statistics route and Progress navigation

Add the protected `/progress/statistics` route and a `Statistics` link to the shared Progress
section navigation on Workouts, Exercises, and Statistics. `/progress` still redirects to
`/progress/workouts`; F21 does not implement the F24 dashboard.

The route accepts only one optional `period` query parameter: `1m`, `3m`, `6m`, `1y`, or `all`.
Missing, empty, repeated, unknown, or unsupported values are client-normalized to the canonical
default. The current local calendar date is supplied to the API, but is not URL state.

### FR-2 — One shared inclusive rolling period

The selector offers exactly `1M`, `3M`, `6M`, `1Y`, and `All`, with `3M` default. Reuse F20.1's
backend calendar-month/year subtraction, end-of-month clamping, and inclusive range bounds.

Every F21 value uses the same period. A terminal workout belongs through its immutable captured
`local_date`, even if start or terminal server timestamps cross midnight. `All` has no lower bound
and includes every owned terminal workout through the supplied local date.

### FR-3 — Terminal workout summary

Only owned `completed` and `cancelled` sessions contribute. In-progress sessions, plan-only data,
unresolved cancelled work, schedule positions, and current routine data do not.

The period summary contains:

* Completed workout count.
* Cancelled workout count.
* Terminal workout count, equal to completed plus cancelled.
* Completion ratio: completed divided by terminal workouts, as a percentage, or unavailable when
  no terminal workout exists.
* Performed-set count, including persisted performed facts in a subsequently cancelled workout and
  all target types.
* Skipped-set count: distinct planned-set snapshots effectively skipped and not performed.
* Skipped-exercise count: effective exercise-scoped skips. It is a separate unit and is never added
  to skipped sets.
* Total recorded elapsed session seconds.

The UI labels the ratio `Completion ratio`, shows its numerator and denominator, and explains that
it concerns started terminal workouts. It never calls it adherence or describes cancellation as a
failure. Duration is labelled `Recorded elapsed session time` and explains that it is wall-clock
time from start to completion/cancellation, not time under tension.

### FR-4 — Effective skip reasons

Use the effective terminal exception projection, not a count of historical events. A skip later
reversed contributes nothing. A set counts at most once even where scope overlap is possible. An
exercise skip counts once as an exercise and covers each remaining unperformed planned set for the
separate skipped-set total.

Return a distribution of effective skip actions, not inferred quantities of covered sets. Every
row reports separate set-scope and exercise-scope counts for its persisted reason. `null` is valid
and displays as `No reason provided`; it must not be inferred as another reason. Only non-zero
categories appear. The supported codes are `not_enough_time`, `too_fatigued`,
`equipment_unavailable`, `unable_to_perform`, `pain_or_discomfort`, and `other`.

Frontend content maps those codes to English labels, does not expose raw codes or free-text notes,
and labels the unit `skip actions`. `Other` remains a code; F21 does not classify its note.

### FR-5 — Complete weekly views

Return a complete ascending sequence of Monday-through-Sunday weekly buckets that intersects the
selected period. For rolling periods it starts on the Monday containing the lower bound and ends on
the Sunday containing the through date. For `All`, it starts at the Monday containing the first
owned terminal-workout local date; when none exists it is empty.

Each bucket separately returns completed/cancelled workout counts, performed-set count, and total
elapsed seconds. It contains only facts whose captured local date is inside the selected period, so
boundary weeks may be partial. The UI makes the selected period visible and does not imply that
those boundary weeks are full comparisons.

Show a weekly workouts view with status counts distinguishable by text and pattern/legend, not
color alone. Show a weekly recorded-work view that locally switches between performed sets and
recorded elapsed session time. Each equivalent semantic weekly table is initially collapsed behind
its own quiet `View weekly details` control and expands in place; its control updates to `Hide
weekly details`. The table contains every returned week and its values so dense bars are never the
only representation, while the initial screen remains scannable. Do not smooth, interpolate,
forecast, regress, rank, add targets, arrows, percentage-change badges, or positive/negative
meaning.

### FR-6 — Activity calendar

Return every active local day in the selected range in ascending order. An active day has one or
more owned terminal workouts and separately reports completed/cancelled counts; a mixed day is one
entry with both counts.

The compact calendar covers the range start through the through date. For `All`, it starts at the
month containing the first active day, and is empty when there is none. It never invents activity
for blank days. Each active day exposes its total terminal-workout count. When a day contains a
cancelled workout, it also shows a compact `C` cancellation count; a cancelled-only day uses the
existing warning treatment and pattern, explained by a visible legend. The visual calendar itself
retains equivalent accessible text, for example: `12 August — 2 workouts: 1 completed, 1
cancelled`; no separate activity-day list is rendered below it. Blank days explicitly read as no
recorded terminal workout.

Color may support scanning, but cannot be the sole cue. Where seven 44-pixel day targets cannot fit
at narrow widths or 200% zoom, replace the visual grid with the ordered activity-day list rather
than tiny targets or document-level horizontal scrolling.

### FR-7 — Read-only safety and request recovery

Statistics is read-only, user-owned, and snapshot-safe. It does not alter workouts, performed
facts, exceptions, events, routine snapshots, or plans. Later routine, catalog, activation, profile,
or deletion changes cannot alter retained workout facts or aggregates.

Use one recoverable request. Initial loading preserves section navigation, the range selector, and
summary/weekly/calendar shapes without displaying false zeroes or empty content. On a range change,
the route updates immediately and old-period data is replaced by contained loading; stale responses
cannot replace the requested period.

Request, network, non-success, or malformed-response failure shows `Unable to load workout
statistics. Please try again.` and a contained Retry while retaining navigation and range state. A
zero-terminal-workout response is a factual empty state, not fabricated chart points. Raw framework
validation arrays, malformed fields, unsupported reason values, and untrusted messages never reach
rendered UI.

## Domain / Data Requirements

F21 adds no entity, persisted aggregate, event type, column, table, or database migration.

Values are deterministic read-time projections over owned terminal workout snapshots, performed
sets, effective exceptions, and server timestamps. Aggregate logic belongs in the backend Progress
service, not endpoints or React components. The API is the authoritative calculator; frontend API
code validates the complete response and its internal invariants before changing confirmed state.

The implementation may extract the F15/F18 effective-exception projection into a shared helper if
it preserves existing behaviour. It must not create mutable analytics state or use historical skip
events instead of effective exceptions. Queries must not load current routine graphs, full event
timelines, catalog records, or free-text exception notes unnecessarily.

## API Requirements

All endpoints use existing cookie authentication and return `401` when unauthenticated.

### `GET /api/progress/statistics`

Required query parameters:

* `period`: exactly one of `1m`, `3m`, `6m`, `1y`, or `all`.
* `local_date`: exactly one strict real `YYYY-MM-DD` date.

No other query parameter is accepted. Missing, empty, repeated, malformed, case-variant, or
unsupported parameters return framework-compatible `422` detail. The endpoint returns `200` for
an empty period:

```json
{
  "range": {
    "period": "3m",
    "from_local_date": "2026-05-13",
    "through_local_date": "2026-08-13"
  },
  "summary": {
    "completed_workout_count": 12,
    "cancelled_workout_count": 2,
    "terminal_workout_count": 14,
    "completion_ratio_percent": 85.71,
    "performed_set_count": 126,
    "skipped_set_count": 7,
    "skipped_exercise_count": 1,
    "total_elapsed_seconds": 48120
  },
  "weeks": [
    {
      "week_start_local_date": "2026-08-10",
      "week_end_local_date": "2026-08-16",
      "completed_workout_count": 2,
      "cancelled_workout_count": 1,
      "performed_set_count": 24,
      "total_elapsed_seconds": 7800
    }
  ],
  "activity_days": [
    {
      "local_date": "2026-08-12",
      "completed_workout_count": 1,
      "cancelled_workout_count": 0
    }
  ],
  "skip_reasons": [
    {
      "reason_code": "pain_or_discomfort",
      "set_skip_action_count": 2,
      "exercise_skip_action_count": 0
    }
  ]
}
```

`completion_ratio_percent` is null exactly when terminal count is zero; otherwise it is
`completed / terminal * 100`, consistently rounded to two decimals. Counts are whole non-negative
integers; durations are whole non-negative seconds. Weeks are unpaginated, complete, unique,
Monday-ascending buckets. Active days are unpaginated, unique, ascending, and inside the range.
Reason rows are non-zero, non-duplicated, follow the fixed code order above (null last), and contain
no notes.

Existing Progress/workout APIs retain their route, response, validation, ownership, and error
contracts. F21 neither extends history pagination nor duplicates terminal-workout detail.

## UI Requirements

F21 follows `harness/context/07_UI_DESIGN_SYSTEM.md` completely and creates no parallel visual
language. Reuse `AppShell`, `AppHeader`, `Page`, `Section`, `Stack`, `Inline`, `SectionNav`, `Card`,
`Badge`, `Button`, `Alert`, `EmptyState`, and `LoadingState`. Reuse or extract the F20.1 time-range
navigation only if it already meets the shared five-range contract.

Mobile information hierarchy:

1. Progress header and concise factual description.
2. Progress section navigation.
3. Time-range selector.
4. Period summary: terminal outcomes, completion ratio, performed/skipped work, elapsed time.
5. Weekly workouts and recorded-work views plus semantic weekly list.
6. Skip-reason distribution.
7. Activity calendar or narrow/zoom semantic activity-day list.

No dashboard framework or generalized analytics library is needed. A small F21 component may own
this factual composition; extract a shared primitive only when another implemented feature has the
same accessibility and interaction contract.

No summary card or visualization may communicate success/failure, on-track/off-track, good/bad,
record, streak, or trend judgement through color, arrows, badges, or copy. Completed and cancelled
are always plain text labels. The completion-ratio explanation is visible near its value, not
tooltip-only.

### States and validation

* Initial load is a labelled Statistics skeleton/status without zero-value, empty-chart, or
  empty-calendar flashes.
* An empty period says `No recorded workouts in this period`, retains section/range controls, and
  offers `View all activity` when the selected period is not All.
* Empty skip distribution says `No recorded skips in this period`; it is neither an error nor
  success claim.
* Empty weekly/calendar sections explain that terminal workouts appear after completion or
  cancellation.
* On error or malformed response, retain section/range context and show the documented Retry alert.
  Confirmed content is never replaced by unvalidated data.

The local performed-sets/elapsed-time switch does not refetch, alter the URL, or move focus
unexpectedly. Validate direct navigation, refresh, Browser Back, populated, no-period-activity,
empty-skips, loading, error, malformed-response, dense-week, dense-day, long-All, mixed-status,
pain/discomfort, and null-reason states at 360 px, 390 px, 430 px, representative tablet/small
desktop, and wide desktop. Verify logical headings/landmarks, visible focus, link semantics,
keyboard/touch access, 44-pixel targets, safe areas, 200% zoom, reduced motion, and no
document-level horizontal overflow.

## Business Rules

* F21 is factual activity reporting, never progress interpretation, plan adherence, or coaching.
* Completed and cancelled are never merged into one displayed outcome.
* Completion ratio is unavailable, not `0%`, where no terminal workout exists.
* Terminal membership uses captured `local_date`, not timestamp-derived timezone inference.
* Performed sets include every target type and retained cancelled-workout fact.
* Skipped sets count effective covered planned-set snapshots; reason rows count exceptions and may
  therefore differ from skipped-set count.
* Reversed skips contribute to none of the statistics.
* Recorded elapsed time is `max(0, terminal_at - started_at)`; it says nothing about lifting, rest,
  intensity, or quality.
* Weeks run Monday through Sunday and include only facts inside the selected range.
* Multiple terminal workouts on one local date create one calendar entry with separate outcomes.
* All output remains read-only, deterministic, snapshot-safe, and user-owned.

## Validation

* Period accepts exactly the five documented values; booleans, whitespace, case variants,
  duplicates, empties, and unknown values are invalid.
* Local date is exactly one real `YYYY-MM-DD` value.
* Every summary, week, day, and reason value is reproducible from owned terminal facts in the
  returned inclusive range.
* In-progress sessions, another user's data, plan-only/unresolved work, current routine data, and
  reversed exceptions cannot influence a response.
* Terminal count equals completed plus cancelled. A non-null ratio is finite, 0–100 inclusive, and
  uses that denominator exactly.
* Weeks are unique, ascending Monday/Sunday buckets; days are unique ascending active dates;
  reasons are supported/null positive-action rows with no raw note.
* F21 has no migration. Before completion compare the configured local database revision with the
  repository Alembic head; fresh/upgrade migration validation is not an F21 gate.

## Acceptance Criteria

* [ ] Progress exposes accessible Workouts, Exercises, and Statistics routes without changing
  primary navigation.
* [ ] Statistics has canonical route-backed five-period selection with 3M default and correct
  refresh/Back behaviour.
* [ ] One inclusive local-date range scopes summary, weekly views, reason distribution, and calendar.
* [ ] Completed and cancelled are separate; completion ratio exposes its denominator, becomes
  unavailable with zero terminal workouts, and is never called adherence.
* [ ] Performed sets retained after cancellation count; unresolved work does not.
* [ ] Effective skipped sets/exercises/reasons exclude reversals and distinguish exception actions
  from covered sets. Pain/discomfort and omitted reasons render as factual categories.
* [ ] Elapsed session time is explicitly named and never presented as time under tension or quality.
* [ ] Complete accessible weekly data and calendar contain no sampling, invented activity,
  color-only meaning, or document-level overflow.
* [ ] Empty/loading/error/malformed/range-transition/dense-data/focus/touch/zoom states preserve
  context and recovery.
* [ ] Today, live workout, completion/cancellation, terminal detail, both existing Progress
  sections, History redirect, user isolation, and ownership regressions pass.
* [ ] Backend tests, backend/frontend static checks, and focused manual UI validation pass.

## Tests

Backend tests cover:

* Authentication, ownership, empty period, and All range.
* Strict query/date validation, inclusive bounds, end-of-month clamping, and weekly buckets.
* Completed-only, cancelled-only, mixed, same-day multiple-workout, partial-boundary-week, and
  captured-local-date crossing-midnight cases.
* Summary/ratio/duration/performed-set calculations, including cancelled repetition, duration, and
  distance facts.
* Set/exercise/partial/reasonless/pain/other/reversed skips and no duplicate covered-set count.
* Reconciliation of summary, weekly, day, and reason projections plus ordering and complete buckets.
* Snapshot independence and no regression to existing Progress/workout-history contracts.

Frontend format, lint, and type checks cover route/query canonicalization, section navigation,
strict parsing of range/summary/week/day/reason invariants, labels/fallbacks, and stale-response
protection. Per DEC-019, F21 adds no automated browser tests. Focused manual validation covers the
states above; inspection verifies backend-owned calculations, validated response data, effective
exceptions rather than raw events, and no adherence/value-judgement copy.

## Out of Scope

* Adherence, missed-workout detection, expected-workout comparison, intentional-rest inference,
  targets, streaks, scores, records, achievements, reminders, or notifications.
* Volume/tonnage, explicit load semantics, muscle distribution, rankings, bodyweight-adjusted work,
  pace, distance, time under tension, intensity analytics, filters, exports, or sharing.
* Body weight, F24 dashboard, deterministic signals, recommendations, coaching, AI, or any trend
  judgement.
* Changes to live capture, routine scheduling, exception definitions, event history,
  authentication, or persistence schema.

## Dependencies

* F12 — Mobile-first UI System and Phase 1 UX Refresh.
* F13 — Start Workout and captured local-date convention.
* F14 and F14.2 — Performed-set facts and timing.
* F15 and F15.1 — Effective structured skips and pain/discomfort reason.
* F17 — Workout Completion.
* F18 — Workout History.
* F20 and F20.1 — Progress information architecture and rolling periods.

## Notes

F21 deliberately creates aggregate factual context before a later feature decides what training
patterns mean. Its weekly views and calendar explain one response; they are not independent sources
of truth. Future volume, adherence, body-weight, or recommendation features must define their own
semantics rather than silently reinterpreting F21.
