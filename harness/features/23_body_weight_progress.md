# F23 — Body Weight Progress

**Status:** Completed. Backend tests and backend/frontend static checks pass; the product owner
confirmed the deployed UI on 2026-08-23.

## Objective

Turn the dated body-weight facts introduced by F22 into a clear factual progress view without
interpreting whether weight gain or loss is desirable.

F23 adds a complete raw-measurement chart, shared rolling periods, a neutral comparison between the
two most recent measurements in the selected period, and period-filtered textual history. It also
simplifies routine capture by hiding the measurement form until the user deliberately chooses
`Add measurement`.

## Context

F22 established one user-owned measurement per local date, newest-first paginated history, current
weight resolution, same-date replacement, editing, and confirmed deletion. F22.1 associates zero to
five optional private photos with one measurement through a dedicated management screen.

F20.1 established the Progress time-range convention: `1M`, `3M`, `6M`, `1Y`, and `All`, with `3M`
as the canonical default, backend-calculated inclusive rolling calendar bounds, route-backed state,
and a complete chart independent from paginated textual history. F23 reuses that convention.

The existing exercise chart contains useful responsive plotting, selection, focus, and visual
behaviour, but its implementation is coupled to exercise sessions and performed sets. F23 must
extract and reuse the domain-neutral time-series chart behaviour instead of creating a second SVG,
axis, point-selection, or chart-style implementation. Exercise-specific and body-weight-specific
details remain in thin domain wrappers.

## User Experience

### Body weight screen

The canonical route remains `/progress/body-weight`. After the Progress section navigation, the
screen presents:

1. Body-weight chart, range selector, current-weight context, and selected-period comparison.
2. The dominant `Add measurement` action.
3. The existing body-weight history, filtered by the selected period.

The date, weight, and note inputs are not permanently visible on entry. Editing controls likewise
remain hidden until the user selects `Edit` on one measurement.

### Route-backed period

The supported periods are `1M`, `3M`, `6M`, `1Y`, and `All`. `3M` is the default and is represented
by an absent `period` query parameter:

```text
/progress/body-weight
/progress/body-weight?period=6m
```

Changing the period creates a normal browser-history entry. Refresh and Browser Back restore it.
Unknown, empty, repeated, or unsupported period values normalize with replace semantics to `3M`;
unrelated query parameters are removed without a navigation loop.

The browser supplies its current local date and the backend calculates the same inclusive rolling
calendar ranges defined by F20.1. `All` has no lower boundary and still ends on the supplied date.

The selected period controls the chart, comparison, and textual history. It does not change the
global current-body-weight fact or the default date/value behaviour of the capture form. Changing
period resets history pagination and discards stale responses from the previous period.

### Chart and point detail

The chart displays every owned measurement inside the selected period, ordered oldest to newest,
as the same connected line and selectable points used by exercise progress. It uses an adjusted
vertical scale with sufficient padding for the visible weights rather than forcing zero into view.

The horizontal extent starts at the oldest actual measurement and ends at the newest. It never
reserves leading empty space back to the theoretical period boundary. A period containing one
measurement renders one isolated point. Irregular gaps remain gaps in the recorded facts; F23 does
not invent daily values.

Selecting or focusing a point exposes its full local date, weight in kilograms, and note when one
exists. When no note exists, the detail states no note was recorded rather than showing an empty
label. Point detail contains no photo thumbnail, appearance comparison, or interpretation.

### Current weight and most-recent change

Current body weight remains the most recent measurement across all history, or the undated profile
fallback when no measurement exists, exactly as defined by F22. The fallback may appear as current
context but never becomes a plotted point or comparison input.

The selected-period comparison uses its two most recent measurements:

```text
change_kg = latest weight in period - immediately previous weight in period
```

The UI labels this `Change since previous measurement`, identifies the previous measurement date,
and formats a positive value with `+`, a negative value with `−`, and zero as `0.0 kg`. Styling is
neutral and does not use success, warning, or danger meaning. With fewer than two measurements in
the period, the comparison is explicitly unavailable. No average, percentage, trend line, or
first-ever comparison is shown.

### Add and edit measurement

`Add measurement` opens the existing responsive `Dialog`: it presents as a bottom panel on mobile
and a centred modal on wider screens. The focused task contains date, weight, optional note,
contained error feedback, `Cancel`, and one dominant `Save measurement` action. It retains F22's
validation, current-local-date default, and same-date replacement semantics.

