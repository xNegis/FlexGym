# F16 — Discomfort and Pain Reporting

## Status

Intentionally omitted from the current MVP.

## Original Objective

Record structured discomfort or pain independently of whether the user continued, skipped work, or
stopped during a workout.

## Decision

The MVP does not need a separate discomfort-reporting flow or a detailed health-adjacent domain
model. Users who skip work because of discomfort can select the structured `pain_or_discomfort`
reason introduced by F15.1 and optionally describe the context in the existing note.

This means the MVP deliberately does not record discomfort when the user continues training.

## Reconsideration Criteria

Revisit this feature when at least one concrete product need requires facts beyond skip feedback,
such as repeated-discomfort signals, reporting while continuing, structured body area or severity,
or adaptation proposals based on discomfort history. A future specification must define medical
safety boundaries and must keep observed facts separate from derived signals and AI interpretation.

## Out of Scope for F15.1

Structured body area, laterality, sensation, severity, onset, effect, medical advice, diagnosis,
analytics, adaptations, recommendations, and AI interpretation.
