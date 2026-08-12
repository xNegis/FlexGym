import type {
  ActiveRoutine,
  ActiveWorkoutConflict,
  ActiveWorkoutSummary,
  ConfiguredExercise,
  ConfiguredSet,
  ConfiguredSetTempo,
  ExerciseDetail,
  ExerciseSummary,
  FitnessProfile,
  Routine,
  ScheduleSlot,
  ScheduleSlotType,
  SessionPreview,
  StartContext,
  StartContextState,
  TrainingDay,
  WorkoutEventException,
  WorkoutExceptionProjection,
  WorkoutExerciseSnapshot,
  WorkoutPlannedSetSnapshot,
  WorkoutSession,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://192.168.1.134:8000";

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
    v.training_day_count <= 7 &&
    typeof v.is_active === "boolean" &&
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
    typeof v.week_position === "number" &&
    Number.isInteger(v.week_position) &&
    v.week_position >= 1 &&
    v.week_position <= 7 &&
    typeof v.exercise_count === "number" &&
    Number.isInteger(v.exercise_count) &&
    v.exercise_count >= 0 &&
    typeof v.created_at === "string" &&
    v.created_at.length > 0 &&
    typeof v.updated_at === "string" &&
    v.updated_at.length > 0
  );
}

function isTrainingDayArray(value: unknown): value is TrainingDay[] {
  if (!Array.isArray(value)) return false;
  if (value.length > 7 || !value.every(isTrainingDay)) return false;
  const ids = new Set(value.map((day) => day.id));
  return ids.size === value.length;
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

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const VALID_SLOT_TYPES: Set<ScheduleSlotType> = new Set(["training", "rest"]);

function isScheduleSlotTrainingDay(value: unknown): value is {
  id: number;
  name: string;
  week_position: number;
  exercise_count: number;
  created_at: string;
  updated_at: string;
} {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    Number.isInteger(v.id) &&
    v.id > 0 &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    v.name.length <= 120 &&
    typeof v.week_position === "number" &&
    Number.isInteger(v.week_position) &&
    v.week_position >= 1 &&
    v.week_position <= 7 &&
    typeof v.exercise_count === "number" &&
    Number.isInteger(v.exercise_count) &&
    v.exercise_count >= 0 &&
    typeof v.created_at === "string" &&
    v.created_at.length > 0 &&
    typeof v.updated_at === "string" &&
    v.updated_at.length > 0
  );
}

function isScheduleSlot(value: unknown): value is ScheduleSlot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.position !== "number" ||
    !Number.isInteger(v.position) ||
    v.position < 1 ||
    v.position > 7
  )
    return false;
  if (typeof v.weekday !== "string" || !WEEKDAYS.includes(v.weekday as (typeof WEEKDAYS)[number]))
    return false;
  if (typeof v.type !== "string" || !VALID_SLOT_TYPES.has(v.type as ScheduleSlotType)) return false;
  if (v.type === "training") {
    return isScheduleSlotTrainingDay(v.training_day);
  }
  return !("training_day" in v);
}

function isScheduleSlotArray(value: unknown): value is ScheduleSlot[] {
  if (!Array.isArray(value)) return false;
  if (value.length !== 7) return false;
  if (!value.every(isScheduleSlot)) return false;
  const positions = new Set(value.map((s) => s.position));
  if (positions.size !== 7) return false;
  return value.every(
    (slot, index) => slot.position === index + 1 && slot.weekday === WEEKDAYS[index],
  );
}

export type ScheduleResult = ScheduleSlot[] | { detail: string };

export async function fetchSchedule(routineId: number): Promise<ScheduleResult> {
  const response = await fetch(`${API_BASE_URL}/api/routines/${routineId}/schedule`, {
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
    return { detail: "Unable to load schedule" };
  }
  if (!isScheduleSlotArray(result)) {
    throw new Error("Invalid schedule response");
  }
  return result;
}

export type MoveTrainingDayResult = ScheduleSlot[] | { detail: string };

export async function moveTrainingDay(
  routineId: number,
  trainingDayId: number,
  weekPosition: number,
): Promise<MoveTrainingDayResult> {
  const response = await fetch(`${API_BASE_URL}/api/routines/${routineId}/schedule`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      training_day_id: trainingDayId,
      week_position: weekPosition,
    }),
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) {
      if (typeof result === "object" && result !== null && "detail" in result) {
        const detail = (result as Record<string, unknown>).detail;
        if (typeof detail === "string" && detail.trim().length > 0) {
          return { detail };
        }
      }
      return { detail: "Training day not found" };
    }
    if (
      response.status === 422 &&
      typeof result === "object" &&
      result !== null &&
      "detail" in result
    ) {
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
        return { detail: messages.length > 0 ? messages.join("; ") : "Invalid request" };
      }
      if (typeof detail === "string") {
        return { detail };
      }
    }
    return { detail: "Unable to move training day" };
  }
  if (!isScheduleSlotArray(result)) {
    throw new Error("Invalid schedule response");
  }
  return result;
}

