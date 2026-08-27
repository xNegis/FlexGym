# F29.1 — Native Rest Completion Cue

## Objective

Deliver the existing same-exercise rest-completion cue reliably from the installed iOS application
when FormCadence is foregrounded, backgrounded, suspended, or the device is locked, while preserving
the current web implementation and workout lifecycle.

## Context

F26 derives a server-relative rest deadline and emits one short warm descending Web Audio cue when a
mounted execution screen observes that deadline. Physical TestFlight use after F29 confirmed that
iOS suspends the WebView while the application is backgrounded or locked, so the existing cue cannot
meet the native-device workflow by itself.

The product owner requires a short non-repeating cue, not an AlarmKit alarm and not an acknowledgement
flow. In the foreground the cue must temporarily duck other audio such as Spotify and then restore it.
In the background or while locked, iOS must display and sound a local notification when notifications
and sound are permitted. Foreground audio may play through the Ring/Silent switch; background and
locked notification sound remains governed by that switch because Critical Alerts are deliberately
not requested.

## User Experience

When the user completes a non-final set with positive planned rest, FormCadence asks for notification
permission when iOS first requires it and schedules one native rest-complete notification for the
existing authoritative deadline.

If FormCadence is visible at zero, the same short two-note cue plays once. Other audio is briefly
attenuated while the cue plays and returns to its prior level immediately afterward. No banner or
duplicate Web Audio cue is presented in the foreground.

If FormCadence is backgrounded, suspended, terminated after scheduling, or the device is locked, iOS
presents a visible `Rest complete` notification with `Your next set is ready.` and plays the bundled
cue when notification sound is allowed. The sound is short and stops by itself; there is no Dismiss,
Stop, snooze, repeating alarm, or required acknowledgement.

Starting the set early, successfully skipping the set or exercise, leaving the execution route, or
making the workout terminal cancels the pending notification. Opening an already-expired rest does
not schedule or replay a stale cue.

## Functional Requirements

### FR-1 — Native-only scheduled delivery

For the installed iOS runtime, a positive F26 same-exercise rest interval schedules one local
notification using the remaining duration derived from the existing server-relative deadline. The
schedule identity includes the complete F26 rest identity and remains stable across timer ticks and
React rerenders.

The browser build continues using F26 Web Audio and never requests notification permission. Android
retains its current web-capability behaviour until a separate physical-device follow-up defines its
notification and exact-alarm contract.

### FR-2 — Permission boundary

The first eligible positive native rest checks notification authorization and requests alert and
sound permission when status is undetermined. This happens contextually after a completed set rather
than on application launch.

Denied, disabled, provisional/quiet, or failed authorization does not block workout use, show a raw
error, or create a repeated prompt. Foreground cue playback remains available independently of
notification authorization. The application makes no claim that background sound occurred.

### FR-3 — One owner and no duplicate cue

For a successfully scheduled positive native rest, the iOS notification owns delivery in every app
state. When delivery occurs in the foreground, the native notification handler suppresses notification
presentation and plays the native cue. F26's observed JavaScript crossing consumes its existing cue
state without starting a second audio path.

If scheduling is unavailable or fails while the execution screen remains visible, the observed F26
crossing uses direct native foreground playback. A pending schedule that loses ownership at the
crossing is cancelled if it later succeeds. Zero-rest transitions use immediate native foreground
playback and do not schedule a notification.

### FR-4 — Foreground audio session

Native foreground playback uses a temporary iOS playback audio session with `duckOthers`. The cue
uses the approved F26 character and duration. When playback finishes or fails, FormCadence deactivates
its session with notification to other audio sessions so Spotify and equivalent media can recover.

Playback is non-looping and best-effort. Output route and media volume remain system-owned. Foreground
playback may remain audible through the Ring/Silent switch; it does not request Critical Alerts.

### FR-5 — Background and locked presentation

The local notification has title `Rest complete`, body `Your next set is ready.`, the bundled custom
cue, and Time Sensitive interruption level on supported iOS versions. It is visible on the Lock
Screen according to the user's notification settings.

Time Sensitive delivery may pass notification summaries and Focus when the user permits it. It does
not override the Ring/Silent switch. No Critical Alerts entitlement, AlarmKit alarm, remote push,
server scheduling, or background JavaScript execution is used.

### FR-6 — Cancellation and stale safety

The pending request is cancelled and any already-delivered rest notification with the same identity
is removed when the rest is no longer owned by the mounted execution route. Cancellation includes a
successful early set start, set/exercise skip, automatic set start, terminal workout response,
validated identity change, navigation, and unmount.

A fresh mount that first discovers zero or overtime does not schedule, foreground-play, or recreate
the expired notification. OS termination after a valid schedule may leave the request with iOS so it
can still deliver at the deadline.

### FR-7 — Failure isolation

Notification request, scheduling, cancellation, native playback, audio-session activation, resource,
and bridge failures do not mutate workout state, retry a workout request, block an existing action,
or expose raw technical errors. The visible and accessible F26 timer remains authoritative in-app.

## Domain / Data Requirements

F29.1 adds no domain entity, database field, migration, fact, event, preference, or backend state.
Notification authorization, pending request identifiers, delivery, and audio-session state are
ephemeral device presentation concerns and are not evidence that a cue was heard.

## API Requirements

