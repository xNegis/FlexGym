import { useCallback, useEffect, useState } from "react";
import { fetchHealth } from "./api";
import type { AppState } from "./types";
import "./App.css";

function App() {
  const [state, setState] = useState<AppState>("loading");

  const checkHealth = useCallback(async () => {
    setState("loading");
    try {
      const result = await fetchHealth();
      setState(result.status === "ok" ? "ready" : "unavailable");
    } catch {
      setState("unavailable");
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <div className="shell">
      <h1 className="title">FlexGym</h1>
      {state === "loading" && (
        <div className="status loading" role="status">
          <p>Checking system status...</p>
        </div>
      )}
      {state === "ready" && (
        <div className="status ready" role="status">
          <p>System ready</p>
        </div>
      )}
      {state === "unavailable" && (
        <div className="status unavailable" role="alert">
          <p>Unable to reach the server</p>
          <p className="hint">Please ensure the backend is running and try again.</p>
          <button type="button" className="retry" onClick={checkHealth}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
