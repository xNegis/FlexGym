# F26 — Rest Countdown Focus and Audio Cue

**Status:** Implemented and automatically validated as of 2026-08-24; product-owner manual
device/browser validation remains pending.

## Objective

Make between-set rest usable without repeatedly approaching or watching the phone. The rest
countdown becomes the dominant, distance-readable element of the awaiting-set screen and emits one
short, warm audio cue when planned rest reaches zero.

F26 reduces visual monitoring while preserving the user's control over set start. It does not start
the next set automatically; configurable automatic set start is a separate Phase 3.5 feature.

## Context

F14 introduced the set-rest countdown and overtime display. F14.2 corrected the execution lifecycle
so a completed non-final set opens the next set in `awaiting_set_start`; the user may start it before
or after planned rest reaches zero.

The implemented countdown is only 5 rem wide with 1.125 rem timer text. During a real gym session,
the product owner had to repeatedly approach and inspect the phone to know whether rest had ended.
There is no non-visual completion cue, so putting the phone down makes the planned rest boundary easy
to miss.

F26 supersedes F14/F14.2 only where they exclude sound or define the compact visual composition of
the between-set countdown. The following existing semantics remain authoritative:

* Rest is derived from the previous set's server-owned completion timestamp and snapshotted
  `rest_after_set_seconds`.
* The countdown reaches zero and then continues as warning-treated `+M:SS` overtime.
* Rest never blocks an early manual start.
* A timer does not mutate workout state or become an authoritative event.
* `Start set N` remains explicit and server-owned.
* Exercise transitions use their separate ascending timer and receive no F26 cue.

Web applications cannot guarantee timed playback after the operating system suspends or terminates
the browser. F26 therefore provides the strongest bounded web behaviour available while the workout
page remains open, but does not claim native-alarm reliability.

## User Experience

### Rest begins

After `Next set` successfully completes a non-final set, the screen enters `awaiting_set_start` for
the next set. The user sees, in order:

1. Exercise identity and `Set N of M`.
2. A large circular rest countdown that dominates the screen.
3. Rest status.
4. `Start set N` as the sole dominant action.
5. A compact next-set prescription and secondary adjust/help/skip actions.

The countdown is large enough to read while the phone is resting nearby. The user may put the phone
down and wait for the audio cue rather than checking it repeatedly.

### Rest reaches zero

When a positive planned rest crosses from time remaining to zero or overtime, FlexGym emits exactly
one short audio cue for that rest interval. The cue is:

* A warm descending two-note chime.
* Less than one second in total duration.
* Moderate in perceived volume.
* Clearly distinguishable from ordinary interface feedback.
* Non-looping, non-repeating, and not patterned like an urgent alarm.

At the same boundary, the visual timer changes to `+0:00`, retains the existing warning treatment
and status icon, and changes its concise visible status to:

```text
Rest complete
```

Overtime then continues as `+M:SS`. The cue does not repeat while overtime increases.

### Starting early or late

`Start set N` is available throughout rest. If the user starts the set before zero, the countdown
and pending cue are cancelled. No delayed cue may play while that set is already in progress.

If the user waits beyond zero, the set remains awaiting start and the overtime display continues.
The cue does not press `Start set N`, record a set-start timestamp, or otherwise advance workflow.

### Zero and null rest

A configured zero-second rest enters `+0:00` immediately after the previous set is successfully
completed and emits the one-time cue as part of that user-initiated transition.

When planned rest is `null`, no countdown, overtime display, audio cue, or empty timer shell appears.
`Start set N` remains required.

### Backgrounding, locking, and returning

When the awaiting-set screen was already mounted before the deadline, it remains armed for that rest
interval. If the browser delays execution while the tab is backgrounded or the screen is locked, the
next observed transition from positive remaining time to zero/overtime attempts the cue once. The
cue may therefore be late when platform scheduling was suspended.

