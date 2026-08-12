import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context";
import { LoadingState } from "../ui/LoadingState";

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <LoadingState label="Checking authentication..." />;
  }

  if (status === "unavailable") {
    return <Navigate to="/unavailable" replace />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

export function RequireProfile({ children }: RequireAuthProps) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <LoadingState label="Checking authentication..." />;
  }

  if (status === "unavailable") {
    return <Navigate to="/unavailable" replace />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (status === "onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export function RedirectIfAuthenticated({ children }: RequireAuthProps) {
  const { status } = useAuth();

  if (status === "loading") {
    return <LoadingState label="Loading..." />;
  }

  if (status === "authenticated") {
    return <Navigate to="/today" replace />;
  }

  if (status === "onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  if (status === "unavailable") {
    return <Navigate to="/unavailable" replace />;
  }

  return <>{children}</>;
}

export function RedirectToOnboarding({ children }: RequireAuthProps) {
  const { status } = useAuth();

  if (status === "loading") {
    return <LoadingState label="Loading..." />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  if (status === "unavailable") {
    return <Navigate to="/unavailable" replace />;
  }

  if (status === "authenticated") {
    return <Navigate to="/today" replace />;
  }

  return <>{children}</>;
}
