import type {
  ExerciseDetail,
  ExerciseSummary,
  FitnessProfile,
  Routine,
  TrainingDay,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const EXERCISE_MUSCLES = new Set([
  "chest",
  "lats",
  "upper_back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quadriceps",
  "hamstrings",
  "glutes",
  "adductors",
  "calves",
  "core",
  "full_body",
]);
const EXERCISE_EQUIPMENT = new Set([
  "bodyweight",
  "barbell",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "resistance_band",
  "pull_up_bar",
]);
const EXERCISE_MOVEMENT_PATTERNS = new Set([
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "horizontal_adduction",
  "shoulder_abduction",
  "elbow_flexion",
  "elbow_extension",
  "squat",
  "lunge",
  "hinge",
  "hip_thrust",
  "knee_extension",
  "knee_flexion",
  "hip_abduction",
  "hip_adduction",
  "calf_raise",
  "trunk_flexion",
  "trunk_anti_extension",
  "trunk_anti_rotation",
  "trunk_lateral_stability",
  "carry",
]);
const EXERCISE_EXECUTION_TYPES = new Set(["bilateral", "unilateral", "alternating", "isometric"]);
const ROUTINE_OBJECTIVES = new Set([
  "build_muscle",
  "lose_fat",
  "increase_strength",
  "general_fitness",
]);

export class UnauthenticatedError extends Error {
  constructor() {
    super("Authentication is required");
    this.name = "UnauthenticatedError";
  }
}

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

function isExerciseSummary(value: unknown): value is ExerciseSummary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.slug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.slug) &&
    v.slug.length <= 100 &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    v.name.length <= 120 &&
    typeof v.primary_muscle === "string" &&
    EXERCISE_MUSCLES.has(v.primary_muscle) &&
    Array.isArray(v.secondary_muscles) &&
    v.secondary_muscles.every(
      (m): m is string => typeof m === "string" && EXERCISE_MUSCLES.has(m),
    ) &&
    new Set(v.secondary_muscles).size === v.secondary_muscles.length &&
    !v.secondary_muscles.includes(v.primary_muscle) &&
    typeof v.equipment === "string" &&
    EXERCISE_EQUIPMENT.has(v.equipment) &&
    typeof v.movement_pattern === "string" &&
    EXERCISE_MOVEMENT_PATTERNS.has(v.movement_pattern) &&
    typeof v.execution_type === "string" &&
    EXERCISE_EXECUTION_TYPES.has(v.execution_type)
  );
}

function isExerciseDetail(value: unknown): value is ExerciseDetail {
  if (!isExerciseSummary(value)) return false;
  const v = value as unknown as Record<string, unknown>;
  return (
    typeof v.instructions === "string" &&
    v.instructions.trim().length > 0 &&
    v.instructions.length <= 500
  );
}

function isExerciseSummaryArray(value: unknown): value is ExerciseSummary[] {
  if (!Array.isArray(value)) return false;
  return value.every(isExerciseSummary);
}

export async function fetchExercises(params?: {
  search?: string;
  primary_muscle?: string;
  equipment?: string;
}): Promise<ExerciseSummary[]> {
  const url = new URL(`${API_BASE_URL}/api/exercises`);
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.primary_muscle) url.searchParams.set("primary_muscle", params.primary_muscle);
  if (params?.equipment) url.searchParams.set("equipment", params.equipment);

  const response = await fetch(url.toString(), { credentials: "include" });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error("Unable to load exercises");
  }
  const data: unknown = await response.json();
  if (!isExerciseSummaryArray(data)) {
    throw new Error("Invalid exercise catalog response");
  }
  return data;
}

export async function fetchExercise(slug: string): Promise<ExerciseDetail | { notFound: true }> {
  const response = await fetch(`${API_BASE_URL}/api/exercises/${encodeURIComponent(slug)}`, {
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 404) {
    return { notFound: true };
  }
  if (!response.ok) {
    throw new Error("Unable to load exercise");
  }
  const data: unknown = await response.json();
  if (!isExerciseDetail(data)) {
    throw new Error("Invalid exercise detail response");
  }
  return data;
}

function isRoutine(value: unknown): value is Routine {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    Number.isInteger(v.id) &&
    v.id > 0 &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    v.name.length <= 120 &&
    typeof v.objective === "string" &&
    ROUTINE_OBJECTIVES.has(v.objective) &&
    (v.description === null ||
      (typeof v.description === "string" &&
        v.description.trim().length > 0 &&
        v.description.length <= 1000)) &&
    typeof v.training_day_count === "number" &&
    Number.isInteger(v.training_day_count) &&
    v.training_day_count >= 0 &&
    typeof v.created_at === "string" &&
    v.created_at.length > 0 &&
    typeof v.updated_at === "string" &&
    v.updated_at.length > 0
  );
}

function isRoutineArray(value: unknown): value is Routine[] {
  if (!Array.isArray(value)) return false;
  return value.every(isRoutine);
}

