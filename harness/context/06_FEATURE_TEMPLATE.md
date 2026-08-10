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

## UI Requirements

Define relevant screens, components, states and interactions.

Include:

* Loading states
* Empty states
* Validation
* Error behaviour

when applicable.

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

## Tests

Describe important behavioural tests expected from the implementation.

Do not require tests merely for achieving arbitrary coverage percentages.

## Out of Scope

Explicitly state functionality that might appear related but belongs to another feature or roadmap phase.

## Dependencies

Previous features required by this feature.

## Notes

Additional implementation guidance only when useful.