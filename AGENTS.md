# Project Mission

This project is being developed using a harness-engineering approach.

The user and ChatGPT act primarily as Product and Technical Directors. Codex is responsible for implementing the project incrementally from well-defined feature specifications.

The goal is not to rush implementation. Planning, architecture, maintainability, and feature boundaries are extremely important.

## Product

We are building a personal-first adaptive fitness application.

The long-term vision is a system that understands:

* The user's fitness profile
* Training routines
* Workout execution and performance
* Exercise feedback and discomfort
* Body evolution
* Nutrition
* Behavioural patterns

The application should eventually derive signals from this information and use deterministic logic and AI reasoning to propose useful adaptations to training and nutrition.

The user remains in control of consequential changes.

## Source of Truth

Do not rely on previous conversations as project context.

Before making architectural decisions or implementing features, inspect the project documentation under `/harness/context`.

Important files include:

* `harness/context/00_START_HERE.md`
* `harness/context/01_PRODUCT_VISION.md`
* `harness/context/02_ROADMAP.md`
* `harness/context/03_ARCHITECTURE.md`
* `harness/context/04_DECISIONS.md`
* `harness/context/05_PROJECT_STATE.md`
* `harness/context/06_FEATURE_TEMPLATE.md`

Existing feature specifications live under `/harness/features`.

Read relevant existing features before implementing new behaviour.

## Development Workflow

Development is iterative and feature-driven.

Features should be relatively small and independently understandable.

When implementing a feature:

1. Read the feature specification completely.
2. Read its dependencies and relevant project documentation.
3. Inspect the existing implementation before proposing changes.
4. Implement only the requested scope.
5. Do not silently introduce functionality belonging to future features.
6. Add or update meaningful tests.
7. Run the relevant tests and validations.
8. Report what changed and any important design decisions or limitations.

If a specification conflicts with an existing architectural decision, stop and raise the conflict instead of silently choosing one interpretation.

## Architecture Principles

* Prefer simple and explicit implementations.
* Keep business logic outside HTTP endpoints and UI components where appropriate.
* Maintain clear separation between frontend, API/application logic, domain concepts, and persistence.
* Avoid premature abstractions.
* Avoid premature distributed infrastructure.
* Do not introduce agents, embeddings, RAG, or complex LLM orchestration unless required by a feature.
* Facts, derived signals, and AI interpretations are different concepts and should remain distinguishable.
* AI should generally propose consequential changes rather than silently applying them.
* The product is personal-first but should not be deliberately designed into a dead end for future multi-user usage.

## Code Quality

The human owner is a Senior Software Engineer and will review the implementation.

Optimize for:

* Readability
* Correctness
* Explicit behaviour
* Maintainability
* Good boundaries
* Useful tests

Do not optimize for cleverness or unnecessary abstraction.

When there are multiple reasonable implementations, prefer the simplest one that satisfies the current feature and existing architectural direction.

## Communication

Be concise when explaining routine implementation work.

Raise architectural concerns, unclear requirements, scope conflicts, or potentially important product decisions explicitly.

Do not make substantial product decisions implicitly inside implementation code.