function isConfiguredSetTempo(value: unknown): value is ConfiguredSetTempo {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const components = [
    v.eccentric_seconds,
    v.stretched_pause_seconds,
    v.concentric_seconds,
    v.peak_contraction_seconds,
  ];
  return (
    typeof v.eccentric_seconds === "number" &&
    Number.isInteger(v.eccentric_seconds) &&
    v.eccentric_seconds >= 0 &&
    v.eccentric_seconds <= 60 &&
    typeof v.stretched_pause_seconds === "number" &&
    Number.isInteger(v.stretched_pause_seconds) &&
    v.stretched_pause_seconds >= 0 &&
    v.stretched_pause_seconds <= 60 &&
    typeof v.concentric_seconds === "number" &&
    Number.isInteger(v.concentric_seconds) &&
    v.concentric_seconds >= 0 &&
    v.concentric_seconds <= 60 &&
    typeof v.peak_contraction_seconds === "number" &&
    Number.isInteger(v.peak_contraction_seconds) &&
    v.peak_contraction_seconds >= 0 &&
    v.peak_contraction_seconds <= 60 &&
    components.some((component) => component !== 0)
  );
}

function hasAtMostTwoDecimalPlaces(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

function isTargetType(value: unknown): value is ConfiguredExercise["target_type"] {
  return (
    typeof value === "string" &&
    ["repetitions", "duration_seconds", "distance_meters"].includes(value)
  );
}

function isConfiguredSet(
  value: unknown,
  targetType: ConfiguredExercise["target_type"],
): value is ConfiguredSet {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.target_value !== "number" || !Number.isFinite(v.target_value)) return false;
  const targetIsValid =
    targetType === "repetitions"
      ? Number.isInteger(v.target_value) && v.target_value >= 1 && v.target_value <= 1000
      : targetType === "duration_seconds"
        ? Number.isInteger(v.target_value) && v.target_value >= 1 && v.target_value <= 86400
        : v.target_value > 0 &&
          v.target_value <= 100000 &&
          hasAtMostTwoDecimalPlaces(v.target_value);
  return (
    typeof v.position === "number" &&
    Number.isInteger(v.position) &&
    v.position >= 1 &&
    targetIsValid &&
    (v.target_weight_kg === null ||
      (typeof v.target_weight_kg === "number" &&
        Number.isFinite(v.target_weight_kg) &&
        v.target_weight_kg >= 0 &&
        v.target_weight_kg <= 5000 &&
        hasAtMostTwoDecimalPlaces(v.target_weight_kg))) &&
    (v.target_rir === null ||
      (typeof v.target_rir === "number" &&
        Number.isInteger(v.target_rir) &&
        v.target_rir >= 0 &&
        v.target_rir <= 10)) &&
    (v.tempo === null || isConfiguredSetTempo(v.tempo)) &&
    (v.rest_after_set_seconds === null ||
      (typeof v.rest_after_set_seconds === "number" &&
        Number.isInteger(v.rest_after_set_seconds) &&
        v.rest_after_set_seconds >= 0 &&
        v.rest_after_set_seconds <= 3600)) &&
    (v.notes === null ||
      (typeof v.notes === "string" && v.notes.trim().length > 0 && v.notes.length <= 500))
  );
}

function isConfiguredExercise(value: unknown): value is ConfiguredExercise {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isTargetType(v.target_type)) return false;
  const targetType = v.target_type;
  return (
    typeof v.id === "number" &&
    Number.isInteger(v.id) &&
    v.id > 0 &&
    typeof v.position === "number" &&
    Number.isInteger(v.position) &&
    v.position >= 1 &&
    isExerciseSummary(v.exercise) &&
    (v.rest_after_exercise_seconds === null ||
      (typeof v.rest_after_exercise_seconds === "number" &&
        Number.isInteger(v.rest_after_exercise_seconds) &&
        v.rest_after_exercise_seconds >= 0 &&
        v.rest_after_exercise_seconds <= 3600)) &&
    (v.notes === null ||
      (typeof v.notes === "string" && v.notes.trim().length > 0 && v.notes.length <= 1000)) &&
    Array.isArray(v.sets) &&
    v.sets.length >= 1 &&
    v.sets.length <= 20 &&
    v.sets.every((set, index) => isConfiguredSet(set, targetType) && set.position === index + 1) &&
    typeof v.created_at === "string" &&
    v.created_at.length > 0 &&
    typeof v.updated_at === "string" &&
    v.updated_at.length > 0
  );
}

function isConfiguredExerciseArray(value: unknown): value is ConfiguredExercise[] {
  if (!Array.isArray(value)) return false;
  if (value.length > 20 || !value.every(isConfiguredExercise)) return false;
  const ids = new Set(value.map((c) => c.id));
  return ids.size === value.length && value.every((c, index) => c.position === index + 1);
}

