
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

Planned areas:

* Exercise catalog
* Custom exercises
* Routine creation
* Routine exercise configuration
* Training day management
* Active routine
* Routine schedule

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
