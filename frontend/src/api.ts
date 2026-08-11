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

function isFitnessProfile(value: unknown): value is FitnessProfile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    typeof v.date_of_birth === "string" &&
    typeof v.biological_sex === "string" &&
    typeof v.height_cm === "number" &&
    typeof v.weight_kg === "number" &&
    (v.body_fat_percentage === null || typeof v.body_fat_percentage === "number") &&
    typeof v.training_experience === "string" &&
    typeof v.primary_goal === "string" &&
    typeof v.training_days_per_week === "number" &&
    typeof v.preferred_workout_duration_minutes === "number" &&
    typeof v.training_environment === "string" &&
    (v.physical_limitations === null || typeof v.physical_limitations === "string") &&
    typeof v.created_at === "string" &&
    typeof v.updated_at === "string"
  );
}

const req = {
  credentials: "include" as RequestCredentials,
  headers: { "Content-Type": "application/json" },
};

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
  const data: unknown = await response.json();
  if (!isFitnessProfile(data)) {
    throw new Error("Invalid profile response");
  }
  return data;
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
  if (!isFitnessProfile(result)) {
    throw new Error("Invalid profile response");
  }
  return result;
}

export async function updateFitnessProfile(
  data: Record<string, unknown>,
): Promise<FitnessProfile | { detail: string }> {
  const response = await fetch(`${API_BASE_URL}/api/fitness-profile`, {
    method: "PUT",
    ...req,
    body: JSON.stringify(data),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    if (response.status === 404) {
      return { detail: "Fitness profile not found" };
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
  if (!isFitnessProfile(result)) {
    throw new Error("Invalid profile response");
  }
  return result;
}

export async function deleteFitnessProfile(): Promise<{ detail: string } | null> {
  const response = await fetch(`${API_BASE_URL}/api/fitness-profile`, {
    method: "DELETE",
    credentials: "include",
  });
  if (response.status === 204) {
    return null;
  }
  if (response.status === 404) {
    return { detail: "Fitness profile not found" };
  }
  const result: unknown = await responseJson(response);
  if (typeof result === "object" && result !== null && "detail" in result) {
    const detail = result.detail;
    if (typeof detail === "string") {
      return { detail };
    }
  }
  return { detail: "Unable to delete fitness profile" };
}
