import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  fetchFitnessProfile,
  fetchHealth,
  fetchMe,
  logout as apiLogoutFn,
  type UserResponse,
} from "../api";
import type { FitnessProfile } from "../types";

type AuthStatus = "loading" | "unavailable" | "unauthenticated" | "onboarding" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: UserResponse | null;
  profile: FitnessProfile | null;
  bootstrapError: string | null;
}

interface AuthContextValue extends AuthState {
  setUser: (user: UserResponse) => Promise<void>;
  setProfile: (profile: FitnessProfile) => void;
  clearProfile: () => void;
  logout: () => Promise<void>;
  retry: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    profile: null,
    bootstrapError: null,
  });

  const bootstrap = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading", bootstrapError: null }));
    try {
      const health = await fetchHealth();
      if (health.status !== "ok") {
        setState((s) => ({ ...s, status: "unavailable", bootstrapError: null }));
        return;
      }
    } catch {
      setState((s) => ({ ...s, status: "unavailable", bootstrapError: null }));
      return;
    }

    try {
      const user = await fetchMe();
      if (user) {
        const profile = await fetchFitnessProfile();
        if (profile) {
          setState({ status: "authenticated", user, profile, bootstrapError: null });
        } else {
          setState({ status: "onboarding", user, profile: null, bootstrapError: null });
        }
      } else {
        setState({ status: "unauthenticated", user: null, profile: null, bootstrapError: null });
      }
    } catch {
      setState({ status: "unavailable", user: null, profile: null, bootstrapError: null });
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const setUser = useCallback(async (user: UserResponse) => {
    setState((s) => ({ ...s, user, status: "loading" }));
    try {
      const profile = await fetchFitnessProfile();
      if (profile) {
        setState((s) => ({ ...s, user, profile, status: "authenticated" }));
      } else {
        setState((s) => ({ ...s, user, profile: null, status: "onboarding" }));
      }
    } catch {
      setState((s) => ({ ...s, status: "unavailable" }));
    }
  }, []);

  const setProfileDirect = useCallback((profile: FitnessProfile) => {
    setState((s) => ({ ...s, profile, status: "authenticated" }));
  }, []);

  const clearProfileDirect = useCallback(() => {
    setState((s) => ({ ...s, user: null, profile: null, status: "unauthenticated" }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogoutFn();
    } catch {
      // Continue with local cleanup even if server call fails
    }
    setState({ status: "unauthenticated", user: null, profile: null, bootstrapError: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        setUser,
        setProfile: setProfileDirect,
        clearProfile: clearProfileDirect,
        logout,
        retry: bootstrap,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
