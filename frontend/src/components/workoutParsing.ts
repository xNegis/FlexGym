// Workout response validation.
//
// These parsers validate the full workout and performed-set projections returned
// by the API. They are kept in a pure module (no fetch, no `import.meta.env`) so
// their invariants can be unit-tested directly. api.ts imports them and uses them
// behind its exported fetch functions.

import type {
  ConfiguredSetTempo,
  WorkoutEventException,
  WorkoutExceptionProjection,
  WorkoutExerciseSnapshot,
  WorkoutPlannedSetSnapshot,
  WorkoutSession,
} from "../types";

export function isConfiguredSetTempo(value: unknown): value is ConfiguredSetTempo {
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

export function isPerformedSet(value: unknown): value is WorkoutPlannedSetSnapshot["performance"] {
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
    ((v.set_started_at === null && v.set_start_mode === null) ||
      (typeof v.set_started_at === "string" &&
        v.set_started_at.length > 0 &&
        (v.set_start_mode === "manual" || v.set_start_mode === "automatic"))) &&
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
  "pain_or_discomfort",
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

export function isWorkoutSession(value: unknown): value is WorkoutSession {
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
          : typeof previousSequence === "number" && e.sequence === previousSequence + 1) &&
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
          "workout_completed",
          "set_skipped",
          "set_skip_reverted",
          "exercise_skipped",
          "exercise_skip_reverted",
          "set_auto_started",
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
    ["in_progress", "cancelled", "completed"].includes(v.status) &&
    typeof v.started_at === "string" &&
    v.started_at.length > 0 &&
    typeof v.automatic_set_start_delay_seconds === "number" &&
    Number.isInteger(v.automatic_set_start_delay_seconds) &&
    [0, 5, 10, 15, 20, 30].includes(v.automatic_set_start_delay_seconds) &&
    (v.cancelled_at === null || typeof v.cancelled_at === "string") &&
    (v.completed_at === null || typeof v.completed_at === "string") &&
    (v.duration_seconds === null ||
      (typeof v.duration_seconds === "number" &&
        Number.isInteger(v.duration_seconds) &&
        v.duration_seconds >= 0)) &&
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
    ((v.current_set_phase === null &&
      v.current_set_started_at === null &&
      v.current_set_start_mode === null) ||
      (v.current_set_phase === "awaiting_set_start" &&
        v.current_set_started_at === null &&
        v.current_set_start_mode === null) ||
      (v.current_set_phase === "set_in_progress" &&
        typeof v.current_set_started_at === "string" &&
        v.current_set_started_at.length > 0 &&
        (v.current_set_start_mode === "manual" || v.current_set_start_mode === "automatic"))) &&
    (v.transition_to_exercise_position === null ||
      (typeof v.transition_to_exercise_position === "number" &&
        Number.isInteger(v.transition_to_exercise_position) &&
        v.transition_to_exercise_position >= 1)) &&
    (v.resume_url === null ||
      (typeof v.resume_url === "string" && v.resume_url.startsWith(`/workouts/${v.id}`))) &&
    eventsOk &&
    Array.isArray(v.exercises) &&
    v.exercises.length >= 1 &&
    v.exercises.every(
      (e: unknown, index: number) =>
        isWorkoutExerciseSnapshot(e) && (e as WorkoutExerciseSnapshot).position === index + 1,
    )
  );
}