If the user opens, resumes through a fresh mount, or refreshes the execution route after the deadline
already passed, FlexGym reconstructs the correct overtime display but does not emit a stale catch-up
cue. This avoids a chime whose original rest boundary may have passed minutes earlier.

Playback while another application is visible or the device is locked is best-effort. Browser
policy, operating-system suspension, system volume, output routing, and silent-mode behaviour remain
outside FlexGym's control. Audio failure does not block the workout or display a disruptive error.

## Functional Requirements

### FR-1 — Dominant distance-readable countdown

During `awaiting_set_start` with non-null rest, the rest circle uses a responsive size equivalent to:

```css
width: clamp(13rem, 62vw, 18rem);
height: clamp(13rem, 62vw, 18rem);
```

The countdown numerals use a responsive size equivalent to `clamp(3.25rem, 15vw, 5rem)`. The exact
CSS may use existing design tokens and shared compositions, but it must preserve approximately the
same 208–288 CSS-pixel visual range and may not regress to the compact F14 timer.

The circle, numeral, status icon, and visible status remain legible without relying solely on color.
The larger composition must not enlarge the exercise-transition timer or the current-set prescription
circle unless a shared implementation can preserve their existing hierarchy.

### FR-2 — Awaiting-set information hierarchy

The rest countdown and `Start set N` occupy the primary visual region. Exercise/set identity remains
above the timer. The required next-set prescription remains visible but moves below the dominant
action in a compact treatment so tempo, notes, rest metadata, and secondary actions do not compete
with the countdown.

Exactly one dominant action remains visible: `Start set N`. `Adjust set`, instructions, and skip
actions remain secondary. F26 does not remove data required by F14/F14.2 or introduce a second
primary action.

### FR-3 — Rest-interval identity and deadline

The frontend derives one rest interval from validated confirmed state:

* Workout ID.
* Workout-exercise position.
* Current awaiting planned-set position.
* Previous planned-set position and server-owned `completed_at`.
* Previous set's snapshotted `rest_after_set_seconds`.

The deadline is still:

```text
previous set completed_at + planned rest seconds
```

The existing server-time offset reconstruction remains authoritative. Device clock time alone does
not redefine the deadline. No cue-fired flag, deadline, timer tick, or elapsed value is persisted or
sent to the backend.

### FR-4 — Cue arming and one-time crossing

A positive-rest interval becomes armed only when the mounted execution screen observes it before
its deadline. When that same armed interval first changes from positive time remaining to zero or
negative time remaining, the frontend attempts playback exactly once and marks the interval consumed
in local state.

The crossing logic must be independent from one-second display precision and tolerate delayed
callbacks. React rerenders, Strict Mode effects, repeated timer ticks, server response replacement,
and overtime updates must not duplicate playback.

Entering a newly created zero-rest interval directly from the successful user-initiated `Next set`
transition attempts one cue immediately. Merely mounting or refreshing an already-expired interval,
including a zero-rest interval, does not.

### FR-5 — Audio preparation and playback

The implementation uses browser-native audio capability without an external network dependency. It
may synthesize the cue through Web Audio or use a small checked-in application asset. The result must
match the approved cue character and remain deterministic across repeated plays.

The `Next set` user interaction should initialize or resume the audio capability before awaiting the
asynchronous completion response where browser policy requires a user gesture. Other normal workout
interactions may also safely prepare it. Preparation itself is silent and must not delay, fail, or
change the performance mutation.

The cue uses a soft attack and release, contains no harsh square-wave tone, clips neither channel,
and uses two descending pitches below 700 Hz. Total audible duration is from 0.6 through 1.0 seconds.

Playback obeys the device's current output, volume, and browser policy. F26 adds no in-app volume,
mute, enable/disable, sound-selection, or test control.

### FR-6 — Cancellation and rearming

A pending or armed cue is cancelled when any of the following occurs before playback:

