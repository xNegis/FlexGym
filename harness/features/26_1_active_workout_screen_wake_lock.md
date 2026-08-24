# F26.1 — Active Workout Screen Wake Lock

**Status:** Implemented and automatically validated as of 2026-08-24; product-owner iPhone/Safari
validation remains pending.

## Objective

Keep the phone display awake while the user is actively executing an in-progress workout so Safari
does not suspend the visible countdown merely because the normal iPhone auto-lock interval expires.

F26.1 complements F26's visual countdown and best-effort audio cue. It prevents automatic screen
sleep while the live workout remains visible; it does not make a web page a native background alarm.

## Context

Physical iPhone/Safari validation of F26 exposed two independent platform boundaries. Web Audio is
muted by iOS silent mode, and Safari may suspend timers and audio after the display locks. The
product owner prioritizes uninterrupted music, so F26.1 addresses only the screen-lock boundary and
does not force an exclusive media audio session.

F26 deliberately excluded wake lock from its own scope. F26.1 supersedes that exclusion as a
separate, bounded Phase 3.5 feature after collaborative product-owner confirmation.

## User Experience

When an owned workout is confirmed as `in_progress` and either its workout overview or exercise
execution route is visible, FlexGym requests a screen wake lock. The display remains awake through
normal set execution and rest countdowns without a new setting, prompt, or persistent indicator.

Leaving the workout, completing or cancelling it, manually locking the phone, or making Safari
non-visible releases or invalidates the lock. Returning to the visible active workout requests it
again. If Safari requires a fresh user activation, the next normal tap or keyboard interaction
provides one bounded retry.

Unsupported or denied wake lock changes nothing about the workout UI or mutations.

## Functional Requirements

### FR-1 — Confirmed active-workout scope

Wake lock is enabled only from a validated workout response whose status is `in_progress`. A URL,
loading placeholder, malformed response, not-found state, or stale client assumption cannot enable
it.

Both `/workouts/{workoutId}` and `/workouts/{workoutId}/exercises/{exercisePosition}` participate so
normal navigation between overview and live exercise execution does not deliberately abandon the
active-workout behaviour.

### FR-2 — Visible screen acquisition

While an eligible workout screen is mounted and the document is visible, FlexGym requests the
browser-native `screen` wake lock. It feature-detects the capability and uses no user-agent or
Safari-version branching.

Acquisition is best-effort and asynchronous. It cannot delay rendering, workout loading, set
completion, set start, skipping, cancellation, or completion.

### FR-3 — User-activation fallback

If initial acquisition is denied because the platform requires transient activation, FlexGym may
retry on a subsequent real pointer or keyboard interaction while the eligible screen remains
active. It must not poll, run a timed retry loop, or repeatedly request while a lock or request is
already outstanding.

### FR-4 — Visibility recovery

Browser or operating-system release remains authoritative. When Safari returns to a visible active
workout after a visibility change, FlexGym requests a replacement lock when none is held. Hiding
the page does not attempt to keep it artificially visible or executing in the background.

### FR-5 — Release and race safety

FlexGym releases its held lock when the workout becomes terminal, the eligible screen unmounts, or
the user navigates away. If an asynchronous request succeeds only after the owning screen has
already become ineligible, the newly returned lock is released immediately.

React rerenders and duplicate interactions do not accumulate wake locks or concurrent requests.

### FR-6 — Failure isolation

Missing APIs, rejected permission, platform revocation, release failure, and runtime exceptions are
contained within the presentation capability. They produce no raw error, alert, retry spinner,
workout-state mutation, API request, or false claim that the screen will remain awake.

## Domain / Data Requirements

F26.1 adds no domain entity, fact, event, preference, table, column, migration, or persisted wake-lock
state. A held wake lock is ephemeral browser state and is not evidence about workout performance.

## API Requirements

F26.1 changes no backend endpoint or response. It consumes the existing validated workout status.

## UI Requirements

F26.1 follows `harness/context/07_UI_DESIGN_SYSTEM.md` but adds no visible control, text, icon, toast,
dialog, loading state, or layout change. Existing workout hierarchy, focus, touch, responsive,
safe-area, zoom, Back, and overflow behaviour remain unchanged.

Failure is deliberately silent because the browser exposes no stable corrective action or reliable
truth that the operating system will keep the screen awake.

## Business Rules

* Only a confirmed in-progress workout may hold the lock.
* Wake lock applies only while an eligible workout page is visible.
* The feature prevents automatic display sleep; it cannot prevent deliberate locking.
* Returning to a visible active workout may reacquire a released lock.
* Terminal workouts and non-workout routes do not retain the lock.
* Wake-lock outcome never changes workout facts, timers, lifecycle, or navigation.

## Validation

* An active visible workout requests one screen lock.
* Cleanup releases a held lock and removes listeners.
* An initial rejection is retried only after a real interaction.
* A hidden page does not request; returning visible can request.
* Platform release permits a later reacquisition.
* A request resolving after cleanup releases its returned lock.
* Unsupported capability and request/release rejection remain non-disruptive.

F26.1 adds no migration. Existing frontend and backend validation remain unchanged except for the
focused frontend controller tests and static/build checks.

## Acceptance Criteria

* [ ] A confirmed active workout requests Screen Wake Lock on supported Safari/iOS.
* [ ] The iPhone display remains awake beyond its configured auto-lock interval while the active
  workout remains visible.
* [ ] Returning to visible Safari reacquires a lock when the platform released it.
* [ ] Completing, cancelling, or leaving the workout releases application ownership of the lock.
* [ ] Unsupported, denied, revoked, and late-resolving requests cannot disrupt workout use.
* [ ] No wake-lock status, setting, API, persistence, migration, or background-alarm claim is added.
* [ ] F25 adjustment capture, F26 rest countdown/cue, explicit set start, skips, completion, and
  Browser Back retain their existing behaviour.
* [ ] Frontend unit, type, lint, format, and production-build checks pass.
* [ ] Product-owner validation passes on the physical iPhone/Safari workout flow.

## Tests

Focused frontend unit tests cover acquisition, cleanup, interaction retry, visibility recovery,
platform release, and late asynchronous success. Static validation verifies that both active
workout screens derive enablement from validated `in_progress` state.

Per DEC-019, no automated browser test is added. Manual validation uses the physical iPhone with a
short auto-lock interval, leaves a visible active workout untouched beyond that interval, confirms
the display remains awake, then verifies release after leaving or completing the workout.

## Out of Scope

* Overriding iOS silent mode or changing F26's audio-session behaviour.
* Native iOS packaging, `AVAudioSession`, notifications, vibration, or background execution.
* Keeping Safari running while another app is visible or after deliberate device lock.
* A user setting, toggle, status indicator, permission tutorial, or battery estimate.
* Automatic set start, timer persistence, or any workout lifecycle mutation.

## Dependencies

* F13 — Start Workout.
* F14/F14.2 — Live workout execution and explicit set lifecycle.
* F17 — Workout Completion.
* F26 — Rest Countdown Focus and Audio Cue.

## Notes

Use capability detection rather than browser detection. Treat wake lock as a revocable lease, not a
durable permission or guarantee. A normal user interaction is an acceptable bounded recovery point;
a timer-based retry loop is not.
