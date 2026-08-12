# F15.1 — Pain or Discomfort Skip Reason

## Objective

Allow a user who skips a set or exercise because of pain or discomfort to retain that reason as a
structured workout exception, with optional natural-language details, without introducing the
broader discomfort-reporting model deferred from the MVP.

## Context

F15 already records optional structured reasons and notes for set and exercise skips. F16 was
intended to record discomfort independently of whether work continued or stopped, but that broader
capability is intentionally omitted from the MVP. F15.1 is a small corrective increment over F15.

## User Experience

The existing skip dialog adds `Pain or discomfort` to its optional Reason selector. The user may
select it for either a set or an exercise and may use the existing optional Details field to record
the affected area or context. Confirmation, progress, timeline, undo, retry, and focus behaviour
remain exactly as in F15.

## Functional Requirements

### FR-1 — Stable reason

Add `pain_or_discomfort` to the supported reason codes for both set and exercise exceptions. The
English label is `Pain or discomfort`.

### FR-2 — Optional note

The existing note remains optional, trimmed, and limited to 500 characters. Unlike `other`, this
reason does not require details.

### FR-3 — Existing semantics

The reason is descriptive only. It does not change progress rules, create a separate pain report,
infer severity or body area, produce medical advice, or alter the plan. Skip reversal preserves the
immutable reason and note in timeline history as defined by F15.

### FR-4 — Compatibility and safety

Existing reason codes and persisted exceptions remain unchanged. Backend validation and database
constraints accept only the expanded supported set. Frontend response parsing recognizes the new
code and continues rejecting unsupported or malformed reason values.

## Domain / Data Requirements

No new entity or field is introduced. Expand the `WorkoutException.reason_code` supported set and
its database check constraint with `pain_or_discomfort` through an Alembic migration. Existing
exception and event IDs, references, timestamps, sequences, notes, and reason codes must survive the
table rebuild unchanged.

## API Requirements

The F15 skip endpoints accept this existing body shape:

```json
{
  "reason_code": "pain_or_discomfort",
  "note": "Left shoulder felt uncomfortable"
}
```

Success and all error responses remain those specified by F15. No endpoint is added.

## UI Requirements

Reuse the existing F15 `Dialog`, `Field`, `Select`, `TextArea`, `Alert`, and buttons. Add one option
to the current selector without changing visual hierarchy. Pending, failure, malformed-response,
keyboard, focus restoration, Browser Back, touch, responsive, zoom, safe-area, and overflow
behaviour remain governed by F15 and the shared UI design system.

## Business Rules

* `pain_or_discomfort` is valid for set- and exercise-scoped skips.
* Details are optional and receive no medical or semantic interpretation.
* Recording this reason necessarily accompanies a skip; discomfort while continuing is not
  recorded in the MVP.
* Undoing the skip does not delete or change the historical reason.

## Validation

Migration validation must apply the full history to a fresh database and upgrade an isolated
database at `f15_exceptions`, preserving representative linked exception/event rows. The configured
local database must be compared with repository head and upgraded before the feature is reported
locally operational. Exercise a real authenticated skip using the migrated database and confirm
that rerunning the supported upgrade command is safe.

## Acceptance Criteria

* [x] `Pain or discomfort` is selectable for set and exercise skips.
* [x] The API and database accept `pain_or_discomfort` with or without an optional note.
* [x] The reason and note appear in current exception projections and timeline events.
* [x] Undo and all existing skip behaviour remain unchanged.
* [x] Unsupported and malformed reason values remain rejected safely.
* [x] Fresh, upgrade, real-flow, backend, and frontend static validations pass.

## Tests

Backend coverage verifies a representative pain/discomfort exercise skip with an optional note and
its timeline projection. Existing grouped F15 tests continue covering both scopes, empty notes,
reversal, validation, ownership, progress, and failures. Migration checks cover fresh creation,
upgrade preservation, the new check constraint, foreign keys, and a real authenticated flow.
Frontend format, lint, and type checks validate the selector and strict parser change. Per DEC-019,
no Playwright test is added.

## Out of Scope

* Discomfort reports when the user continues training.
* Structured body area, sensation, intensity, onset, duration, laterality, or effect.
* Medical guidance, emergency messaging, diagnosis, analytics, derived signals, adaptations, or AI.
* Editing a confirmed reason or note.

## Dependencies

* F15 — Workout Exceptions and Feedback.

## Notes

This increment deliberately captures less information than the former F16 direction. Its value is
low-friction factual retention for skipped work, not a general health or injury model.
