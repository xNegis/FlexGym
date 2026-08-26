# F28 — Distance-readable Live Workout Execution

**Status:** Collaboratively groomed and implementation-ready as of 2026-08-26.

## Objective

Make the live workout screen readable when the phone is resting on the floor or otherwise viewed
from a useful distance. The current set exposes its critical prescription as large glanceable
metrics, and the exercise-transition screen gives the user both a consistent rest countdown and an
ordered preview of the exercises still to come.

F28 is a focused presentation refinement. It does not change performed facts, workout lifecycle,
rest prescriptions, automatic-start eligibility, or the user's control over exercise start.

## Context

Real-gym use showed that the existing repetition target can be read from a phone on the floor, but
RIR and weight use compact supporting text that cannot. The current exercise-transition screen also
shows only the immediate next exercise, which makes it harder to form a mental map of the remaining
equipment or gym areas.

The transition timer is currently a 6 rem circle with 1.125 rem numerals and counts upward from the
previous exercise's completion. This is both materially smaller than F26's 13–18 rem between-set
countdown and behaviourally inconsistent with it. The user must interpret one rest as remaining time
and the other as total elapsed time.

F28 supersedes F14/F14.2 where they require an ascending exercise-transition timer, and supersedes
F26 only where it deliberately excluded enlarging the current-set prescription and exercise-
transition timer. F26's between-set countdown/audio rules and F27's same-exercise automatic-start
rules otherwise remain authoritative. Cross-exercise start remains manual.

## User Experience

### Current-set prescription

Whenever an unresolved current set is presented, the target value is no longer the only prominent
metric. The screen shows:

1. Exercise identity and `Set N of M`.
2. The applicable rest or lifecycle state and its dominant action, where relevant.
3. A distance-readable metric group:
   * Target repetitions, seconds, or metres in one large labelled circle.
   * Target or adjusted RIR in a second equally sized labelled circle when RIR is present.
   * Target or adjusted weight as a large explicit `Weight N kg` line beneath the circles when
     weight is present.
4. Tempo, planned rest, notes, draft status, and secondary actions in their existing supporting
   hierarchy.

The two circles are equal in diameter. They use different approved surface/border treatments and
visible labels, so their meaning never depends on color. If RIR is absent, no empty RIR circle or
invented value appears and the target circle remains centered. An explicit RIR or weight of zero is
still displayed and remains different from absence.

F25 adjustment drafts replace the displayed target, RIR, and weight immediately for their exact
set. Starting that set does not revert the large prescription to the plan. Confirmed and draft data
semantics do not change.

During `set_in_progress`, this metric group is the dominant information. During
`awaiting_set_start`, F26/F27's rest or automatic-start countdown and `Start set N` remain dominant;
the same readable prescription appears below the action so it is available before and after an
automatic or manual start without competing with the rest boundary.

### Transition to the next exercise

After the current exercise is resolved and another exercise remains, the transition screen shows:

1. The completed/partial/skipped status of the previous exercise.
2. `Next`, the next exercise name, and its existing compact set-count/target-type preview.
3. An `After that` ordered list containing every later unresolved exercise after the immediate next
   exercise, in workout order.
4. A large exercise-rest countdown using the same visual size and countdown/overtime convention as
   the between-set timer.
5. `Start next exercise` as the sole dominant action.

The `After that` list shows exercise names and visible workout positions only. It does not duplicate
the immediate next exercise, repeat prescriptions, use nested cards, truncate the sequence, or hide
it behind disclosure. Resolved later exercises are not described as remaining. If no exercise
remains after the immediate next exercise, the section is omitted.

This sequence lets the user decide where to move next and anticipate later equipment without
turning the transition screen into the complete workout overview.

### Exercise-rest countdown

For positive `rest_after_exercise_seconds`, the transition begins at the planned duration and
counts down to `0:00`. `Start next exercise` remains available throughout; rest never blocks an
early manual start.