* `Start set N` succeeds for the awaiting set.
* The set or its exercise is successfully skipped.
* The workout is completed, cancelled, no longer active, or no longer owns that current set.
* Navigation or component unmount leaves the live execution screen.
* A validated server response changes the rest-interval identity.

Starting early must cancel scheduled audio nodes or callbacks, not merely hide the timer.

A later non-final set completion creates a different rest identity and may arm one new cue. A
consumed interval never rearms because of an unrelated server response or navigation within the same
mounted state.

### FR-7 — Visual and accessible completion state

Before zero, the visible status remains `Rest`. At and after zero it becomes `Rest complete` while
the timer displays `+M:SS`. Warning color and the established alert-clock icon remain non-danger
signals.

Assistive technology receives one concise rest-complete announcement at the crossing. It does not
receive an announcement every second. The timer retains an accessible value that communicates time
remaining or overtime, and the completion state is understandable without hearing the cue or seeing
color.

### FR-8 — Audio failure isolation

Unsupported audio APIs, denied playback, suspended contexts, missing output devices, and runtime
playback errors do not:

* Fail or roll back set completion.
* Block `Start set N`.
* Change confirmed workout state.
* Create repeated retry loops.
* Render raw browser errors or a persistent failure alert.

The application may record a development diagnostic, but user-facing UI must not claim the cue
played successfully. The visual timer remains the reliable in-app fallback.

### FR-9 — Manual set start remains authoritative

F26 does not call the set-start endpoint automatically. It does not schedule, simulate, or dispatch
the `Start set N` action after audio playback. The server records a set start only after the existing
explicit user action succeeds.

This requirement preserves F14.2's manual-only lifecycle until the separately groomed automatic-start
feature explicitly supersedes it.

### FR-10 — Existing execution safety

Countdown and cue state derive only from a complete validated workout response. Malformed responses
cannot arm audio, alter the timer, or advance the workflow. Expected request errors and unexpected
network failures preserve the last confirmed rest state and normal recovery actions.

Timer updates remain client projections and make no API request. Existing duplicate-submission,
ownership, active-workout, cancellation, skip, correction, and resume protections remain unchanged.

## Domain / Data Requirements

F26 introduces no domain entity, table, column, preference, event type, persisted timer state,
analytical fact, or database migration.

The audio cue is ephemeral presentation derived from the existing rest deadline. A locally consumed
cue is not evidence that the device produced audible sound and must not be added to the workout
timeline or treated as a user action.

One small frontend timer/cue state module may own rest identity, initial arming, deadline crossing,
consumption, and cancellation. Keep Web Audio or media-element effects outside React rendering so
the pure state transition can be tested without browser audio.

## API Requirements

F26 adds and changes no API endpoint or public response shape.

It continues to consume the F14/F14.2 workout representation, including:

* `server_now`.
* Current exercise/set positions and lifecycle phase.
* Previous performed-set `completed_at`.
* Snapshotted `rest_after_set_seconds`.

No request reports that a timer crossed zero or that a cue was attempted, played, blocked, or heard.

## UI Requirements

F26 follows `harness/context/07_UI_DESIGN_SYSTEM.md` completely and introduces no parallel visual
language.

Reuse `AppShell`, `Page`, `Card`, `Stack`, `Inline`, `Button`, existing timer/icon treatments, and the
shared execution actions. Extend the existing rest-timer composition with semantic design tokens;
do not introduce raw colors, a generic alarm component, modal, toast, sound setting, or new primary
button.

### Awaiting-set states

Exercise and validate:

* Positive rest with more than one minute remaining.
* Positive rest below one minute.
* Final positive second before zero.
* Exact zero and subsequent overtime.
* Zero-second configured rest created by `Next set`.
* Null rest without timer shell or cue.
* Early manual set start.
* Cue attempted successfully, unavailable, blocked, or rejected.
* Mounted-before-deadline background delay followed by a late observed crossing.
* Fresh mount, direct navigation, or refresh after the deadline with no stale cue.
* Skip, cancel, corrected timeline, malformed response, and not-found states.