export type ConfiguredExerciseResult = ConfiguredExercise | { detail: string };
export type ConfiguredExerciseListResult = ConfiguredExercise[] | { detail: string };

function configErrorMessage(
  result: unknown,
  status: number,
  fallbacks: Record<number, string>,
): string {
  if (
    [404, 409, 422].includes(status) &&
    typeof result === "object" &&
    result !== null &&
    "detail" in result
  ) {
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

export async function fetchExerciseConfigs(
  routineId: number,
  dayId: number,
): Promise<ConfiguredExerciseListResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/routines/${routineId}/days/${dayId}/exercises`,
    { credentials: "include" },
  );
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) {
      return { detail: "Training day not found" };
    }
    return { detail: "Unable to load exercises" };
  }
  if (!isConfiguredExerciseArray(result)) {
    throw new Error("Invalid exercise configurations response");
  }
  return result;
}

export interface CreateExerciseConfigPayload {
  exercise_slug: string;
  target_type: string;
  rest_after_exercise_seconds: number | null;
  notes: string | null;
  sets: {
    target_value: number;
    target_weight_kg: number | null;
    target_rir: number | null;
    tempo: {
      eccentric_seconds: number;
      stretched_pause_seconds: number;
      concentric_seconds: number;
      peak_contraction_seconds: number;
    } | null;
    rest_after_set_seconds: number | null;
    notes: string | null;
  }[];
}

export async function createExerciseConfig(
  routineId: number,
  dayId: number,
  payload: CreateExerciseConfigPayload,
): Promise<ConfiguredExerciseResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/routines/${routineId}/days/${dayId}/exercises`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    return {
      detail: configErrorMessage(result, response.status, {
        404: "Training day not found",
        409: "Exercise already configured",
      }),
    };
  }
  if (!isConfiguredExercise(result)) {
    throw new Error("Invalid exercise configuration response");
  }
  return result;
}

export interface UpdateExerciseConfigPayload {
  target_type: string;
  rest_after_exercise_seconds: number | null;
  notes: string | null;
  sets: {
    target_value: number;
    target_weight_kg: number | null;
    target_rir: number | null;
    tempo: {
      eccentric_seconds: number;
      stretched_pause_seconds: number;
      concentric_seconds: number;
      peak_contraction_seconds: number;
    } | null;
    rest_after_set_seconds: number | null;
    notes: string | null;
  }[];
}

export async function updateExerciseConfig(
  routineId: number,
  dayId: number,
  configId: number,
  payload: UpdateExerciseConfigPayload,
): Promise<ConfiguredExerciseResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/routines/${routineId}/days/${dayId}/exercises/${configId}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    return {
      detail: configErrorMessage(result, response.status, {
        404: "Configured exercise not found",
      }),
    };
  }
  if (!isConfiguredExercise(result)) {
    throw new Error("Invalid exercise configuration response");
  }
  return result;
}

