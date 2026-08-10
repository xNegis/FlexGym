# Launch FlexGym

## Backend

```bash
cd backend
.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`