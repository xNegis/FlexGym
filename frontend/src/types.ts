type AuthScreen =
  "loading" | "unavailable" | "registration" | "login" | "onboarding" | "authenticated";

type Section = "profile" | "exercises" | "routines";

interface User {
  id: number;
  email: string;
}

interface FitnessProfile {
  id: number;
  date_of_birth: string;
  biological_sex: string;
  height_cm: number;
  weight_kg: number;
  body_fat_percentage: number | null;
  training_experience: string;
  primary_goal: string;
  training_days_per_week: number;
  preferred_workout_duration_minutes: number;
  training_environment: string;
  physical_limitations: string | null;
  created_at: string;
  updated_at: string;
}

interface Routine {
  id: number;
  name: string;
  objective: string;
  description: string | null;
  training_day_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ActiveRoutine {
  routine: Routine;
  activated_at: string;
}

interface TrainingDay {
  id: number;
  name: string;
  week_position: number;
  exercise_count: number;
  created_at: string;
  updated_at: string;
}

interface ScheduleSlotTrainingDay {
  id: number;
  name: string;
  week_position: number;
  exercise_count: number;
  created_at: string;
  updated_at: string;
}

type ScheduleSlotType = "training" | "rest";

interface ScheduleTrainingSlot {
  position: number;
  weekday: string;
  type: "training";
  training_day: ScheduleSlotTrainingDay;
}

interface ScheduleRestSlot {
  position: number;
  weekday: string;
  type: "rest";
}

type ScheduleSlot = ScheduleTrainingSlot | ScheduleRestSlot;

interface ExerciseSummary {
  slug: string;
  name: string;
  primary_muscle: string;
  secondary_muscles: string[];
  equipment: string;
  movement_pattern: string;
  execution_type: string;
}

interface ExerciseDetail extends ExerciseSummary {
  instructions: string;
}

interface ConfiguredSetTempo {
  eccentric_seconds: number;
  stretched_pause_seconds: number;
  concentric_seconds: number;
  peak_contraction_seconds: number;
}

interface ConfiguredSet {
  position: number;
  target_value: number;
  target_weight_kg: number | null;
  target_rir: number | null;
  tempo: ConfiguredSetTempo | null;
  rest_after_set_seconds: number | null;
  notes: string | null;
}

interface ConfiguredExercise {
  id: number;
  position: number;
  exercise: ExerciseSummary;
  target_type: "repetitions" | "duration_seconds" | "distance_meters";
  rest_after_exercise_seconds: number | null;
  notes: string | null;
  sets: ConfiguredSet[];
  created_at: string;
  updated_at: string;
}

interface SessionPreviewExercise {
  position: number;
  name: string;
  set_count: number;
}

interface SessionPreview {
  id: number;
  name: string;
  week_position: number;
  exercise_count: number;
  set_count: number;
  can_start: boolean;
  exercises: SessionPreviewExercise[];
}

interface ActiveWorkoutSummary {
  id: number;
  routine_name: string;
  selected_training_day_name: string;
  local_date: string;
  started_at: string;
  status: string;
  selection_kind: string;
}

type StartContextState = "active_workout" | "no_active_routine" | "rest_day" | "scheduled_session";

interface StartContextBase {
  state: StartContextState;
}

interface StartContextActiveWorkout extends StartContextBase {
  state: "active_workout";
  workout: ActiveWorkoutSummary;
}

interface StartContextNoActiveRoutine extends StartContextBase {
  state: "no_active_routine";
}

interface StartContextRestDay extends StartContextBase {
  state: "rest_day";
  routine: { routine_id: number; routine_name: string };
  week_position: number;
  weekday: string;
  session_previews: SessionPreview[];
}

interface StartContextScheduledSession extends StartContextBase {
  state: "scheduled_session";
  routine: { routine_id: number; routine_name: string };
  session: SessionPreview;
  session_previews: SessionPreview[];
}

type StartContext =
  | StartContextActiveWorkout
  | StartContextNoActiveRoutine
  | StartContextRestDay
  | StartContextScheduledSession;

interface WorkoutPlannedSetSnapshot {
  position: number;
  target_value: number;
  target_weight_kg: number | null;
  target_rir: number | null;
  tempo: ConfiguredSetTempo | null;
  rest_after_set_seconds: number | null;
  notes: string | null;
}

interface WorkoutExerciseSnapshot {
  position: number;
  source_exercise_id: number | null;
  exercise_slug: string;
  exercise_name: string;
  target_type: string;
  rest_after_exercise_seconds: number | null;
  notes: string | null;
  planned_sets: WorkoutPlannedSetSnapshot[];
}

interface WorkoutSession {
  id: number;
  routine_name: string;
  local_date: string;
  scheduled_week_position: number;
  scheduled_slot_was_rest: boolean;
  scheduled_training_day_id: number | null;
  scheduled_training_day_name: string | null;
  selected_training_day_id: number;
  selected_training_day_name: string;
  selected_week_position: number;
  selection_kind: string;
  status: string;
  started_at: string;
  cancelled_at: string | null;
  exercises: WorkoutExerciseSnapshot[];
}

interface ActiveWorkoutConflict {
  detail: string;
  active_workout: ActiveWorkoutSummary | null;
}

export {
  type ActiveRoutine,
  type ActiveWorkoutConflict,
  type ActiveWorkoutSummary,
  type AuthScreen,
  type ConfiguredExercise,
  type ConfiguredSet,
  type ConfiguredSetTempo,
  type ExerciseDetail,
  type ExerciseSummary,
  type FitnessProfile,
  type Routine,
  type ScheduleRestSlot,
  type ScheduleSlot,
  type ScheduleSlotTrainingDay,
  type ScheduleSlotType,
  type ScheduleTrainingSlot,
  type Section,
  type SessionPreview,
  type SessionPreviewExercise,
  type StartContext,
  type StartContextState,
  type TrainingDay,
  type User,
  type WorkoutExerciseSnapshot,
  type WorkoutPlannedSetSnapshot,
  type WorkoutSession,
};
