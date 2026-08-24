# F27 — Configurable Automatic Same-exercise Set Start

**Status:** Implemented and automatically validated as of 2026-08-24; product-owner manual UI
validation remains pending.

## Objective

Remove the avoidable return-to-phone interaction between sets when the user explicitly chooses that
behaviour. A persisted per-user workout preference may pre-authorize FlexGym to start the next set
of the same exercise after planned rest completes and a selected additional delay elapses.

The default remains manual. Automatic start never crosses between exercises, completes work, or
claims to know when the user physically began lifting. It records a distinct automatic start fact at
the pre-authorized boundary so manual and application-triggered starts remain auditable.

## Context

F14.2 deliberately separated `awaiting_set_start` from `set_in_progress` and made every set start an
explicit manual action. F26 made the between-set rest countdown dominant and added one best-effort
audio cue at rest completion. F26.1 requests a screen wake lock while an active workout screen is
visible. Real gym use still exposed one interaction after rest: returning to the phone only to press
`Start set N`.

F27 supersedes F14.2 and F26 only for a user-pre-authorized automatic transition between sets of the
same exercise. Their remaining lifecycle, timer, audio, ownership, interruption, and factual-data
rules remain authoritative.

The web client cannot guarantee execution while hidden, suspended, offline, or terminated. F27
therefore automates only a timely, visible, mounted execution flow. It adds no native scheduler,
background worker, notification, service worker, or late catch-up start.

## User Experience

### Configuring the preference

Profile gains a `Workout settings` section and a dedicated `/profile/workout-settings` route. The
screen explains the current setting and offers exactly these choices:

* `Manual start` (`0` seconds).
* `5 seconds`.
* `10 seconds`.
* `15 seconds`.
* `20 seconds`.
* `30 seconds`.

`Manual start` is the default for existing and new users. A positive value means that after a
non-null planned rest reaches zero, FlexGym waits that additional delay and then attempts to start
the next set automatically.

Changing from manual to any positive value opens a consequential confirmation before saving. It
states that:

* Automatic start applies only between sets of the same exercise.
* FlexGym records the configured automatic boundary as the set start.
* The recorded time may be earlier than the user's physical first repetition.
* Changes apply only to workouts started after the setting is saved.

Cancelling leaves the confirmed preference unchanged. Changing one positive delay to another or
disabling automatic start does not require confirmation, although the explanation remains visible.
Every later transition from manual back to a positive value confirms again; no separate permanent
acknowledgement flag is stored.

Saving keeps the user on the settings screen and shows restrained inline success feedback. Profile
shows the effective value and a secondary `Manage workout settings` action.

### Workout snapshot

Starting a workout copies the user's effective automatic-start delay into the immutable workout
snapshot. A missing preference resolves to `0`. Later preference edits do not change an existing
workout, including one that has not yet reached its first rest.

This makes the behaviour of the complete workout predictable and keeps automatic event eligibility
reconstructable after the global preference changes.

### Positive planned rest

For a workout whose snapshot delay is positive, the existing F26 rest countdown remains unchanged
until planned rest reaches zero. The audio cue is still attempted once at that rest boundary.

At zero, the dominant timer changes from the rest countdown to the configured post-rest delay:

```text
Starting automatically
0:10
```

The delay counts down to zero. `Start set N` remains the sole dominant action throughout and can
start the set early. The next-set prescription and secondary adjust/help/skip actions retain their
F26 hierarchy.

When the automatic boundary is reached while the execution route is mounted and visible, FlexGym
attempts automatic start exactly once. The action becomes pending with `Starting...`. A validated
success enters `set_in_progress` and renders the normal in-progress set screen.

### Zero and null planned rest

A zero-second planned rest retains F26's immediate cue and begins the configured post-rest delay
immediately after the successful `Next set` transition.

A null planned rest has no objective rest-completion boundary. It therefore remains manual even when
the workout snapshot contains a positive automatic delay: no timer, audio cue, post-rest delay, or
automatic request appears.

### Manual start, skip, cancellation, and navigation

Manual start remains available before rest ends and throughout the post-rest delay. A successful
manual start cancels the pending automatic action and records the existing manual `set_started`
event.

