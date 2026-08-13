# Launch FormCadence

## Backend

```bash
cd backend
.venv\Scripts\python -m uvicorn app.main:app --reload --host 192.168.1.134 --port 8000
```

## Frontend

```bash
cd frontend
npm run dev -- --host
```

Open `http://192.168.1.134:5173`