At the planned boundary, the timer changes to the established warning treatment, changes its
visible status from `Rest` to `Rest complete`, and continues as `+M:SS`. The icon, plus prefix, and
visible status supplement color. Overtime represents time beyond planned exercise rest rather than
total transition time.

A zero-second exercise rest begins immediately at `+0:00`. A null exercise rest has no objective
countdown boundary and therefore renders no timer shell or invented elapsed target. The next
exercise remains manually startable in both cases.

F28 does not emit a new audio cue at exercise-rest completion and does not start the next exercise
automatically. F26 audio remains scoped to rest between sets of the same exercise, and F27
automatic start remains scoped to subsequent sets of that same exercise.

### Refresh, navigation, and failure

The exercise-rest projection is reconstructed from the previous exercise's server-owned completion
timestamp, snapshotted planned rest, validated server time, and the existing client receipt offset.
Refresh, returning to the route, delayed rendering, and timer ticks cannot reset or extend it.

Browser Back retains its existing route behaviour and never starts an exercise. A failed or
malformed `Start next exercise` response preserves the next exercise, remaining sequence,
countdown/overtime state, and retry action with safe contained error feedback.

## Functional Requirements

### FR-1 — Distance-readable target and RIR metrics

The target and optional RIR circles use equal responsive dimensions approximately equivalent to:

```css
width: clamp(6.5rem, 29vw, 8rem);
height: clamp(6.5rem, 29vw, 8rem);
```

Their primary numerals use a responsive size approximately equivalent to
`clamp(2rem, 9vw, 3rem)`. Visible unit labels use at least mobile body size. Exact CSS may be
refined with existing tokens, but both metrics must remain equally prominent and legible from the
same viewing distance.

The first circle displays the numeric value plus exactly one visible type label:

* `Reps` for `repetitions`.
* `Seconds` for `duration_seconds`.
* `Metres` for `distance_meters`.

The second circle displays the numeric RIR plus the visible label `RIR`. Accessible names use the
full metric meaning and value. Color is supplemental.

### FR-2 — Optional metric semantics

RIR and weight use the exact effective current-set values already owned by the screen:

* An applicable F25 draft value while a matching draft exists.
* Otherwise the immutable planned snapshot value.

Null RIR omits the RIR circle. Null weight omits the weight line. Numeric zero displays as zero.
Missing values are never rendered as `0`, `—`, an empty circle, or an inferred draft.

Weight is shown beneath the circle group as `Weight N kg`, with the numeric value at least at the
existing section-title scale. It is not a third circle. Weight presentation changes no load
semantics and does not infer whether a value represents total, per-hand, unilateral, assisted, or
machine load.

### FR-3 — State-specific information hierarchy

For a set in progress, order the current task as:

1. Current exercise/set identity and lifecycle status.
2. Target/RIR circles and optional prominent weight.
3. `Next set` or `Finish exercise` as the sole dominant action.
4. Adjustment, instruction, and skip actions.
5. Tempo, planned rest, notes, draft explanation, and set summaries as supporting information.

For an awaiting set, retain F26/F27's dominant timer, rest status, and `Start set N` before the
distance-readable prescription. No large metric may obscure the timer, duplicate the dominant
action, or move `Start set N` into a secondary treatment.

Unstarted, skipped, resolved, cancelled, loading, not-found, and terminal states must not display a
large metric group as though a set were actively actionable when the validated workout says it is
not.

### FR-4 — Remaining-exercise sequence

During a valid transition, derive the preview exclusively from the validated immutable workout
exercise snapshots. The immediate next exercise remains the existing transition target. `After
that` includes every exercise satisfying both:

* Its position is greater than the immediate next exercise's position.
* Its effective projection is not resolved.

Render those exercises in ascending workout position as a semantic ordered list. Each item exposes
its visible `Exercise N of M` position and exercise name. Long names wrap. The list is omitted when
empty and is not independently paginated, collapsed, reordered, or interactive.

