# Launch FormCadence

## Backend

```bash
cd backend
.venv\Scripts\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Frontend

```bash
cd frontend
npm run dev -- --host
```

Open `http://localhost:5173` on the development PC. For a browser-only check from another device on
the same network, replace `localhost` with the development PC's current LAN address.
