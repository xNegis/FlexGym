import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
  },
  webServer: [
    {
      command:
        "cd ../backend && .venv\\Scripts\\python -m alembic upgrade head && .venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000",
      port: 8000,
      reuseExistingServer: true,
      env: {
        DATABASE_URL: "sqlite:///./test_e2e.db",
        ALLOWED_ORIGINS: "http://localhost:5173",
        JWT_SECRET: "playwright-test-jwt-secret",
      },
    },
    {
      command: "npm run dev",
      port: 5173,
      reuseExistingServer: true,
      env: {
        VITE_API_BASE_URL: "http://localhost:8000",
      },
    },
  ],
});
