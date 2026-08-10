# `05_PROJECT_STATE.md`

# Project State

## Current Phase

Phase 0 — Foundation

## Current Status

F02 — User Authentication implemented and validated.

## Completed Features

* F01 — Project Infrastructure
* F02 — User Authentication

## Next Feature

F03 — User Fitness Profile

## Existing Feature Specifications

* `harness/features/01_project_infrastructure.md`
* `harness/features/02_user_authentication.md`

## Current Technology

Backend:
Python 3.11+ / FastAPI / uv

Frontend:
React 19 / TypeScript 6 / Vite / npm

Persistence:
SQLite / SQLAlchemy 2 / Alembic

Authentication:
Email and password / Argon2id / JWT cookie

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

None currently blocking Phase 0.
