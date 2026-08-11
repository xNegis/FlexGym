# `05_PROJECT_STATE.md`

# Project State

## Current Phase

Phase 1 — Training Planning

## Current Status

Phase 0 — Foundation completed. F01 through F04 are implemented and validated.

F05 — Exercise Catalog is implemented and validated.

F06 — Custom Exercises was reviewed and intentionally skipped for the MVP. The rationale and
reconsideration criteria are documented in `harness/features/06_custom_exercises.md`.

F07 — Routine Creation is implemented and validated.

F08 — Training Day Management is implemented and validated.

F09 — Routine Exercise Configuration is implemented and validated.

## Completed Features

* F01 — Project Infrastructure
* F02 — User Authentication
* F03 — User Fitness Profile
* F04 — Profile Management
* F05 — Exercise Catalog
* F07 — Routine Creation
* F08 — Training Day Management
* F09 — Routine Exercise Configuration

## Skipped Features

* F06 — Custom Exercises

## Next Feature

F10 — Routine Schedule is next in Phase 1 and remains to be specified.

## Existing Feature Specifications

* `harness/features/01_project_infrastructure.md`
* `harness/features/02_user_authentication.md`
* `harness/features/03_user_fitness_profile.md`
* `harness/features/04_profile_management.md`
* `harness/features/05_exercise_catalog.md`
* `harness/features/06_custom_exercises.md` (skipped)
* `harness/features/07_routine_creation.md`
* `harness/features/08_training_day_management.md`
* `harness/features/09_routine_exercise_configuration.md`

## Current Technology

Backend:
Python 3.11+ / FastAPI / uv

Frontend:
React 19 / TypeScript 6 / Vite / npm

Persistence:
SQLite / SQLAlchemy 2 / Alembic

Authentication:
Multiple accounts / unique normalized email / Argon2id / JWT cookie

Testing:
pytest (basic backend tests) / Playwright deferred

Code Quality:
Backend: Ruff (lint + format), mypy (type checking)
Frontend: Prettier (format), ESLint (lint), tsc (type checking)

## Important Current Constraints

* Development will primarily be performed through an AI coding harness.
* Feature specifications must therefore be explicit and implementation-ready.
* Features should remain reasonably small.
* Do not prematurely implement functionality belonging to later roadmap phases.
* Initial product is personal-first.
* Architecture should preserve reasonable future scalability.

## Open Questions

None currently blocking Phase 1 planning.