A successful set or exercise skip, workout cancellation or completion, change of current set,
terminal response, route unmount, or navigation away cancels any not-yet-sent automatic action.
Browser Back never starts a set.

If navigation occurs after an automatic request has already reached the backend, the confirmed
server result remains authoritative. Returning reconstructs the resulting lifecycle normally.

### Refresh, visibility, and late discovery

A fresh mount or refresh before the automatic boundary may reconstruct and arm the remaining rest
or post-rest delay from the workout snapshot and server-owned timestamps.

If the page becomes hidden and returns before the boundary, it may remain eligible. If the boundary
passes while hidden, the interval is consumed without automatic start. Returning afterward shows
the ordinary manual awaiting-set state and rest overtime; it does not catch up.

A fresh mount that first discovers the automatic boundary at or after expiry also remains manual.
The frontend does not infer a stale start merely because current time is beyond the boundary.

Normal visible timer scheduling or network latency may make a request arrive slightly after the
calculated boundary. The backend accepts an otherwise-valid automatic start only through five
seconds after that boundary. It records the exact calculated boundary, not request-arrival time. A
request before the boundary or outside that freshness window is rejected without mutation.

### Failure and concurrency

Only one automatic request is attempted for a rest interval. The frontend never runs an invisible
retry loop.

After a network failure, malformed response, or start conflict that could represent an ambiguous
outcome, the frontend performs one ordinary workout refresh:

* If validated state shows the set in progress, it renders that confirmed state without an error.
* If the set still awaits start, automatic start remains consumed, a safe inline error is shown,
  and `Start set N` remains available for manual recovery.
* If another action changed or terminated the current set, that confirmed state is rendered.

Concurrent manual/automatic requests or two visible clients cannot append two effective starts.
The first valid transaction wins; later requests return a deliberate conflict and are reconciled
through the same refresh boundary.

## Functional Requirements

### FR-1 — Persisted per-user workout preference

Persist one optional one-to-one workout-preferences record per user. Its effective
`automatic_set_start_delay_seconds` is exactly one of `0`, `5`, `10`, `15`, `20`, or `30`; absence
means `0`.

The preference belongs to the user rather than the fitness profile, routine, exercise, or active
workout. Deleting and recreating a fitness profile does not delete the workout preference. Account
ownership and deletion behaviour remain consistent with other user-owned data.

### FR-2 — Immutable workout-level preference snapshot

Every newly created workout stores a non-null `automatic_set_start_delay_seconds` snapshot resolved
from the effective user preference in the same transaction as workout creation. Existing workouts
upgrade to `0` and remain manual.

The snapshot is immutable through supported APIs and is returned in complete workout responses.
Changing the global preference never rewrites historical or in-progress workouts.

### FR-3 — Automatic-start eligibility and boundary

Automatic start is eligible only when all of the following are true:

* The workout is `in_progress` and owned by the authenticated user.
* The target is the earliest unresolved set of the currently started exercise.
* Its derived phase is `awaiting_set_start`.
* A previous set in the same exercise has a current performed projection with server-owned
  `completed_at`.
* The previous snapshotted `rest_after_set_seconds` is non-null.
* The workout's delay snapshot is positive.

The server calculates:

```text
automatic_start_at = previous completed_at
                   + previous planned rest seconds
                   + workout automatic-start delay seconds
```

The endpoint accepts from `automatic_start_at` through `automatic_start_at + 5 seconds`, inclusive.
It rejects earlier or later requests without appending an event.

### FR-4 — Distinct automatic start event

Add `set_auto_started` as a supported typed `WorkoutEvent` value. It requires valid owning workout,
workout-exercise, and workout-planned-set references and has no arbitrary JSON payload.

A successful automatic request appends exactly one `set_auto_started` event whose server-derived
`occurred_at` is `automatic_start_at`. It creates no performed-set row and completes no work.

Manual starts continue to append `set_started` using request-time server UTC. Exercise start and
next-exercise start continue to append manual `set_started` for their first incomplete set and are
never automatic.

### FR-5 — Unified lifecycle with explicit start mode

