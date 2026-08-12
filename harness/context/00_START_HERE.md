# `00_START_HERE.md`

# Project Instructions

This repository contains the source of truth for the project.

Project context lives under `harness/context`.
Feature specifications live under `harness/features`.

The user and ChatGPT act as Product and Technical Directors. Implementation will mostly be performed by an AI coding harness.

The main responsibility in conversations is therefore **planning and feature specification**, not writing implementation code.

Before proposing or writing a feature, read:

1. `01_PRODUCT_VISION.md`
2. `02_ROADMAP.md`
3. `03_ARCHITECTURE.md`
4. `04_DECISIONS.md`
5. `05_PROJECT_STATE.md`
6. `06_FEATURE_TEMPLATE.md`
7. `07_UI_DESIGN_SYSTEM.md` when the feature creates or changes user-facing UI.

Historical implementation model and cost metadata is tracked centrally in
`08_COST_TRACKING.md`.

Also read any existing features relevant to the feature currently being designed.

UI-affecting features must reuse the visual tokens, primitives, responsive rules, and interaction
patterns defined by `07_UI_DESIGN_SYSTEM.md`. A feature specification must not introduce a parallel
visual language implicitly.

## Working Method

Development is iterative and feature-driven.

Features must:

* Be reasonably small.
* Produce a coherent increment of functionality.
* Have clearly defined scope.
* Have explicit acceptance criteria.
* Avoid implementing functionality belonging to future roadmap phases.
* Preserve existing architectural decisions.
* Be understandable by an AI coding agent without requiring conversation history.

Do not design dozens of detailed future features prematurely.

The roadmap defines direction. Detailed specifications should normally be written shortly before implementation.

## Collaboration workflow

When the user says:

> "Vamos con la Phase X"

Use `02_ROADMAP.md` and `05_PROJECT_STATE.md` to identify the next appropriate feature.

Discuss its design with the user when meaningful product decisions exist.

Once the design is clear, produce the corresponding feature specification using `06_FEATURE_TEMPLATE.md`.

Feature files are stored under `harness/features` and follow:

`{number}_{feature_name}.md`

Example:

`01_project_infrastructure.md`

After a feature has been implemented and validated, update `05_PROJECT_STATE.md`.

When a feature introduces a database migration, validation must cover both a fresh isolated
database and an isolated upgrade from the previously committed migration head. Before closing the
feature, compare the actual local development database revision with the repository head and
exercise a real affected flow against a migrated database. Test schemas created directly from ORM
metadata do not prove that migrations were applied or that an existing installation upgrades
correctly.

Important architectural/product decisions discovered during development must be added to `04_DECISIONS.md`.

## Important Principle

The repository documentation, not previous ChatGPT conversations, is the project's source of truth.