After a successful save, the dialog closes, confirmed chart/summary/history state refreshes, and a
contained success message identifies the saved date. That message offers a secondary `Add photos`
or `Manage photos` action for the saved measurement and routes to F22.1's existing photo screen.
Photo selection and upload do not occur inside the measurement dialog: the measurement must exist
first, and the dedicated screen retains the complete zero-to-five-photo draft, validation,
ordering, upload, and recovery flow.

`Edit` opens the same responsive focused form with the immutable date presented as context and the
weight/note prefilled. Successful edits close it and refresh every affected projection. A save or
edit failure preserves the draft and keeps the dialog open. Escape, backdrop dismissal, and Cancel
are disabled while saving and otherwise restore focus to the trigger.

Deleting remains the existing explicit confirmation flow. Successful same-date replacement retains
photos; successful measurement deletion removes its chart point and follows F22.1's photo cleanup
contract.

## Functional Requirements

### FR-1 — Shared rolling periods

Support exactly `1m`, `3m`, `6m`, `1y`, and `all`, with `3m` as the canonical route default. Reuse
one backend calendar-range implementation for exercise progress, workout statistics where
compatible, body-weight chart projection, and filtered body-weight history rather than introducing
slightly different body-weight boundary rules.

### FR-2 — Complete raw-measurement chart

Return every effective owned measurement in the selected period, oldest first, without pagination,
sampling, smoothing, interpolation, or fabricated values. The undated profile fallback is excluded.
Replacing a same-date measurement changes the existing point; it never creates a duplicate date.

### FR-3 — Neutral most-recent comparison

Calculate the signed kilogram difference between the latest and immediately previous measurements
inside the selected period. Both inputs and their dates remain explicit and auditable. Return no
change value when the selected period contains fewer than two measurements.

### FR-4 — Shared chart implementation

Extract a reusable factual time-series chart from the existing exercise chart. The shared component
owns responsive measurement, axes, connected line, point placement, adjusted vertical extent,
single-point behaviour, selected/focused state, touch targets, keyboard access, and shared semantic
styles. Domain wrappers own data mapping, title, unit/value formatting, accessible point names, and
detail content.

Migrate the existing exercise chart to compose the shared component in the same feature. Its
metrics, set detail, URLs, empty states, and visual behaviour must not regress. F23 must not copy the
exercise chart file and rename exercise fields to weight fields.

### FR-5 — Period-filtered history

Apply the selected rolling bounds to F22's existing newest-first textual history. Preserve
cursor-based pagination and `Load more`; the chart remains complete before any additional history
page is loaded. A cursor is valid only for the authenticated user, selected period, supplied local
date, and page boundary that created it.

### FR-6 — Progressive-disclosure capture

Replace the permanently visible record form with the responsive add/edit dialog described above.
Reuse F22's upsert endpoint and business rules. Keep F22.1's photo flow separate and make it
immediately reachable after a successful save without forcing photo capture.

### FR-7 — Projection synchronization

After create, same-date replacement, edit, or deletion, refresh current weight, complete chart,
comparison, and the first filtered history page as one coordinated screen update. Prevent an older
request from replacing newer confirmed state. Mutation failure leaves all previously confirmed
projections visible and usable.

### FR-8 — Factual language

Use `Current body weight`, `Change since previous measurement`, and measurement-specific language.
Do not call the signed difference progress, improvement, regression, success, failure, velocity, or
a trend. Direction and styling never imply whether gaining or losing weight is desirable.

## Domain / Data Requirements

F23 introduces no persisted entity and no migration. Body-weight measurements remain the only
dated facts, with one effective row per user and local date.

Period bounds, latest/previous selection, and `change_kg` are deterministic read-time projections.
The backend is authoritative for all three. The frontend may format returned values but must not
independently choose comparison points or recompute business semantics.

All measurement queries remain ownership-scoped. Notes are factual point context. Photo metadata is
not part of the chart projection.

## API Requirements

All endpoints require cookie authentication and an existing fitness profile. Return `401` when
unauthenticated, `404` when the fitness profile is absent, and `422` for malformed, repeated,
unknown, or incompatible query parameters. Frontend API functions parse success bodies from
`unknown`, validate ordering, uniqueness, bounds, summary consistency, and numeric values, and
normalize all error shapes before UI rendering.

### `GET /api/progress/body-weight`

Accept exactly `period` and `local_date`. Both are required at the API boundary; the frontend sends
the canonical period value even when the route omits the default query parameter.

Return:

