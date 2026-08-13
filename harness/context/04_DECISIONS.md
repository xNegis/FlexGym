

# `04_DECISIONS.md`

# Project Decisions

This document records decisions whose reasoning may otherwise be forgotten.

Do not record trivial implementation details.

---

## DEC-001 — Personal-first product

**Status:** Accepted

The application will initially be built primarily for its creator.

Commercialization is possible but is not a requirement for initial development.

This allows rapid iteration without requiring premature multi-tenant or enterprise infrastructure.

---

## DEC-002 — Python / FastAPI backend

**Status:** Accepted

The initial backend will use Python with FastAPI.

---

## DEC-003 — React / TypeScript frontend

**Status:** Accepted

The initial frontend will use React and TypeScript.

Mobile usability must be considered from the beginning.

---

## DEC-004 — SQLite initial persistence

**Status:** Accepted

SQLite will be used initially instead of JSON files.

Reason:

It retains the operational simplicity of a local file while providing relational modelling, transactions, constraints and structured queries.

The architecture should allow future migration to PostgreSQL if necessary.

---

## DEC-005 — AI cannot silently mutate consequential user plans

**Status:** Accepted

AI-generated adaptations should normally become structured suggestions.

The user should explicitly accept consequential changes before they modify the active routine or nutrition plan.

---

## DEC-006 — Facts, signals and AI interpretation are separate concepts

**Status:** Accepted

Raw user behaviour must remain distinguishable from deterministic derived signals and LLM interpretations.

This improves auditability, testability and future algorithm development.

---

## DEC-007 — Basic JWT authentication for the proof of concept

**Status:** Accepted

Authentication will initially use a single seven-day JWT signed by the backend and transported
in an HTTP-only cookie.

The proof of concept will not persist sessions or introduce refresh tokens, token rotation, or a
revocation list. Logout removes the browser cookie; a copied JWT remains valid until its expiry.

This tradeoff keeps F02 small while retaining a replaceable authentication boundary for future
hardening.

---

## DEC-008 — Defer browser-level testing during the early proof of concept

**Status:** Accepted

New features will initially require only a small set of basic backend tests for their essential
behaviour. Exhaustive variant testing and automated browser browser-level coverage are deferred until the
main product flows are more stable.

Existing testing infrastructure may remain available, but browser-level execution is not part of
the current feature validation contract.

---

## DEC-009 — Frontend API boundaries must normalize untrusted responses

**Status:** Accepted

HTTP response bodies are runtime input and must not be trusted merely because frontend TypeScript
types describe an expected shape.

Frontend API functions must parse response bodies as `unknown` and validate or normalize them
before returning values to UI components. In particular, error payloads must become a stable,
UI-safe representation such as a string message or a deliberately typed application error. React
components must never render raw values taken directly from a server response.

Feature specifications must define the important non-success statuses and their public response
shapes. This includes framework-generated validation responses such as FastAPI's `422` payload. If
an endpoint retains a framework-native error shape, the frontend API boundary must handle it
explicitly. Unexpected or malformed error bodies must fall back to a safe generic message without
breaking the current screen.

This decision does not require a global custom error framework or exhaustive error-path testing.
Each feature should verify one representative normal failure for every user flow it introduces or
materially changes, while keeping automated coverage proportional to the feature.

---

## DEC-010 — Hosted installations permit multiple user accounts

**Status:** Accepted

The personal-first product direction does not imply a single-account deployment. Registration is
available to unauthenticated visitors, and multiple users with unique normalized email addresses may
coexist in one installation.

This replaces the original F02 proof-of-concept restriction that closed registration after the first
account. Authentication and persisted domain data remain explicitly user-owned; invitations, roles,
administration, and other multi-user collaboration features remain out of scope.

---

## DEC-011 — The initial exercise catalog is curated global reference data

**Status:** Accepted

FlexGym's initial exercise catalog consists of global, system-managed exercise records with stable
slugs. It is installed through the normal database migration/bootstrap path and is read-only through
user-facing APIs.

The initial dataset is explicitly curated and versioned in the repository rather than fetched from
an external exercise service or invented at runtime. This gives later routines stable references and
makes fresh installations useful without an administrator import step.

User-created exercises remain a separate, user-owned capability for a later feature. The shared
catalog does not infer exercise suitability from profile data and does not represent medical advice.

---

## DEC-012 — Skip custom exercises in the current MVP sequence

**Status:** Accepted

F06 — Custom Exercises will not be implemented in the current MVP sequence. The curated global
catalog introduced by F05 is sufficient to validate routine planning before adding a user-facing
exercise-authoring workflow.