Both `set_started` and `set_auto_started` open a set's effective in-progress lifecycle. Completion
closes the latest effective start; marking incomplete still requires a later new start.

Derived responses expose start provenance as `manual`, `automatic`, or `null` alongside the existing
start timestamp for both the current set and completed performed-set projections. Automatic-start
duration is derived from its recorded boundary through completion but must remain distinguishable
from a user-declared manual interval.

### FR-6 — Frontend rest/automatic state machine

Extend the bounded F26 rest state module or compose a similarly pure module that owns:

* Stable rest identity.
* Automatic boundary and post-rest remaining time.
* Fresh-mount arming before the boundary.
* Visible mounted boundary crossing.
* Consumption after one attempt, manual start, skip, terminal state, identity change, unmount, or a
  hidden crossing.
* No rearming from rerenders, timer ticks, Strict Mode effects, same-interval response replacement,
  overtime, or recovery refresh.

Timer ticks remain client projections and make no polling request. The automatic transition must not
be implemented as a synthetic click on the button.

### FR-7 — Visibility and freshness safety

Automatic dispatch requires `document.visibilityState === "visible"` at the observed boundary.
Crossing while hidden consumes the local attempt. Fresh mounting at or after the boundary does not
dispatch.

Unsupported visibility APIs, delayed callbacks, suspended tabs, a lost wake lock, offline state,
and closed or terminated browsers do not broaden eligibility or create catch-up behaviour.

### FR-8 — Atomic concurrency safety

The automatic-start service validates eligibility and appends the event atomically. It must remain
correct under competing manual start, automatic start, skip, cancellation, and duplicate automatic
requests. Database constraint or transaction failures are normalized into deliberate application
outcomes; raw integrity errors never escape the API.

The event sequence remains contiguous and exactly one effective start wins. No client-supplied
timestamp, delay, visibility assertion, or event type becomes authoritative.

### FR-9 — One reconciliation after ambiguity

Automatic dispatch performs at most one mutation request. Expected conflict, unexpected failure, or
malformed success triggers at most one authenticated workout read for reconciliation. It does not
retry the mutation automatically.

Validated reconciled state is authoritative. If reconciliation also fails, the last confirmed
awaiting state and manual action remain visible with a generic recoverable error.

### FR-10 — Existing execution preservation

Preserve F14/F14.2/F15/F17/F25/F26/F26.1 behaviour for:

* Manual first-exercise, next-exercise, and between-set starts.
* Performed-set adjustment drafts and confirmed completion.
* Rest audio, visual/accessibility completion, and server-relative time.
* Set/exercise skip and reversal.
* Workout completion, cancellation, correction, and resume.
* Wake-lock acquisition/release and failure isolation.
* Ownership, strict parsing, duplicate-submission protection, and terminal immutability.

## Domain / Data Requirements

F27 introduces:

* A user-owned one-to-one workout-preferences record with the configured delay.
* An immutable non-null delay snapshot on each workout session.
* The typed `set_auto_started` workout event.
* Derived manual/automatic start provenance.

The delay is a user-authorized execution preference, not a fitness fact, routine prescription,
performed value, adaptation signal, or AI interpretation.

Do not persist timer ticks, remaining time, visibility state, attempt/played flags, frontend
deadlines, network failures, or audio outcomes. The exact automatic boundary is derived by the
backend from stored server-owned/snapshotted values.

Database constraints must enforce the allowed delay values for both preference and workout
snapshot. The event-type constraint must preserve every existing supported event.

## API Requirements

All endpoints require authentication. Bodies reject unknown fields. Booleans are invalid as integer
delays. Error bodies follow DEC-009 and frontend consumers normalize all runtime responses.

### `GET /api/workout-preferences`

Returns the effective preference, including the default when no row exists:

```json
{
  "automatic_set_start_delay_seconds": 0
}
```

Returns `401` when unauthenticated. A malformed success is rejected by the frontend boundary.

### `PUT /api/workout-preferences`

Accepts exactly:

```json
{
  "automatic_set_start_delay_seconds": 10
}
```