```json
{
  "period": "3m",
  "range_start": "2026-05-15",
  "range_end": "2026-08-15",
  "items": [
    {
      "measurement_date": "2026-08-07",
      "weight_kg": 80.6,
      "note": null
    },
    {
      "measurement_date": "2026-08-14",
      "weight_kg": 80.0,
      "note": "Morning measurement"
    }
  ],
  "summary": {
    "latest": { "measurement_date": "2026-08-14", "weight_kg": 80.0 },
    "previous": { "measurement_date": "2026-08-07", "weight_kg": 80.6 },
    "change_kg": -0.6
  }
}
```

`range_start` is null for `all`. Items are strictly oldest first and contain unique dates.
`latest`, `previous`, and `change_kg` are all null for an empty period. With one item, `latest` is
present while `previous` and `change_kg` are null. With at least two items, they correspond exactly
to the final two items and `change_kg` is rounded to one decimal.

### `GET /api/body-weight-measurements`

Extend the existing endpoint with `period` and `local_date`. F23 sends both on every history request.
For compatibility, omitting both retains F22's unfiltered history contract; providing only one is
invalid. When present, all returned items fall within the backend-calculated inclusive range.

The response continues to include global `current_weight`, unaffected by the period, plus filtered
`items` and `next_cursor`. Cursors must cryptographically bind the range context so reuse after a
period or local-date change returns `422` rather than leaking or mixing pages.

### Existing mutation and photo endpoints

F22 `PUT`/`DELETE` and every F22.1 photo endpoint retain their existing public contracts. F23 adds
no combined measurement-and-photo transaction and exposes no object-storage information.

## UI Requirements

F23 follows `harness/context/07_UI_DESIGN_SYSTEM.md` and reuses `AppShell`, `AppHeader`, `Page`,
`SectionNav`, `Section`, `Card`, `Button`, `Field`, `TextInput`, `TextArea`, `Alert`, `EmptyState`,
`LoadingState`, and `Dialog`. It introduces the shared factual time-series chart described in FR-4
because two Progress domains now require identical responsive plotting and interaction behaviour.

The screen retains one dominant `Add measurement` action. Range buttons are selection controls,
not competing calls to action. Edit, photo management, Load more, and Delete remain secondary or
quiet according to the shared system.

Initial loading preserves chart, summary, action, and history shapes without showing false zero or
empty values. Chart and history failures are contained independently and offer Retry. A confirmed
chart remains visible during a safe contained refresh. Period empty says `No measurements in this
period` and retains range selection and Add measurement. Global empty says `No body-weight
measurements yet` and makes Add measurement the resolution action.

The add/edit dialog preserves input on validation, API, or malformed-response failure and announces
the contained error. Pending copy uses `Saving…`, prevents duplicate submission and dismissal, and
does not claim success before a validated response. The post-save photo action never hides or
delays the saved measurement.

Every chart point is reachable by keyboard and a minimum 44 px touch target, even when visible dots
are smaller. Focus and selection do not rely on colour. The selected detail is announced without
reading every point automatically. Line and point geometry are visual; an equivalent ordered data
table/list remains available to assistive technology.

Validate at 360 px, 390 px, 430 px, representative tablet/small desktop, and wide desktop widths,
including 200% zoom, safe areas, on-screen keyboard obstruction, visible focus, reduced motion,
Browser Back, refresh, and absence of document-level horizontal overflow.

## Business Rules

* Exactly one effective measurement may exist per user and local date.
* `3M` is the default period; all period boundaries reuse the established inclusive calendar rules.
* The chart and filtered history contain only dated F22 measurement facts through the supplied local
  date.
* Current body weight is global and is not changed by period selection.
* A chart contains every selected-period measurement and starts at the oldest actual point.
* The only comparison is latest minus immediately previous within the selected period.
* A signed change has neutral factual meaning; positive and negative are not success/error states.
* The undated pre-F22 profile fallback is never charted or compared.
* Add/edit forms are visible only inside a deliberate focused task.
* Photos remain optional, private, limited to five per measurement, and outside chart presentation.

## Validation

* `period` accepts exactly `1m`, `3m`, `6m`, `1y`, or `all`; case variants, whitespace, booleans,
  duplicates, unsupported values, and empty values are invalid.
* `local_date` accepts exactly one real `YYYY-MM-DD` date; timestamps and impossible dates are
  invalid.
* Calendar subtraction clamps end-of-month values and both range boundaries are inclusive.
* Chart items are unique by date, oldest first, owned, finite, between 20 and 500 kg, and no more
  precise than one decimal.
* Filtered history is newest first and contains the same selected-period measurement population,
  subject only to pagination.