### FR-5 — Countdown transition projection

For a positive snapshotted exercise rest, calculate the deadline as:

```text
previous exercise latest_completed_at + rest_after_exercise_seconds
```

Before the deadline, display remaining time as `M:SS`. At and after the deadline, display time
beyond the deadline as `+M:SS`. Use the existing validated `server_now` plus elapsed client time;
the device wall clock alone cannot redefine the result.

Timer ticks are local projections only. They create no request, event, persisted tick, stored
deadline, or workout mutation. Rerenders and validated response replacement cannot reset the
deadline.

### FR-6 — Null, zero, and early-start behaviour

* Positive rest counts down and then enters warning-treated overtime.
* Zero rest enters warning-treated `+0:00` immediately.
* Null rest renders no countdown, overtime, completion status, or empty timer shell.
* `Start next exercise` is enabled before zero whenever the existing lifecycle permits it.
* A successful early or late start removes the transition UI through the existing confirmed
  workout response.

F28 does not add pause, extension, skip-rest, reset, or live rest editing.

### FR-7 — Shared timer visual language

The exercise-rest circle and numerals use F26's dominant responsive range:

```css
width: clamp(13rem, 62vw, 18rem);
height: clamp(13rem, 62vw, 18rem);
font-size: clamp(3.25rem, 15vw, 5rem);
```

Reuse the established neutral, overtime warning, clock, alert-clock, plus-prefix, and visible
`Rest`/`Rest complete` semantics. The implementation should share a bounded workout-timer
composition when practical rather than copying visual rules that can drift, but it must preserve
the distinct set-rest audio/automatic state machines.

### FR-8 — Existing workflow preservation

Preserve existing behaviour for:

* Manual next-exercise start and its atomic exercise/first-set start events.
* F27 automatic start only between sets of the same exercise.
* F26 set-rest audio and F26.1 screen wake lock.
* F25 draft adjustment and performed-value persistence.
* Set/exercise skip and undo, completion, cancellation, correction, ownership, and resume.
* The factual transition duration derived from existing exercise completion/start timestamps.

Changing the visual projection from total elapsed transition time to remaining planned rest plus
overtime does not rewrite or remove the underlying observed transition timestamps.

## Domain / Data Requirements

F28 introduces no entity, table, column, event type, preference, persisted UI state, analytical
fact, or database migration.

The prominent values are existing planned snapshot values or F25 frontend drafts. The remaining
exercise sequence is a read-only projection of existing workout exercises. The transition countdown
is a deterministic rendering of an existing timestamp and planned duration.

## API Requirements

F28 adds and changes no endpoint or public response shape.

It continues to consume the validated complete workout representation, including exercise order,
effective resolution state, planned set values, `rest_after_exercise_seconds`,
`latest_completed_at`, `server_now`, and the current transition position. Existing API response
validation and safe error normalization remain authoritative.

## UI Requirements

F28 follows `harness/context/07_UI_DESIGN_SYSTEM.md` completely and introduces no parallel visual
language.

Reuse `AppShell`, `Page`, `Card`, `Badge`, `Button`, existing stack/inline compositions, Lucide clock
icons, semantic tokens, and the live-workout actions. The metric pair and remaining sequence are
feature compositions, not new generic cards or global typography primitives. Do not introduce raw
colors, arbitrary spacing, a third large metric circle, or an app-wide font-size override.

### Mobile hierarchy

The active set prioritizes exercise/set identity, the readable prescription, and the one dominant
completion action. The awaiting-set screen retains the dominant rest/automatic timer and start
action before the prescription. The transition prioritizes next exercise, remaining route, large
exercise-rest timer, and one manual start action.

The `After that` sequence appears directly below the immediate next-exercise preview and before the
timer. It remains visually compact enough that the timer and primary action are reachable without
precision scrolling, while all exercise names remain readable and untruncated.

### States

Exercise and validate:

* Repetition, duration, and distance targets.
* Present, absent, and explicit-zero RIR and weight.
* Planned and matching adjusted values before and after set start.
* Awaiting manual start, post-rest automatic delay, automatic pending, and set in progress.
* Long values, multi-digit set positions, long exercise names, tempo, notes, and draft explanation.
* Transition with zero, one, and several later unresolved exercises.
* Later resolved/skipped exercises excluded from `After that`.
* Positive rest before zero, exact zero, prolonged overtime, zero rest, and null rest.
* Early next-exercise start, pending success, recoverable expected error, network error, malformed
  success, cancellation, not-found, and terminal replacement.

Loading continues to use the shared workout loading state and never renders false metric or
transition values. No new empty state or confirmation exists. A pending transition start retains
the complete confirmed screen, disables duplicate submission, and uses the existing `Starting...`
label. Failure keeps the timer and sequence current and leaves a usable retry action.

### Responsive and accessibility behaviour

Validate at 360 px, 390 px, 430 px, representative tablet/small desktop, and wide desktop widths.
At normal mobile widths the target and RIR circles remain equal and side by side. At insufficient
effective width, including 200% zoom, they may stack while retaining equal dimensions and labels.
They must never shrink into unreadability or cause document-level horizontal overflow.

The large transition timer must fit without clipping through `M:SS` and `+M:SS`, safe-area insets,
long surrounding content, and 200% zoom. The remaining list wraps names rather than scrolling
horizontally. `Start set`, `Next set`, `Finish exercise`, and `Start next exercise` remain 48–56 CSS
pixels high and reachable above the bottom navigation.

Metric groups use semantic grouping and accessible names. Timer state is understandable without
color, does not announce every second, and may announce the mounted positive-to-complete boundary
once without announcing stale overtime on a fresh mount. Keyboard order follows visual order,
focus remains visible, and Browser Back/refresh retain their existing semantics.

## Business Rules

* Only critical current-set values receive distance-readable promotion.
* Target and RIR circles are equal; weight is prominent beneath them and never a third circle.
* Null RIR/weight is absent; numeric zero remains visible.
* F25 drafts override only their exact matching set's displayed values.
* The immediate next exercise is not duplicated in `After that`.
* `After that` contains all and only later unresolved exercises in workout order.
* Positive exercise rest counts down; after zero it displays warning-treated overtime.
* Null exercise rest has no timer; zero rest begins in overtime.
* Planned rest never blocks an early next-exercise start.
* Exercise start remains manual and server-confirmed.
* Exercise-rest completion emits no F28 audio cue and creates no event.
* No timer or presentation change rewrites workout facts or plan snapshots.

## Validation

Validate the transition projection with fixed timestamps for positive remaining time, the final
second, exact zero, overtime, zero rest, null rest, server/client clock offset, delayed ticks, and
refresh reconstruction. Confirm that rendering never mutates or polls the API.

Validate metric selection for plan values, matching F25 drafts, draft preservation across set start,
null and zero optionals, and every target type. Validate remaining-list derivation for ordered,
resolved, skipped, empty, and long-name cases.

F28 adds no migration. Before completion, compare the configured local database's `alembic current`
with repository `alembic heads`; no fresh/previous-head migration gate is introduced.

## Acceptance Criteria

* [ ] Current-set target and optional RIR appear in equal, distance-readable labelled circles.
* [ ] Optional weight appears as a large `Weight N kg` line beneath the circles, not a third circle.
* [ ] Repetition, seconds, metres, RIR, and weight remain understandable without color alone.
* [ ] Null optional values are omitted and explicit zero values remain visible.
* [ ] A matching F25 draft remains visible before and after set start and is never replaced by the
  plan through presentation rerenders.
* [ ] The F26/F27 timer remains dominant while awaiting set start; active-set prescription remains
  dominant while the set is in progress.
* [ ] A transition prominently identifies the immediate next exercise and lists all later unresolved
  exercises in order without duplicating the next one.
