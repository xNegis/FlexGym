import type {
  ActiveRoutine,
  ActiveWorkoutConflict,
  ActiveWorkoutSummary,
  BodyProgressPhoto,
  BodyProgressPhotoPage,
  BodyWeightCurrentWeight,
  BodyWeightChartItem,
  BodyWeightChartPage,
  BodyWeightChartSummary,
  BodyWeightMeasurement,
  BodyWeightPage,
  BodyWeightSaveResult,
  ConfiguredExercise,
  ConfiguredSet,
  ExerciseDetail,
  ExerciseChartItem,
  ExerciseChartPage,
  ExerciseHistoryPage,
  ExerciseHistorySession,
  ExerciseHistorySet,
  ExerciseProgressItem,
  ExerciseSummary,
  FitnessProfile,
  ProgressPeriod,
  ProgressRange,
  Routine,
  ScheduleSlot,
  ScheduleSlotType,
  SessionPreview,
  StartContext,
  StartContextState,
  TrainingDay,
  WorkoutHistoryItem,
  WorkoutHistoryPage,
  WorkoutPreference,
  WorkoutSession,
  WorkoutStatistics,
  WorkoutStatisticsActivityDay,
  WorkoutStatisticsSkipReason,
  WorkoutStatisticsSummary,
  WorkoutStatisticsWeek,
} from "./types";
import {
  validateAdjustedPerformance,
  type SetAdjustmentTargetType,
} from "./components/setAdjustment";
import { isConfiguredSetTempo, isWorkoutSession } from "./components/workoutParsing";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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

