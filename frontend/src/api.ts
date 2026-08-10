const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface HealthResponse {
  status: "ok" | "unavailable";
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) {
    return { status: "unavailable" };
  }
  const data: unknown = await response.json();
  if (
    typeof data === "object" &&
    data !== null &&
    "status" in data &&
    (data.status === "ok" || data.status === "unavailable")
  ) {
    return { status: data.status as "ok" | "unavailable" };
  }
  return { status: "unavailable" };
}

export interface RegistrationStatusResponse {
  registration_available: boolean;
}

export interface UserResponse {
  id: number;
  email: string;
}

export interface AuthErrorResponse {
  detail: string;
}

const req = {
  credentials: "include" as RequestCredentials,
  headers: { "Content-Type": "application/json" },
};

export async function fetchRegistrationStatus(): Promise<RegistrationStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/registration-status`);
  if (!response.ok) {
    throw new Error("Unable to determine registration status");
  }
  return (await response.json()) as RegistrationStatusResponse;
}

export async function registerUser(
  email: string,
  password: string,
): Promise<UserResponse | AuthErrorResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    ...req,
    body: JSON.stringify({ email, password }),
  });
  const data = (await response.json()) as UserResponse | AuthErrorResponse;
  if (!response.ok) {
    return data as AuthErrorResponse;
  }
  return data as UserResponse;
}

export async function loginUser(
  email: string,
  password: string,
): Promise<UserResponse | AuthErrorResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    ...req,
    body: JSON.stringify({ email, password }),
  });
  const data = (await response.json()) as UserResponse | AuthErrorResponse;
  if (!response.ok) {
    return data as AuthErrorResponse;
  }
  return data as UserResponse;
}

export async function fetchMe(): Promise<UserResponse | null> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    credentials: "include",
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Unable to determine authenticated user");
  }
  return (await response.json()) as UserResponse;
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Unable to log out");
  }
}
