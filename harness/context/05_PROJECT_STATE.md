# `05_PROJECT_STATE.md`

# Project State

## Current Phase

Phase 0 — Foundation and Phase 1 — Training Planning are completed successfully. Phase 2 — Workout
Tracking is in progress with F13 — Start Workout completed.

## Current Status

Phase 0 — Foundation completed. F01 through F04 are implemented and validated.

F05 — Exercise Catalog is implemented and validated.

F06 — Custom Exercises was reviewed and intentionally skipped for the MVP. The rationale and
reconsideration criteria are documented in `harness/features/06_custom_exercises.md`.

F07 — Routine Creation is implemented and validated.

F08 — Training Day Management is implemented and validated.

F09 — Routine Exercise Configuration is implemented and validated.

F10 — Routine Schedule is implemented and validated.

F11 — Active Routine is implemented and validated.

Phase 1 — Training Planning is completed.

F12 — Mobile-first UI System and Phase 1 UX Refresh is implemented. The frontend now uses a shared
design-token system (CSS custom properties), a reusable UI primitive layer, React Router with
canonical routes, authentication and profile guards, a mobile-first app shell with bottom navigation,
and the Quiet Strength visual direction. All F02–F11 flows have been migrated and validated with
authenticated Playwright coverage at 360, 390, and 430 px.

F13 — Start Workout is implemented and validated. Today resolves the active routine's local-day session, previews
its exercises and planned set counts, permits an alternate executable session without changing the
plan, snapshots the selected prescription, and supports persistent resume and confirmed discard.
Backend, migration, and static frontend validation pass, and the product owner completed the final
manual UI verification.

## Completed Features

* F01 — Project Infrastructure
* F02 — User Authentication
* F03 — User Fitness Profile
* F04 — Profile Management
* F05 — Exercise Catalog
* F07 — Routine Creation
* F08 — Training Day Management
* F09 — Routine Exercise Configuration
* F10 — Routine Schedule
* F11 — Active Routine
* F12 — Mobile-first UI System and Phase 1 UX Refresh
* F13 — Start Workout

## Skipped Features

* F06 — Custom Exercises

## Next Feature

Select and specify the next Phase 2 feature from the roadmap's Live workout and Set tracking areas.
Its exact boundary should be discussed before assigning a feature number or writing its specification.

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
* `harness/features/10_routine_schedule.md`
* `harness/features/11_active_routine.md`
* `harness/features/12_mobile_ui_system.md` (completed)
* `harness/features/13_start_workout.md` (completed)

## Current Technology

Backend:
Python 3.11+ / FastAPI / uv

Frontend:
React 19 / TypeScript 6 / Vite / npm / React Router 7 / Lucide React

Persistence:
SQLite / SQLAlchemy 2 / Alembic

Authentication:
Multiple accounts / unique normalized email / Argon2id / JWT cookie

Testing:
pytest (187 backend tests) / existing F12 Playwright infrastructure retained but deferred as a
completion gate for current MVP features under DEC-019

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

None currently blocking Phase 2 planning.
