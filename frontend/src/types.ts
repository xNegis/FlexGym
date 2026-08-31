type AuthScreen =
  "loading" | "unavailable" | "registration" | "login" | "onboarding" | "authenticated";

type Section = "profile" | "exercises" | "routines";

type UserRole = "user" | "admin";

interface User {
  id: number;
  email: string;
  role: UserRole;
}

interface WorkoutPreference {
  automatic_set_start_delay_seconds: number;
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
  current_weight_measurement_date: string | null;
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
  resume_url: string;
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

interface PerformedSet {
  performed_value: number;
  performed_weight_kg: number | null;
  performed_rir: number | null;
  entry_mode: "as_planned" | "adjusted";
  set_started_at: string | null;
  set_start_mode: "manual" | "automatic" | null;
  completed_at: string;
  observed_duration_seconds: number | null;
  updated_at: string;
}

interface WorkoutEvent {
  sequence: number;
  event_type: string;
  exercise_position: number | null;
  set_position: number | null;
  occurred_at: string;
  exception: WorkoutEventException | null;
}

interface WorkoutEventException {
  scope: "set" | "exercise";
  reason_code: string | null;
  note: string | null;
}

interface WorkoutExceptionProjection {
  scope: "set" | "exercise";
  reason_code: string | null;
  note: string | null;
  occurred_at: string;
}

interface WorkoutPlannedSetSnapshot {
  position: number;
  target_value: number;
  target_weight_kg: number | null;
  target_rir: number | null;
  tempo: ConfiguredSetTempo | null;
  rest_after_set_seconds: number | null;
  notes: string | null;
  performance: PerformedSet | null;
  exception: WorkoutExceptionProjection | null;
}

interface WorkoutExerciseSnapshot {
  position: number;
  source_exercise_id: number | null;
  exercise_slug: string;
  exercise_name: string;
  target_type: ConfiguredExercise["target_type"];
  rest_after_exercise_seconds: number | null;
  notes: string | null;
  planned_sets: WorkoutPlannedSetSnapshot[];
  instructions: string | null;
  started_at: string | null;
  latest_completed_at: string | null;
  completed_set_count: number;
  skipped_set_count: number;
  total_set_count: number;
  is_complete: boolean;
  is_resolved: boolean;
  execution_status: "pending" | "in_progress" | "completed" | "partial" | "skipped";
  exception: WorkoutExceptionProjection | null;
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
  automatic_set_start_delay_seconds: number;
  cancelled_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  exercises: WorkoutExerciseSnapshot[];
  server_now: string;
  completed_set_count: number;
  skipped_set_count: number;
  total_set_count: number;
  all_sets_recorded: boolean;
  all_sets_resolved: boolean;
  current_exercise_position: number | null;
  current_set_position: number | null;
  current_set_phase: string | null;
  current_set_started_at: string | null;
  current_set_start_mode: "manual" | "automatic" | null;
  transition_to_exercise_position: number | null;
  resume_url: string | null;
  events: WorkoutEvent[];
}

interface ActiveWorkoutConflict {
  detail: string;
  active_workout: ActiveWorkoutSummary | null;
}

type WorkoutHistoryStatus = "completed" | "cancelled";

interface WorkoutHistoryItem {
  id: number;
  routine_name: string;
  selected_training_day_name: string;
  local_date: string;
  status: WorkoutHistoryStatus;
  selection_kind: "scheduled" | "alternate";
  started_at: string;
  terminal_at: string;
  duration_seconds: number;
  completed_set_count: number;
  skipped_set_count: number;
  unresolved_set_count: number;
  total_set_count: number;
}

interface WorkoutHistoryPage {
  items: WorkoutHistoryItem[];
  next_cursor: string | null;
}

type ExerciseHistoryMetric = "heaviest_weight" | "estimated_1rm";

type ProgressPeriod = "1m" | "3m" | "6m" | "1y" | "all";

interface ProgressRange {
  period: ProgressPeriod;
  from_local_date: string | null;
  through_local_date: string;
}

interface ExerciseProgressItem {
  exercise_slug: string;
  exercise_name: string;
  session_count: number;
  last_local_date: string;
  last_performed_at: string;
}

interface ExerciseHistorySet {
  exercise_position: number;
  set_position: number;
  performed_reps: number;
  performed_weight_kg: number | null;
  performed_rir: number | null;
  completed_at: string;
}

interface ExerciseHistorySession {
  workout_id: number;
  routine_name: string;
  selected_training_day_name: string;
  local_date: string;
  status: "completed" | "cancelled";
  terminal_at: string;
  total_reps: number;
  heaviest_weight_kg: number | null;
  estimated_1rm_kg: number | null;
  sets: ExerciseHistorySet[];
}

interface ExerciseChartItem {
  workout_id: number;
  routine_name: string;
  selected_training_day_name: string;
  local_date: string;
  status: "completed" | "cancelled";
  terminal_at: string;
  heaviest_weight_kg: number;
  estimated_1rm_kg: number;
  sets: ExerciseHistorySet[];
}

interface ExerciseChartPage {
  exercise: { slug: string; name: string };
  range: ProgressRange;
  has_any_history: boolean;
  items: ExerciseChartItem[];
}

interface ExerciseHistoryPage {
  exercise: { slug: string; name: string };
  range: ProgressRange;
  has_any_history: boolean;
  items: ExerciseHistorySession[];
  next_cursor: string | null;
}

interface WorkoutStatisticsSummary {
  completed_workout_count: number;
  cancelled_workout_count: number;
  terminal_workout_count: number;
  completion_ratio_percent: number | null;
  performed_set_count: number;
  skipped_set_count: number;
  skipped_exercise_count: number;
  total_elapsed_seconds: number;
}

interface WorkoutStatisticsWeek {
  week_start_local_date: string;
  week_end_local_date: string;
  completed_workout_count: number;
  cancelled_workout_count: number;
  performed_set_count: number;
  total_elapsed_seconds: number;
}

interface WorkoutStatisticsActivityDay {
  local_date: string;
  completed_workout_count: number;
  cancelled_workout_count: number;
}

interface WorkoutStatisticsSkipReason {
  reason_code: string | null;
  set_skip_action_count: number;
  exercise_skip_action_count: number;
}

interface WorkoutStatistics {
  range: ProgressRange;
  summary: WorkoutStatisticsSummary;
  weeks: WorkoutStatisticsWeek[];
  activity_days: WorkoutStatisticsActivityDay[];
  skip_reasons: WorkoutStatisticsSkipReason[];
}

interface BodyWeightMeasurement {
  measurement_date: string;
  weight_kg: number;
  note: string | null;
  photo_count: number;
  created_at: string;
  updated_at: string;
}

interface BodyWeightCurrentWeight {
  weight_kg: number;
  source: BodyWeightSource;
  measurement_date: string | null;
}

type BodyWeightSource = "measurement" | "profile_fallback";

interface BodyWeightPage {
  current_weight: BodyWeightCurrentWeight;
  items: BodyWeightMeasurement[];
  next_cursor: string | null;
}

interface BodyWeightSaveResult {
  item: BodyWeightMeasurement;
  current_weight: BodyWeightCurrentWeight;
}

interface BodyWeightChartItem {
  measurement_date: string;
  weight_kg: number;
  note: string | null;
}

interface BodyWeightChartSummaryPoint {
  measurement_date: string;
  weight_kg: number;
}

interface BodyWeightChartSummary {
  latest: BodyWeightChartSummaryPoint | null;
  previous: BodyWeightChartSummaryPoint | null;
  change_kg: number | null;
}

interface BodyWeightChartPage {
  period: ProgressPeriod;
  range_start: string | null;
  range_end: string;
  items: BodyWeightChartItem[];
  summary: BodyWeightChartSummary;
}

interface BodyProgressPhoto {
  id: string;
  display_order: number;
  width: number;
  height: number;
  byte_size: number;
  created_at: string;
  content_path: string;
}

interface BodyProgressPhotoPage {
  measurement: {
    measurement_date: string;
    weight_kg: number;
    note: string | null;
  };
  photos: BodyProgressPhoto[];
  photo_count: number;
  remaining_capacity: number;
}

export {
  type ActiveRoutine,
  type ActiveWorkoutConflict,
  type ActiveWorkoutSummary,
  type AuthScreen,
  type BodyProgressPhoto,
  type BodyProgressPhotoPage,
  type BodyWeightCurrentWeight,
  type BodyWeightChartItem,
  type BodyWeightChartPage,
  type BodyWeightChartSummary,
  type BodyWeightChartSummaryPoint,
  type BodyWeightMeasurement,
  type BodyWeightPage,
  type BodyWeightSaveResult,
  type BodyWeightSource,
  type ConfiguredExercise,
  type ConfiguredSet,
  type ConfiguredSetTempo,
  type ExerciseDetail,
  type ExerciseHistoryMetric,
  type ExerciseHistoryPage,
  type ExerciseHistorySession,
  type ExerciseHistorySet,
  type ExerciseChartItem,
  type ExerciseChartPage,
  type ExerciseProgressItem,
  type ExerciseSummary,
  type FitnessProfile,
  type PerformedSet,
  type ProgressPeriod,
  type ProgressRange,
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
  type UserRole,
  type WorkoutEvent,
  type WorkoutEventException,
  type WorkoutExceptionProjection,
  type WorkoutExerciseSnapshot,
  type WorkoutHistoryItem,
  type WorkoutHistoryPage,
  type WorkoutHistoryStatus,
  type WorkoutPlannedSetSnapshot,
  type WorkoutPreference,
  type WorkoutSession,
  type WorkoutStatistics,
  type WorkoutStatisticsActivityDay,
  type WorkoutStatisticsSkipReason,
  type WorkoutStatisticsSummary,
  type WorkoutStatisticsWeek,
};
