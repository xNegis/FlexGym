import { useCallback, useEffect, useState } from "react";
import { fetchFitnessProfile, fetchHealth, fetchMe } from "./api";
import ExerciseCatalog from "./components/ExerciseCatalog";
import ExerciseDetail from "./components/ExerciseDetail";
import FitnessProfileForm from "./components/FitnessProfileForm";
import LoginForm from "./components/LoginForm";
import ProfileManagement from "./components/ProfileManagement";
import RegistrationForm from "./components/RegistrationForm";
import type { AuthScreen, FitnessProfile, Section, User } from "./types";
import "./App.css";

function App() {
  const [screen, setScreen] = useState<AuthScreen>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<FitnessProfile | null>(null);
  const [section, setSection] = useState<Section>("profile");
  const [catalogSlug, setCatalogSlug] = useState<string | null>(null);

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

        const currentProfile = await fetchFitnessProfile();
        if (currentProfile) {
          setProfile(currentProfile);
          setScreen("authenticated");
        } else {
          setScreen("onboarding");
        }
        return;
      }

      setScreen("login");
    } catch {
      setScreen("unavailable");
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const handleUser = async (u: User) => {
    setUser(u);
    setScreen("loading");
    try {
      const currentProfile = await fetchFitnessProfile();
      if (currentProfile) {
        setProfile(currentProfile);
        setScreen("authenticated");
      } else {
        setScreen("onboarding");
      }
    } catch {
      setScreen("unavailable");
    }
  };

  const handleProfileCreated = (created: FitnessProfile) => {
    setProfile(created);
    setScreen("authenticated");
  };

  const handleProfileUpdated = (updated: FitnessProfile) => {
    setProfile(updated);
  };

  const handleProfileDeleted = () => {
    setUser(null);
    setProfile(null);
    setScreen("login");
  };

  const handleLoggedOut = () => {
    setUser(null);
    setProfile(null);
    setSection("profile");
    setCatalogSlug(null);
    setScreen("login");
  };

  const handleOpenExercise = (slug: string) => {
    setCatalogSlug(slug);
  };

  const handleBackToCatalog = () => {
    setCatalogSlug(null);
  };

  const handleSectionChange = (next: Section) => {
    setSection(next);
    setCatalogSlug(null);
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
      {screen === "registration" && (
        <RegistrationForm onRegistered={handleUser} onLoginRequested={() => setScreen("login")} />
      )}
      {screen === "login" && (
        <LoginForm
          onLoggedIn={handleUser}
          onRegistrationRequested={() => setScreen("registration")}
        />
      )}
      {screen === "onboarding" && (
        <FitnessProfileForm onProfileCreated={handleProfileCreated} onLoggedOut={handleLoggedOut} />
      )}
      {screen === "authenticated" && user && profile && (
        <>
          <nav className="app-nav" aria-label="Main navigation">
            <button
              type="button"
              className={`nav-tab${section === "profile" ? " nav-tab-active" : ""}`}
              onClick={() => handleSectionChange("profile")}
            >
              Profile
            </button>
            <button
              type="button"
              className={`nav-tab${section === "exercises" ? " nav-tab-active" : ""}`}
              onClick={() => handleSectionChange("exercises")}
            >
              Exercises
            </button>
          </nav>

          {section === "profile" && (
            <ProfileManagement
              profile={profile}
              email={user.email}
              onLoggedOut={handleLoggedOut}
              onProfileDeleted={handleProfileDeleted}
              onProfileUpdated={handleProfileUpdated}
            />
          )}

          {section === "exercises" && (
            <>
              <div hidden={catalogSlug !== null}>
                <ExerciseCatalog
                  onOpenExercise={handleOpenExercise}
                  onUnauthenticated={handleLoggedOut}
                />
              </div>
              {catalogSlug !== null && (
                <ExerciseDetail
                  slug={catalogSlug}
                  onBack={handleBackToCatalog}
                  onUnauthenticated={handleLoggedOut}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
