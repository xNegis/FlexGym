# `05_PROJECT_STATE.md`

# Project State

## Current Phase

Phase 0 — Foundation, Phase 1 — Training Planning, and Phase 2 — Workout Tracking are completed
successfully.

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
authenticated automated browser coverage at 360, 390, and 430 px.

F13 — Start Workout is implemented and validated. Today resolves the active routine's local-day session, previews
its exercises and planned set counts, permits an alternate executable session without changing the
plan, snapshots the selected prescription, and supports persistent resume and confirmed discard.
Backend, migration, and static frontend validation pass, and the product owner completed the final
manual UI verification.

F14 — Live Workout Timeline and Set Tracking and F14.2 — Explicit Set Start and Accurate Set Timing
are implemented and validated. The live flow snapshots prescriptions, records performed sets and an
append-only event timeline, separates rest from explicit set start, derives observed set and rest
durations from server timestamps, preserves adjustments and corrections, times exercise transitions,
and recovers after interruption. The product owner completed a real-workout validation and confirmed
the final interaction flow and persisted monitoring timeline. Workout-level completion remains
deliberately assigned to F17.

F15 — Workout Exceptions and Feedback is implemented and validated. Active workouts support
optional structured set/exercise skips and append-only reversals while preserving performed facts,
explicit set lifecycle timing, derived progress, transitions, and interruption recovery. Backend,
migration, frontend static validation, and an intensive product-owner manual session pass. The
persisted session audit confirmed a contiguous chronological timeline, readable skip/reversal
history, consistent effective projections, valid foreign keys, and no performed/skipped overlap.

F15.1 — Pain or Discomfort Skip Reason is implemented and validated. Set and exercise skips accept
the stable `pain_or_discomfort` reason with optional notes. The migration preserves existing
exception/event history, and the configured local database is at repository head.

F17 — Workout Completion is implemented and validated. An owned, currently active workout with
every planned set performed or explicitly skipped can be deliberately finished through a confirmed
dialog, atomically persisting `completed` status, a server-owned `completed_at`, a contiguous
`workout_completed` event, and release of the matching active association. The canonical workout URL
immediately renders a read-only summary with wall-clock duration, performed/skipped/total counts,
and compact ordered exercise results, while Today returns to normal start behaviour. Completed
workouts reject all live mutations and the configured local database is at repository head.

F18 — Workout History is implemented and validated. Authenticated users browse their completed and
cancelled workouts newest-first at the `/history` destination through an opaque cursor-paginated
compact projection, with URL-backed `All`/`Completed`/`Cancelled` filtering, incremental `Load more`,
and distinct empty/error states. Cancelled workouts receive a read-only terminal summary with elapsed
duration and explicitly distinguishable unresolved sets, and terminal detail associates with History
in main navigation. F18 adds no migration; the configured local database remains at repository head.

F19 — Dockerise App and Prepare Environment Variables is implemented and validated. The repository
provides Dockerfiles for the frontend and backend, a Compose deployment configuration, documented
environment-file templates, and a deployment script that validates the stack configuration, applies
migrations, waits for backend health, and verifies the application endpoints.

Phase 2 — Workout Tracking is completed. F16 remains intentionally omitted from the current MVP.

F20 — Progress Area and Exercise Performance History is implemented and validated. `Progress`
replaces `History`
in primary navigation and owns the Workouts and Exercises sections at `/progress/workouts` and
`/progress/exercises`, preserving the F18 workout-history experience and adding read-only exercise
performance history with Total reps, Heaviest weight, and Epley Estimated 1RM metrics, an accessible
line chart, and cursor-paginated session history. Backend tests and frontend static validation pass,
and the product owner completed the final production UI review, including the refined chart-point
set detail and zero-anchored Total reps scale. F20 adds no migration; the configured local database
remains at repository head.

F20.1 — Exercise Progress Refinement is implemented and has passed independent automated and static
validation. Exercise charts now use Estimated 1RM by default with Heaviest weight as the alternative,
exclude null and zero loads from weight-based projections, expose route-backed `1M`, `3M`, `6M`,
`1Y`, and `All` periods, and load the complete oldest-first chart independently from the paginated
session history. Total reps remains factual session context rather than a chart metric. F20.1 adds no
migration; the configured local database remains at repository head. Product-owner manual responsive,
interaction, and accessibility review is the remaining completion gate.

Phase 3 — Progress & Analytics is in progress. F20 is the first implemented increment. The remaining
roadmap sequence is F20.1 — Exercise Progress Refinement, F21 — Workout Statistics and Activity
Trends, F22 — Body Weight Tracking, F23 — Body Weight Progress, and F24 — Progress Dashboard.

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
* F14 — Live Workout Timeline and Set Tracking
* F14.2 — Explicit Set Start and Accurate Set Timing
* F15 — Workout Exceptions and Feedback
* F15.1 — Pain or Discomfort Skip Reason
* F17 — Workout Completion
* F18 — Workout History
* F19 — Dockerise App and Prepare Environment Variables
* F20 — Progress Area and Exercise Performance History

## Skipped Features

* F06 — Custom Exercises
* F16 — Discomfort and Pain Reporting (omitted from the current MVP)

## Next Feature

Complete the product-owner manual responsive, interaction, and accessibility review for F20.1
before specifying F21 — Workout Statistics and Activity Trends.

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
* `harness/features/14_live_workout_timeline_and_set_tracking.md` (completed)
* `harness/features/14_2_explicit_set_start_timing.md` (completed corrective follow-up)
* `harness/features/15_workout_exceptions_and_feedback.md` (completed)
* `harness/features/15_1_pain_or_discomfort_skip_reason.md` (completed corrective follow-up)
* `harness/features/16_discomfort_and_pain_reporting.md` (intentionally omitted from current MVP)
* `harness/features/17_workout_completion.md` (completed)
* `harness/features/18_workout_history.md` (completed)
* `harness/features/20_progress_exercise_history.md` (completed)
* `harness/features/20_1_exercise_progress_refinement.md` (implemented; awaiting product-owner
  manual UI validation)

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
pytest (315 backend tests) / existing F12 automated browser infrastructure retained but deferred as a
completion gate for current MVP features under DEC-019

Code Quality:
Backend: Ruff (lint + format), mypy (type checking)
Frontend: Prettier (format), ESLint (lint), tsc (type checking)

## Cost Tracking

Per-feature AI implementation costs and models are recorded in
`harness/context/08_COST_TRACKING.md`.

## Important Current Constraints

* Development will primarily be performed through an AI coding harness.
* Feature specifications must therefore be explicit and implementation-ready.
* Features should remain reasonably small.
* Do not prematurely implement functionality belonging to later roadmap phases.
* Initial product is personal-first.
* Architecture should preserve reasonable future scalability.

## Open Questions

No product decisions currently block F20.1. The remaining completion gate is the product-owner
manual UI review defined by the feature specification and DEC-019.