Returns `200` with the complete effective preference after an atomic create/update. Returns `422`
for an unsupported value, boolean, missing field, or unknown field, and `401` when unauthenticated.
The confirmation dialog is a frontend interaction contract; the backend still validates the value.

### Extended workout representation

The workout root adds:

```json
{
  "automatic_set_start_delay_seconds": 10,
  "current_set_start_mode": "automatic"
}
```

`current_set_start_mode` is `manual` or `automatic` only while a current set is in progress;
otherwise it is `null`. Each performed-set projection similarly adds `set_start_mode`, which may be
`null` for legacy performance without an observed start.

Timeline responses accept `set_auto_started` with the same relational reference requirements as
manual `set_started`.

### `POST /api/workouts/{workout_id}/exercises/{exercise_position}/sets/{set_position}/auto-start`

Accepts no body. It returns:

* `200` with the complete workout in `set_in_progress` after appending `set_auto_started`.
* Ownership-safe `404` outcomes matching manual set start.
* `409 {"detail":"Workout is not active"}` when terminal or stale.
* `409 {"detail":"Workout set is not current"}` for a later or changed set.
* `409 {"detail":"Workout set is already started"}` when another request won.
* `409 {"detail":"Automatic set start is not enabled"}` for snapshot delay `0`, absent previous
  completion, or null planned rest.
* `409 {"detail":"Automatic set start is not due"}` before the boundary.
* `409 {"detail":"Automatic set start window expired"}` after the five-second freshness window.
* `422` for invalid path values or any request body.
* `401` when unauthenticated.

Framework validation shapes remain normalized before reaching UI components.

## UI Requirements

F27 follows `harness/context/07_UI_DESIGN_SYSTEM.md` completely and introduces no parallel visual
language.

Reuse `AppShell`, `Page`, `Section`, `KeyValueList`, `Field`, `Select`, `Button`, `Alert`, `Dialog`,
the existing timer composition, and established workout actions. No new generic setting, countdown,
toast, button, field, or modal treatment is required.

### Profile and settings hierarchy

Profile retains `Edit profile` as its dominant account/profile action. The new `Workout settings`
section is secondary and shows `Set start: Manual` or `Set start: Automatic after N seconds` plus
`Manage workout settings`.

The settings screen uses:

1. Header and concise explanation.
2. One labelled select with the six allowed choices.
3. Visible note that changes apply to new workouts.
4. One dominant `Save settings` action.
5. Inline success or recoverable error feedback.

Initial loading does not show a false manual value. Save pending keeps the selected value visible,
prevents duplicate submission, and uses `Saving...`. A failed save preserves the draft. Unexpected
or malformed responses show a safe generic message. No empty state applies because an effective
default always exists.

The confirmation dialog appears before a manual-to-positive save, traps/restores focus, closes with
Cancel or Escape when not pending, and remains open with recoverable feedback if the confirmed save
fails. Its confirm action is `Enable automatic start`.

Browser Back returns to Profile without saving a draft. Refresh reloads the last confirmed setting.

### Awaiting-set hierarchy

Before rest zero, retain the F26 hierarchy. During the positive post-rest delay, retain the same
dominant circle size and replace its content/status with the remaining automatic delay and
`Starting automatically`. The state is understandable without audio, color, or per-second screen
reader announcements.

`Start set N` remains the sole dominant action. Automatic pending changes that action to
`Starting...` and disables conflicting start/skip/completion mutations until resolution. Secondary
information does not compete with the countdown.

After an ineligible hidden/late boundary or failed automatic attempt, render the ordinary F26
`Rest complete` overtime state, the manual start action, and a contained error when applicable. Do
not keep showing a frozen automatic countdown or claim that the set started.

### States and responsive behaviour

Exercise and validate:

* Manual default workout.
* Positive rest before zero and throughout every supported post-rest delay.
* Zero rest with immediate cue and delayed automatic start.
* Null rest remaining manual.
* Manual start before rest zero and during the delay.
* Automatic pending, success, conflict reconciliation, network ambiguity, malformed success, and
  reconciliation failure.
