const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: "Chest",
  lats: "Lats",
  upper_back: "Upper back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quadriceps: "Quadriceps",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  adductors: "Adductors",
  calves: "Calves",
  core: "Core",
  full_body: "Full body",
};

const EQUIPMENT_LABELS: Record<string, string> = {
  bodyweight: "Bodyweight",
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  cable: "Cable",
  machine: "Machine",
  resistance_band: "Resistance band",
  pull_up_bar: "Pull-up bar",
};

const MOVEMENT_PATTERN_LABELS: Record<string, string> = {
  horizontal_push: "Horizontal push",
  vertical_push: "Vertical push",
  horizontal_pull: "Horizontal pull",
  vertical_pull: "Vertical pull",
  horizontal_adduction: "Horizontal adduction",
  shoulder_abduction: "Shoulder abduction",
  elbow_flexion: "Elbow flexion",
  elbow_extension: "Elbow extension",
  squat: "Squat",
  lunge: "Lunge",
  hinge: "Hip hinge",
  hip_thrust: "Hip thrust",
  knee_extension: "Knee extension",
  knee_flexion: "Knee flexion",
  hip_abduction: "Hip abduction",
  hip_adduction: "Hip adduction",
  calf_raise: "Calf raise",
  trunk_flexion: "Trunk flexion",
  trunk_anti_extension: "Anti-extension",
  trunk_anti_rotation: "Anti-rotation",
  trunk_lateral_stability: "Lateral stability",
  carry: "Loaded carry",
};

const EXECUTION_TYPE_LABELS: Record<string, string> = {
  bilateral: "Bilateral",
  unilateral: "Unilateral",
  alternating: "Alternating",
  isometric: "Isometric hold",
};

export function muscleLabel(value: string): string {
  return MUSCLE_GROUP_LABELS[value] ?? value;
}

export function equipmentLabel(value: string): string {
  return EQUIPMENT_LABELS[value] ?? value;
}

export function movementPatternLabel(value: string): string {
  return MOVEMENT_PATTERN_LABELS[value] ?? value;
}

export function executionTypeLabel(value: string): string {
  return EXECUTION_TYPE_LABELS[value] ?? value;
}

export const MUSCLE_GROUP_FILTERS = Object.entries(MUSCLE_GROUP_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const EQUIPMENT_FILTERS = Object.entries(EQUIPMENT_LABELS).map(([value, label]) => ({
  value,
  label,
}));
