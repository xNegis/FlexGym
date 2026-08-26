// F28 — Distance-readable Live Workout Execution.
//
// This module owns the pure presentation derivations for the live-workout
// screen. It has no React or browser dependencies so its invariants can be
// tested directly. It deliberately does not touch F26's set-rest audio/automatic
// state machines or F27's same-exercise automatic-start logic; those remain
// authoritative elsewhere.

import type { WorkoutExerciseSnapshot, WorkoutPlannedSetSnapshot } from "../types";
import { parseDisplayValue, type SetAdjustmentDraft } from "./setAdjustment.ts";

export type SetTargetType = "repetitions" | "duration_seconds" | "distance_meters";

export type SetTargetTypeLabel = "Reps" | "Seconds" | "Metres";

const TARGET_TYPE_LABELS: Record<SetTargetType, SetTargetTypeLabel> = {
  repetitions: "Reps",
  duration_seconds: "Seconds",
  distance_meters: "Metres",
};

export function targetTypeLabel(targetType: SetTargetType): SetTargetTypeLabel {
  return TARGET_TYPE_LABELS[targetType];
}

export interface EffectiveSetMetrics {
  value: number;
  weight: number | null;
  rir: number | null;
}

// A matching F25 draft overrides only its exact set's displayed target, RIR,
// and weight. Blank optional draft fields mean null (the user cleared them),
// never a fallback to the planned value. The planned snapshot remains the source
// of truth when no draft exists.
export function resolveEffectiveSetMetrics(
  plannedSet: WorkoutPlannedSetSnapshot,
  draft: SetAdjustmentDraft | null,
): EffectiveSetMetrics {
  if (draft) {
    return {
      value: parseDisplayValue(draft.performed_value) ?? plannedSet.target_value,
      weight: parseDisplayValue(draft.performed_weight_kg),
      rir: parseDisplayValue(draft.performed_rir),
    };
  }
  return {
    value: plannedSet.target_value,
    weight: plannedSet.target_weight_kg,
    rir: plannedSet.target_rir,
  };
}

export interface CurrentSetMetricVisibility {
  hasCurrentSet: boolean;
  isAwaitingStart: boolean;
  isSetInProgress: boolean;
  isExerciseSkipped: boolean;
  isWorkoutCancelled: boolean;
  isWorkoutCompleted: boolean;
}

// The distance-readable prescription is only meaningful while a current set is
// actively actionable. Unstarted, skipped, resolved, cancelled, and terminal
// states must not present it as though a set were in progress.
export function shouldShowCurrentSetMetrics(state: CurrentSetMetricVisibility): boolean {
  if (state.isWorkoutCancelled || state.isWorkoutCompleted) return false;
  if (state.isExerciseSkipped) return false;
  if (!state.hasCurrentSet) return false;
  return state.isAwaitingStart || state.isSetInProgress;
}

// The ordered `After that` sequence is every exercise after the immediate next
// one whose effective projection is not yet resolved, in ascending workout
// position. The immediate next exercise is never included.
export function computeLaterUnresolvedExercises(
  exercises: WorkoutExerciseSnapshot[],
  nextExercisePosition: number,
): WorkoutExerciseSnapshot[] {
  return exercises.filter(
    (exercise) => exercise.position > nextExercisePosition && !exercise.is_resolved,
  );
}

export interface ExerciseRestObservation {
  seconds: number;
  overtime: boolean;
}

// Projects the exercise-rest countdown from the previous exercise's server-owned
// completion timestamp and snapshotted planned rest. Positive rest counts down
// and then enters overtime; zero rest begins in overtime; null rest has no
// objective boundary and returns null so the UI renders no timer shell.
export function computeExerciseRestObservation(
  exercise: WorkoutExerciseSnapshot | undefined,
  serverNow: string,
  nextExercise: WorkoutExerciseSnapshot | undefined,
  clientReceivedAt: number,
  nowMs: number = Date.now(),
): ExerciseRestObservation | null {
  if (!exercise || !exercise.is_resolved || !nextExercise) return null;
  const restSeconds = exercise.rest_after_exercise_seconds;
  if (restSeconds == null) return null;

  const serverTime = new Date(serverNow).getTime();
  if (!Number.isFinite(serverTime)) return null;

  const completedAt = exercise.latest_completed_at;
  if (!completedAt) return null;
  const completedAtMs = new Date(completedAt).getTime();
  if (!Number.isFinite(completedAtMs)) return null;

  const estimatedServerNowMs = serverTime + (nowMs - clientReceivedAt);
  const targetMs = completedAtMs + restSeconds * 1000;
  const remainingMs = targetMs - estimatedServerNowMs;

  if (remainingMs > 0) {
    return { seconds: Math.ceil(remainingMs / 1000), overtime: false };
  }
  return {
    seconds: Math.max(0, Math.floor((estimatedServerNowMs - targetMs) / 1000)),
    overtime: true,
  };
}

// Shared countdown/overtime formatting. Positive `seconds` with overtime renders
// as `+M:SS`; otherwise `M:SS`. Used by both set rest and exercise rest.
export function formatTimer(seconds: number, overtime: boolean): string {
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const prefix = overtime ? "+" : "";
  return `${prefix}${m}:${String(s).padStart(2, "0")}`;
}
