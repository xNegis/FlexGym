
# `01_PRODUCT_VISION.md`

# Product Vision

Build a deeply adaptive fitness platform that learns from how the user actually trains, eats, performs and feels.

The product starts as a personal application but should be designed cleanly enough that it could eventually support external users and become a commercial product.

The immediate priority is not monetization.

The priority is building a product that its creator genuinely wants to use.

## Core Idea

Most fitness applications either:

* Track workouts.
* Generate routines.
* Track nutrition.
* Provide generic recommendations.

This product aims to progressively build a model of the user and continuously improve recommendations using actual observed behaviour.

The fundamental loop is:

User acts
→ application records facts
→ system derives signals
→ intelligence interprets those signals
→ system proposes adaptations
→ user accepts or rejects them
→ system continues learning.

## Main Domains

### User Profile

Physical characteristics, goals, experience, availability, preferences and constraints.

### Training Planning

Training routines, exercises, schedules, targets and progression.

### Workout Tracking

Real-time tracking of sets, repetitions, weights, skipped exercises, difficulty and discomfort.

### Training Analytics

Historical performance and behavioural patterns.

### Adaptation Engine

Detect patterns and propose changes based on actual user behaviour.

### AI Coach

Use LLM-based reasoning over structured user state, signals and feedback.

### Nutrition

Food, recipes, meals, calories, macronutrients and nutritional targets.

### Unified Coaching

Reason across training, nutrition, body evolution, performance and qualitative feedback.

## Example Adaptation

A user repeatedly skips an exercise.

The application asks why.

The user reports shoulder discomfort.

The system records this as structured feedback.

Repeated occurrences become a signal.

The system may later suggest replacing the exercise with an alternative.

The AI must not silently alter consequential parts of the user's routine.

It proposes changes.

The user decides.