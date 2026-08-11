
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
* Routine Schedule
* Active Routine

A training day is one planned workout session inside a routine, such as Push, Pull, or Legs. It is
not a weekday. Routine Schedule will later provide exactly seven ordered weekly positions, each of
which is either rest or references one training day. Every training day must be allocated exactly
once before a routine can become active. A routine may remain incomplete while it is being designed.

---

## Phase 2 — Workout Tracking

Goal: make the application usable during real gym sessions.

Planned areas:

* Start workout
* Live workout
* Set tracking
* Exercise navigation
* Rest timer
* Exercise feedback
* Pain/discomfort reporting
* Exercise skip feedback
* Workout completion
* Workout history

Completion of this phase should make the product independently useful as a workout tracker.

---

## Phase 3 — Progress & Analytics

Goal: understand what has happened without using AI.

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