* [ ] The exercise-transition timer matches F26's dominant responsive size.
* [ ] Positive exercise rest counts down to zero and then displays warning-treated `+M:SS` with
  visible and iconographic completion meaning.
* [ ] Zero exercise rest begins at `+0:00`; null rest renders no timer shell.
* [ ] `Start next exercise` remains available before zero and is the only transition action that
  starts the next exercise.
* [ ] F28 adds no exercise-transition sound, automatic exercise start, persistence, API, or
  migration.
* [ ] Pending, failed, malformed, refreshed, cancelled, and terminal transitions preserve a usable
  and truthful screen.
* [ ] Existing performed facts, transition timestamps, skips, corrections, F25 drafts, F26 cue,
  F26.1 wake lock, F27 same-exercise automatic start, and workout completion do not regress.
* [ ] Changed UI satisfies responsive, zoom, focus, keyboard, touch, safe-area, Back, refresh,
  reduced-motion, and horizontal-overflow contracts.
* [ ] Frontend tests/static/build checks, backend workout regressions, configured-database revision
  check, and focused physical-phone validation pass.

## Tests

Frontend unit tests cover pure presentation derivations:

* Effective target/RIR/weight selection from plan versus one matching F25 draft.
* Null versus explicit-zero optional metrics and all target-type labels.
* Ordered remaining-exercise projection excluding the immediate next and every resolved later item.
* Positive exercise-rest countdown, exact zero, overtime, zero/null rest, server offset, delayed
  observation, and identity replacement without timer reset.

Component inspection and frontend static checks verify semantic labels/grouping, token-only styles,
equal circles, no third weight circle, one dominant action per state, safe error normalization, no
timer-driven request, and no exercise-transition audio or automatic-start call.

Run the relevant backend workout regressions protecting exercise completion/start timestamps,
transition position, snapshotted exercise rest, skip/correction, cancellation, and terminal
immutability. No new backend behaviour test is required solely for a frontend projection.

Per DEC-019, add no new automated browser or browser-level tests. Focused manual UI validation
covers every state above at required widths, 200% zoom, keyboard/focus, safe areas, Browser Back,
refresh, and document overflow. Physical iPhone/Safari validation additionally places the phone at
a representative floor-level gym viewing distance and verifies target, RIR, weight, and transition
timer readability without lifting the device.

## Out of Scope

* An app-wide typography increase, accessibility font-size setting, or device-distance preference.
* A third circle for weight or large promotion of Tempo, notes, and every supporting field.
* Exercise-transition audio, vibration, notifications, spoken exercise names, or music ducking.
* Automatic next-exercise start, configurable cross-exercise delay, or changes to F27.
* Reordering exercises, choosing a non-next exercise from the preview, gym-floor routing, equipment
  availability, supersets, or circuits.
* Editing, pausing, extending, skipping, or resetting rest during execution.
* Changes to planned/performed data, transition facts, History, Progress, adaptation, or AI.
* Native packaging, background execution, or guaranteed behaviour while hidden or terminated.

## Dependencies

* F12 — Mobile-first UI System and Phase 1 UX Refresh.
* F14/F14.2 — Live Workout Timeline, Set Tracking, and Explicit Set Start.
* F15/F15.1 — Workout exceptions and skip behaviour.
* F17 — Workout Completion.
* F25 — Performed Set Adjustment Reliability.
* F26 — Rest Countdown Focus and Audio Cue.
* F26.1 — Active Workout Screen Wake Lock.
* F27 — Configurable Automatic Same-exercise Set Start.

## Notes

Prefer extracting small pure derivations for effective metric values, later unresolved exercises,
and exercise-rest countdown state rather than embedding more timer/list logic directly in the
screen component. A shared visual timer composition must not merge set-rest audio/automatic
behaviour with the presentation-only exercise transition.

The change from total elapsed transition time to countdown/overtime is intentionally presentation-
only. Existing completion/start timestamps continue to preserve the complete factual transition
duration for history or later analysis.