export class ForbiddenError extends Error {
  constructor() {
    super("Access is not permitted");
    this.name = "ForbiddenError";
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
  role: "user" | "admin";
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
    typeof value.email === "string" &&
    "role" in value &&
    (value.role === "user" || value.role === "admin")
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
    (v.current_weight_measurement_date === null ||
      typeof v.current_weight_measurement_date === "string") &&
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
  const data: unknown = await responseJson(response);
  if (!isUserResponse(data)) {
    throw new Error("Invalid authentication response");
  }
  return data;
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

export interface AdminOverview {
  registered_user_count: number;
}

function isAdminOverview(value: unknown): value is AdminOverview {
  return (
    typeof value === "object" &&
    value !== null &&
    "registered_user_count" in value &&
    typeof value.registered_user_count === "number" &&
    Number.isInteger(value.registered_user_count) &&
    value.registered_user_count >= 0
  );
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const response = await fetch(`${API_BASE_URL}/api/admin/overview`, {
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 403) {
    throw new ForbiddenError();
  }
  if (!response.ok) {
    throw new Error("Unable to load administration overview");
  }
  const data: unknown = await responseJson(response);
  if (!isAdminOverview(data)) {
    throw new Error("Invalid administration overview response");
  }
  return data;
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
  const url = new URL(`${API_BASE_URL}/api/exercises`, window.location.origin);
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

export type CreateWorkoutResult =
  WorkoutSession | { detail: string; active_workout?: ActiveWorkoutSummary };

// ────────────────── workout preferences (F27) ──────────────────

const WORKOUT_PREFERENCE_DELAYS = new Set([0, 5, 10, 15, 20, 30]);

function isWorkoutPreference(value: unknown): value is WorkoutPreference {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.automatic_set_start_delay_seconds === "number" &&
    Number.isInteger(v.automatic_set_start_delay_seconds) &&
    WORKOUT_PREFERENCE_DELAYS.has(v.automatic_set_start_delay_seconds)
  );
}

export async function fetchWorkoutPreferences(): Promise<WorkoutPreference> {
  const response = await fetch(`${API_BASE_URL}/api/workout-preferences`, {
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error("Unable to load workout settings");
  }
  const data: unknown = await responseJson(response);
  if (!isWorkoutPreference(data)) {
    throw new Error("Invalid workout settings response");
  }
  return data;
}

export type WorkoutPreferencesResult = WorkoutPreference | { detail: string };

export async function updateWorkoutPreferences(
  delaySeconds: number,
): Promise<WorkoutPreferencesResult> {
  const response = await fetch(`${API_BASE_URL}/api/workout-preferences`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ automatic_set_start_delay_seconds: delaySeconds }),
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    return { detail: safeErrorDetail(result, response.status, "Unable to save workout settings") };
  }
  if (!isWorkoutPreference(result)) {
    throw new Error("Invalid workout settings response");
  }
  return result;
}

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

export type CompleteWorkoutResult = WorkoutSession | { notFound: true } | { detail: string };

export async function completeWorkout(workoutId: number): Promise<CompleteWorkoutResult> {
  const response = await fetch(`${API_BASE_URL}/api/workouts/${workoutId}/complete`, {
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
    return { detail: safeErrorDetail(result, response.status, "Unable to finish workout") };
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

export type AutoStartSetResult =
  WorkoutSession | { notFound: true } | { detail: string } | { conflict: string };

export async function autoStartSet(
  workoutId: number,
  exercisePosition: number,
  setPosition: number,
): Promise<AutoStartSetResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/workouts/${workoutId}/exercises/${exercisePosition}/sets/${setPosition}/auto-start`,
    { method: "POST", credentials: "include" },
  );
  if (response.status === 401) throw new UnauthenticatedError();
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) return { notFound: true };
    const detail = safeErrorDetail(result, response.status, "Unable to start set automatically");
    if (response.status === 409) return { conflict: detail };
    return { detail };
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

function assertValidAdjustedPerformance(
  targetType: SetAdjustmentTargetType,
  performedValue: number,
  performedWeightKg: number | null,
  performedRir: number | null,
): void {
  const errors = validateAdjustedPerformance(
    targetType,
    performedValue,
    performedWeightKg,
    performedRir,
  );
  if (Object.keys(errors).length > 0) {
    throw new Error("Invalid adjusted set performance");
  }
}

export async function recordSetPerformance(
  workoutId: number,
  exercisePosition: number,
  setPosition: number,
  body: SetPerformanceBody,
  targetType: SetAdjustmentTargetType,
): Promise<SetPerformanceResult> {
  if (body.entry_mode === "adjusted") {
    assertValidAdjustedPerformance(
      targetType,
      body.performed_value,
      body.performed_weight_kg,
      body.performed_rir,
    );
  }
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
  targetType: SetAdjustmentTargetType,
  performedValue: number,
  performedWeightKg: number | null,
  performedRir: number | null,
): Promise<SetPerformanceResult> {
  assertValidAdjustedPerformance(targetType, performedValue, performedWeightKg, performedRir);
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

export interface WorkoutHistoryParams {
  status?: "completed" | "cancelled";
  cursor?: string;
}

function isWorkoutHistoryItem(value: unknown): value is WorkoutHistoryItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.completed_set_count !== "number" ||
    !Number.isInteger(v.completed_set_count) ||
    v.completed_set_count < 0 ||
    typeof v.skipped_set_count !== "number" ||
    !Number.isInteger(v.skipped_set_count) ||
    v.skipped_set_count < 0 ||
    typeof v.unresolved_set_count !== "number" ||
    !Number.isInteger(v.unresolved_set_count) ||
    v.unresolved_set_count < 0 ||
    typeof v.total_set_count !== "number" ||
    !Number.isInteger(v.total_set_count) ||
    v.total_set_count < 0
  ) {
    return false;
  }
  if (v.completed_set_count + v.skipped_set_count + v.unresolved_set_count !== v.total_set_count) {
    return false;
  }
  return (
    typeof v.id === "number" &&
    Number.isInteger(v.id) &&
    v.id > 0 &&
    typeof v.routine_name === "string" &&
    v.routine_name.trim().length > 0 &&
    typeof v.selected_training_day_name === "string" &&
    v.selected_training_day_name.trim().length > 0 &&
    typeof v.local_date === "string" &&
    isValidCalendarDate(v.local_date) &&
    (v.status === "completed" || v.status === "cancelled") &&
    (v.selection_kind === "scheduled" || v.selection_kind === "alternate") &&
    typeof v.started_at === "string" &&
    isValidTimestamp(v.started_at) &&
    typeof v.terminal_at === "string" &&
    isValidTimestamp(v.terminal_at) &&
    typeof v.duration_seconds === "number" &&
    Number.isInteger(v.duration_seconds) &&
    v.duration_seconds >= 0
  );
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isValidTimestamp(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isWorkoutHistoryPage(value: unknown): value is WorkoutHistoryPage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.items) &&
    v.items.every(isWorkoutHistoryItem) &&
    (v.next_cursor === null || (typeof v.next_cursor === "string" && v.next_cursor.length > 0))
  );
}

export async function fetchWorkoutHistory(
  params: WorkoutHistoryParams = {},
): Promise<WorkoutHistoryPage> {
  const url = new URL(`${API_BASE_URL}/api/workouts/history`, window.location.origin);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.cursor) url.searchParams.set("cursor", params.cursor);

  const response = await fetch(url.toString(), { credentials: "include" });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error("Unable to load workout history");
  }
  const data: unknown = await response.json();
  if (!isWorkoutHistoryPage(data)) {
    throw new Error("Invalid workout history response");
  }
  return data;
}

// ────────────────── progress (F20) ──────────────────

function isValidSlug(value: unknown): value is string {
  return (
    typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 100
  );
}

function isExerciseProgressItem(value: unknown): value is ExerciseProgressItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isValidSlug(v.exercise_slug) &&
    typeof v.exercise_name === "string" &&
    v.exercise_name.trim().length > 0 &&
    v.exercise_name.length <= 120 &&
    typeof v.session_count === "number" &&
    Number.isInteger(v.session_count) &&
    v.session_count > 0 &&
    typeof v.last_local_date === "string" &&
    isValidCalendarDate(v.last_local_date) &&
    typeof v.last_performed_at === "string" &&
    isValidTimestamp(v.last_performed_at)
  );
}

function isExerciseProgressList(value: unknown): value is { items: ExerciseProgressItem[] } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.items) || !v.items.every(isExerciseProgressItem)) return false;
  return new Set(v.items.map((item) => item.exercise_slug)).size === v.items.length;
}

export async function fetchExerciseProgress(): Promise<ExerciseProgressItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/progress/exercises`, {
    credentials: "include",
  });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error("Unable to load exercise progress");
  }
  const data: unknown = await response.json();
  if (!isExerciseProgressList(data)) {
    throw new Error("Invalid exercise progress response");
  }
  return data.items;
}

function isExerciseHistorySet(value: unknown): value is ExerciseHistorySet {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.exercise_position === "number" &&
    Number.isInteger(v.exercise_position) &&
    v.exercise_position >= 1 &&
    typeof v.set_position === "number" &&
    Number.isInteger(v.set_position) &&
    v.set_position >= 1 &&
    typeof v.performed_reps === "number" &&
    Number.isInteger(v.performed_reps) &&
    v.performed_reps >= 1 &&
    (v.performed_weight_kg === null ||
      (typeof v.performed_weight_kg === "number" &&
        Number.isFinite(v.performed_weight_kg) &&
        v.performed_weight_kg >= 0)) &&
    (v.performed_rir === null ||
      (typeof v.performed_rir === "number" &&
        Number.isInteger(v.performed_rir) &&
        v.performed_rir >= 0 &&
        v.performed_rir <= 10)) &&
    typeof v.completed_at === "string" &&
    isValidTimestamp(v.completed_at)
  );
}

function isExerciseHistorySession(value: unknown): value is ExerciseHistorySession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const baseIsValid =
    typeof v.workout_id === "number" &&
    Number.isInteger(v.workout_id) &&
    v.workout_id > 0 &&
    typeof v.routine_name === "string" &&
    v.routine_name.trim().length > 0 &&
    typeof v.selected_training_day_name === "string" &&
    v.selected_training_day_name.trim().length > 0 &&
    typeof v.local_date === "string" &&
    isValidCalendarDate(v.local_date) &&
    (v.status === "completed" || v.status === "cancelled") &&
    typeof v.terminal_at === "string" &&
    isValidTimestamp(v.terminal_at) &&
    typeof v.total_reps === "number" &&
    Number.isInteger(v.total_reps) &&
    v.total_reps >= 0 &&
    (v.heaviest_weight_kg === null ||
      (typeof v.heaviest_weight_kg === "number" &&
        Number.isFinite(v.heaviest_weight_kg) &&
        v.heaviest_weight_kg > 0)) &&
    (v.estimated_1rm_kg === null ||
      (typeof v.estimated_1rm_kg === "number" &&
        Number.isFinite(v.estimated_1rm_kg) &&
        v.estimated_1rm_kg > 0)) &&
    Array.isArray(v.sets) &&
    v.sets.length >= 1 &&
    v.sets.every(isExerciseHistorySet);
  if (!baseIsValid) return false;

