# F25 — Performed Set Adjustment Reliability

**Status:** Implemented and automatically validated as of 2026-08-24; product-owner mobile
validation remains pending.

## Objective

Make adjusted performed-set capture dependable during a live workout, especially when the workout
prescription has no planned weight. A value entered by the user must either remain a visible draft,
be persisted as the performed fact for the intended set, or be rejected with a clear validation
error. It must never be silently converted to missing data.

F25 corrects the production defects exposed by the product owner's first real-gym session. It does
not change the established distinction between an immutable workout prescription, an unconfirmed
adjustment draft, and a confirmed `PerformedSet`.

## Context

F14 introduced workout-local exercise and set snapshots plus a separate `PerformedSet` projection.
F14.2 made every set start explicit and established that adjustments to an incomplete set remain
frontend draft state until `Next set` or `Finish exercise` confirms the performed set.

That domain boundary is correct, but the implemented frontend violates its reliability contract in
several connected ways:

* Locale-formatted decimal input such as `2,5` is passed through JavaScript `Number(...)`, becoming
  `NaN`.
* JSON serialization converts `NaN` to `null`, which is valid for optional performed weight, so the
  request can succeed while silently discarding what the user entered.
* Numeric fields do not receive complete finite, shape, precision, and target-specific validation
  before an adjustment is applied or submitted.
* Applying the server response from `Start set` clears the current adjustment draft, although F14.2
  explicitly requires that draft to survive the transition into `set_in_progress`.
* A draft weight is rendered only when the planned snapshot already has a non-null target weight.
  This makes an entered weight invisible for exactly the plan-without-weight case that exposed the
  incident.
* Generic workout-response handling can clear a current-set draft even when the response leaves that
  same set incomplete and current.

A production audit confirmed that the workout snapshot and `PerformedSet` architecture prevented
plan changes from rewriting history. It also found complete performed rows whose weights were null
after the affected adjustment flow. The historical workout was repaired through a separate guarded
operational change. F25 fixes the application behaviour; it is not a data-repair feature.

F20 and F20.1 already consume confirmed performed weight correctly. A strictly positive performed
weight contributes to Heaviest weight and Estimated 1RM once its workout is terminal. Therefore the
correct end-to-end fix belongs in workout capture and must be verified through the existing Progress
projection rather than changing Progress to infer missing load.

## User Experience

### Applying an adjustment to an incomplete set

The user may open `Adjust set` while the current set is `awaiting_set_start` or `set_in_progress`.
The dialog keeps the existing fields:

1. Performed value, labelled for the exercise target type.
2. Optional `Weight (kg)`.
3. Optional `RIR`.

Existing plan values prefill a new draft. Reopening the dialog for the same incomplete set uses its
current draft values instead. The user may enter decimal weight or distance using either the point
or comma decimal separator. For example, `12.5` and `12,5` both represent `12.5`.

`Apply adjustments` validates every field. On success it closes the dialog and returns to the same
set lifecycle phase without making a performance request or completing the set. The execution
surface shows an explicit adjusted-value summary, including entered weight and RIR even when the
plan had no corresponding target. It also shows the concise status:

```text
Adjustment applied · saved when you complete the set
```

`Start set N`, `Next set`, or `Finish exercise` remains the sole dominant lifecycle action.

### Invalid input

A non-empty value that cannot be represented by the applicable performed-set contract is invalid.
The dialog remains open, shows a concise error at the affected field, and moves focus to the first
invalid field when submission is attempted. No draft is replaced, no performance request is made,
and no lifecycle action occurs.

Blank optional weight and RIR mean that no value was entered and deliberately map to `null`. A
non-empty invalid value never maps to `null`. The required performed-value field cannot be blank.

### Starting and completing the adjusted set

If the user applies adjustments during `awaiting_set_start`, pressing `Start set N` preserves the
same draft and visible adjusted-value summary after the server confirms `set_in_progress`.

When the user later presses `Next set` or `Finish exercise`, the frontend validates the current draft
again and submits normalized JSON numbers using the existing `adjusted` performance contract. The
server atomically creates the performed projection and completion event as established by F14 and
F14.2.

