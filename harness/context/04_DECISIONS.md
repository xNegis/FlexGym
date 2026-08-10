

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

## DEC-008 — Defer end-to-end testing during the early proof of concept

**Status:** Accepted

New features will initially require only a small set of basic backend tests for their essential
behaviour. Exhaustive variant testing and Playwright end-to-end coverage are deferred until the
main product flows are more stable.

Existing testing infrastructure may remain available, but end-to-end execution is not part of
the current feature validation contract.