* Summary latest/previous values exactly match the final two chronological points.
* Same-date replacement changes weight/note without changing date or deleting photos.
* Malformed responses and stale requests cannot replace confirmed frontend state.
* F23 adds no migration. Compare the configured local database revision with repository Alembic
  head before completion; no fresh/upgrade migration gate is introduced.

## Acceptance Criteria

* [ ] `/progress/body-weight` shows the chart before capture and history content.
* [ ] The route-backed selector offers exactly 1M, 3M, 6M, 1Y, and All with canonical 3M default.
* [ ] Refresh and Browser Back preserve the selected period.
* [ ] Chart, most-recent comparison, and textual history use the same backend-calculated period.
* [ ] Current body weight remains global and the undated fallback never becomes a point.
* [ ] The chart includes every selected-period measurement and no fabricated or smoothed values.
* [ ] The chart starts at the oldest actual point and renders one measurement as one isolated point.
* [ ] Point selection exposes date, weight, and optional note by keyboard and touch.
* [ ] The signed difference compares the latest measurement only with its immediate predecessor in
  the selected period and remains neutral.
* [ ] Empty and one-measurement periods do not invent a comparison.
* [ ] The shared chart implementation is used by body weight and exercise progress without exercise
  chart regression or duplicated plotting CSS/geometry.
* [ ] Changing period resets pagination; Load more never changes the complete chart.
* [ ] Add and Edit reveal a responsive focused dialog; inputs are absent from the idle screen.
* [ ] Successful save refreshes projections and offers the existing zero-to-five-photo flow without
  embedding photo upload in the measurement dialog.
* [ ] Save failure retains the draft; chart/history failure preserves independent recovery; delete
  failure retains confirmation and confirmed data.
* [ ] Same-date replacement retains photos and measurement deletion follows durable photo cleanup.
* [ ] No moving average, trend line, goal, interpretation, photo chart content, or AI is introduced.
* [ ] Backend tests, backend/frontend static checks, and focused manual UI validation pass.

## Tests

Backend tests cover rolling month/year bounds, end-of-month clamping, inclusive boundaries, `all`,
strict parameters, ownership, profile absence, complete oldest-first chart data, newest-first
filtered pagination, and cursor rejection across user/period/local-date context.

Projection cases cover global empty, profile fallback only, period empty with older global current
weight, one point, two points, more than one history page, zero/positive/negative differences,
decimal rounding, notes, boundary dates, same-date replacement, deletion, and user isolation.

Frontend format, lint, and type checks cover strict chart/summary/history response validation,
period URL parsing and canonicalization, stale-request protection, pagination reset, signed value
formatting, modal draft preservation, and post-save photo routing. Suitable existing unit coverage
should exercise the extracted chart's one-point geometry and domain-neutral mapping without adding
a new browser runner.

Per DEC-019, F23 adds no automated browser coverage. Focused manual validation covers global and
period empty states, one/dense/gapped charts, point selection and notes, all ranges, independent
loading/errors, malformed responses, Add/Edit save success and failure, same-date replacement,
post-save Add/Manage photos, delete success/failure, Load more success/failure, refresh, Browser
Back, keyboard/focus, touch, responsive widths, zoom, and horizontal overflow. Exercise-progress
chart behaviour is regression-checked after shared extraction.

## Out of Scope

* Moving averages, rolling averages, regression lines, smoothing, interpolation, forecasts, or
  weight-change velocity.
* First-to-latest or first-ever change summaries, percentage change, records, milestones, targets,
  goal ranges, BMI, body-fat/composition analysis, or positive/negative judgement.
* Photo thumbnails, before/after comparison, overlays, image analysis, or photo upload inside the
  chart or measurement form.
* Direct chart editing, drag-to-change values, custom date ranges, exports, sharing, reminders,
  notifications, correlations with training/nutrition, adaptation signals, recommendations, or AI.
* F24 Progress Dashboard composition.

## Dependencies

* F02 — User Authentication.
* F03/F04 — Fitness Profile and Profile Management.
* F12 — Mobile-first UI System and Phase 1 UX Refresh.
* F20/F20.1 — Progress information architecture, chart, and range conventions.
* F21 — Shared factual period semantics where compatible.
* F22 — Body Weight Tracking.
* F22.1 — Body Progress Photos.

## Notes

Keeping the complete chart projection separate from paginated history preserves the established
Progress contract: the graph answers for the whole selected period while the textual record remains
incrementally readable. The shared chart extraction should be the smallest reusable boundary that
eliminates duplicated plotting and interaction code; it must not create a general chart framework.