  const sets = v.sets as ExerciseHistorySet[];
  for (let index = 1; index < sets.length; index += 1) {
    const previous = sets[index - 1];
    const current = sets[index];
    if (
      current.exercise_position < previous.exercise_position ||
      (current.exercise_position === previous.exercise_position &&
        current.set_position <= previous.set_position)
    ) {
      return false;
    }
  }

  const totalReps = sets.reduce((sum, set) => sum + set.performed_reps, 0);
  if (v.total_reps !== totalReps) return false;

  const positiveWeightedSets = sets.filter(
    (set): set is ExerciseHistorySet & { performed_weight_kg: number } =>
      set.performed_weight_kg !== null && set.performed_weight_kg > 0,
  );
  if (positiveWeightedSets.length === 0) {
    return v.heaviest_weight_kg === null && v.estimated_1rm_kg === null;
  }

  const heaviestWeight = Math.max(...positiveWeightedSets.map((set) => set.performed_weight_kg));
  const estimated1Rm = Math.max(
    ...positiveWeightedSets.map((set) => set.performed_weight_kg * (1 + set.performed_reps / 30)),
  );
  const isRoundedMetric = (actual: unknown, expected: number) =>
    typeof actual === "number" && Math.abs(actual - expected) <= 0.005001;
  return (
    isRoundedMetric(v.heaviest_weight_kg, heaviestWeight) &&
    isRoundedMetric(v.estimated_1rm_kg, estimated1Rm)
  );
}

const PROGRESS_PERIODS: Set<ProgressPeriod> = new Set(["1m", "3m", "6m", "1y", "all"]);

function isProgressRange(value: unknown): value is ProgressRange {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const throughLocalDate = v.through_local_date;
  const validShape =
    typeof v.period === "string" &&
    PROGRESS_PERIODS.has(v.period as ProgressPeriod) &&
    (v.from_local_date === null ||
      (typeof v.from_local_date === "string" && isValidCalendarDate(v.from_local_date))) &&
    typeof throughLocalDate === "string" &&
    isValidCalendarDate(throughLocalDate);
  if (!validShape) return false;
  if (v.period === "all") return v.from_local_date === null;
  return typeof v.from_local_date === "string" && v.from_local_date <= throughLocalDate;
}

