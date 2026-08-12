# F17 — Workout Completion

## Objective

Allow an authenticated user to deliberately close an in-progress workout after every planned set
has been explicitly resolved, persist completion as an immutable lifecycle fact, and present an
immediate read-only summary at the workout's canonical URL.

F17 turns the execution record from F13–F15 into a completed workout without introducing
historical browsing, analytics, recommendations, or new feedback collection.

## Context

F13 introduced immutable workout snapshots, one active workout per user, cancellation, and
`/workouts/{workoutId}`. F14 and F14.2 added performed sets, typed observed events, explicit set
starts, and server-derived timing. F15 added explicit skips and `all_sets_resolved`, which is true
only when every planned set is performed or actively skipped.

Completion must preserve the distinction between performed, skipped, and pending work. It never
infers skips from absence or silently resolves unfinished work. F15.1, F16, and F17 may be developed
in parallel, so F17 does not depend on either unfinished feature. When their structured facts are
present in the integrated codebase, completion preserves them and existing workout projections may
display them unchanged; F17 adds no interpretation or discomfort-specific interaction.

```text
in_progress
├── cancelled  — explicit discard; unresolved work is allowed
└── completed  — explicit confirmation; all work was already resolved
```

Completion is observed when the server accepts the user's confirmation. The summary is a projection
of persisted facts, not a separate editable report.

## User Experience

### Ready to finish

When all sets are resolved, `/workouts/{workoutId}` shows performed, skipped, and total counts and
makes `Finish workout` the single dominant action. Existing results remain visible for inspection.
Applicable `Undo skip` and `Mark incomplete` corrections remain available until completion.

`Finish workout` is absent while any set remains unresolved. The existing resume flow remains the
dominant action then. To finish early, the user must explicitly skip the remaining set or exercise;
completion never creates skips.

### Confirmation

`Finish workout` opens a dialog that names the selected session, shows performed/skipped/total
counts, and explains that completion makes the workout read-only. Its actions are `Keep workout
open` and `Finish workout`.

Confirmation uses `Finishing…`, prevents duplicate submission, and keeps confirmed content visible.
Back or Escape closes the dialog when no request is pending, restores focus, and records nothing.
A failed request leaves the dialog open with an inline retryable error. The UI never claims
completion before validating the complete server response.

### Immediate summary

Success remains at `/workouts/{workoutId}` and replaces live controls with:

1. `Completed` status, selected session, routine, and local workout date.
2. Start time, completion time, and observed total duration.
3. Performed, skipped, and total set counts.
4. Scheduled or alternate-session context.
5. Ordered exercise summaries with status and compact performed/skipped set results.
6. `Back to Today` as the single dominant action.

Total duration is the elapsed wall-clock interval from server-owned `started_at` through
`completed_at`. It includes rests and interruptions and is labelled `Workout duration`, never active
training time.

The summary uses snapshot facts even if the source plan changes or is deleted. Refresh and direct
navigation restore it. Browser Back follows normal history; `Back to Today` explicitly opens
`/today`.

## Functional Requirements

### FR-1 — Completed lifecycle state

Add persisted status `completed` and nullable server-owned `completed_at`.

Valid lifecycle combinations are:

* `in_progress`: `cancelled_at` and `completed_at` are null.
* `cancelled`: `cancelled_at` is non-null and `completed_at` is null.
* `completed`: `completed_at` is non-null and `cancelled_at` is null.

Existing workouts retain their status and timestamps during migration.

### FR-2 — Explicit eligibility

Only an owned, currently active `in_progress` workout with `all_sets_resolved = true` may complete.
`all_sets_recorded` is not the condition because valid completion may include explicit skips.
Unresolved work is never automatically mutated.

### FR-3 — Atomic completion

Completion atomically:

1. Rechecks ownership, `in_progress` status, the matching active association, and current progress.
2. Rejects any unresolved set.
3. Uses one server UTC instant for `completed_at` and `workout_completed`.
4. Changes status to `completed`.
5. Appends the next contiguous typed event.
6. Removes the matching `ActiveWorkout` association.
7. Commits all changes together.

Any failure preserves lifecycle, timeline, performed/skipped facts, and active association.

### FR-4 — Terminal read-only state

Completed workouts reject exercise/set start, set completion, correction, `Mark incomplete`, skip,
undo skip, cancellation, and repeated completion through the established inactive-workout boundary.
F17 provides no reopen, undo-completion, deletion, or historical editing.

### FR-5 — Release and subsequent starts

Completion removes only the association matching the completed workout. A missing, stale, or
different association causes a conflict and atomic rollback. Once released, Today no longer offers
Resume and normal F13 rules may start another workout, including on the same local date.

### FR-6 — Completed retrieval

The existing owned-workout endpoint returns completed workouts at their canonical URL; unknown and
other-user IDs remain indistinguishable. The response adds nullable `completed_at`, supports
`completed`, and preserves snapshots, projections, and the typed timeline.