Custom exercise creation addresses valid but currently unproven needs such as uncommon machines,
specialized variants, rehabilitation movements, and personal naming. It would also require decisions
about structured metadata quality, duplicate concepts, ownership, and the lifecycle of exercises
referenced by future routines and workout history.

The feature may be reconsidered after routine planning and workout tracking show repeated gaps that
cannot reasonably be addressed by expanding the curated catalog. Skipping F06 does not prohibit a
later custom-exercise feature; it preserves the feature number as an explicit product decision and
moves the next planned increment to F07 — Routine Creation.

---

## DEC-013 — A routine is a complete training plan

**Status:** Accepted

In FlexGym, a routine represents a complete training plan such as Push/Pull/Legs or a four-day
hypertrophy plan. It is not an individual training session.

A routine may contain ordered training days, and each training day may contain configured exercises.
Training-day management should therefore be introduced before routine-exercise configuration so
exercises can be attached directly to their intended day.

The number of days in a routine is derived from its actual training-day records. It must not be
stored as independent routine metadata because the declared count could disagree with the routine's
structure.

---

## DEC-014 — Training sessions and the seven-day routine cycle are separate concepts

**Status:** Accepted

A training day represents one planned workout session inside a routine, such as Push, Pull, or
Legs. It is not itself a weekday or a rest day. A routine may contain up to seven training days.

Routine scheduling is a separate concern. Every scheduled routine uses exactly seven ordered weekly
positions. Each position is either rest or references one training day, and every training day must
be allocated exactly once before the routine can become active. Until scheduling is implemented, a
routine and its training days may remain an incomplete draft.

Training-day display order is independent from future weekly allocation. Rest is represented by the
absence of a training-day assignment in a weekly position, not by a persisted training-day record.
If two weekly sessions have the same purpose, they remain separate training-day records and may use
the same display name.

---

## DEC-015 — Routine prescriptions use structured per-set targets

**Status:** Accepted

A configured routine exercise contains ordered set records rather than one shared set count and
prescription. Each set may therefore have a different target, load, Repetitions in Reserve, tempo,
rest, and note. The number of sets is derived from those records.

The frontend may accept a compact comma-separated target shorthand such as `12, 12, 10, 8`, but the
delimiter string is not domain data and must not be persisted. Movement-phase seconds are modelled
as four structured Tempo components; total Time Under Tension is not stored as though it were an
observed fact.

All routine prescription values are plans. Future workout execution records actual performance as
separate facts and does not silently overwrite the plan. Supersets, circuits, and formal drop-set or
set-type semantics are deferred until their workflows justify dedicated domain concepts.

---

## DEC-016 — Weekly placement is the canonical training-day order

**Status:** Accepted

Every persisted training day is assigned exactly once to one of its routine's seven fixed weekly
positions, ordered Monday through Sunday. Training-day creation and its first-free weekly assignment
occur atomically. A training day cannot exist unassigned.

Weekly position replaces the independent training-day display position introduced by F08. Training
days are displayed in weekly order, and changing their order means changing their weekly placement.
Moving a session to a rest position leaves its previous position as rest; moving it to an occupied
position swaps both sessions atomically.

Only training assignments are persisted. Positions without assignments are derived rest positions.
The public `rest` / `training` slot type is also derived and is not stored. No null or sentinel
training-day reference represents rest.

This decision supersedes the parts of DEC-014 and F08 that made training-day display order
independent from weekly allocation or allowed a persisted training day to remain unassigned.

---

## DEC-017 — Active routine is a lightweight singleton selection

**Status:** Accepted

Each user may have zero or one active routine. Activation selects the current plan for future
workout flows; it does not clone, freeze, archive, or version the routine, and active routines remain
editable.

A routine needs at least one training day to be activated. Weekly assignment completeness is also
verified, although F10 enforces it during supported writes. Configured exercises are deliberately
not an activation requirement because session-level workout readiness belongs to the future Start
Workout feature.

Switching replaces the selection atomically after explicit frontend confirmation. Users may
deactivate without deleting the plan. Deleting the active routine or its final training day clears
the selection atomically. F11 records only when the current selection was activated; activation
history, plan snapshots, commitment periods, and adherence are deferred.

---

## DEC-018 — Mobile-first UI system before workout tracking

**Status:** Accepted

Before Phase 2 begins, FlexGym will replace its incrementally accumulated proof-of-concept UI with
a shared mobile-first design and interaction system.

The product character is `Quiet Strength`: calm, precise, professional, restrained, and optimized
for comprehension rather than decoration or gamification. The permanent design contract is stored
in `harness/context/07_UI_DESIGN_SYSTEM.md` and is mandatory for every future UI-affecting feature.