* Skip, cancellation, terminal state, identity replacement, route unmount, and navigation.
* Refresh before rest completion, during the delay, and at/after the automatic boundary.
* Hidden-before-boundary return, hidden-across-boundary consumption, and visible delayed callback
  within/outside freshness.
* Two-tab or manual/automatic concurrency.
* Unsupported wake lock or visibility behaviour without workflow failure.

Validate changed Profile and execution states at 360 px, 390 px, 430 px, representative tablet or
small desktop, and wide desktop widths. Verify 200% zoom, keyboard navigation, visible focus,
44-pixel targets, safe areas, reduced motion, Browser Back, refresh, on-screen keyboard, long labels,
and no document-level horizontal overflow.

## Business Rules

* `0` always means manual; it never means immediate automatic start.
* Positive allowed delays are exactly 5, 10, 15, 20, and 30 seconds.
* Preference edits apply only to workouts created afterward.
* Automatic start applies only after non-null rest between sets of the same exercise.
* First-set and cross-exercise starts remain explicit manual actions.
* Rest audio occurs at rest completion, not at automatic set start.
* Manual early start, skip, cancellation, terminal state, identity change, hidden crossing, and
  navigation cancel a not-yet-sent automatic attempt.
* A fresh or returned screen never performs a stale catch-up start.
* Exactly one automatic mutation attempt occurs per eligible interval.
* The server owns eligibility, freshness, event type, and exact automatic timestamp.
* Exactly one manual or automatic effective start may win.
* Automatic start never creates performed values or completes work.
* Automatic start provenance remains visible in structured responses.
* Recorded automatic duration is not represented as sensor-verified or exact physical work time.

## Validation

Validate allowed delay values at frontend, API, service, and database boundaries. Confirm absent
preference/default resolution, one-to-one ownership, cross-user isolation, immutable workout
snapshotting, and preservation across fitness-profile deletion/recreation.

Validate automatic boundary calculation with fixed timestamps for positive, zero, and null rest;
exact due time; exact five-second upper bound; early and expired requests; manual/automatic/duplicate
concurrency; and no duplicate/gapped event sequence.

Migration validation must include:

* Applying the complete migration history to a fresh isolated database and verifying preference,
  workout snapshot, allowed-value constraints, and the expanded event constraint.
* Creating an isolated database at the previous committed Alembic head
  `f22_1_global_photo_limit`, populating users and legacy active/completed/cancelled workouts,
  applying F27, and verifying every existing workout defaults to manual without invented automatic
  events or changed facts.
* Exercising real authenticated preference save, workout creation/snapshot, timely automatic start,
  and manual fallback through the API against an upgraded database.
* Comparing `alembic current` and `alembic heads` for the actual configured local development
  database, safely applying the migration before reporting F27 locally operational.
* Re-running the supported migration command and confirming it is safe and creates no duplicate
  preference rows, columns, constraints, or events.

Schemas created only through ORM metadata do not satisfy the migration gate.

## Acceptance Criteria

* [ ] Existing and new users resolve to manual start unless they save a positive option.
* [ ] Profile exposes a dedicated Workout settings flow with the six exact choices.
* [ ] Manual-to-positive save requires the approved consequence explanation and confirmation.
* [ ] Cancelling or failing configuration preserves the prior confirmed value.
* [ ] A new workout atomically snapshots the current preference; existing workouts remain manual.
* [ ] Preference changes never alter an already-created workout.
* [ ] Positive and zero rest enter the configured post-rest delay after the F26 cue boundary.
* [ ] Null rest remains manual and renders no automatic countdown.
* [ ] Manual start remains available before the automatic boundary and cancels automatic dispatch.
* [ ] A visible mounted eligible interval attempts automatic start exactly once at its boundary.
* [ ] A successful automatic request appends one `set_auto_started` at the server-derived boundary
  and creates no performed set.
* [ ] Early and more-than-five-seconds-late automatic requests are rejected without mutation.
* [ ] Hidden crossings and fresh already-expired mounts never catch up automatically.
* [ ] Manual/automatic, duplicate-client, skip, and cancellation races cannot create two starts or
  expose raw persistence errors.