function shiftProgressMonths(localDate: string, months: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const totalMonth = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonth / 12);
  const targetMonthIndex = totalMonth - targetYear * 12;
  const finalDay = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(Math.min(day, finalDay)).padStart(2, "0")}`;
}

function isRequestedProgressRange(
  range: ProgressRange,
  period: ProgressPeriod,
  localDate: string,
): boolean {
  const monthOffsets: Partial<Record<ProgressPeriod, number>> = {
    "1m": -1,
    "3m": -3,
    "6m": -6,
    "1y": -12,
  };
  const expectedFrom =
    period === "all" ? null : shiftProgressMonths(localDate, monthOffsets[period] as number);
  return (
    range.period === period &&
    range.through_local_date === localDate &&
    range.from_local_date === expectedFrom
  );
}

function isInsideProgressRange(localDate: string, range: ProgressRange): boolean {
  return (
    localDate <= range.through_local_date &&
    (range.from_local_date === null || localDate >= range.from_local_date)
  );
}

function isExerciseHistoryPage(value: unknown): value is ExerciseHistoryPage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.exercise !== "object" || v.exercise === null) return false;
  const exercise = v.exercise as Record<string, unknown>;
  if (!(
    isValidSlug(exercise.slug) &&
    typeof exercise.name === "string" &&
    exercise.name.trim().length > 0 &&
    exercise.name.length <= 120 &&
    isProgressRange(v.range) &&
    typeof v.has_any_history === "boolean" &&
    Array.isArray(v.items) &&
    v.items.every(isExerciseHistorySession) &&
    (v.next_cursor === null ||
      (typeof v.next_cursor === "string" &&
        v.next_cursor.length > 0 &&
        v.next_cursor.length <= 512 &&
        /^[A-Za-z0-9_-]+={0,2}$/.test(v.next_cursor)))
  )) {
    return false;
  }

  const items = v.items as ExerciseHistorySession[];
  if (new Set(items.map((item) => item.workout_id)).size !== items.length) return false;
  const range = v.range as ProgressRange;
  if (!items.every((item) => isInsideProgressRange(item.local_date, range))) return false;
  if (v.has_any_history === false && (items.length > 0 || v.next_cursor !== null)) return false;
  return items.every((item, index) => {
    if (index === 0) return true;
    const previous = items[index - 1];
    const terminalComparison = Date.parse(previous.terminal_at) - Date.parse(item.terminal_at);
    return (
      terminalComparison > 0 || (terminalComparison === 0 && previous.workout_id > item.workout_id)
    );
  });
}

function isExerciseChartItem(value: unknown): value is ExerciseChartItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.workout_id !== "number" ||
    !Number.isInteger(v.workout_id) ||
    v.workout_id <= 0 ||
    typeof v.routine_name !== "string" ||
    v.routine_name.trim().length <= 0 ||
    typeof v.selected_training_day_name !== "string" ||
    v.selected_training_day_name.trim().length <= 0 ||
    typeof v.local_date !== "string" ||
    !isValidCalendarDate(v.local_date) ||
    (v.status !== "completed" && v.status !== "cancelled") ||
    typeof v.terminal_at !== "string" ||
    !isValidTimestamp(v.terminal_at) ||
    typeof v.heaviest_weight_kg !== "number" ||
    !Number.isFinite(v.heaviest_weight_kg) ||
    v.heaviest_weight_kg <= 0 ||
    typeof v.estimated_1rm_kg !== "number" ||
    !Number.isFinite(v.estimated_1rm_kg) ||
    v.estimated_1rm_kg <= 0 ||
    !Array.isArray(v.sets) ||
    v.sets.length < 1 ||
    !v.sets.every(isExerciseHistorySet)
  ) {
    return false;
  }

  const sets = v.sets as ExerciseHistorySet[];
  for (let index = 1; index < sets.length; index += 1) {
    const previous = sets[index - 1];
    const current = sets[index];
    if (
      current.exercise_position < previous.exercise_position ||
      (current.exercise_position === previous.exercise_position &&
        current.set_position <= previous.set_position)
    ) {
      return false;
    }
  }

  const positiveWeightedSets = sets.filter(
    (set): set is ExerciseHistorySet & { performed_weight_kg: number } =>
      set.performed_weight_kg !== null && set.performed_weight_kg > 0,
  );
  if (positiveWeightedSets.length === 0) return false;

  const heaviestWeight = Math.max(...positiveWeightedSets.map((set) => set.performed_weight_kg));
  const estimated1Rm = Math.max(
    ...positiveWeightedSets.map((set) => set.performed_weight_kg * (1 + set.performed_reps / 30)),
  );
  return (
    Math.abs(v.heaviest_weight_kg - heaviestWeight) <= 0.005001 &&
    Math.abs(v.estimated_1rm_kg - estimated1Rm) <= 0.005001
  );
}

function isExerciseChartPage(value: unknown): value is ExerciseChartPage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.exercise !== "object" || v.exercise === null) return false;
  const exercise = v.exercise as Record<string, unknown>;
  if (!(
    isValidSlug(exercise.slug) &&
    typeof exercise.name === "string" &&
    exercise.name.trim().length > 0 &&
    exercise.name.length <= 120 &&
    isProgressRange(v.range) &&
    typeof v.has_any_history === "boolean" &&
    Array.isArray(v.items) &&
    v.items.every(isExerciseChartItem)
  )) {
    return false;
  }

  const items = v.items as ExerciseChartItem[];
  if (new Set(items.map((item) => item.workout_id)).size !== items.length) return false;
  const range = v.range as ProgressRange;
  if (!items.every((item) => isInsideProgressRange(item.local_date, range))) return false;
  if (v.has_any_history === false && items.length > 0) return false;
  return items.every((item, index) => {
    if (index === 0) return true;
    const previous = items[index - 1];
    const localDateComparison =
      previous.local_date === item.local_date ? 0 : previous.local_date < item.local_date ? -1 : 1;
    if (localDateComparison < 0) return true;
    if (localDateComparison > 0) return false;
    const terminalComparison = Date.parse(previous.terminal_at) - Date.parse(item.terminal_at);
    return (
      terminalComparison < 0 || (terminalComparison === 0 && previous.workout_id < item.workout_id)
    );
  });
}

export interface ExerciseHistoryParams {
  period: ProgressPeriod;
  localDate: string;
  cursor?: string;
  limit?: number;
}

export type ExerciseHistoryResult = ExerciseHistoryPage | { notFound: true };

export async function fetchExerciseChart(
  slug: string,
  period: ProgressPeriod,
  localDate: string,
): Promise<ExerciseChartPage | { notFound: true }> {
  const url = new URL(
    `${API_BASE_URL}/api/progress/exercises/${encodeURIComponent(slug)}/chart`,
    window.location.origin,
  );
  url.searchParams.set("period", period);
  url.searchParams.set("local_date", localDate);

  const response = await fetch(url.toString(), { credentials: "include" });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 404) {
    return { notFound: true };
  }
  if (!response.ok) {
    throw new Error("Unable to load exercise chart");
  }
  const data: unknown = await response.json();
  if (
    !isExerciseChartPage(data) ||
    data.exercise.slug !== slug ||
    !isRequestedProgressRange(data.range, period, localDate)
  ) {
    throw new Error("Invalid exercise chart response");
  }
  return data;
}

export async function fetchExerciseHistory(
  slug: string,
  params: ExerciseHistoryParams,
): Promise<ExerciseHistoryResult> {
  const url = new URL(
    `${API_BASE_URL}/api/progress/exercises/${encodeURIComponent(slug)}/history`,
    window.location.origin,
  );
  url.searchParams.set("period", params.period);
  url.searchParams.set("local_date", params.localDate);
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  if (params.limit) url.searchParams.set("limit", String(params.limit));

  const response = await fetch(url.toString(), { credentials: "include" });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 404) {
    return { notFound: true };
  }
  if (!response.ok) {
    throw new Error("Unable to load exercise history");
  }
  const data: unknown = await response.json();
  if (
    !isExerciseHistoryPage(data) ||
    data.exercise.slug !== slug ||
    !isRequestedProgressRange(data.range, params.period, params.localDate)
  ) {
    throw new Error("Invalid exercise history response");
  }
  return data;
}

// ────────────────── workout statistics (F21) ──────────────────

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isWorkoutStatisticsSummary(value: unknown): value is WorkoutStatisticsSummary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    !isNonNegativeInteger(v.completed_workout_count) ||
    !isNonNegativeInteger(v.cancelled_workout_count) ||
    !isNonNegativeInteger(v.terminal_workout_count) ||
    v.terminal_workout_count !==
      (v.completed_workout_count as number) + (v.cancelled_workout_count as number) ||
    !isNonNegativeInteger(v.performed_set_count) ||
    !isNonNegativeInteger(v.skipped_set_count) ||
    !isNonNegativeInteger(v.skipped_exercise_count) ||
    !isNonNegativeInteger(v.total_elapsed_seconds)
  ) {
    return false;
  }
  const ratio = v.completion_ratio_percent;
  if (
    ratio !== null &&
    (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0 || ratio > 100)
  ) {
    return false;
  }
  if ((v.terminal_workout_count as number) === 0) return ratio === null;
  return ratio !== null;
}

function isCalendarDateMonday(value: string): boolean {
  if (!isValidCalendarDate(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 1;
}

function isCalendarDateSunday(value: string): boolean {
  if (!isValidCalendarDate(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
}

function shiftLocalDateDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWorkoutStatisticsWeek(value: unknown): value is WorkoutStatisticsWeek {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.week_start_local_date === "string" &&
    isCalendarDateMonday(v.week_start_local_date) &&
    typeof v.week_end_local_date === "string" &&
    isCalendarDateSunday(v.week_end_local_date) &&
    shiftLocalDateDays(v.week_start_local_date, 6) === v.week_end_local_date &&
    isNonNegativeInteger(v.completed_workout_count) &&
    isNonNegativeInteger(v.cancelled_workout_count) &&
    isNonNegativeInteger(v.performed_set_count) &&
    isNonNegativeInteger(v.total_elapsed_seconds)
  );
}

function isWorkoutStatisticsActivityDay(value: unknown): value is WorkoutStatisticsActivityDay {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.local_date === "string" &&
    isValidCalendarDate(v.local_date) &&
    isNonNegativeInteger(v.completed_workout_count) &&
    isNonNegativeInteger(v.cancelled_workout_count)
  );
}

const SKIP_REASON_ORDER = [
  "not_enough_time",
  "too_fatigued",
  "equipment_unavailable",
  "unable_to_perform",
  "pain_or_discomfort",
  "other",
] as const;

function isWorkoutStatisticsSkipReason(value: unknown): value is WorkoutStatisticsSkipReason {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    (v.reason_code !== null &&
      (typeof v.reason_code !== "string" ||
        !(SKIP_REASON_ORDER as readonly string[]).includes(v.reason_code))) ||
    !isNonNegativeInteger(v.set_skip_action_count) ||
    !isNonNegativeInteger(v.exercise_skip_action_count)
  ) {
    return false;
  }
  return (v.set_skip_action_count as number) > 0 || (v.exercise_skip_action_count as number) > 0;
}

function isWorkoutStatistics(value: unknown): value is WorkoutStatistics {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    !isProgressRange(v.range) ||
    !isWorkoutStatisticsSummary(v.summary) ||
    !Array.isArray(v.weeks) ||
    !v.weeks.every(isWorkoutStatisticsWeek) ||
    !Array.isArray(v.activity_days) ||
    !v.activity_days.every(isWorkoutStatisticsActivityDay) ||
    !Array.isArray(v.skip_reasons) ||
    !v.skip_reasons.every(isWorkoutStatisticsSkipReason)
  ) {
    return false;
  }

  const weeks = v.weeks as WorkoutStatisticsWeek[];
  let completedAcrossWeeks = 0;
  let cancelledAcrossWeeks = 0;
  let performedSetsAcrossWeeks = 0;
  let elapsedAcrossWeeks = 0;
  for (let index = 1; index < weeks.length; index += 1) {
    if (
      shiftLocalDateDays(weeks[index - 1].week_start_local_date, 7) !==
      weeks[index].week_start_local_date
    ) {
      return false;
    }
  }
  for (const week of weeks) {
    completedAcrossWeeks += week.completed_workout_count;
    cancelledAcrossWeeks += week.cancelled_workout_count;
    performedSetsAcrossWeeks += week.performed_set_count;
    elapsedAcrossWeeks += week.total_elapsed_seconds;
  }
  const summary = v.summary as WorkoutStatisticsSummary;
  if (
    completedAcrossWeeks !== summary.completed_workout_count ||
    cancelledAcrossWeeks !== summary.cancelled_workout_count ||
    performedSetsAcrossWeeks !== summary.performed_set_count ||
    elapsedAcrossWeeks !== summary.total_elapsed_seconds
  ) {
    return false;
  }

  const days = v.activity_days as WorkoutStatisticsActivityDay[];
  const range = v.range as ProgressRange;
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    if (day.local_date > range.through_local_date) return false;
    if (range.from_local_date !== null && day.local_date < range.from_local_date) return false;
    if (index > 0 && day.local_date <= days[index - 1].local_date) return false;
  }
  const completedAcrossDays = days.reduce((sum, day) => sum + day.completed_workout_count, 0);
  const cancelledAcrossDays = days.reduce((sum, day) => sum + day.cancelled_workout_count, 0);
  if (
    completedAcrossDays !== summary.completed_workout_count ||
    cancelledAcrossDays !== summary.cancelled_workout_count
  ) {
    return false;
  }

  const reasons = v.skip_reasons as WorkoutStatisticsSkipReason[];
  const reasonIndex = (code: string | null): number =>
    code === null
      ? SKIP_REASON_ORDER.length
      : (SKIP_REASON_ORDER as readonly string[]).indexOf(code);
  for (let index = 1; index < reasons.length; index += 1) {
    if (reasonIndex(reasons[index - 1].reason_code) >= reasonIndex(reasons[index].reason_code)) {
      return false;
    }
  }

  return true;
}

export async function fetchWorkoutStatistics(
  period: ProgressPeriod,
  localDate: string,
): Promise<WorkoutStatistics> {
  const url = new URL(`${API_BASE_URL}/api/progress/statistics`, window.location.origin);
  url.searchParams.set("period", period);
  url.searchParams.set("local_date", localDate);

  const response = await fetch(url.toString(), { credentials: "include" });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error("Unable to load workout statistics");
  }
  const data: unknown = await response.json();
  if (!isWorkoutStatistics(data) || !isRequestedProgressRange(data.range, period, localDate)) {
    throw new Error("Invalid workout statistics response");
  }
  return data;
}

// ────────────────── body weight (F22) ──────────────────

function isBodyWeightMeasurement(value: unknown): value is BodyWeightMeasurement {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.measurement_date === "string" &&
    isValidCalendarDate(v.measurement_date) &&
    typeof v.weight_kg === "number" &&
    Number.isFinite(v.weight_kg) &&
    v.weight_kg >= 20 &&
    v.weight_kg <= 500 &&
    (v.note === null || (typeof v.note === "string" && v.note.length <= 1000)) &&
    typeof v.photo_count === "number" &&
    Number.isInteger(v.photo_count) &&
    v.photo_count >= 0 &&
    v.photo_count <= 5 &&
    typeof v.created_at === "string" &&
    isValidTimestamp(v.created_at) &&
    typeof v.updated_at === "string" &&
    isValidTimestamp(v.updated_at)
  );
}

function isBodyWeightCurrentWeight(value: unknown): value is BodyWeightCurrentWeight {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const isMeasurement =
    v.source === "measurement" &&
    typeof v.measurement_date === "string" &&
    isValidCalendarDate(v.measurement_date);
  const isProfileFallback = v.source === "profile_fallback" && v.measurement_date === null;
  return (
    typeof v.weight_kg === "number" &&
    Number.isFinite(v.weight_kg) &&
    v.weight_kg >= 20 &&
    v.weight_kg <= 500 &&
    (isMeasurement || isProfileFallback)
  );
}

function isBodyWeightPage(value: unknown): value is BodyWeightPage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isBodyWeightCurrentWeight(v.current_weight)) return false;
  if (!Array.isArray(v.items) || !v.items.every(isBodyWeightMeasurement)) return false;
  const items = v.items as BodyWeightMeasurement[];
  if (new Set(items.map((item) => item.measurement_date)).size !== items.length) return false;
  for (let index = 1; index < items.length; index += 1) {
    if (items[index - 1].measurement_date <= items[index].measurement_date) return false;
  }
  return (
    v.next_cursor === null ||
    (typeof v.next_cursor === "string" &&
      v.next_cursor.length > 0 &&
      v.next_cursor.length <= 512 &&
      /^[A-Za-z0-9_-]+={0,2}$/.test(v.next_cursor))
  );
}

function isBodyWeightSaveResult(value: unknown): value is BodyWeightSaveResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isBodyWeightMeasurement(v.item) && isBodyWeightCurrentWeight(v.current_weight);
}

function hasAtMostOneDecimalPlace(value: number): boolean {
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
}

function isBodyWeightChartItem(value: unknown): value is BodyWeightChartItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.measurement_date === "string" &&
    isValidCalendarDate(v.measurement_date) &&
    typeof v.weight_kg === "number" &&
    Number.isFinite(v.weight_kg) &&
    v.weight_kg >= 20 &&
    v.weight_kg <= 500 &&
    hasAtMostOneDecimalPlace(v.weight_kg) &&
    (v.note === null || (typeof v.note === "string" && v.note.length <= 1000))
  );
}

function isBodyWeightChartSummaryPoint(value: unknown): value is {
  measurement_date: string;
  weight_kg: number;
} {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.measurement_date === "string" &&
    isValidCalendarDate(v.measurement_date) &&
    typeof v.weight_kg === "number" &&
    Number.isFinite(v.weight_kg) &&
    v.weight_kg >= 20 &&
    v.weight_kg <= 500 &&
    hasAtMostOneDecimalPlace(v.weight_kg)
  );
}

function isBodyWeightChartSummary(value: unknown): value is BodyWeightChartSummary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!("latest" in v) || !("previous" in v) || !("change_kg" in v)) return false;
  const latestOk = v.latest === null || isBodyWeightChartSummaryPoint(v.latest);
  const previousOk = v.previous === null || isBodyWeightChartSummaryPoint(v.previous);
  const changeOk =
    v.change_kg === null || (typeof v.change_kg === "number" && Number.isFinite(v.change_kg));
  return latestOk && previousOk && changeOk;
}

function isBodyWeightChartPage(
  value: unknown,
  period: ProgressPeriod,
  localDate: string,
): value is BodyWeightChartPage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.period !== period || !PROGRESS_PERIODS.has(v.period as ProgressPeriod)) return false;
  if (v.range_end !== localDate) return false;

  const monthOffsets: Partial<Record<ProgressPeriod, number>> = {
    "1m": -1,
    "3m": -3,
    "6m": -6,
    "1y": -12,
  };
  const expectedFrom =
    period === "all" ? null : shiftProgressMonths(localDate, monthOffsets[period] as number);
  if (v.range_start !== expectedFrom) return false;

  if (!isBodyWeightChartSummary(v.summary)) return false;
  if (!Array.isArray(v.items) || !v.items.every(isBodyWeightChartItem)) return false;

  const items = v.items as BodyWeightChartItem[];
  if (new Set(items.map((item) => item.measurement_date)).size !== items.length) return false;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.measurement_date > localDate) return false;
    if (expectedFrom !== null && item.measurement_date < expectedFrom) return false;
    if (index > 0 && items[index - 1].measurement_date >= item.measurement_date) return false;
  }

  const summary = v.summary as BodyWeightChartSummary;
  if (items.length === 0) {
    return summary.latest === null && summary.previous === null && summary.change_kg === null;
  }

  const latest = items[items.length - 1];
  if (
    summary.latest === null ||
    summary.latest.measurement_date !== latest.measurement_date ||
    Math.abs(summary.latest.weight_kg - latest.weight_kg) > 1e-6
  ) {
    return false;
  }
  if (items.length === 1) {
    return summary.previous === null && summary.change_kg === null;
  }

  const previous = items[items.length - 2];
  if (
    summary.previous === null ||
    summary.previous.measurement_date !== previous.measurement_date ||
    Math.abs(summary.previous.weight_kg - previous.weight_kg) > 1e-6
  ) {
    return false;
  }
  if (summary.change_kg === null) return false;
  const expectedChange = Math.round((latest.weight_kg - previous.weight_kg) * 10) / 10;
  return Math.abs(summary.change_kg - expectedChange) <= 1e-6;
}

export interface BodyWeightListParams {
  cursor?: string;
  limit?: number;
  period?: ProgressPeriod;
  localDate?: string;
}

function isInsideBodyWeightRange(
  measurementDate: string,
  period: ProgressPeriod,
  localDate: string,
): boolean {
  if (measurementDate > localDate) return false;
  if (period === "all") return true;
  const monthOffsets: Partial<Record<ProgressPeriod, number>> = {
    "1m": -1,
    "3m": -3,
    "6m": -6,
    "1y": -12,
  };
  const from = shiftProgressMonths(localDate, monthOffsets[period] as number);
  return measurementDate >= from;
}

export async function fetchBodyWeightChart(
  period: ProgressPeriod,
  localDate: string,
): Promise<BodyWeightChartPage> {
  const url = new URL(`${API_BASE_URL}/api/progress/body-weight`, window.location.origin);
  url.searchParams.set("period", period);
  url.searchParams.set("local_date", localDate);

  const response = await fetch(url.toString(), { credentials: "include" });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error("Unable to load body weight chart");
  }
  const data: unknown = await response.json();
  if (!isBodyWeightChartPage(data, period, localDate)) {
    throw new Error("Invalid body weight chart response");
  }
  return data;
}

export async function fetchBodyWeightMeasurements(
  params: BodyWeightListParams = {},
): Promise<BodyWeightPage> {
  const url = new URL(`${API_BASE_URL}/api/body-weight-measurements`, window.location.origin);
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.period) url.searchParams.set("period", params.period);
  if (params.localDate) url.searchParams.set("local_date", params.localDate);

  const response = await fetch(url.toString(), { credentials: "include" });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error("Unable to load body weight history");
  }
  const data: unknown = await response.json();
  if (!isBodyWeightPage(data)) {
    throw new Error("Invalid body weight response");
  }
  if (params.period && params.localDate) {
    for (const item of data.items) {
      if (!isInsideBodyWeightRange(item.measurement_date, params.period, params.localDate)) {
        throw new Error("Invalid body weight response");
      }
    }
  }
  return data;
}

export type BodyWeightSaveOutcome =
  { created: boolean; result: BodyWeightSaveResult } | { detail: string };

export async function saveBodyWeightMeasurement(
  measurementDate: string,
  currentLocalDate: string,
  weightKg: number,
  note: string | null,
): Promise<BodyWeightSaveOutcome> {
  const response = await fetch(
    `${API_BASE_URL}/api/body-weight-measurements/${encodeURIComponent(measurementDate)}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_local_date: currentLocalDate,
        weight_kg: weightKg,
        note,
      }),
    },
  );
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (response.status !== 200 && response.status !== 201) {
    return { detail: safeErrorDetail(result, response.status, "Unable to save measurement") };
  }
  if (!isBodyWeightSaveResult(result)) {
    throw new Error("Invalid body weight response");
  }
  return { created: response.status === 201, result };
}

