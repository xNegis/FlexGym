type AuthScreen =
  "loading" | "unavailable" | "registration" | "login" | "onboarding" | "authenticated";

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

export { type AuthScreen, type FitnessProfile, type User };