export async function reorderExerciseConfigs(
  routineId: number,
  dayId: number,
  configIds: number[],
): Promise<ConfiguredExerciseListResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/routines/${routineId}/days/${dayId}/exercises/order`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercise_configuration_ids: configIds }),
    },
  );
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    return {
      detail: configErrorMessage(result, response.status, {
        404: "Training day not found",
      }),
    };
  }
  if (!isConfiguredExerciseArray(result)) {
    throw new Error("Invalid exercise configurations response");
  }
  return result;
}

export async function deleteExerciseConfig(
  routineId: number,
  dayId: number,
  configId: number,
): Promise<{ detail: string } | null> {
  const response = await fetch(
    `${API_BASE_URL}/api/routines/${routineId}/days/${dayId}/exercises/${configId}`,
    { method: "DELETE", credentials: "include" },
  );
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 204) {
    return null;
  }
  if (response.status === 404) {
    return { detail: "Configured exercise not found" };
  }
  return { detail: "Unable to delete exercise" };
}

function isActiveRoutine(value: unknown): value is ActiveRoutine {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isRoutine(v.routine)) return false;
  if ((v.routine as Routine).is_active !== true) return false;
  return typeof v.activated_at === "string" && v.activated_at.length > 0;
}

export async function fetchActiveRoutine(): Promise<ActiveRoutine | null> {
  const response = await fetch(`${API_BASE_URL}/api/active-routine`, {
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error("Unable to load active routine");
  }
  const data: unknown = await response.json();
  if (data === null) {
    return null;
  }
  if (!isActiveRoutine(data)) {
    throw new Error("Invalid active routine response");
  }
  return data;
}

export type ActivateRoutineResult = ActiveRoutine | { detail: string };

export async function activateRoutine(routineId: number): Promise<ActivateRoutineResult> {
  const response = await fetch(`${API_BASE_URL}/api/active-routine`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ routine_id: routineId }),
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
      if (
        typeof result === "object" &&
        result !== null &&
        "detail" in result &&
        typeof (result as Record<string, unknown>).detail === "string"
      ) {
        return { detail: (result as Record<string, unknown>).detail as string };
      }
      return { detail: "Routine cannot be activated" };
    }
    if (response.status === 422) {
      if (typeof result === "object" && result !== null && "detail" in result) {
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
          return {
            detail: messages.length > 0 ? messages.join("; ") : "Invalid request",
          };
        }
        if (typeof detail === "string") {
          return { detail };
        }
      }
      return { detail: "Invalid request" };
    }
    return { detail: "Unable to activate routine" };
  }
  if (!isActiveRoutine(result)) {
    throw new Error("Invalid active routine response");
  }
  return result;
}

export async function deactivateRoutine(): Promise<{ detail: string | null }> {
  const response = await fetch(`${API_BASE_URL}/api/active-routine`, {
    method: "DELETE",
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 204) {
    return { detail: null };
  }
  return { detail: "Unable to deactivate routine" };
}

function isActiveWorkoutSummary(value: unknown): value is ActiveWorkoutSummary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    Number.isInteger(v.id) &&
    v.id > 0 &&
    typeof v.routine_name === "string" &&
    v.routine_name.length > 0 &&
    typeof v.selected_training_day_name === "string" &&
    v.selected_training_day_name.length > 0 &&
    typeof v.local_date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.local_date) &&
    typeof v.started_at === "string" &&
    v.started_at.length > 0 &&
    typeof v.status === "string" &&
    v.status.length > 0 &&
    typeof v.selection_kind === "string" &&
    v.selection_kind.length > 0 &&
    typeof v.resume_url === "string" &&
    v.resume_url.startsWith(`/workouts/${v.id}`)
  );
}

const VALID_START_CONTEXT_STATES: Set<StartContextState> = new Set([
  "active_workout",
  "no_active_routine",
  "rest_day",
  "scheduled_session",
]);

function isSessionPreviewExercise(
  value: unknown,
): value is { position: number; name: string; set_count: number } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.position === "number" &&
    Number.isInteger(v.position) &&
    v.position >= 1 &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    typeof v.set_count === "number" &&
    Number.isInteger(v.set_count) &&
    v.set_count >= 0
  );
}

function isSessionPreview(value: unknown): value is SessionPreview {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    Number.isInteger(v.id) &&
    v.id > 0 &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    typeof v.week_position === "number" &&
    Number.isInteger(v.week_position) &&
    v.week_position >= 1 &&
    v.week_position <= 7 &&
    typeof v.exercise_count === "number" &&
    Number.isInteger(v.exercise_count) &&
    v.exercise_count >= 0 &&
    typeof v.set_count === "number" &&
    Number.isInteger(v.set_count) &&
    v.set_count >= 0 &&
    typeof v.can_start === "boolean" &&
    Array.isArray(v.exercises) &&
    v.exercises.every(isSessionPreviewExercise)
  );
}

function isSessionPreviewArray(value: unknown): value is SessionPreview[] {
  if (!Array.isArray(value)) return false;
  return value.every(isSessionPreview);
}

function isStartContext(value: unknown): value is StartContext {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.state !== "string" || !VALID_START_CONTEXT_STATES.has(v.state as StartContextState))
    return false;

  if (v.state === "active_workout") {
    return isActiveWorkoutSummary(v.workout);
  }
  if (v.state === "no_active_routine") {
    return true;
  }
  if (v.state === "rest_day" || v.state === "scheduled_session") {
    if (
      typeof v.routine !== "object" ||
      v.routine === null ||
      !("routine_id" in v.routine) ||
      !("routine_name" in v.routine)
    )
      return false;
    if (!isSessionPreviewArray(v.session_previews)) return false;
    if (v.state === "scheduled_session") {
      return isSessionPreview(v.session);
    }
    return (
      typeof v.week_position === "number" &&
      Number.isInteger(v.week_position) &&
      v.week_position >= 1 &&
      v.week_position <= 7 &&
      typeof v.weekday === "string" &&
      v.weekday.length > 0
    );
  }
  return false;
}

export type StartContextResult = StartContext | { detail: string };

export async function fetchStartContext(localDate: string): Promise<StartContextResult> {
  const url = `${API_BASE_URL}/api/workouts/start-context?local_date=${encodeURIComponent(localDate)}`;
  const response = await fetch(url, { credentials: "include" });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (
      response.status === 422 &&
      typeof result === "object" &&
      result !== null &&
      "detail" in result
    ) {
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
        return { detail: messages.length > 0 ? messages.join("; ") : "Invalid date" };
      }
    }
    return { detail: "Unable to load today's context" };
  }
  if (!isStartContext(result)) {
    throw new Error("Invalid start context response");
  }
  return result;
}

function isWorkoutPlannedSetSnapshot(
  value: unknown,
  targetType: string,
): value is WorkoutPlannedSetSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.target_value !== "number" || !Number.isFinite(v.target_value)) return false;
  const targetIsValid =
    targetType === "repetitions"
      ? Number.isInteger(v.target_value) && v.target_value >= 1
      : targetType === "duration_seconds"
        ? Number.isInteger(v.target_value) && v.target_value >= 1
        : true;
  const perfOk = v.performance === null || isPerformedSet(v.performance);
  const excOk = v.exception === null || isWorkoutExceptionProjection(v.exception);
  return (
    typeof v.position === "number" &&
    Number.isInteger(v.position) &&
    v.position >= 1 &&
    targetIsValid &&
    (v.target_weight_kg === null || typeof v.target_weight_kg === "number") &&
    (v.target_rir === null ||
      (typeof v.target_rir === "number" && Number.isInteger(v.target_rir))) &&
    (v.tempo === null || isConfiguredSetTempo(v.tempo)) &&
    (v.rest_after_set_seconds === null ||
      (typeof v.rest_after_set_seconds === "number" &&
        Number.isInteger(v.rest_after_set_seconds))) &&
    (v.notes === null || typeof v.notes === "string") &&
    perfOk &&
    excOk
  );
}

function isPerformedSet(value: unknown): value is WorkoutPlannedSetSnapshot["performance"] {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.performed_value === "number" &&
    Number.isFinite(v.performed_value) &&
    (v.performed_weight_kg === null ||
      (typeof v.performed_weight_kg === "number" && Number.isFinite(v.performed_weight_kg))) &&
    (v.performed_rir === null ||
      (typeof v.performed_rir === "number" && Number.isInteger(v.performed_rir))) &&
    (v.entry_mode === "as_planned" || v.entry_mode === "adjusted") &&
    (v.set_started_at === null || typeof v.set_started_at === "string") &&
    typeof v.completed_at === "string" &&
    v.completed_at.length > 0 &&
    (v.observed_duration_seconds === null ||
      (typeof v.observed_duration_seconds === "number" &&
        Number.isInteger(v.observed_duration_seconds) &&
        v.observed_duration_seconds >= 0)) &&
    typeof v.updated_at === "string" &&
    v.updated_at.length > 0
  );
}

const SUPPORTED_REASON_CODES = new Set([
  "not_enough_time",
  "too_fatigued",
  "equipment_unavailable",
  "unable_to_perform",
  "other",
]);

function isValidReasonCode(value: unknown): boolean {
  return value === null || (typeof value === "string" && SUPPORTED_REASON_CODES.has(value));
}

function isWorkoutExceptionProjection(value: unknown): value is WorkoutExceptionProjection {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.scope === "set" || v.scope === "exercise") &&
    isValidReasonCode(v.reason_code) &&
    (v.note === null || typeof v.note === "string") &&
    typeof v.occurred_at === "string" &&
    v.occurred_at.length > 0
  );
}

function isWorkoutEventException(value: unknown): value is WorkoutEventException {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.scope === "set" || v.scope === "exercise") &&
    isValidReasonCode(v.reason_code) &&
    (v.note === null || typeof v.note === "string")
  );
}

function isWorkoutExerciseSnapshot(value: unknown): value is WorkoutExerciseSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const targetType = typeof v.target_type === "string" ? v.target_type : "";
  return (
    typeof v.position === "number" &&
    Number.isInteger(v.position) &&
    v.position >= 1 &&
    (v.source_exercise_id === null ||
      (typeof v.source_exercise_id === "number" && Number.isInteger(v.source_exercise_id))) &&
    typeof v.exercise_slug === "string" &&
    v.exercise_slug.length > 0 &&
    typeof v.exercise_name === "string" &&
    v.exercise_name.length > 0 &&
    typeof v.target_type === "string" &&
    ["repetitions", "duration_seconds", "distance_meters"].includes(v.target_type) &&
    (v.rest_after_exercise_seconds === null ||
      (typeof v.rest_after_exercise_seconds === "number" &&
        Number.isInteger(v.rest_after_exercise_seconds))) &&
    (v.notes === null || typeof v.notes === "string") &&
    (v.instructions === null || typeof v.instructions === "string") &&
    (v.started_at === null || typeof v.started_at === "string") &&
    (v.latest_completed_at === null || typeof v.latest_completed_at === "string") &&
    typeof v.completed_set_count === "number" &&
    Number.isInteger(v.completed_set_count) &&
    v.completed_set_count >= 0 &&
    typeof v.skipped_set_count === "number" &&
    Number.isInteger(v.skipped_set_count) &&
    v.skipped_set_count >= 0 &&
    typeof v.total_set_count === "number" &&
    Number.isInteger(v.total_set_count) &&
    v.total_set_count >= 1 &&
    v.completed_set_count + v.skipped_set_count <= v.total_set_count &&
    typeof v.is_complete === "boolean" &&
    typeof v.is_resolved === "boolean" &&
    typeof v.execution_status === "string" &&
    ["pending", "in_progress", "completed", "partial", "skipped"].includes(
      v.execution_status as string,
    ) &&
    (v.exception === null || isWorkoutExceptionProjection(v.exception)) &&
    Array.isArray(v.planned_sets) &&
    v.planned_sets.length >= 1 &&
    v.planned_sets.every(
      (s: unknown, index: number) =>
        isWorkoutPlannedSetSnapshot(s, targetType) &&
        (s as WorkoutPlannedSetSnapshot).position === index + 1,
    )
  );
}

function isWorkoutSession(value: unknown): value is WorkoutSession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const skipEventTypes = new Set([
    "set_skipped",
    "set_skip_reverted",
    "exercise_skipped",
    "exercise_skip_reverted",
  ]);
  const eventsOk =
    Array.isArray(v.events) &&
    v.events.length >= 1 &&
    v.events.every((event: unknown, index: number) => {
      if (typeof event !== "object" || event === null) return false;
      const e = event as Record<string, unknown>;
      const previousEvent = index > 0 ? (v.events as unknown[])[index - 1] : null;
      const previousSequence =
        typeof previousEvent === "object" && previousEvent !== null
          ? (previousEvent as Record<string, unknown>).sequence
          : null;
      const isSkipEvent = typeof e.event_type === "string" && skipEventTypes.has(e.event_type);
      return (
        typeof e.sequence === "number" &&
        Number.isInteger(e.sequence) &&
        e.sequence >= 1 &&
        (index === 0
          ? e.sequence === 1
          : typeof previousSequence === "number" && e.sequence > previousSequence) &&
        typeof e.event_type === "string" &&
        [
          "workout_started",
          "exercise_started",
          "set_started",
          "set_completed",
          "set_updated",
          "set_marked_incomplete",
          "exercise_completed",
          "workout_cancelled",
          "set_skipped",
          "set_skip_reverted",
          "exercise_skipped",
          "exercise_skip_reverted",
        ].includes(e.event_type) &&
        (e.exercise_position === null ||
          (typeof e.exercise_position === "number" &&
            Number.isInteger(e.exercise_position) &&
            e.exercise_position >= 1)) &&
        (e.set_position === null ||
          (typeof e.set_position === "number" &&
            Number.isInteger(e.set_position) &&
            e.set_position >= 1)) &&
        typeof e.occurred_at === "string" &&
        e.occurred_at.length > 0 &&
        (isSkipEvent ? isWorkoutEventException(e.exception) : e.exception === null)
      );
    });
  return (
    typeof v.id === "number" &&
    Number.isInteger(v.id) &&
    v.id > 0 &&
    typeof v.routine_name === "string" &&
    v.routine_name.length > 0 &&
    typeof v.local_date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.local_date) &&
    typeof v.scheduled_week_position === "number" &&
    Number.isInteger(v.scheduled_week_position) &&
    v.scheduled_week_position >= 1 &&
    v.scheduled_week_position <= 7 &&
    typeof v.scheduled_slot_was_rest === "boolean" &&
    (v.scheduled_training_day_id === null || typeof v.scheduled_training_day_id === "number") &&
    (v.scheduled_training_day_name === null || typeof v.scheduled_training_day_name === "string") &&
    typeof v.selected_training_day_id === "number" &&
    Number.isInteger(v.selected_training_day_id) &&
    v.selected_training_day_id > 0 &&
    typeof v.selected_training_day_name === "string" &&
    v.selected_training_day_name.length > 0 &&
    typeof v.selected_week_position === "number" &&
    typeof v.selection_kind === "string" &&
    ["scheduled", "alternate"].includes(v.selection_kind) &&
    typeof v.status === "string" &&
    ["in_progress", "cancelled"].includes(v.status) &&
    typeof v.started_at === "string" &&
    v.started_at.length > 0 &&
    (v.cancelled_at === null || typeof v.cancelled_at === "string") &&
    typeof v.server_now === "string" &&
    v.server_now.length > 0 &&
    typeof v.completed_set_count === "number" &&
    Number.isInteger(v.completed_set_count) &&
    v.completed_set_count >= 0 &&
    typeof v.skipped_set_count === "number" &&
    Number.isInteger(v.skipped_set_count) &&
    v.skipped_set_count >= 0 &&
    typeof v.total_set_count === "number" &&
    Number.isInteger(v.total_set_count) &&
    v.total_set_count >= 1 &&
    v.completed_set_count + v.skipped_set_count <= v.total_set_count &&
    typeof v.all_sets_recorded === "boolean" &&
    typeof v.all_sets_resolved === "boolean" &&
    (v.current_exercise_position === null ||
      (typeof v.current_exercise_position === "number" &&
        Number.isInteger(v.current_exercise_position) &&
        v.current_exercise_position >= 1)) &&
    (v.current_set_position === null ||
      (typeof v.current_set_position === "number" &&
        Number.isInteger(v.current_set_position) &&
        v.current_set_position >= 1)) &&
    (v.current_set_phase === null ||
      (typeof v.current_set_phase === "string" &&
        ["awaiting_set_start", "set_in_progress"].includes(v.current_set_phase))) &&
    (v.current_set_started_at === null || typeof v.current_set_started_at === "string") &&
    (v.transition_to_exercise_position === null ||
      (typeof v.transition_to_exercise_position === "number" &&
        Number.isInteger(v.transition_to_exercise_position) &&
        v.transition_to_exercise_position >= 1)) &&
    typeof v.resume_url === "string" &&
    v.resume_url.startsWith(`/workouts/${v.id}`) &&
    eventsOk &&
    Array.isArray(v.exercises) &&
    v.exercises.length >= 1 &&
    v.exercises.every(
      (e: unknown, index: number) =>
        isWorkoutExerciseSnapshot(e) && (e as WorkoutExerciseSnapshot).position === index + 1,
    )
  );
}

export type CreateWorkoutResult =
  WorkoutSession | { detail: string; active_workout?: ActiveWorkoutSummary };

function isActiveWorkoutConflict(value: unknown): value is ActiveWorkoutConflict {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.detail === "string" &&
    (v.active_workout === null || isActiveWorkoutSummary(v.active_workout))
  );
}

function safeErrorDetail(result: unknown, _status: number, fallback: string): string {
  if (typeof result === "object" && result !== null && "detail" in result) {
    const detail = (result as Record<string, unknown>).detail;
    if (typeof detail === "string" && detail.trim().length > 0) {
      return detail;
    }
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
      return messages.length > 0 ? messages.join("; ") : fallback;
    }
  }
  return fallback;
}

export async function createWorkout(
  trainingDayId: number,
  localDate: string,
): Promise<CreateWorkoutResult> {
  const response = await fetch(`${API_BASE_URL}/api/workouts`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ training_day_id: trainingDayId, local_date: localDate }),
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 409 && isActiveWorkoutConflict(result)) {
      return {
        detail: result.detail,
        active_workout: result.active_workout ?? undefined,
      };
    }
    return { detail: safeErrorDetail(result, response.status, "Unable to start workout") };
  }
  if (!isWorkoutSession(result)) {
    throw new Error("Invalid workout response");
  }
  return result;
}

export async function fetchActiveWorkout(): Promise<WorkoutSession | null> {
  const response = await fetch(`${API_BASE_URL}/api/workouts/active`, {
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error("Unable to load active workout");
  }
  const data: unknown = await response.json();
  if (data === null) {
    return null;
  }
  if (!isWorkoutSession(data)) {
    throw new Error("Invalid workout response");
  }
  return data;
}

export type WorkoutResult = WorkoutSession | { notFound: true };
export type CancelWorkoutResult = WorkoutSession | { notFound: true } | { detail: string };

export async function fetchWorkout(workoutId: number): Promise<WorkoutResult> {
  const response = await fetch(`${API_BASE_URL}/api/workouts/${workoutId}`, {
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 404) {
    return { notFound: true };
  }
  if (!response.ok) {
    throw new Error("Unable to load workout");
  }
  const data: unknown = await response.json();
  if (!isWorkoutSession(data)) {
    throw new Error("Invalid workout response");
  }
  return data;
}

export async function cancelWorkout(workoutId: number): Promise<CancelWorkoutResult> {
  const response = await fetch(`${API_BASE_URL}/api/workouts/${workoutId}/cancel`, {
    method: "POST",
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (response.status === 404) {
    return { notFound: true };
  }
  if (!response.ok) {
    return { detail: safeErrorDetail(result, response.status, "Unable to discard workout") };
  }
  if (!isWorkoutSession(result)) {
    throw new Error("Invalid workout response");
  }
  return result;
}

export type StartExerciseResult = WorkoutSession | { notFound: true } | { detail: string };

export async function startExercise(
  workoutId: number,
  exercisePosition: number,
): Promise<StartExerciseResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/workouts/${workoutId}/exercises/${exercisePosition}/start`,
    { method: "POST", credentials: "include" },
  );
  if (response.status === 401) throw new UnauthenticatedError();
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) return { notFound: true };
    return { detail: safeErrorDetail(result, response.status, "Unable to start exercise") };
  }
  if (!isWorkoutSession(result)) throw new Error("Invalid workout response");
  return result;
}