export async function fetchRoutines(): Promise<Routine[]> {
  const response = await fetch(`${API_BASE_URL}/api/routines`, {
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error("Unable to load routines");
  }
  const data: unknown = await response.json();
  if (!isRoutineArray(data)) {
    throw new Error("Invalid routines response");
  }
  return data;
}

export async function fetchRoutine(routineId: number): Promise<Routine | { notFound: true }> {
  const response = await fetch(`${API_BASE_URL}/api/routines/${routineId}`, {
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 404) {
    return { notFound: true };
  }
  if (!response.ok) {
    throw new Error("Unable to load routine");
  }
  const data: unknown = await response.json();
  if (!isRoutine(data)) {
    throw new Error("Invalid routine response");
  }
  return data;
}

export type RoutineResult = Routine | { detail: string };

export async function createRoutine(data: {
  name: string;
  objective: string;
  description: string | null;
}): Promise<RoutineResult> {
  const response = await fetch(`${API_BASE_URL}/api/routines`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 409) {
      return { detail: "Routine name already exists" };
    }
    if (response.status === 422) {
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
          return { detail: messages.length > 0 ? messages.join("; ") : "Invalid routine data" };
        }
        if (typeof detail === "string") {
          return { detail };
        }
      }
    }
    return { detail: "Unable to create routine" };
  }
  if (!isRoutine(result)) {
    throw new Error("Invalid routine response");
  }
  return result;
}

export async function updateRoutine(
  routineId: number,
  data: { name: string; objective: string; description: string | null },
): Promise<RoutineResult> {
  const response = await fetch(`${API_BASE_URL}/api/routines/${routineId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) {
      return { detail: "Routine not found" };
    }
    if (response.status === 409) {
      return { detail: "Routine name already exists" };
    }
    if (response.status === 422) {
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
          return { detail: messages.length > 0 ? messages.join("; ") : "Invalid routine data" };
        }
        if (typeof detail === "string") {
          return { detail };
        }
      }
    }
    return { detail: "Unable to update routine" };
  }
  if (!isRoutine(result)) {
    throw new Error("Invalid routine response");
  }
  return result;
}

export async function deleteRoutine(routineId: number): Promise<{ detail: string } | null> {
  const response = await fetch(`${API_BASE_URL}/api/routines/${routineId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 204) {
    return null;
  }
  if (response.status === 404) {
    return { detail: "Routine not found" };
  }
  return { detail: "Unable to delete routine" };
}

function isTrainingDay(value: unknown): value is TrainingDay {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    Number.isInteger(v.id) &&
    v.id > 0 &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    v.name.length <= 120 &&
    typeof v.position === "number" &&
    Number.isInteger(v.position) &&
    v.position >= 1 &&
    typeof v.created_at === "string" &&
    v.created_at.length > 0 &&
    typeof v.updated_at === "string" &&
    v.updated_at.length > 0
  );
}

function isTrainingDayArray(value: unknown): value is TrainingDay[] {
  if (!Array.isArray(value)) return false;
  return value.every(isTrainingDay);
}

export type TrainingDayResult = TrainingDay | { detail: string };
export type TrainingDayListResult = TrainingDay[] | { detail: string };

function trainingDayErrorMessage(
  result: unknown,
  status: number,
  fallbacks: Record<number, string>,
): string {
  if (status in fallbacks && typeof result === "object" && result !== null && "detail" in result) {
    const detail = (result as Record<string, unknown>).detail;
    if (typeof detail === "string" && detail.trim().length > 0) {
      return detail;
    }
  }
  if (status === 422 && typeof result === "object" && result !== null && "detail" in result) {
    const detail = (result as Record<string, unknown>).detail;
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
      return messages.length > 0 ? messages.join("; ") : "Invalid request";
    }
  }
  return fallbacks[status] ?? "Unable to complete request";
}

export async function fetchTrainingDays(routineId: number): Promise<TrainingDayListResult> {
  const response = await fetch(`${API_BASE_URL}/api/routines/${routineId}/days`, {
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) {
      return { detail: "Routine not found" };
    }
    return { detail: "Unable to load training days" };
  }
  if (!isTrainingDayArray(result)) {
    throw new Error("Invalid training days response");
  }
  return result;
}

export async function createTrainingDay(
  routineId: number,
  name: string,
): Promise<TrainingDayResult> {
  const response = await fetch(`${API_BASE_URL}/api/routines/${routineId}/days`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    return {
      detail: trainingDayErrorMessage(result, response.status, {
        404: "Routine not found",
        409: "Routine already has 7 training days",
      }),
    };
  }
  if (!isTrainingDay(result)) {
    throw new Error("Invalid training day response");
  }
  return result;
}

export async function renameTrainingDay(
  routineId: number,
  dayId: number,
  name: string,
): Promise<TrainingDayResult> {
  const response = await fetch(`${API_BASE_URL}/api/routines/${routineId}/days/${dayId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    return {
      detail: trainingDayErrorMessage(result, response.status, {
        404: "Training day not found",
      }),
    };
  }
  if (!isTrainingDay(result)) {
    throw new Error("Invalid training day response");
  }
  return result;
}

export async function reorderTrainingDays(
  routineId: number,
  dayIds: number[],
): Promise<TrainingDayListResult> {
  const response = await fetch(`${API_BASE_URL}/api/routines/${routineId}/days/order`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day_ids: dayIds }),
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    return {
      detail: trainingDayErrorMessage(result, response.status, {
        404: "Routine not found",
      }),
    };
  }
  if (!isTrainingDayArray(result)) {
    throw new Error("Invalid training days response");
  }
  return result;
}

export async function deleteTrainingDay(
  routineId: number,
  dayId: number,
): Promise<{ detail: string } | null> {
  const response = await fetch(`${API_BASE_URL}/api/routines/${routineId}/days/${dayId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 204) {
    return null;
  }
  if (response.status === 404) {
    return { detail: "Training day not found" };
  }
  return { detail: "Unable to delete training day" };
}
