# `06_FEATURE_TEMPLATE.md`

# Feature Specification Template

Feature specifications should be implementation-ready but should avoid prescribing unnecessary implementation details.

---

# FXX — Feature Title

## Objective

Explain what this feature introduces and why it exists.

## Context

Relevant existing functionality, product principles and dependencies.

## User Experience

Describe how the user interacts with the feature.

Use concrete flows where appropriate.

## Functional Requirements

### FR-1 — Requirement name

Description.

### FR-2 — Requirement name

Description.

Continue as required.

## Domain / Data Requirements

Describe new concepts, entities or persisted information when relevant.

Avoid prematurely locking implementation details unless architecture requires them.

## API Requirements

Define externally important API behaviour when relevant.

Exact endpoint design may be specified when it materially improves the implementation contract.

For each important endpoint, define relevant non-success statuses as well as success behaviour.
Specify the public response shape when the frontend consumes the error. Account explicitly for
framework-generated validation responses such as FastAPI `422` errors; do not assume every
`detail` value is a string.

## UI Requirements

Define relevant screens, components, states and interactions.

Include:

* Loading states
* Empty states
* Validation
* Error behaviour

when applicable.

State how expected request failures and unexpected or malformed server responses behave in the UI.
Frontend API code must treat response bodies as untrusted runtime values, normalize errors before
returning them to components, and provide a safe generic fallback. UI components must not render
raw server payloads.

## Business Rules

Explicit rules and invariants.

## Validation

Input validation and constraints.

## Acceptance Criteria

Use independently verifiable criteria.

Example:

* [ ] The user can ...
* [ ] Invalid ... is rejected.
* [ ] Data persists after ...
* [ ] Existing functionality continues to ...

When a feature touches or depends on an existing user flow, name the important regression scenarios
concretely rather than saying only that the flow "continues to work." Include at least one normal
failure path for each introduced or materially changed flow, and require that it leaves the UI in a
usable state.

## Tests

Describe important behavioural tests expected from the implementation.

Do not require tests merely for achieving arbitrary coverage percentages.

Keep coverage proportional. Prefer one representative failure-path test over a test for every
status, validation field, enum, or boundary. If frontend or end-to-end tests are intentionally
deferred, state which error scenarios must instead be verified through focused manual execution or
code inspection; do not mark them validated solely because backend tests and TypeScript checks pass.

## Out of Scope

Explicitly state functionality that might appear related but belongs to another feature or roadmap phase.

## Dependencies

Previous features required by this feature.

## Notes

Additional implementation guidance only when useful.
