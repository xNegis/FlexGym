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
* `harness/context/07_UI_DESIGN_SYSTEM.md` for every feature that creates or changes user-facing UI

Existing feature specifications live under `/harness/features`.

Read relevant existing features before implementing new behaviour.

For UI work, read `harness/context/07_UI_DESIGN_SYSTEM.md` completely before proposing or changing
the frontend. Reuse its tokens, primitives, responsive rules, content conventions, and interaction
patterns. Do not add feature-local visual conventions when the shared system covers the need.

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

For UI work, validation must exercise the relevant loading, empty, error, pending, unavailable, and
confirmation states. Inspect changed flows at 360 px, 390 px, 430 px, and a representative desktop
width; verify keyboard focus and browser Back where navigation changes; and confirm that no page
introduces document-level horizontal overflow.

### Migration validation gate

Before marking any feature that adds or changes a database migration as completed:

1. Apply the complete migration history to a new isolated database and verify the expected schema
   and required reference data.
2. Create or migrate an isolated database to the previously committed Alembic head, apply the new
   migration, and verify the affected application flow against that upgraded database.
3. Compare `alembic current` and `alembic heads` for the actual configured local development
   database used by the application. If it is behind, do not report the feature as locally
   operational or fully validated until the migration has been safely applied, or clearly report
   the pending migration and exact remediation command.
4. Exercise at least one real API or UI path using a migrated database rather than relying only on
   mocked persistence or tables created directly from ORM metadata.
5. Confirm that re-running the supported migration command is safe and does not duplicate required
   reference data.

Tests that use `Base.metadata.create_all()` or equivalent schema creation are useful for service and
endpoint behaviour, but they do not validate Alembic migrations and must never be presented as doing
so. A feature must not be marked completed merely because those tests pass.

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

## Codex-only orchestration pointer

This section is not an implementation instruction. OpenCode implementation agents must ignore this
section, must not open the referenced `.codex` runbook, and must not launch or manage other OpenCode
sessions.

Only when acting as the Codex coordinator and the product owner explicitly asks to launch or manage
OpenCode, read `.codex/runbooks/opencode_implementation.md`. It records the verified external runner
configuration and handoff workflow. This pointer must not influence feature scope, architecture,
implementation, or validation.