Only a validated success response for that exact set clears its draft. The next set begins without
an adjustment draft. A failed, conflicting, unauthenticated, or malformed completion response must
not silently turn the entered values into an as-planned submission or discard them before recovery.

### Editing a completed set

Opening `Adjust set` for a completed set preloads its confirmed performed values. `Update set`
applies the same locale-safe parsing and validation rules, then uses the existing immediate
performed-set update operation. Pending copy remains `Saving...`.

Success replaces the confirmed workout representation and shows the updated performed facts.
Failure keeps the dialog values available for correction or retry. Editing a completed set must not
clear an unrelated draft for the current incomplete set when that set remains current.

### Refresh and navigation

An incomplete-set draft is intentionally in-memory state. It survives lifecycle and other server
responses within the mounted execution screen when the same set remains current, but it is not
required to survive a full page refresh, closing the tab, or leaving and later reopening the
execution route.

Confirmed performed values continue to survive refresh, screen locking, app switching, navigation,
and later plan edits through the existing backend persistence model.

### Progress traceability

An adjusted set with entered weight is visible immediately as a confirmed performed fact in the
owned workout response after set completion. In-progress workouts remain excluded from Progress as
defined by F20. Once the workout is completed or cancelled, its performed repetition sets appear in
the existing Progress history, and strictly positive performed weights contribute to the existing
F20.1 charts without inference from the plan.

## Functional Requirements

### FR-1 — One locale-safe numeric parser boundary

All live-workout adjustment entry uses one explicit parsing and validation boundary rather than
calling `Number(...)`, `parseFloat(...)`, or equivalent ad hoc conversions in event handlers.

For decimal-capable performed fields, the parser:

* Trims surrounding whitespace.
* Accepts ASCII digits with at most one `.` or `,` decimal separator.
* Normalizes either accepted separator to one finite JSON number.
* Rejects grouping separators, mixed separators, exponent notation, signs, embedded whitespace,
  multiple separators, and other non-decimal syntax.
* Enforces the applicable maximum of two fractional decimal places.

Whole-number fields accept trimmed ASCII digits only and produce finite integers. Blank handling is
field-specific: the performed value is required; optional weight and RIR return `null` only when the
trimmed source is empty.

The parser returns a success or structured field error. It never returns `NaN`, positive or negative
infinity, or an ambiguous `number | null` result for invalid non-empty input.

### FR-2 — Target-specific validation before draft application

`Apply adjustments` validates the complete draft using the established F14 bounds:

* Repetition performance is a whole integer from 1 through 1,000.
* Duration performance is a whole number of seconds from 1 through 86,400.
* Distance performance is greater than zero, no more than 100,000 metres, and has at most two
  decimal places.
* Performed weight is optional; when present it is from 0 through 5,000 kilograms with at most two
  decimal places.
* Performed RIR is optional; when present it is a whole integer from 0 through 10.

Invalid fields block draft application. Validation copy identifies the required correction without
showing raw server payloads or silently coercing the value.

### FR-3 — Validation again at every mutation boundary

The draft is parsed and validated again immediately before `Next set` or `Finish exercise` submits
an adjusted performance. Completed-set `Update set` does the same before its mutation.

The frontend API boundary also rejects any programmatic adjusted body containing a non-finite,
non-integer where required, out-of-range, over-precision, or contract-inconsistent value before
calling `fetch`. TypeScript types alone are not considered runtime validation.

This defence prevents a stale or programmatically corrupted draft from relying on JSON
serialization semantics. An invalid adjusted value never falls back to `as_planned` and never sends
`null` in place of a non-empty invalid optional value.

### FR-4 — Set-scoped draft identity

An adjustment draft is associated with the exact owned live-workout coordinates that created it:

* Workout ID.
* Workout-exercise position.
* Planned-set position.

Draft display and submission require all three coordinates to match the current incomplete set.
Changing to another set, exercise, or workout must not reuse a stale draft.

The draft survives a validated workout response when the same identified set remains the current
incomplete set. This includes the response from starting that set and an unrelated completed-set
edit. The implementation must not couple all successful workout responses to unconditional draft
clearing.

The draft clears when:

* Its set is successfully completed.
* Its set or owning exercise is successfully skipped.
* The response proves that its set is already completed, skipped, no longer current, or no longer
  belongs to an active mutable workout.
