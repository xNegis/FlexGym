type TargetType = "repetitions" | "duration_seconds" | "distance_meters";

interface ParseResult {
  values: number[];
}

interface ParseError {
  error: string;
}

export function parseTargetShorthand(
  input: string,
  targetType: TargetType,
): ParseResult | ParseError {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "Target values cannot be empty" };
  }

  if (trimmed.startsWith(",") || trimmed.endsWith(",")) {
    return { error: "Values must not start or end with a comma" };
  }

  const parts = trimmed.split(",");
  if (parts.some((p) => p.trim() === "")) {
    return { error: "Empty values between commas are not allowed" };
  }

  const values: number[] = [];
  for (const part of parts) {
    const num = Number(part.trim());
    if (!Number.isFinite(num) || Number.isNaN(num)) {
      return { error: `"${part.trim()}" is not a valid number` };
    }
    values.push(num);
  }

  if (values.length > 20) {
    return { error: "At most 20 target values are allowed" };
  }

  if (targetType === "repetitions") {
    for (const v of values) {
      if (!Number.isInteger(v)) {
        return { error: "Repetition targets must be whole numbers" };
      }
      if (v < 1 || v > 1000) {
        return { error: "Repetition targets must be 1-1000" };
      }
    }
  } else if (targetType === "duration_seconds") {
    for (const v of values) {
      if (!Number.isInteger(v)) {
        return { error: "Duration targets must be whole seconds" };
      }
      if (v < 1 || v > 86400) {
        return { error: "Duration targets must be 1-86400 seconds" };
      }
    }
  } else if (targetType === "distance_meters") {
    for (const v of values) {
      if (v <= 0 || v > 100000) {
        return { error: "Distance targets must be 0.01-100000 metres" };
      }
      const rounded = Math.round(v * 100) / 100;
      if (rounded !== v) {
        return { error: "Distance targets must have at most two decimal places" };
      }
    }
  }

  return { values };
}