export async function startSet(
  workoutId: number,
  exercisePosition: number,
  setPosition: number,
): Promise<SetPerformanceResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/workouts/${workoutId}/exercises/${exercisePosition}/sets/${setPosition}/start`,
    { method: "POST", credentials: "include" },
  );
  if (response.status === 401) throw new UnauthenticatedError();
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) return { notFound: true };
    return { detail: safeErrorDetail(result, response.status, "Unable to start set") };
  }
  if (!isWorkoutSession(result)) throw new Error("Invalid workout response");
  return result;
}

export type SetPerformanceResult = WorkoutSession | { notFound: true } | { detail: string };
export type SetPerformanceBody =
  | { entry_mode: "as_planned" }
  | {
      entry_mode: "adjusted";
      performed_value: number;
      performed_weight_kg: number | null;
      performed_rir: number | null;
    };

export async function recordSetPerformance(
  workoutId: number,
  exercisePosition: number,
  setPosition: number,
  body: SetPerformanceBody,
): Promise<SetPerformanceResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/workouts/${workoutId}/exercises/${exercisePosition}/sets/${setPosition}/performance`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (response.status === 401) throw new UnauthenticatedError();
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) return { notFound: true };
    return { detail: safeErrorDetail(result, response.status, "Unable to save set") };
  }
  if (!isWorkoutSession(result)) throw new Error("Invalid workout response");
  return result;
}