export async function deleteBodyWeightMeasurement(
  measurementDate: string,
): Promise<{ detail: string } | null> {
  const response = await fetch(
    `${API_BASE_URL}/api/body-weight-measurements/${encodeURIComponent(measurementDate)}`,
    { method: "DELETE", credentials: "include" },
  );
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 204) {
    return null;
  }
  const result: unknown = await responseJson(response);
  if (response.status === 404) {
    return { detail: "Body weight measurement not found" };
  }
  return { detail: safeErrorDetail(result, response.status, "Unable to delete measurement") };
}

// ────────────────── body progress photos (F22.1) ──────────────────

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function isBodyProgressPhoto(value: unknown): value is BodyProgressPhoto {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isValidUuid(v.id) &&
    typeof v.display_order === "number" &&
    Number.isInteger(v.display_order) &&
    v.display_order >= 0 &&
    v.display_order <= 4 &&
    typeof v.width === "number" &&
    Number.isInteger(v.width) &&
    v.width > 0 &&
    v.width <= 2560 &&
    typeof v.height === "number" &&
    Number.isInteger(v.height) &&
    v.height > 0 &&
    v.height <= 2560 &&
    typeof v.byte_size === "number" &&
    Number.isInteger(v.byte_size) &&
    v.byte_size > 0 &&
    typeof v.created_at === "string" &&
    isValidTimestamp(v.created_at) &&
    typeof v.content_path === "string" &&
    v.content_path === `/api/body-progress-photos/${v.id}/content`
  );
}

