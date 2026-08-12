

# `03_ARCHITECTURE.md`

# Architecture

These decisions define the initial architecture and can evolve through explicit project decisions.

## Initial Stack

### Backend

Python
FastAPI

### Frontend

React
TypeScript

The frontend should be responsive and designed primarily around mobile usage because workout tracking will happen predominantly from a phone.

A PWA approach is preferred initially over native mobile applications.

### Persistence

SQLite initially.

SQLite is chosen because the application initially targets a single primary user and should require minimal infrastructure.

Persistence code must avoid unnecessary SQLite-specific coupling so that PostgreSQL or another relational database can replace it later.

### ORM

SQLAlchemy.

### Testing

Backend:

* pytest

Frontend / browser integration:

* automated browser where appropriate.

## Logical Architecture

Frontend

↓

REST API

↓

Application / Domain Logic

↓

Persistence

Business logic should not live directly inside API endpoints.

## Data Philosophy

Separate:

### Facts

Things that actually happened.

Examples:

* 72.5 kg × 8 repetitions.
* Exercise skipped.
* Shoulder discomfort reported.
* Body weight: 67.2 kg.

### Derived Signals

Interpretations produced deterministically from facts.

Examples:

* Exercise skipped in 4 of last 6 sessions.
* Rep target repeatedly missed.
* Performance improving.

### AI Interpretation

LLM reasoning based on structured facts, derived signals and relevant user context.

### Changes

Consequential changes should generally be represented as suggestions before mutating the user's active plan.

## Product Engineering Principles

### 1. Tracking must be fast

Using the application during a workout must not feel like filling in a questionnaire.

### 2. Collect explicit feedback selectively

Ask questions when the answer provides meaningful information.

Infer everything else when reasonably possible.

### 3. AI is not the database

Important facts and decisions must be stored structurally.

### 4. AI should not have unrestricted authority

AI proposes consequential changes rather than silently applying them.

### 5. Personal-first, scalable later

Do not build infrastructure for hypothetical massive scale.

Do avoid architectural shortcuts that make reasonable future growth unnecessarily difficult.

### 6. Features should be vertical

Prefer small usable increments over large horizontal technical projects.

### 7. Avoid premature AI complexity

Start with deterministic rules when deterministic rules solve the problem.

Agents, RAG, embeddings and complex LLM orchestration should only be introduced when there is a concrete need.