The screen does not display technical playback status or promise background reliability. Pending and
failed workout mutations retain their existing labels and recovery boundaries.

### Responsive behaviour

Validate the dominant rest composition at 360 px, 390 px, 430 px, and a representative desktop
width. The timer must fit without clipping or horizontal scrolling, including safe-area insets and
200% zoom. `Start set N` remains reachable without precision scrolling and is never obscured by main
navigation or the on-screen keyboard.

Long exercise names, multi-digit set counts, `M:SS` and `+M:SS`, adjusted-set summaries, tempo,
notes, and secondary actions must wrap without shrinking the timer below its specified minimum or
causing document-level horizontal overflow.

Verify keyboard navigation, visible focus, 44-pixel controls, reduced motion, Browser Back, refresh,
screen locking, and app switching. The cue contains no motion dependency.

## Business Rules

* Set rest applies only after a completed non-final set when another set remains in the same
  exercise.
* Exercise-transition timing receives no F26 audio cue.
* Null rest produces neither timer nor cue.
* Zero rest created by a successful completion produces one immediate cue.
* Positive rest produces at most one cue when an armed interval crosses zero.
* A fresh mount after expiry reconstructs overtime without a stale cue.
* A mounted page may attempt one delayed cue after platform suspension when it next observes the
  crossing.
* Starting early cancels the pending cue.
* The cue never starts, completes, skips, or otherwise mutates a set.
* Audio is supplemental; visual and accessible completion state remains mandatory.
* System/browser audio policy is respected and background playback is best-effort.
* The user receives no F26 sound configuration, mute, volume, or test control.
* No audio outcome becomes a workout fact, event, metric, signal, or coaching input.

## Validation

* Rest identity includes workout, exercise, current set, previous set, previous completion timestamp,
  and planned rest duration.
* Deadline uses server-relative time and the existing validated timestamps.
* Initial positive state arms; the first positive-to-zero/overtime transition consumes once.
* Repeated zero/overtime observations cannot replay the cue.
* A successful zero-rest `Next set` transition cues once; a fresh already-zero mount does not.
* Null rest cannot arm or play.
* A changed, skipped, started, terminal, or unmounted interval cancels pending playback.
* An audio exception cannot affect confirmed workout state or lifecycle actions.
* The timer exposes non-color and non-audio completion semantics without per-second announcements.
* F26 adds no migration. Before completion, compare configured-local `alembic current` with
  repository `alembic heads`; no fresh/previous-head migration gate is introduced.

## Acceptance Criteria

* [ ] The between-set countdown is approximately 208–288 CSS pixels and readable at a useful phone
  viewing distance at every required width.
* [ ] Exercise/set identity, the dominant timer, rest status, `Start set N`, prescription, and
  secondary actions follow the specified mobile hierarchy.
* [ ] A positive rest interval emits one warm descending cue when it first crosses zero.
* [ ] Exact zero changes the visible status to `Rest complete` and overtime continues as `+M:SS`.
* [ ] The cue never repeats during overtime, rerenders, timer ticks, or same-interval server updates.
* [ ] A newly created zero-second rest emits one immediate cue and remains manually startable.
* [ ] Null rest displays no timer shell and emits no cue.
* [ ] Starting a set before zero cancels its pending cue and no delayed sound plays in progress.
* [ ] A mounted pre-deadline interval attempts one cue after a delayed background crossing.
* [ ] Refreshing or freshly opening an already-expired interval shows correct overtime without a
  stale cue.
* [ ] Cue preparation or playback failure cannot fail set completion, block set start, or expose raw
  errors.
* [ ] System volume/output policy remains authoritative and the UI makes no guarantee of native
  background-alarm behaviour.
* [ ] Audio completion is supplemented by visible status, icon, accessible timer value, and one
  restrained announcement.
* [ ] `Start set N` remains the only action capable of starting the next set; F26 performs no
  automatic advance.