function isBodyProgressPhotoPage(value: unknown): value is BodyProgressPhotoPage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.measurement !== "object" || v.measurement === null) return false;
  const measurement = v.measurement as Record<string, unknown>;
  const measurementOk =
    typeof measurement.measurement_date === "string" &&
    isValidCalendarDate(measurement.measurement_date) &&
    typeof measurement.weight_kg === "number" &&
    Number.isFinite(measurement.weight_kg) &&
    (measurement.note === null || typeof measurement.note === "string");
  if (!measurementOk) return false;

  if (!Array.isArray(v.photos) || !v.photos.every(isBodyProgressPhoto)) return false;
  const photos = v.photos as BodyProgressPhoto[];
  const orders = photos.map((photo) => photo.display_order);
  if (new Set(orders).size !== orders.length) return false;
  if (orders.some((order, index) => order !== index)) return false;
  if (new Set(photos.map((photo) => photo.id)).size !== photos.length) return false;

  return (
    typeof v.photo_count === "number" &&
    Number.isInteger(v.photo_count) &&
    v.photo_count === photos.length &&
    typeof v.remaining_capacity === "number" &&
    Number.isInteger(v.remaining_capacity) &&
    v.remaining_capacity === 5 - photos.length
  );
}

export type BodyProgressPhotosResult = BodyProgressPhotoPage | { notFound: true };