export async function updateSetPerformance(
  workoutId: number,
  exercisePosition: number,
  setPosition: number,
  performedValue: number,
  performedWeightKg: number | null,
  performedRir: number | null,
): Promise<SetPerformanceResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/workouts/${workoutId}/exercises/${exercisePosition}/sets/${setPosition}/performance`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_mode: "adjusted",
        performed_value: performedValue,
        performed_weight_kg: performedWeightKg,
        performed_rir: performedRir,
      }),
    },
  );
  if (response.status === 401) throw new UnauthenticatedError();
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) return { notFound: true };
    return { detail: safeErrorDetail(result, response.status, "Unable to update set") };
  }
  if (!isWorkoutSession(result)) throw new Error("Invalid workout response");
  return result;
}

export async function markSetIncomplete(
  workoutId: number,
  exercisePosition: number,
  setPosition: number,
): Promise<SetPerformanceResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/workouts/${workoutId}/exercises/${exercisePosition}/sets/${setPosition}/performance`,
    { method: "DELETE", credentials: "include" },
  );
  if (response.status === 401) throw new UnauthenticatedError();
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) return { notFound: true };
    return { detail: safeErrorDetail(result, response.status, "Unable to mark incomplete") };
  }
  if (!isWorkoutSession(result)) throw new Error("Invalid workout response");
  return result;
}