* The execution component is intentionally left or remounted.

Failure and malformed-response paths retain the draft when it is still safe to retry against the
same confirmed set.

### FR-5 — Visible adjusted facts independent of planned values

The current-set summary derives each adjusted display value from the draft by explicit null/blank
checks, not truthiness fallbacks.

An entered draft weight renders even when `target_weight_kg` is null. An entered `0` remains visibly
distinct from no entered weight. The same rule applies to RIR `0`. The performed-value summary must
not replace a valid zero-like string through `value || plannedValue` logic, even though the target
type's validation may later reject zero where it is not permitted.

Planned and adjusted values remain distinguishable. The UI must not label a local draft as already
recorded, persisted, or present in Progress.

### FR-6 — Confirmed persistence remains completion-owned

Applying adjustments to an incomplete set performs no backend mutation. `Start set` records only
the existing `set_started` fact. `Next set` or `Finish exercise` remains responsible for atomically
persisting the adjusted `PerformedSet` and established timeline events.

Successful completion uses `entry_mode = adjusted` and the exact normalized draft values. The
server response must contain the confirmed performance for the intended set. The frontend must
validate that response before advancing or clearing the draft.

The operation does not mutate routine configuration, workout exercise snapshots, planned-set
targets, or their timestamps.

### FR-7 — Completed-set correction remains immediate

`Update set` retains F14's unified create-or-replace endpoint and `set_updated` event semantics.
Locale normalization happens before the existing JSON body is built. A successful update changes
only the current performed projection; it does not rewrite its completion/start timestamps or any
plan snapshot.

The completed-set dialog retains the entered strings during pending and failure states. Only a
validated success response closes the dialog and replaces confirmed values.

### FR-8 — Backend finite-number defence

The backend continues to own final performed-set validation and adds or confirms explicit finite
checks before decimal conversion or persistence. Direct API callers cannot persist `NaN`, infinity,
out-of-range values, invalid whole numbers, or excessive precision even if they bypass the
frontend.

Any rejected create or update leaves the performed projection, timeline, lifecycle, and workout
association unchanged. Framework-generated validation detail remains an untrusted transport value
that the frontend normalizes before display.

### FR-9 — Progress uses only the confirmed fact

F20/F20.1 calculation and eligibility rules remain unchanged. Progress reads
`PerformedSet.performed_weight_kg`; it never recovers a missing value from a routine, workout plan,
frontend draft, adjacent set, or remembered prior session.

A terminal repetition-target workout containing the adjusted positive weight must expose that value
in its Progress session set facts and must calculate Heaviest weight and Estimated 1RM from it under
the existing positive-weight rule.

### FR-10 — Request and response safety

Pending lifecycle or update actions prevent duplicate submission. Confirmed workout state changes
only after the complete response passes the existing strict parser and relevant current-set
invariants.

Expected API errors are normalized into concise user-facing copy. Unexpected network failures and
malformed responses use a safe generic fallback. Raw response objects, FastAPI validation arrays,
and invalid numeric values never reach rendered UI.

## Domain / Data Requirements

F25 introduces no entity, table, column, event type, persisted draft, analytical aggregate, or
database migration.

The existing boundaries remain authoritative:

* `WorkoutExercise` is an immutable workout-local exercise snapshot.
* `WorkoutPlannedSet` is an immutable workout-local set prescription.
* Frontend draft state is an unconfirmed proposal for one exact incomplete set.
* `PerformedSet` is the current confirmed performed projection for one planned set.
* `WorkoutEvent` is the append-only observation history.

Draft identity may be represented through a small frontend type or reducer, but it must not become a
new backend status or be embedded into a plan snapshot. Numeric parsing and draft reconciliation
should live outside the React render body so their invariants can be tested directly and reused by
incomplete and completed adjustment paths.

F25 does not change the database meaning of weight `0`. It remains a valid raw performed fact under
F14 but does not produce an F20.1 weight-based chart observation, which requires a strictly positive
weight.

## API Requirements

F25 adds no endpoint and does not change successful public response shapes.

### Existing adjusted performance body

The existing endpoint remains:

```text
PUT /api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/performance
```

