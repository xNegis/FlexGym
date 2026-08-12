# F01 — Project Infrastructure

## Objective

Establish a reproducible, executable foundation for FlexGym consisting of a React/TypeScript frontend, a FastAPI backend, SQLite persistence through SQLAlchemy, database migrations, and automated validation.

This feature must prove that the complete local application path works—from the browser, through the REST API, to the database—without introducing product behaviour that belongs to later features.

## Context

No application implementation currently exists.

The accepted architecture defines:

* Python and FastAPI for the backend.
* React and TypeScript for the frontend.
* A responsive, mobile-first web interface with a future PWA direction.
* SQLite and SQLAlchemy for initial persistence.
* A REST boundary between frontend and backend.
* Separation between HTTP endpoints, application logic, and persistence.
* pytest for backend tests and automated browser where frontend or browser-level validation is appropriate.

The initial product is personal-first, but this feature must not introduce global application state or persistence shortcuts that would make future user ownership unnecessarily difficult.

## User Experience

### Local startup

1. A developer follows the repository instructions to install backend and frontend dependencies.
2. The developer applies the database migrations.
3. The developer starts the backend and frontend development servers.
4. Opening the frontend displays a minimal FlexGym application shell.
5. The shell checks the backend and communicates whether the application is ready.

### Successful connection

When the API and database are available, the shell displays a concise ready state.

### Unavailable connection

When the API cannot be reached or its health check fails, the shell displays a clear error state and offers a retry action. Raw exception details must not be shown to the user.

## Functional Requirements

### FR-1 — Repository structure

The repository must contain clearly separated backend and frontend applications while retaining `harness/context` and `harness/features` as project documentation.

The structure must make the boundaries between API delivery, application logic, configuration, and persistence understandable without requiring conversation history.

### FR-2 — Backend application

The backend must provide a FastAPI application that can be started locally using a documented command.

API routes must be grouped under an `/api` prefix. Endpoint handlers must remain thin and delegate non-HTTP work to the appropriate application or infrastructure component.

### FR-3 — Configuration

Runtime configuration must be loaded from environment variables with development-safe defaults where appropriate.

At minimum, configuration must support:

* Database URL.
* Allowed frontend origin or origins.
* Application environment.

An example environment file must document supported values without containing secrets. Local environment files and runtime database files must not be committed.

### FR-4 — Persistence foundation

The backend must configure SQLAlchemy against SQLite and expose an explicit database session boundary suitable for later application services.

Database schema changes must be managed through Alembic migrations. A baseline migration must be present and applicable to a new database, even though this feature introduces no product-domain tables.

SQLite-specific behaviour must remain confined to configuration and persistence setup.

### FR-5 — Health API

The backend must expose `GET /api/health`.

The health operation must verify that the application can execute a trivial database query.

When healthy, it must return HTTP `200` with:

```json
{
  "status": "ok"
}
```

When the database check fails, it must return HTTP `503` with:

```json
{
  "status": "unavailable"
}
```

Internal exception details must be logged where useful but must not appear in the response.

### FR-6 — Frontend application shell

The frontend must be a Vite-based React and TypeScript application.

It must provide a minimal, mobile-first FlexGym shell that calls the health API and renders distinct loading, ready, and unavailable states.

The API base URL must be configurable per environment rather than hard-coded into UI components.

The shell must include a retry action after a failed health request.

### FR-7 — Local frontend/backend integration

The local configuration must allow the frontend to call the backend without disabling browser security protections. CORS must allow only configured origins rather than an unrestricted wildcard.

### FR-8 — Dependency and command reproducibility

Backend dependencies must be declared in `pyproject.toml` and locked in a committed `uv.lock` file. Frontend dependencies must use `package.json` and a committed npm lock file.

The README must document prerequisites and copy-pasteable commands for:

* Installing dependencies.
* Configuring the local environment.
* Applying migrations.
* Starting each application.
* Running automated tests.
* Running formatting, linting, and static type checks.

The selected Python and Node.js versions must be explicitly documented.

### FR-9 — Code quality automation

The backend must use Ruff for formatting and linting and mypy for static type checking. The frontend must use Prettier for formatting, ESLint for linting, and the TypeScript compiler for static type checking.

Validation commands must fail with a non-zero exit code when a check fails and must be suitable for later use in continuous integration.

### FR-10 — Automated tests