* [ ] Ambiguous automatic outcomes perform one read reconciliation and no mutation retry.
* [ ] Failed or consumed automatic start leaves a usable manual action and correct overtime state.
* [ ] API responses distinguish manual, automatic, and unavailable start provenance.
* [ ] First-set/exercise transitions, performed completion, F25 drafts, F26 cue, F26.1 wake lock,
  skips, correction, cancellation, completion, history, and resume retain their specified behaviour.
* [ ] Changed UI satisfies loading, pending, error, confirmation, responsive, zoom, focus, keyboard,
  touch, safe-area, reduced-motion, Back, refresh, and overflow contracts.
* [ ] Fresh/upgrade migrations, a real migrated-database API flow, backend/frontend checks, and
  focused manual UI validation pass.

## Tests

Backend tests cover:

* Preference default, allowed updates, invalid values/booleans/unknown fields, ownership, and
  fitness-profile independence.
* Workout creation copying the effective preference and legacy workouts defaulting to zero.
* Positive/zero/null boundary derivation with fixed timestamps.
* Exact boundary and five-second inclusive expiry limits.
* `set_auto_started` references, timestamp, sequence, lifecycle, start mode, and no performed row.
* Early, expired, disabled, wrong-current, already-started, terminal, inaccessible, malformed-ID,
  and unauthenticated outcomes with proportional representative coverage.
* Manual/automatic, duplicate automatic, skip, and cancellation concurrency preserving one start
  and a contiguous timeline.
* Completion, mark-incomplete/restart, resume, timeline, and performed projection behaviour for both
  start modes.
* Fresh and previous-head migration paths plus real authenticated flows on the migrated schema.

Frontend unit tests cover the pure automatic-rest state boundary:

* Manual/null exclusion and allowed positive delays.
* Rest-to-post-delay projection and exact visible crossing.
* Fresh mount before/during the delay versus at/after expiry.
* One attempt only across timer ticks, Strict Mode-style repeats, and response replacement.
* Manual start, skip, terminal, identity change, unmount, and hidden-crossing consumption.
* One reconciliation classification for success, still-awaiting, and changed-state outcomes.

Code inspection and frontend static checks verify strict preference/workout parsing, normalized
errors, no synthetic button click, no automatic mutation retry, server-relative deadline use, and
no persistence of ephemeral timer/visibility state.

Per DEC-019, add no new automated browser or browser-level tests. Focused manual UI validation
covers the complete Profile setting/confirmation flow and all execution states listed in UI
Requirements at the required widths and accessibility conditions.

## Out of Scope

* Per-workout, per-routine, per-exercise, or per-set editable automatic-start settings.
* Changing the preference of an existing workout.
* Automatic first-set or next-exercise start.
* Automatic set completion, repetition detection, or physical-start sensing.
* Pause, snooze, extension, skip-rest, reset, or live delay adjustment.
* Native background scheduling, service workers, notifications, vibration, alarms, or guaranteed
  execution while hidden, suspended, offline, locked, or terminated.
* Retrying automatic mutations without user action.
* New sound settings, cue selection, volume, or playback guarantees.
* Changing performed-set values, planned rest, workout history presentation, Progress metrics,
  adaptation signals, recommendations, or AI.

## Dependencies

* F12 — Mobile-first UI System and Phase 1 UX Refresh.
* F14/F14.2 — Live Workout Timeline, Explicit Set Start, and Accurate Set Timing.
* F15/F15.1 — Workout exceptions and skip behaviour.
* F17 — Workout Completion.
* F25 — Performed Set Adjustment Reliability.
* F26 — Rest Countdown Focus and Audio Cue.
* F26.1 — Active Workout Screen Wake Lock.

## Notes

Use a dedicated automatic-start application action rather than reusing a client-supplied mode on
the manual endpoint. The backend must derive the delay and boundary from owned persisted data.

The five-second freshness window tolerates ordinary timer and network scheduling without allowing a
stale request to backdate a set minutes later. It is an eligibility boundary, not a retry period.

Keep start provenance explicit throughout lifecycle derivation. Treating `set_auto_started` as an
indistinguishable manual event would weaken the factual model and make future timing interpretation
misleading.