* [ ] Exercise transitions, final-set completion, skip, cancellation, correction, resume, and F25
  adjusted-value capture retain their existing behaviour.
* [ ] Changed UI satisfies responsive, zoom, focus, touch, safe-area, reduced-motion, and overflow
  contracts.
* [ ] Frontend unit/static/build checks, backend regressions, configured-database revision check, and
  focused manual device/browser validation pass.

## Tests

Frontend unit tests cover the pure rest-cue state boundary:

* Stable rest-interval identity and change detection.
* Positive initial observation arming without playback.
* Exact and delayed positive-to-non-positive crossing consuming once.
* Repeated overtime observations producing no second cue.
* User-initiated zero-rest creation cueing once.
* Fresh already-expired or already-zero mount remaining consumed without playback.
* Null rest, early set start, skip, workout cancellation, identity change, and unmount cancellation.
* A later rest interval rearming independently.

Code inspection and frontend static checks verify:

* Audio preparation occurs from an eligible user interaction without coupling it to mutation
  success.
* Browser audio calls are isolated behind safe error handling.
* No timer tick, cue state, or playback result is persisted or sent to the API.
* No code path invokes set start automatically.
* Timer announcements occur at the completion boundary rather than every second.

Run the relevant existing backend workout tests to protect F14/F14.2 completion timestamps,
set-start lifecycle, null/zero/positive rest sources, skip/cancel behaviour, and server-time
reconstruction. F26 requires no new backend endpoint or persistence test.

Per DEC-019, F26 adds no automated browser or automated browser-level tests. Focused manual
validation covers:

* Listening to the cue in a normal foreground workout on each supported browser family available to
  the project.
* Phone-speaker intelligibility in a representative gym-like environment without becoming harsh or
  repetitive.
* Positive, zero, and null rest; exact zero; prolonged overtime; and early start.
* Screen lock and switching to another app, documenting platform-specific best-effort results rather
  than treating OS suspension as an application failure.
* Refresh/direct navigation before and after the deadline and absence of stale/duplicate cues.
* Audio unavailable/blocked while the visual workflow remains fully usable.
* 360 px, 390 px, 430 px, and representative desktop layout, plus 200% zoom, keyboard, focus, touch,
  safe areas, reduced motion, and document-overflow inspection.

## Out of Scope

* Automatically starting the next set after rest or after a configurable delay.
* User settings for sound enablement, mute, volume, cue selection, or a test button.
* Repeated alarms, snooze, acknowledgement, countdown voice, spoken exercise names, music ducking,
  or haptic patterns.
* Vibration, notifications, push, service workers, background workers, native packaging, Android/iOS
  alarm APIs, or guaranteed playback while suspended or terminated.
* Screen Wake Lock or keeping the display awake.
* Changing exercise-transition timing or adding a between-exercise cue.
* Rest extension, pause, skip, manual reset, or custom rest changes during execution.
* Persisting timer ticks, deadlines, cue-fired flags, playback outcomes, or device audio preferences.
* Changing performed-set capture, F25 adjustment reliability, plan snapshots, Progress, adaptation,
  recommendations, or AI.

## Dependencies

* F12 — Mobile-first UI System and Phase 1 UX Refresh.
* F14 — Live Workout Timeline and Set Tracking.
* F14.2 — Explicit Set Start and Accurate Set Timing.
* F15/F15.1 — Workout exception and skip behaviour.
* F17 — Workout Completion.
* F25 — Performed Set Adjustment Reliability.

## Notes

The important distinction is between an interval that was observed and armed before its deadline
and an interval first discovered after expiry. Preserve that distinction explicitly; deriving only
`remaining <= 0` in an effect will cause stale cues on refresh and duplicates on rerender.

Prime audio during an eligible user gesture, but do not produce a silent or audible test sound. The
mutation must remain correct even when audio initialization throws.

F27 may later use the same rest identity and crossing boundary to schedule automatic start, but F26
must not pre-authorize or implement that behaviour.