No backend endpoint or response changes. The native delivery deadline is derived exclusively from
the existing validated workout response, `server_now`, previous server-owned `completed_at`, and
snapshotted `rest_after_set_seconds`.

## UI Requirements

F29.1 follows `harness/context/07_UI_DESIGN_SYSTEM.md`. It adds no application screen, control,
dialog, toast, layout, loading state, or visual convention. The existing execution screen remains
the primary task surface and `Start set N` remains its dominant action.

The only new presentation is the operating-system authorization prompt and the background/Lock
Screen notification. Existing loading, empty, error, pending, unavailable, confirmation, keyboard,
focus, Back, refresh, safe-area, zoom, and no-horizontal-overflow behaviour remain unchanged at
360 px, 390 px, 430 px, and desktop widths.

## Business Rules

* Only same-exercise set rest receives this cue; exercise transitions do not.
* Null rest never schedules or plays.
* Positive native rest has at most one scheduled/delivered cue owner.
* Zero rest cues immediately only when created by the confirmed user transition.
* No stale cue occurs on fresh expired mount.
* The cue never starts, completes, skips, or otherwise mutates a set.
* Foreground cue playback can duck other media and may sound through Ring/Silent.
* Background/locked delivery respects Ring/Silent and all user notification authorization.
* No acknowledgement is required and no alarm repeats.

## Validation

* Stable identity schedules once despite repeated positive observations.
* Expired, zero, and null observations do not schedule.
* Identity change and loss of eligible state cancel the previous request.
* A scheduled native request owns the crossing and suppresses direct duplicate playback.
* Failed or denied scheduling falls back to direct foreground playback.
* A pending schedule that crosses before resolution cannot later duplicate delivery.
* The bundled sound is a valid short PCM WAV and is copied into the iOS application resources.
* iOS project configuration contains the native source, resource, and Time Sensitive entitlement.
* Browser builds retain Web Audio and contain no notification request.

F29.1 adds no migration. Existing configured-database revision status remains unchanged and no
migration gate is introduced.

## Acceptance Criteria

* [ ] A positive same-exercise rest schedules one local iOS notification at the server-derived deadline.
* [ ] Foreground delivery emits one short cue, ducks Spotify, restores it, and produces no duplicate.
* [ ] Background and locked delivery shows `Rest complete` / `Your next set is ready.` and emits the
  short sound when iOS notification sound is permitted.
* [ ] Foreground playback remains audible with the Ring/Silent switch enabled on the physical iPhone.
* [ ] Background/locked delivery respects Ring/Silent and does not request Critical Alerts.
* [ ] The sound ends by itself without AlarmKit, Dismiss, Stop, snooze, repeat, or acknowledgement.
* [ ] Early start, automatic start, skip, terminal state, identity change, and route exit cancel the
  pending request without affecting the workout mutation.
* [ ] Fresh expired mounts, null rest, repeated ticks, rerenders, and visibility recovery do not
  create stale or duplicate cues.
* [ ] Notification or audio failure leaves the existing timer and workout actions usable.
* [ ] Existing web cue, workout execution, automatic start, wake lock, and native authentication
  behaviour retain their established contracts.
* [ ] Frontend tests and static/build checks pass, Capacitor iOS synchronization passes, Codemagic
  compiles the Swift target, and focused physical-iPhone validation passes.

## Tests

Focused frontend unit tests cover the native-delivery coordinator's stable scheduling, cancellation,
crossing ownership, failed-schedule fallback, pending-resolution race, stale mount, and disposal.
Existing F26 and F27 tests continue covering rest identity/crossing and automatic-start boundaries.

Static inspection validates the iOS source/resource/entitlement project membership and absence of
Critical Alerts, AlarmKit, background modes, remote push, or backend changes. Windows cannot compile
the iOS target; Codemagic's clean hosted build is the native compilation gate.

Manual physical-iPhone validation covers foreground speaker playback, Spotify duck/restore, Ring/Silent
foreground playback, app switching, device lock, notification permission grant/denial where practical,
early cancellation, notification text, no duplicate after return, and background Ring/Silent
suppression. Per DEC-019, no automated browser test is added.

## Out of Scope

* Critical Alerts or guaranteed sound through Ring/Silent while backgrounded or locked.
* AlarmKit, persistent alarm UI, acknowledgement, Dismiss/Stop, snooze, or repeating sound.
* Android notification channels, exact-alarm permission, Doze handling, or Play Store delivery.
* Exercise-transition cues, voice prompts, vibration/haptics, user sound settings, volume controls,
  sound selection, or a test button.
* Remote push notifications, backend scheduling, background JavaScript, background audio keepalive,
  service workers, Live Activities, Dynamic Island, Apple Watch, or widgets.
* Automatic workflow mutation beyond the already implemented F27 contract.

## Dependencies

F14/F14.2 live set lifecycle; F17 terminal workouts; F25 adjustment reliability; F26 rest countdown
and cue identity; F27 automatic same-exercise set start; F29 native Capacitor packaging and Codemagic
distribution.

## Notes

Schedule by remaining duration, not the device clock's interpretation of the server timestamp. Keep
the complete F26 rest identity as the cancellation/deduplication key. A native positive-rest request
must remain the sole cue owner after successful scheduling so returning from suspension cannot replay
the browser's formerly best-effort late cue.
