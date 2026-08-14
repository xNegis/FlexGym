
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

Phase 3 turns the workout facts captured through Phase 2 into factual historical and analytical
views. It must keep observed facts, deterministic projections, goal-dependent interpretation, and
future adaptation signals distinguishable. A chart moving up or down does not by itself mean that
the user is progressing or regressing.

Current intended sequence:

* F20 — Progress Area and Exercise Performance History (completed)
* F20.1 — Exercise Progress Refinement
* F21 — Workout Statistics and Activity Trends
* F22 — Body Weight Tracking
* F22.1 — Body Progress Photos
* F23 — Body Weight Progress
* F24 — Progress Dashboard

### F20 — Progress Area and Exercise Performance History

F20 replaces History in primary navigation with a broader Progress destination. It preserves the
existing workout-history view and adds exercise performance history from owned performed-set facts
in completed and partially performed cancelled workouts.

For each eligible exercise, the user can inspect previous sessions, performed sets, repetitions,
optional weight and RIR, Heaviest weight, Total reps, and Epley Estimated 1RM. The selected metric
is displayed over time in an accessible chart, and each point remains explainable through the
underlying session and set facts.

F20 is descriptive. It does not interpret changes against the user's goal, classify them as
positive or negative, identify records or stagnation, or propose adaptations.

### F20.1 — Exercise Progress Refinement

F20.1 sharpens the distinction between exercise performance and exercise activity. Total reps
remains available as factual session and set context, but is removed as an independently selectable
progress chart because repetitions naturally fluctuate with load, programming, set count, and rep
range and therefore do not describe progression by themselves.

Exercise progress charts retain:

* Heaviest weight, as the largest directly observed external load in a qualifying session.
* Estimated 1RM, as the existing deterministic Epley projection that combines observed load and
  repetitions.

The exercise detail adds route-backed rolling time ranges shared by its chart and session history:
`1M`, `3M`, `6M`, `1Y`, and `All`. `3M` is the default range. Changing the range resets pagination,
refresh and Browser Back preserve both range and metric, and exercises without qualifying observed
weight receive an explicit unavailable state rather than invented zero values.

F20.1 does not add max-repetition charts, volume, personal records, trend judgements, or stagnation
detection. DEC-023 records the refined metric, positive-weight, and complete-period rules and
supersedes the affected parts of the initial F20 decision.

### F21 — Workout Statistics and Activity Trends

F21 answers aggregate activity questions such as whether the user is training regularly, training
more or less frequently, how much recorded work is being performed, and how often started workouts
are completed. It adds a Statistics or Overview perspective under Progress and reuses the Phase 3
time-range convention where appropriate.

The factual period summary and temporal views cover:

* Completed workouts.
* Cancelled workouts, kept explicitly separate from completed workouts.
* Completion ratio over terminal workouts, without calling it plan adherence.
* Performed sets, including performed facts retained in a subsequently cancelled workout.
* Skipped sets and skipped exercises.
* Recorded workout duration, clearly labelled as elapsed session time rather than time under
  tension.
* Structured skip-reason distribution, including pain or discomfort.
* Weekly activity charts and a compact calendar of days on which workout activity was recorded.

F21 does not claim that more training, sets, or time is inherently better. It does not calculate
plan adherence because the application cannot yet reconstruct every historically expected workout
or distinguish every intentional rest day from a missed session.

Training volume in kilograms is deferred until load semantics are explicit for dumbbells,
unilateral exercises, bodyweight work, assisted movements, machines, and missing observed weight.
Muscle-distribution statistics are also deferred until primary and secondary muscle contributions
have a deliberate, non-duplicative rule. F21 adds no streaks, weekly targets, scores, records,
recommendations, or AI interpretation.

### F22 — Body Weight Tracking

F22 introduces user-owned body-weight measurements as historical facts. The user can record a
weight in kilograms for a local measurement date, attach an optional note, browse the chronological
history, replace an incorrect weight or note for that date, and delete an entry through explicit
confirmation. There is exactly one measurement per local date: saving again for a date replaces its
weight and note.

Measurement history is free-standing: it is not assigned to a routine, workout, or training phase.
The current body weight shown by Profile must resolve from the most recent measurement when one
exists, otherwise from the existing profile value. The profile's onboarding value remains the
undated fallback for users whose profile predates F22; migration must not invent a historical
measurement date when the application does not know when that value was measured. New onboarding
records the entered weight as the first measurement on the user's current local date. Body weight
is subsequently managed through this history rather than general Profile editing.

F22 covers capture and factual history only. It does not add charts, trends, target weight,
composition measurements, photographs, or positive/negative interpretation.

### F22.1 — Body Progress Photos

F22.1 optionally associates private body-progress photos with the measurements introduced by F22.
Each measurement can retain zero to five user-selected photos in their chosen display order. The
capture flow recommends three views — front, side, and back — but never requires those views,
orientation labels, or a fixed photographic protocol. Users can browse each measurement's photos,
view one at a time at a useful size, and deliberately remove a photo; deleting a measurement also
removes its associated photos.

Images are sensitive user-owned facts. They are stored outside the relational database in private
object storage, with only ownership-scoped metadata and an opaque object key persisted in the
database. FTP, public object URLs, and database blobs are not acceptable storage models. Access
must remain authenticated and short-lived or proxy-protected; uploaded files require bounded
format, size, and count validation, and image metadata that can expose location or device details
must not be retained unnecessarily.

F22.1 adds capture, private storage, and factual browsing only. It does not infer body composition,
compare images automatically, score appearance, expose sharing/social features, use images for AI,
or turn F23's body-weight chart into a photo-analysis feature.

### F23 — Body Weight Progress

F23 visualizes the measurements introduced by F22. It owns the body-weight chart and the shared
`1M`, `3M`, `6M`, `1Y`, and `All` range selector that deliberately remain outside F22. The chart
uses F22's single effective measurement per local date, shows the first and latest measurement in
the selected period and their absolute kilogram difference, and exposes notes associated with
plotted facts. The pre-F22 undated profile fallback is current-weight context only and is never
invented as a chart point.

It also adds a clearly labelled deterministic trend, preferably a time-based seven-day moving
average rather than an average of the last seven entries, so irregular measurement frequency does
not silently change the meaning. Its specification must define replacement of a daily measurement,
gaps, single measurements, empty periods, boundary dates, and how raw and smoothed series coexist.

F23 remains a factual visualization of body-weight history. It neither duplicates F22's capture,
editing, deletion, and paginated textual history nor displays or analyses the private photos planned
for F22.1.

F23 describes direction and magnitude but does not decide whether gaining or losing weight is good,
claim goal fulfilment, infer causation from training, forecast future weight, or recommend changes.

### F24 — Progress Dashboard

F24 makes `/progress` a factual summary of the implemented Progress perspectives rather than a new
analytics source. It composes existing projections into a concise overview containing recent
workouts, workout and performed-set activity for the selected period, weekly consistency context,
the latest body-weight measurement and factual period change, recently trained exercises, and
direct routes to Workouts, Exercises, Statistics, and Body Weight.

The first dashboard does not rank exercises by improvement, identify stagnation, create a general
progress score, or surface warnings and recommendations. Those concepts are derived signals and
belong in Phase 4 unless a later feature first defines transparent deterministic rules for them.

Completion of Phase 3 should let the user inspect exercise performance, overall training activity,
and body-weight evolution while preserving a clear boundary between what happened and what the
application thinks should happen next.

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