Consistency will be enforced through both documentation and code. Semantic tokens and shared
frontend primitives own generic appearance, accessibility, and interaction states. Feature
components own domain-specific composition and must not create parallel button, field, feedback, or
layout conventions locally.

Authenticated navigation is mobile-first and uses meaningful URLs. The current primary destinations
are Plan, Exercises, and Profile. A Today or workout destination will be introduced only when Phase
2 implements a real corresponding flow.

F12 performs the complete Phase 0–1 UI migration without changing backend APIs, persistence, domain
rules, activation semantics, scheduling semantics, or prescription meaning. A mixed permanent
old/new visual system is not an acceptable completion state.

F12 also ends DEC-008's blanket frontend browser-test deferral for stable cross-feature shell,
navigation, responsive, and dialog behaviour. Coverage remains deliberately focused; business-rule
variants continue to belong primarily in backend tests.

---

## DEC-019 — Defer automated browser coverage during the MVP

**Status:** Accepted

Automated browser and browser-level coverage is not a completion requirement for F13 or subsequent MVP
features. New automated browser tests must not be added as part of normal feature delivery during this
stage.

Frontend behaviour is still validated proportionally through static checks, focused parser or unit
tests when a suitable existing runner is available, and manual execution of the required responsive,
keyboard, focus, navigation, loading, empty, error, pending, unavailable, and confirmation states.
Backend tests remain required for domain, API, ownership, persistence, and migration behaviour.

The existing automated browser infrastructure and F12 coverage may remain in the repository, but maintaining
or executing it is not an MVP feature-completion gate. A later explicit decision may reinstate
automated browser coverage when the product flows are stable enough to justify its delivery cost.

This decision supersedes DEC-018's requirement for ongoing focused browser-test coverage and extends
DEC-008's original deferral through the remainder of the MVP.

---

## DEC-020 — Workout monitoring uses typed observed events and structured facts

**Status:** Accepted

Live workouts require a recoverable temporal record without forcing continuous phone interaction.
FlexGym therefore records server-timestamped, append-only events for meaningful actions the
application actually observes, such as workout start, exercise start, set confirmation, correction,
exercise completion, and cancellation.

The timeline complements rather than replaces structured domain state. Performed values remain
structured performed-set facts, planned targets remain immutable snapshot facts, and progress,
timer thresholds, transition duration, and other timing values are derived from those facts and
event timestamps. Events use explicit supported types and relational references rather than an
arbitrary JSON event store.

Timer ticks and the instant a client-rendered countdown reaches zero are not persisted as observed
events. They are deterministic projections of a server timestamp and snapshotted planned duration.
The system must distinguish exact observed intervals from estimates: one confirmation per set can
measure time between interactions but cannot measure exact set duration or individual repetition
timing.

This boundary permits later workout history and analytics to reconstruct what the application knew
and when, while avoiding false precision and keeping current domain state directly queryable and
validated.

---

## DEC-021 — Defer independent discomfort reporting from the MVP

**Status:** Accepted

The MVP will not introduce a separate discomfort or pain report, structured body area, severity,
sensation, or continuation outcome. That model adds health-adjacent complexity before the product
has a demonstrated need to record discomfort when planned work continues.

F15's structured skip feedback is extended by F15.1 with the stable `pain_or_discomfort` reason.
The existing optional note can retain natural-language context. This records pain only when a set or
exercise is skipped and does not derive medical meaning, signals, recommendations, or plan changes.

F16 is intentionally omitted rather than treated as completed. It may be reconsidered when
continued-work discomfort or structured discomfort history is needed for a concrete user flow.

---

## DEC-022 — Progress owns historical perspectives and separates metrics from interpretation

**Status:** Accepted

Phase 3 replaces the primary `History` destination with `Progress` while retaining exactly five
authenticated navigation items. Progress initially contains Workouts, which preserves F18, and
Exercises, which exposes performed repetition facts over time. Body and other perspectives remain
absent until implemented.

Exercise performance initially uses three deterministic per-workout metrics: Total reps, Heaviest
weight, and Epley Estimated 1RM. Estimated 1RM is calculated for every performed repetition set with
observed weight using `weight × (1 + repetitions / 30)`, with no repetition-count eligibility
threshold. RIR remains set-level context rather than an aggregate metric.

These values describe recorded work and estimated strength; they do not constitute a universal
progress score or evidence of hypertrophy, fat loss, health, or workout quality. Phase 3 UI must not
assign positive or negative meaning to a metric change unless a later feature explicitly defines
and validates that interpretation. This preserves the architectural distinction between facts,
deterministic projections, derived signals, and later AI reasoning.