export async function fetchBodyProgressPhotos(
  measurementDate: string,
): Promise<BodyProgressPhotosResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/body-weight-measurements/${encodeURIComponent(measurementDate)}/photos`,
    { credentials: "include" },
  );
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 404) {
    return { notFound: true };
  }
  if (!response.ok) {
    throw new Error("Unable to load progress photos");
  }
  const data: unknown = await response.json();
  if (!isBodyProgressPhotoPage(data) || data.measurement.measurement_date !== measurementDate) {
    throw new Error("Invalid progress photos response");
  }
  return data;
}

export type UploadProgressPhotosResult = BodyProgressPhotoPage | { detail: string };

export async function uploadProgressPhotos(
  measurementDate: string,
  files: File[],
): Promise<UploadProgressPhotosResult> {
  const form = new FormData();
  for (const file of files) {
    form.append("photos", file);
  }
  const response = await fetch(
    `${API_BASE_URL}/api/body-weight-measurements/${encodeURIComponent(measurementDate)}/photos`,
    { method: "POST", credentials: "include", body: form },
  );
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (response.status !== 201) {
    if (response.status === 404) {
      return { detail: "Body weight measurement not found" };
    }
    if (response.status === 409) {
      return { detail: "This measurement can hold at most five photos" };
    }
    if (response.status === 413) {
      return { detail: "A photo exceeds the 15 MiB limit" };
    }
    if (response.status === 415) {
      return { detail: "One of the selected files is not a supported image" };
    }
    if (response.status === 503) {
      return { detail: "Private photo storage is unavailable" };
    }
    return { detail: safeErrorDetail(result, response.status, "Unable to upload photos") };
  }
  if (!isBodyProgressPhotoPage(result)) {
    throw new Error("Invalid progress photos response");
  }
  return result;
}

export type ReorderProgressPhotosResult = BodyProgressPhotoPage | { detail: string };

export async function reorderProgressPhotos(
  measurementDate: string,
  photoIds: string[],
): Promise<ReorderProgressPhotosResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/body-weight-measurements/${encodeURIComponent(measurementDate)}/photos/order`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_ids: photoIds }),
    },
  );
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  const result: unknown = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) {
      return { detail: "Body weight measurement not found" };
    }
    if (response.status === 409) {
      return { detail: "The photo order is out of date" };
    }
    if (response.status === 422) {
      return { detail: "The photo order is invalid" };
    }
    return { detail: safeErrorDetail(result, response.status, "Unable to save order") };
  }
  if (!isBodyProgressPhotoPage(result)) {
    throw new Error("Invalid progress photos response");
  }
  return result;
}

export async function deleteProgressPhoto(photoId: string): Promise<{ detail: string } | null> {
  const response = await fetch(
    `${API_BASE_URL}/api/body-progress-photos/${encodeURIComponent(photoId)}`,
    { method: "DELETE", credentials: "include" },
  );
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (response.status === 204) {
    return null;
  }
  if (response.status === 404) {
    return { detail: "Photo not found" };
  }
  return { detail: "Unable to delete photo" };
}

export function photoContentUrl(contentPath: string): string {
  return `${API_BASE_URL}${contentPath}`;
}

export async function fetchProgressPhotoContent(contentPath: string): Promise<Blob> {
  const response = await fetch(photoContentUrl(contentPath), { credentials: "include" });
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error("Unable to load progress photo");
  }
  return response.blob();
}
