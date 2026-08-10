# FlexGym

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

# Optional: configure DATABASE_URL, ALLOWED_ORIGINS, and APP_ENV as
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

Open http://localhost:5173 in a browser. The shell should display a ready state after successfully connecting to the backend.

## Running Tests

### Backend tests

```bash
cd backend
.venv\Scripts\python -m pytest
```

### End-to-end tests

```bash
cd frontend
npx playwright test
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


xnegis@gmail.com
123456789101112131415!