An adjusted request remains:

```json
{
  "entry_mode": "adjusted",
  "performed_value": 10,
  "performed_weight_kg": 12.5,
  "performed_rir": 2
}
```

All adjusted keys remain required. Optional absence is represented by an explicit JSON `null` only
for weight and RIR. Locale formatting is a frontend input concern: the API receives JSON numbers,
never strings such as `"12,5"`.

The endpoint preserves F14/F14.2 behaviour:

* `200` returns the complete validated workout after create or replacement.
* Ownership-safe workout/set `404` outcomes remain unchanged.
* `409` lifecycle and active-workout conflicts remain unchanged.
* `422` rejects invalid paths, body shape, type, finiteness, range, integer, or precision.
* `401` remains unauthenticated.

Every non-success outcome leaves persistence unchanged.

### Existing Progress reads

`GET /api/progress/exercises/{exercise_slug}/history` and
`GET /api/progress/exercises/{exercise_slug}/chart` retain F20.1's contracts. No draft is exposed
through either endpoint. After terminal completion/cancellation, the confirmed decimal weight is
returned as a JSON number and participates in chart metrics only when strictly positive.

## UI Requirements

F25 follows `harness/context/07_UI_DESIGN_SYSTEM.md` completely and introduces no parallel visual
language.

Reuse `AppShell`, `Page`, `Card`, `Stack`, `Inline`, `Button`, `Field`, `TextInput`, `Alert`, and
`Dialog`. Add no new form, button, toast, or success primitive solely for this feature. Field-level
error support should be added to or composed consistently with the shared `Field` primitive when
the current primitive cannot associate concise validation text with its input.

### Mobile information hierarchy

For the live current-set surface:

1. Exercise and set identity.
2. Current planned or adjusted performed-value summary.
3. Entered draft weight and RIR when present, regardless of plan nullability.
4. Draft status copy.
5. Exactly one dominant lifecycle action.
6. Secondary adjust, help, or skip actions.

F25 does not redesign the rest countdown; that belongs to a later Phase 3.5 feature. The adjusted
summary must fit the existing current-set and awaiting-set compositions without displacing the sole
dominant lifecycle action.

### Adjustment dialog states

Exercise and validate:

* New incomplete-set draft with plan-prefilled values.
* New draft where planned weight and RIR are null.
* Reopening an applied draft.
* Awaiting-start and in-progress application.
* Point-decimal and comma-decimal entry.
* Blank required value.
* Blank optional weight/RIR.
* Invalid syntax, mixed separators, excessive precision, range failure, and whole-number failure.
* Completed-set edit idle, pending, success, expected failure, unexpected failure, and malformed
  response.

Validation errors are associated with their fields and do not erase any entered string. Dialog
focus stays within the shared focus trap, moves to the first invalid field on attempted application,
and returns to the invoking `Adjust set` action on cancel or success.

### Live draft and request states

Exercise and validate:

* Draft visible while awaiting start.
* Start-set pending with the draft and timer context retained.
* Start-set success preserving the draft in progress.
* Start-set conflict, network failure, and malformed response preserving a safe retry state.
* Completion pending with adjusted values still visible.
* Completion success clearing only the completed set's draft and advancing normally.
* Completion conflict, network failure, server validation failure, and malformed response retaining
  the draft for correction or retry when the same set remains current.
* A server response that makes the drafted set completed, skipped, or non-current clearing it rather
  than applying it to another set.

Pending labels remain the existing `Starting...`, `Saving...`, or equivalent established copy.
Errors appear at the smallest recoverable boundary and do not replace confirmed workout context.

### Accessibility and responsive behaviour

Input labels and validation messages are programmatically associated. Required versus optional
state is explicit. Numeric inputs retain at least 16-pixel text, useful mobile `inputMode` hints,
44-pixel touch targets, and visible keyboard focus. Decimal input must remain usable when the mobile
keyboard emits either comma or point.

Validate the changed execution and adjustment states at 360 px, 390 px, 430 px, and a representative
desktop width. Also verify 200% zoom, safe areas, reduced motion, on-screen keyboard obstruction,
long localized validation copy, and no document-level horizontal overflow.