For completed workouts, `resume_url`, current exercise/set fields, current set phase/start, and
transition target are null. Stored underlying facts must not make a completed workout resumable.

### FR-7 — Summary projections

Expose source facts required for the summary. Derive non-negative whole `duration_seconds` from
`started_at` and `completed_at`; do not store it separately.

Reuse existing exercise/set projections for names, target types, execution statuses, counts,
performed values, optional weight/RIR, entry mode, observed set time when available, explicit skips,
and existing optional skip feedback.

Do not calculate volume, adherence, personal records, active time, average rest, calories, or
comparisons.

### FR-8 — Completion event

Add typed event `workout_completed`. It uses the next sequence, exactly matches `completed_at`, and
has no exercise, set, or exception reference. Completion generates no synthetic exercise, set,
skip, discomfort, or timing events.

### FR-9 — Today and history boundary

After completion, Today resolves from the current plan because no active workout exists. It does not
embed the completed summary or recent-workout history. Discovery of completed/cancelled workouts
belongs to F18.

### FR-10 — Existing behaviour preservation

Preserve snapshots, explicit starts, performed-set entry/correction, skips/reversals,
server-relative timers, recovery, cancellation, ownership isolation, and plan independence.
Cancelled workouts remain cancelled and gain no completion timestamp/event.

### FR-11 — Request and response safety

Prevent duplicate submissions. Change confirmed UI state only after strict validation of the full
updated workout. Stale, duplicate, inaccessible, malformed, or unexpected responses preserve the
last confirmed workout and a usable retry/navigation path.

Frontend boundaries treat status, timestamps, duration, progress, results, and the new event as
untrusted runtime input. Malformed values become safe generic errors, never rendered raw data.

## Domain / Data Requirements

Add nullable `WorkoutSession.completed_at`; expand its status and mutually exclusive lifecycle
timestamp constraints. Expand `WorkoutEvent.event_type` with `workout_completed`. Service
validation enforces the event's null exercise/set/exception references.

Do not persist duration, summary rows, aggregate counts, labels, cursors, or a summary entity.
Completion does not alter or duplicate performed sets, exceptions, discomfort facts, or prior
events. F17 introduces no new F15.1/F16 domain concept and must remain compatible with those facts
when they are present.

## API Requirements

All endpoints require authentication. IDs are strict positive integers and reject booleans.

### `POST /api/workouts/{workout_id}/complete`

Accepts no body and returns:

* `200` with the complete updated workout in `completed` status.
* `404 {"detail":"Workout not found"}` for unknown/inaccessible workouts.
* `409 {"detail":"Workout is not active"}` for cancelled/completed workouts or an invalid active
  association.
* `409 {"detail":"Workout has unresolved sets"}` while any set is pending.
* `422` with framework validation detail for an invalid path.
* `401` when unauthenticated.

Clients submit no timestamp, duration, count, status, or sequence.

### Extended workout representation

```json
{
  "status": "completed",
  "started_at": "2026-08-14T09:45:00Z",
  "cancelled_at": null,
  "completed_at": "2026-08-14T10:52:30Z",
  "duration_seconds": 4050,
  "resume_url": null
}
```

For `in_progress` and `cancelled`, `completed_at` and `duration_seconds` are null. Existing fields
retain their meanings.

## UI Requirements

F17 follows `harness/context/07_UI_DESIGN_SYSTEM.md` and adds no local visual language.

Reuse `AppHeader`, `Page`, `Section`, `Card`, `Badge`, `Button`, `Dialog`, `Alert`, and
`LoadingState`. No new shared primitive is required. Eligible state uses `Finish workout` as its
dominant action; corrections/discard remain secondary. Completed state uses `Back to Today` and
contains no mutations.

`Completed`, performed/skipped counts, and exercise statuses use explicit text rather than color
alone. Dates/times use browser locale while preserving the local-date fact. Duration uses compact
accessible units such as `1 hr 7 min`; under one minute may show `Less than 1 min`. Missing optional
values are omitted, not shown as false zeroes.

States:

* Loading preserves expected shape and never flashes a false lifecycle state.
* Pending work retains existing resume execution and has no finish action.
* Eligible work shows resolved counts without claiming completion.
* Pending completion keeps the dialog/content visible and disables conflicts.
* Success renders the same-URL summary and focuses its completed heading/region.
* A normal conflict keeps or refetches validated state; an already-completed refetch may show the
  summary.
* Unexpected or malformed success keeps the dialog open with `Unable to finish workout. Please try
  again.`
* Cancelled, inaccessible, and backend-unavailable behaviour remains recoverable and read-only.

Back or Escape closes the confirmation before navigation. After success, URL and normal history are
unchanged. `Back to Today` never depends on history.

