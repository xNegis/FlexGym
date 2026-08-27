# FormCadence

Personal-first adaptive fitness application.

## Prerequisites

- Python 3.11+
- Node.js 24+
- uv (Python package manager)

## Setup

### Backend

```bash
cd backend

# Install dependencies
uv sync --extra dev

# Optional: configure DATABASE_URL, ALLOWED_ORIGINS, APP_ENV, and JWT_SECRET as
# environment variables. The defaults work for local development;
# .env.example documents the supported values.

# Apply database migrations
.venv\Scripts\python -m alembic upgrade head

# Start development server
.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env if needed (defaults work for local development)

# Start development server
npm run dev
```

### Verification

Open http://localhost:5173 in a browser. A new installation should display registration after
successfully connecting to the backend.

### Native mobile packages

FormCadence uses Capacitor to package the same React/Vite frontend for iOS and Android under the
application ID `app.formcadence`. The normal web build remains unchanged. Mobile builds use the
public, non-secret API URL in `frontend/.env.mobile` and package compiled assets rather than loading
the deployed website as a remote WebView.

From `frontend`, synchronize both native projects after a frontend or Capacitor change:

```bash
npm ci
npm run mobile:sync
```

Use `npm run mobile:sync:android` or `npm run mobile:sync:ios` to synchronize one platform. Android
can then be opened and built with Android Studio once its SDK and a supported JDK are installed.
iOS cannot be compiled locally on Windows; the root `codemagic.yaml` workflow builds and signs it on
hosted macOS, then uploads the IPA for internal TestFlight testing.

The Codemagic workflow expects an App Store Connect integration named
`formcadence_app_store_connect`. Certificates, provisioning profiles, API private keys, issuer IDs,
key IDs, passwords, and other secrets belong only in the Codemagic/Apple secure interfaces and must
never be committed to this repository.

### Docker deployment

Create a local deployment environment file from the example and adjust its values when needed:

```bash
cp .env.example .env
```

The deployment file is ignored by Git. Start or update the complete application with:

```bash
bash scripts/deploy.sh
```

When running the Compose stack on a development PC rather than the public server, use the local
HTTP configuration:

```bash
bash scripts/deploy.sh --local
```

The local mode serves `http://localhost`; production deployment continues to require HTTPS.

Alternatively, pass a specific environment file:

```bash
bash scripts/deploy.sh --env-file /path/to/deploy.env
```

The script validates the Compose configuration, applies Alembic migrations during backend startup,
waits for the backend healthcheck, and verifies the backend and frontend endpoints. The
`VITE_API_BASE_URL` value is a frontend build-time setting, so changing it requires rebuilding the
frontend image.

Body-progress photo storage accepts at most 10,000 retained objects per installation by default.
Set `BODY_PROGRESS_PHOTO_GLOBAL_LIMIT` to a positive integer in the deployment `.env` to choose a
different ceiling. Active photos and objects still pending physical S3 deletion both consume this
capacity; a successfully deleted S3 object frees its slot.

## Running Tests

### Backend tests

```bash
cd backend
.venv\Scripts\python -m pytest
```

## Code Quality

### Backend

```bash
cd backend
.venv\Scripts\python -m ruff check .           # linting
.venv\Scripts\python -m ruff format --check .   # formatting
.venv\Scripts\python -m mypy app tests          # type checking
```

### Frontend

```bash
cd frontend
npx prettier --check "src/**/*.{ts,tsx,css}"  # formatting
npx eslint src/                                 # linting
npx tsc -b                                      # type checking
```