Browser Back performs no mutation. Refresh retains confirmed server facts but may discard an
unconfirmed draft as explicitly scoped by F25.

## Business Rules

* A plan snapshot and a performed result are different facts.
* Applying an incomplete-set adjustment creates only a frontend draft.
* Starting a set does not persist or discard its adjustment draft.
* Completing the set persists its validated draft atomically as `adjusted` performance.
* Editing a completed set updates confirmed performance immediately through the existing endpoint.
* An invalid non-empty numeric value is an error, never missing data.
* Comma and point are equivalent decimal separators at the frontend input boundary.
* The API and database remain locale-neutral and store normalized numeric values.
* A draft belongs to one exact workout, exercise position, and set position.
* A response concerning the same still-current set does not clear its draft merely because it is a
  successful response.
* A stale draft never follows the user to a different set, exercise, or workout.
* Empty optional weight/RIR means null; weight `0` and RIR `0` are explicit entered values.
* Plan edits never rewrite confirmed historical workout or performed-set facts.
* Progress uses confirmed performance only and continues to exclude in-progress workouts.
* F25 makes no performance, progression, adherence, or coaching judgement.

## Validation

* Performed adjustment strings follow the strict syntax and blank semantics in FR-1.
* All normalized numeric values are finite before a request body is constructed.
* Target-specific performed values, weight, and RIR satisfy the F14 bounds in FR-2.
* JSON request bodies contain no locale-formatted numeric strings, `NaN`, or infinity.
* `adjusted` requests contain every performed key; only weight and RIR may be null.
* Backend validation independently enforces finiteness, bounds, integer requirements, precision,
  discriminator shape, and unknown-field rejection.
* Draft coordinates must match the current incomplete set before display or submission.
* Successful draft completion is reflected in the returned workout's intended performed-set row.
* Failed parsing, start, completion, or update leaves confirmed workout state unchanged and retains
  recoverable user input where the same-set invariant holds.
* A terminal positive-weight repetition set appears unchanged in Progress history and reproduces
  the existing Heaviest weight and Estimated 1RM calculations.
* F25 adds no migration. Before completion, compare the configured local database's
  `alembic current` with repository `alembic heads`; no fresh/previous-head migration gate is added.

## Acceptance Criteria

* [ ] Entering `12,5` or `12.5` for performed weight applies and later persists the identical numeric
  value `12.5`.
* [ ] A non-empty invalid weight cannot be silently serialized or persisted as null.
* [ ] Repetition, duration, distance, weight, and RIR receive their target-specific frontend
  validation before adjustment or mutation.
* [ ] Blank optional weight and RIR persist as null, while explicit weight `0` and RIR `0` remain
  distinguishable entered facts.
* [ ] Invalid input keeps the dialog and exact entered strings available, identifies the affected
  field, focuses the first invalid field, and makes no request.
* [ ] Applying adjustments to an incomplete set does not complete it or call a performance endpoint.
* [ ] Applied values and draft status are visible on the live screen even when the plan has no weight
  or RIR target.
* [ ] Starting the adjusted set preserves its exact draft and does not persist performance.
* [ ] A validated `Next set` or `Finish exercise` persists the exact adjusted values and clears only
  that set's draft after success.
* [ ] A failed or malformed start/completion response cannot discard the safe current-set draft or
  advance confirmed lifecycle state.
* [ ] A draft cannot be submitted for a different set, exercise, or workout after confirmed state
  changes.
* [ ] Editing a completed set accepts comma/point decimals, updates the performed projection, and
  preserves its dialog values on failure.
* [ ] Updating another completed set does not clear an unrelated safe draft for the current set.
* [ ] Direct API attempts with non-finite or otherwise invalid numeric values fail without changing
  performance or timeline.
* [ ] A workout with null planned weight can record a positive adjusted weight, return it from
  workout history, and contribute it to Progress after the workout becomes terminal.
* [ ] Routine or plan changes do not alter the recorded performed value or its Progress result.
* [ ] Existing as-planned completion, explicit set start, skip, undo, correction, cancellation,
  completion, terminal history, and Progress positive-weight rules retain their documented
  behaviour.
* [ ] Changed UI meets responsive, keyboard, focus, touch, zoom, safe-area, and overflow contracts.
* [ ] Focused automated checks, backend/frontend static validation, configured-database revision
  comparison, and manual UI validation pass.

