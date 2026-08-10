import { useCallback, useEffect, useState } from "react";
import { fetchHealth, fetchMe, fetchRegistrationStatus } from "./api";
import AuthShell from "./components/AuthShell";
import LoginForm from "./components/LoginForm";
import RegistrationForm from "./components/RegistrationForm";
import type { AuthScreen, User } from "./types";
import "./App.css";

function App() {
  const [screen, setScreen] = useState<AuthScreen>("loading");
  const [user, setUser] = useState<User | null>(null);

  const bootstrap = useCallback(async () => {
    setScreen("loading");
    try {
      const result = await fetchHealth();
      if (result.status !== "ok") {
        setScreen("unavailable");
        return;
      }
    } catch {
      setScreen("unavailable");
      return;
    }

    try {
      const currentUser = await fetchMe();
      if (currentUser) {
        setUser(currentUser);
        setScreen("authenticated");
        return;
      }

      const regStatus = await fetchRegistrationStatus();
      if (regStatus.registration_available) {
        setScreen("registration");
      } else {
        setScreen("login");
      }
    } catch {
      setScreen("unavailable");
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const handleUser = (u: User) => {
    setUser(u);
    setScreen("authenticated");
  };

  const handleLoggedOut = () => {
    setUser(null);
    setScreen("login");
  };

  if (screen === "loading") {
    return (
      <div className="shell">
        <h1 className="title">FlexGym</h1>
        <div className="status loading" role="status">
          <p>Checking system status...</p>
        </div>
      </div>
    );
  }

  if (screen === "unavailable") {
    return (
      <div className="shell">
        <h1 className="title">FlexGym</h1>
        <div className="status unavailable" role="alert">
          <p>Unable to reach the server</p>
          <p className="hint">Please ensure the backend is running and try again.</p>
          <button type="button" className="retry" onClick={bootstrap}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <h1 className="title">FlexGym</h1>
      {screen === "registration" && <RegistrationForm onRegistered={handleUser} />}
      {screen === "login" && <LoginForm onLoggedIn={handleUser} />}
      {screen === "authenticated" && user && (
        <AuthShell email={user.email} onLoggedOut={handleLoggedOut} />
      )}
    </div>
  );
}

export default App;
