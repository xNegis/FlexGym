
# `02_ROADMAP.md`

# Product Roadmap

The roadmap defines direction rather than immutable implementation order.

Features may be split, merged or reordered as the product evolves.

---

## Phase 0 — Foundation

Goal: establish the technical and user foundations.

### F01 — Project Infrastructure

Establish frontend, backend, persistence, testing and repository structure.

### F02 — User Authentication

Registration, login, logout and authenticated user identity.

### F03 — User Fitness Profile

Initial fitness profile containing the information required for future training and nutrition functionality.

Potential information includes:

* Age
* Sex
* Height
* Weight
* Optional body-fat percentage
* Training experience
* Primary goal
* Training availability
* Preferred workout duration
* Equipment availability
* Physical limitations

Exact fields should be designed when specifying the feature.

### F04 — Profile Management

Allow the user to inspect and modify their fitness profile.

---

## Phase 1 — Training Planning

Goal: represent the user's training plan.

The planning model separates reusable exercise definitions, the training sessions that compose a
routine, and the seven-day weekly cycle in which those sessions are performed.

Current intended sequence:

* F05 — Exercise Catalog
* F06 — Custom Exercises (intentionally skipped for the current MVP)
* F07 — Routine Creation
* F08 — Training Day Management
* F09 — Routine Exercise Configuration
* F10 — Routine Schedule
* F11 — Active Routine

A training day is one planned workout session inside a routine, such as Push, Pull, or Legs. It is
not a weekday. Routine Schedule provides exactly seven ordered weekly positions, each of which is
either derived rest or references one training day. Every training day is allocated exactly once as
part of its creation, and weekly placement is its canonical display order. A routine with no
training days therefore has seven derived rest positions.

---

## Cross-phase UI Stabilization

Goal: establish a professional mobile-first product interface before workout execution increases
frontend interaction complexity.

### F12 — Mobile-first UI System and Phase 1 UX Refresh

Introduce the shared design-token and primitive system, authenticated application shell, mobile
navigation, URL-backed flows, and a complete visual and interaction migration of F02 through F11.

F12 is a frontend stabilization feature. It preserves existing domain and API behaviour and does
not introduce workout tracking, a dashboard, analytics, recommendations, or AI functionality.

The normative visual and interaction contract lives in `07_UI_DESIGN_SYSTEM.md`.

---

## Phase 2 — Workout Tracking

Goal: make the application usable during real gym sessions.

Current intended sequence:

* F13 — Start Workout
* F14 — Live Workout Timeline and Set Tracking
* F14.2 — Explicit Set Start and Accurate Set Timing
* F15 — Workout Exceptions and Feedback
* F15.1 — Pain or Discomfort Skip Reason
* F16 — Discomfort and Pain Reporting (intentionally omitted from the current MVP)
* F17 — Workout Completion
* F18 — Workout History
* F19 — Dockerise App. Prepare environment variables

F14 introduces the core one-tap execution timeline: review the started workout, start each exercise,
accept planned set values as performed or adjust them, record each set while advancing, time planned
rest between sets, observe transitions between exercises, and recover the timeline after
interruption. F14.2 corrects the set lifecycle by requiring an explicit set start after rest and
recording observed start-to-completion timing. F15 adds workout exceptions such as skipped sets or
exercises and their reasons. F15.1 adds pain or discomfort as a structured skip reason with optional
natural-language details. The broader F16 model for reporting discomfort whether the user stops or
continues is intentionally omitted from the current MVP. F17 closes the active workout and presents
its immediate summary. F18 makes completed
and cancelled workouts available through historical browsing.

These boundaries are intentionally incremental. Later features build on persisted workout facts
without collapsing planned targets, observed performance, skip feedback, discomfort, completion,
or historical presentation into one undifferentiated feature.

Completion of this phase should make the product independently useful as a workout tracker.

---

## Phase 3 — Progress & Analytics

Goal: understand what has happened without using AI.

Current intended sequence begins with:

* F20 — Progress Area and Exercise Performance History

F20 replaces History in primary navigation with a broader Progress destination. It preserves the
existing workout-history view and adds exercise performance history using factual performed sets,
Total reps, Heaviest weight, and Epley Estimated 1RM. It does not interpret changes against the
user's goal or classify them as positive or negative.

Planned areas:

* Exercise history
* Progress charts
* Workout statistics
* Body-weight tracking
* Body progress

---

## Phase 4 — Adaptation Engine V1

Goal: derive useful deterministic signals from user behaviour.

Potential signals:

* Repeated rep-target failure
* Consistent upper rep-range completion
* Repeated exercise skipping
* Repeated discomfort
* Reduced workout completion
* Increasing workout duration

The system begins proposing structured changes.

Suggestions must support:

* Accept
* Reject
* Dismiss

---

## Phase 5 — AI Coach

Goal: use LLM reasoning over structured application data.

Planned areas:

* Workout analysis
* Training suggestions
* Routine generation
* Context-aware coach conversation
* Persistent user preferences/context

AI should reason over structured facts and derived signals rather than unrestricted raw database dumps.

---

## Phase 6 — Nutrition

Goal: represent and track nutritional behaviour.

Planned areas:

* Food catalog
* Custom foods
* Recipes
* Meals
* Daily tracking
* Calories
* Macronutrients
* Nutrition targets
* Nutrition history
* Nutrition suggestions

---

## Phase 7 — Unified Coach

Goal: combine training, nutrition, body evolution and feedback.

Potential capabilities:

* Unified user state
* Cross-domain signals
* Adaptive training recommendations
* Adaptive nutrition recommendations
* Weekly coaching review

Example:

Training performance decreases while body weight and caloric intake are also decreasing.

The system can reason over these signals together instead of treating them as unrelated data.