Backend tests must use an isolated temporary database and must not read or mutate the developer's local database.

automated browser must provide an browser-level smoke test that starts from the browser and verifies the healthy application state through the real API and test database.

Test execution must be deterministic and must clean up its temporary runtime data.

## Domain / Data Requirements

This feature introduces no fitness-domain entities or user-owned data.

It establishes only:

* SQLAlchemy engine and session management.
* Alembic migration infrastructure and an empty baseline revision.
* A configurable SQLite database location.

No placeholder user, profile, exercise, or workout tables may be added.

## API Requirements

### `GET /api/health`

Responses:

* `200 {"status":"ok"}` when the backend and database are available.
* `503 {"status":"unavailable"}` when database availability cannot be verified.

The endpoint requires no authentication because authentication does not exist yet.

OpenAPI documentation generated by FastAPI must remain available in development.

## UI Requirements

The initial UI must:

* Identify the application as FlexGym.
* Be usable at common mobile viewport widths without horizontal overflow.
* Show a non-empty loading state while checking the API.
* Show a ready state after a successful health response.
* Show a human-readable unavailable state after a network, protocol, or unhealthy response.
* Allow the user to retry a failed health check without reloading the page.

The interface is an infrastructure verification shell, not the final dashboard or visual design system.

## Business Rules

* A healthy process with an unavailable database is not considered healthy.
* Health responses expose status only, not configuration, paths, stack traces, dependency versions, or other internal details.
* API base URLs, database URLs, and allowed origins are environment configuration, not component-level constants.
* HTTP route functions must not create database engines or sessions directly.
* Tests must never depend on execution order or an existing local database.

## Validation

* Invalid or missing required production configuration must fail during application startup with a useful developer-facing error.
* Allowed origins must be parsed and validated from configuration.
* Frontend handling must treat network failures, non-2xx responses, invalid payloads, and `unavailable` payloads as unavailable states.
* No secret or machine-specific absolute path may be committed in configuration.

## Acceptance Criteria

* [x] A new developer can set up the repository by following the README without undocumented steps.
* [x] The backend and frontend can be started independently with documented commands.
* [x] Alembic can create a new SQLite database from the committed migration history.
* [x] `GET /api/health` returns the documented `200` response when the database is available.
* [x] `GET /api/health` returns the documented `503` response without leaking internal details when the database check fails.
* [x] The frontend displays loading, ready, and unavailable states correctly.
* [x] The frontend retry action performs a new health request.
* [x] The frontend works at a mobile viewport without horizontal overflow.
* [x] CORS accepts the configured development frontend origin and does not use a wildcard.
* [x] Backend tests run against isolated temporary persistence.
* [x] The automated browser smoke test verifies the browser-to-API-to-database path.
* [x] Formatting, linting, type checking, backend tests, and browser-level tests pass using documented commands.
* [x] Generated databases, caches, build output, local environment files, and test artifacts are ignored by version control.
* [x] No authentication, fitness profile, exercise, routine, or workout functionality is introduced.

## Tests

Backend tests must cover:

* Successful health response with a working test database.
* Unavailable health response when the database check raises an error.
* Exact public response shape for both outcomes.
* CORS behaviour for an allowed origin and an unconfigured origin.

automated browser must cover:

* Loading the application at a mobile viewport.
* Reaching the ready state through the real backend and test database.
* Rendering the unavailable state for a failed health request and successfully retrying it.
* Absence of horizontal page overflow at the selected mobile viewport.

## Out of Scope

* Registration, login, logout, sessions, tokens, and authenticated identity.
* User or fitness-profile data.
* Exercise, routine, workout, analytics, adaptation, AI, or nutrition behaviour.
* A production deployment platform or continuous deployment.
* Docker or container orchestration.
* Cloud databases or PostgreSQL support.
* A complete design system or final application navigation.
* PWA installation, service workers, offline behaviour, or push notifications.
* Production monitoring and observability platforms.

## Dependencies

None. This is the first implementation feature.

## Notes

Prefer a conventional monorepo layout with `backend` and `frontend` at the repository root.

Use uv with a `pyproject.toml`-based Python workflow and npm for the frontend. Exact library versions should be locked during implementation rather than copied into this specification.

The baseline migration may contain no schema operations. Its purpose is to prove and establish the migration workflow before domain tables are introduced.

Do not add abstractions for hypothetical multi-database, multi-service, or distributed deployment requirements.
