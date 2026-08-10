import type { FitnessProfile } from "./types";

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

function isUserResponse(value: unknown): value is UserResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number" &&
    "email" in value &&
    typeof value.email === "string"
  );
}

function authErrorMessage(value: unknown, fallback: string): string {
  if (typeof value !== "object" || value === null || !("detail" in value)) {
    return fallback;
  }

  const detail = value.detail;
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }
  if (!Array.isArray(detail)) {
    return fallback;
  }

  const messages = detail.flatMap((item) => {
    if (
      typeof item === "object" &&
      item !== null &&
      "msg" in item &&
      typeof item.msg === "string"
    ) {
      return [item.msg.replace(/^Value error,\s*/i, "")];
    }
    return [];
  });
  return messages.length > 0 ? messages.join("; ") : fallback;
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
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
  const data = await responseJson(response);
  if (!response.ok) {
    return { detail: authErrorMessage(data, "Unable to register") };
  }
  if (!isUserResponse(data)) {
    throw new Error("Invalid registration response");
  }
  return data;
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
  const data = await responseJson(response);
  if (!response.ok) {
    return { detail: authErrorMessage(data, "Unable to log in") };
  }
  if (!isUserResponse(data)) {
    throw new Error("Invalid login response");
  }
  return data;
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

export async function fetchFitnessProfile(): Promise<FitnessProfile | null> {
  const response = await fetch(`${API_BASE_URL}/api/fitness-profile`, {
    credentials: "include",
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Unable to check fitness profile");
  }
  return (await response.json()) as FitnessProfile;
}

export async function createFitnessProfile(
  data: Record<string, unknown>,
): Promise<FitnessProfile | { detail: string }> {
  const response = await fetch(`${API_BASE_URL}/api/fitness-profile`, {
    method: "POST",
    ...req,
    body: JSON.stringify(data),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    if (response.status === 409) {
      return { detail: "Fitness profile already exists" };
    }
    if (typeof result === "object" && result !== null && "detail" in result) {
      const detail = result.detail;
      if (Array.isArray(detail)) {
        const messages = detail
          .filter(
            (item): item is { msg: string } =>
              typeof item === "object" &&
              item !== null &&
              "msg" in item &&
              typeof item.msg === "string",
          )
          .map((item) => item.msg);
        return { detail: messages.length > 0 ? messages.join("; ") : "Invalid profile data" };
      }
      if (typeof detail === "string") {
        return { detail };
      }
    }
    return { detail: "Unable to save fitness profile" };
  }
  return result as FitnessProfile;
}
