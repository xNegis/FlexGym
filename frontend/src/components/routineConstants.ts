interface Option {
  value: string;
  label: string;
}

export const OBJECTIVE_OPTIONS: Option[] = [
  { value: "", label: "Select..." },
  { value: "build_muscle", label: "Build muscle" },
  { value: "lose_fat", label: "Lose fat" },
  { value: "increase_strength", label: "Increase strength" },
  { value: "general_fitness", label: "General fitness" },
];

const LABEL_MAP: Record<string, string> = {};
for (const opt of OBJECTIVE_OPTIONS) {
  if (opt.value !== "") {
    LABEL_MAP[opt.value] = opt.label;
  }
}

export function labelFor(value: string): string {
  return LABEL_MAP[value] ?? value;
}