Validate eligible, confirmation, pending/error, completed, mixed-result, and long-value states at
360, 390, 430 px, representative tablet/small desktop, and wide desktop widths without document
overflow. Preserve keyboard operation, visible focus, 44 px targets, 48–56 px dominant actions,
dialog focus containment/restoration, announcements, logical headings, 200% zoom, safe areas, and
reduced motion.

## Business Rules

* Completion is explicit, never automatic after the last resolution.
* Every set must be performed or actively skipped first.
* Missing performance never implies a skip.
* `all_sets_resolved`, not `all_sets_recorded`, gates completion.
* Completed workouts may mix performed and skipped work.
* Completion records one terminal timestamp/event at the same server instant.
* A workout cannot be completed and cancelled.
* Completion is terminal in F17 and changes no plan/snapshot.
* Only the matching active association is released.
* Duration is total wall-clock elapsed time.
* Client timestamps, counts, duration, cursors, and sequence are never authoritative.

## Validation

* IDs are strict positive integers; booleans are invalid; completion accepts no body.
* Database constraints enforce exactly the lifecycle combinations in FR-1.
* `workout_completed` has null exercise/set/exception references.
* Completion time equals its event time and is not earlier than start.
* Duration is null when not completed and a non-negative whole number when completed.
* Performed and active-skip counts are exclusive and sum to total at completion.
* Failed completion is fully atomic.

Migration validation must include:

* Full history on a fresh isolated database.
* Upgrade from the previously committed Alembic head present when implementation begins, populated
  with active, all-performed, mixed, all-skipped, and cancelled workouts.
* Preservation of existing lifecycle, snapshot, performance, exception/discomfort, and event facts.
* Real authenticated successful and rejected completion against the upgraded database.
* Comparison of configured local `alembic current` and `alembic heads`, with safe upgrade before
  claiming local operation.
* Safe rerun of the supported migration command without duplicate schema/data.

ORM metadata-created schemas do not satisfy this gate.

## Acceptance Criteria

* [ ] All-performed, mixed, and all-skipped active workouts expose `Finish workout`.
* [ ] Any unresolved set prevents completion without implicit mutation.
* [ ] Confirmation names the session, shows counts, and explains read-only consequence.
* [ ] Success atomically persists status, timestamp, event, and association release.
* [ ] Completed workouts reject all live/cancel/completion mutations.
* [ ] The canonical URL immediately shows context, wall-clock duration, counts, and compact ordered
  results.
* [ ] Refresh/direct access restore summary independently from later plan changes.
* [ ] Today stops offering Resume and normal new-workout rules apply.
* [ ] Cancelled and in-progress behaviour remains intact.
* [ ] Duplicate, stale, unresolved, foreign, failed, and malformed requests preserve consistency
  and usable UI context.
* [ ] Responsive, keyboard, focus, touch, safe-area, zoom, motion, and overflow checks pass.
* [ ] Fresh/upgrade migration, migrated-database flows, automated checks, and manual UI validation
  pass.

## Tests

Backend tests cover all-performed, mixed, and all-skipped success; unresolved rejection; atomic
timestamp/event/association behaviour with fixed time; duration projection; duplicate, cancelled,
stale-association, ownership, path/body, and authentication failures; representative live mutation
rejection after completion; completed retrieval; and real migration-upgrade flows.

Frontend static validation and inspection cover strict parsing, eligibility/action visibility,
summary formatting, normalized errors, and malformed-response protection. Do not add a runner solely
for F17.

Focused manual UI validation covers the three result mixtures; pending and pre-completion
corrections; success, refresh, direct access, Back, and Today; pending/conflict/unexpected/malformed,
inaccessible/unavailable/cancelled states; dialog focus and announcements; keyboard/touch, color
independence, 200% zoom, safe areas/reduced motion; and overflow checks at required widths.

Per DEC-019, F17 adds no Playwright or automated end-to-end tests.

## Out of Scope

* Creating or editing discomfort/pain reports, severity, body area, sensation, continuation
  decisions, or medical guidance (F16). Existing integrated facts may remain visible read-only.
* Historical lists, calendars, filters, or browsing (F18).
* Reopen, undo completion, completed editing/deletion.
* Workout notes, session RPE, mood, energy, weight, photos, or post-workout feedback.
* Volume, records, comparisons, charts, adherence, analytics, signals, adaptations, recommendations,
  or AI.
* Sharing, exports, celebrations, streaks, calories, sensors, or wearables.

## Dependencies

* F13 — Start Workout.
* F14 — Live Workout Timeline and Set Tracking.
* F14.2 — Explicit Set Start and Accurate Set Timing.
* F15 — Workout Exceptions and Feedback.

F15.1 and F16 are parallel workstreams rather than dependencies. Their integrated structured facts,
when present, are preserved and may be displayed through their established projections without
expanding F17.

## Notes

Keep completion to one terminal fact, one typed event, release of the active singleton, and a
deterministic projection. F18 should reuse this representation rather than requiring a denormalized
summary.
