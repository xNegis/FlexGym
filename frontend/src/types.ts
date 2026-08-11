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
  created_at: string;
  updated_at: string;
}

interface TrainingDay {
  id: number;
  name: string;
  position: number;
  exercise_count: number;
  created_at: string;
  updated_at: string;
}

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

export {
  type AuthScreen,
  type ConfiguredExercise,
  type ConfiguredSet,
  type ConfiguredSetTempo,
  type ExerciseDetail,
  type ExerciseSummary,
  type FitnessProfile,
  type Routine,
  type Section,
  type TrainingDay,
  type User,
};