## Tests

Add a focused frontend unit-test seam for the numeric parser and draft reconciliation. A small
frontend unit runner is justified by the production data-loss regression; do not add browser test
infrastructure or a broad component-testing framework.

Frontend unit tests cover representative cases:

* `12,5` and `12.5` normalize to `12.5` for decimal-capable fields.
* Blank optional values become null, while invalid non-empty, mixed-separator, exponent,
  over-precision, non-finite, and out-of-range values produce field errors.
* Whole-number repetition/duration/RIR constraints and decimal distance/weight constraints use the
  correct target-specific path.
* A draft applied to an awaiting set survives reconciliation with the same set after `Start set`.
* The same draft survives an unrelated successful response while its set remains current.
* Successful completion or a response proving the drafted set is no longer current clears it.
* Draft coordinates prevent reuse for another set.

Backend tests cover:

* Adjusted completion with a null planned weight and decimal `12.5` performed weight.
* Direct adjusted create/update rejection for representative non-finite, invalid whole-number,
  precision, and range input, with projection and timeline unchanged.
* Existing nullable optional fields and explicit zero remain valid raw performed facts.
* Completed-set update retains established completion/start timestamps and appends `set_updated`.
* A completed or cancelled repetition workout exposes the confirmed decimal weight through Progress
  history and the positive-weight chart projection.

Frontend format, lint, type, unit, and build checks plus backend lint, format, type, and focused/full
test suites must pass as appropriate to the repository workflow.

Per DEC-019, F25 adds no automated browser or other automated browser-level tests. Focused manual UI
validation covers:

* A no-planned-weight set adjusted with `12,5`, started, completed, then observed in terminal workout
  detail and Progress.
* The equivalent point-decimal path.
* Invalid syntax, precision, bounds, blank required value, and blank optional values.
* Draft visibility and survival across Start-set pending/success and recoverable failures.
* Completed-set edit success and failure without loss of current-set draft.
* Completion failure and malformed-response recovery without silent as-planned fallback.
* Refresh discarding only the unconfirmed draft while confirmed facts remain.
* All dialog/live states at 360 px, 390 px, 430 px, and representative desktop width, including
  mobile numeric keyboards, keyboard-only use, focus restoration, 200% zoom, safe areas, and no
  document-level overflow.

## Out of Scope

* Persisting an unconfirmed draft across full refresh, tab closure, route exit, another device, or
  offline/background synchronization.
* Saving incomplete-set adjustments as backend draft entities or performed facts before completion.
* Automatically copying or carrying a performed weight, value, or RIR to the next set or workout.
* Editing completed workouts or performed sets from historical or Progress screens.
* Bulk or automated historical data repair, repair endpoints, admin tools, or deployment scripts.
* Changing Progress metric eligibility, positive-weight rules, Epley calculation, or terminal-only
  history eligibility.
* Changing plan configuration, updating a plan from performed values, or altering snapshot rules.
* Rest-timer layout, sound, vibration, wake locks, notifications, or automatic next-set start. These
  remain separate Phase 3.5 work.
* Offline writes, service workers, native packaging, wearables, sensor capture, recommendations,
  adaptations, or AI.

## Dependencies

* F09 — Routine Exercise Configuration.
* F13 — Start Workout.
* F14 — Live Workout Timeline and Set Tracking.
* F14.2 — Explicit Set Start and Accurate Set Timing.
* F15/F15.1 — Workout exceptions and skip behaviour.
* F17 — Workout Completion.
* F18 — Workout History.
* F20/F20.1 — Exercise Progress and positive performed-weight projections.

## Notes

The most important implementation property is explicit state reconciliation. Avoid fixing only the
observed comma case while leaving generic response handling capable of deleting the draft. Likewise,
avoid preserving an unscoped draft that could be submitted for the next set.

Do not use JavaScript truthiness to distinguish entered numeric values from missing values. Parse
the original string, preserve it for editing and error recovery, and use the normalized number only
at a validated mutation boundary.

The production workout repair is operational history, not a fixture, migration, or acceptance
shortcut. F25 must prove the normal application path independently.
