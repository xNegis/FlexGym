interface Option {
  value: string;
  label: string;
}

export const SEX_OPTIONS: Option[] = [
  { value: "", label: "Select..." },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export const EXPERIENCE_OPTIONS: Option[] = [
  { value: "", label: "Select..." },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export const GOAL_OPTIONS: Option[] = [
  { value: "", label: "Select..." },
  { value: "build_muscle", label: "Build muscle" },
  { value: "lose_fat", label: "Lose fat" },
  { value: "increase_strength", label: "Increase strength" },
  { value: "general_fitness", label: "General fitness" },
];

export const ENVIRONMENT_OPTIONS: Option[] = [
  { value: "", label: "Select..." },
  { value: "full_gym", label: "Full gym" },
  { value: "home_gym", label: "Home gym" },
  { value: "minimal_equipment", label: "Minimal equipment" },
  { value: "bodyweight_only", label: "Bodyweight only" },
];

const LABEL_MAP: Record<string, string> = {};
for (const opts of [SEX_OPTIONS, EXPERIENCE_OPTIONS, GOAL_OPTIONS, ENVIRONMENT_OPTIONS]) {
  for (const opt of opts) {
    if (opt.value !== "") {
      LABEL_MAP[opt.value] = opt.label;
    }
  }
}

export function labelFor(value: string): string {
  return LABEL_MAP[value] ?? value;
}