export type SkipResult = WorkoutSession | { notFound: true } | { detail: string };

export interface SkipBody {
  reason_code?: string | null;
  note?: string | null;
}

export async function skipSet(
  workoutId: number,
  exercisePosition: number,
  setPosition: number,
  body: SkipBody = {},
): Promise<SkipResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/workouts/${workoutId}/exercises/${exercisePosition}/sets/${setPosition}/skip`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (response.status === 401) throw new UnauthenticatedError();
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) return { notFound: true };
    return { detail: safeErrorDetail(result, response.status, "Unable to skip set") };
  }
  if (!isWorkoutSession(result)) throw new Error("Invalid workout response");
  return result;
}

export async function undoSkipSet(
  workoutId: number,
  exercisePosition: number,
  setPosition: number,
): Promise<SkipResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/workouts/${workoutId}/exercises/${exercisePosition}/sets/${setPosition}/skip`,
    { method: "DELETE", credentials: "include" },
  );
  if (response.status === 401) throw new UnauthenticatedError();
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) return { notFound: true };
    return { detail: safeErrorDetail(result, response.status, "Unable to undo skip") };
  }
  if (!isWorkoutSession(result)) throw new Error("Invalid workout response");
  return result;
}

export async function skipExercise(
  workoutId: number,
  exercisePosition: number,
  body: SkipBody = {},
): Promise<SkipResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/workouts/${workoutId}/exercises/${exercisePosition}/skip`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (response.status === 401) throw new UnauthenticatedError();
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) return { notFound: true };
    return { detail: safeErrorDetail(result, response.status, "Unable to skip exercise") };
  }
  if (!isWorkoutSession(result)) throw new Error("Invalid workout response");
  return result;
}

export async function undoSkipExercise(
  workoutId: number,
  exercisePosition: number,
): Promise<SkipResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/workouts/${workoutId}/exercises/${exercisePosition}/skip`,
    { method: "DELETE", credentials: "include" },
  );
  if (response.status === 401) throw new UnauthenticatedError();
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) return { notFound: true };
    return { detail: safeErrorDetail(result, response.status, "Unable to undo skip") };
  }
  if (!isWorkoutSession(result)) throw new Error("Invalid workout response");
  return result;
}
