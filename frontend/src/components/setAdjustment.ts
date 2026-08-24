// F25 — Performed Set Adjustment Reliability.
//
// This module is the single locale-safe numeric-entry boundary for live-workout
// adjustment drafts. It never produces NaN or Infinity from a non-empty invalid
// input, treats a blank optional field as null (never as a valid value), and
// scopes a draft to one exact workout, exercise position, and set position.

export type SetAdjustmentTargetType = "repetitions" | "duration_seconds" | "distance_meters";

export interface SetAdjustmentFieldErrors {
  performed_value?: string;
  performed_weight_kg?: string;
  performed_rir?: string;
}

export interface ParsedAdjustment {
  performed_value: number;
  performed_weight_kg: number | null;
  performed_rir: number | null;
}

export type ParseAdjustmentResult =
  { ok: true; value: ParsedAdjustment } | { ok: false; errors: SetAdjustmentFieldErrors };

export interface SetAdjustmentDraft {
  workout_id: number;
  exercise_position: number;
  set_position: number;
  performed_value: string;
  performed_weight_kg: string;
  performed_rir: string;
}

export interface CurrentSetCoordinates {
  workout_id: number;
  current_exercise_position: number | null;
  current_set_position: number | null;
  current_set_phase: string | null;
}

type FieldParseResult =
  { status: "value"; value: number } | { status: "null" } | { status: "error"; error: string };

const DECIMAL_PATTERN = /^[0-9]+(?:[.,][0-9]+)?$/;
const WHOLE_PATTERN = /^[0-9]+$/;

function parseDecimal(raw: string): FieldParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { status: "null" };
  if (!DECIMAL_PATTERN.test(trimmed)) {
    return { status: "error", error: "Enter a number" };
  }
  const normalized = trimmed.replace(",", ".");
  const decimalIndex = normalized.indexOf(".");
  if (decimalIndex !== -1 && normalized.length - decimalIndex - 1 > 2) {
    return { status: "error", error: "Use at most two decimal places" };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { status: "error", error: "Number is too large" };
  }
  return { status: "value", value };
}

function parseWhole(raw: string): FieldParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { status: "null" };
  if (!WHOLE_PATTERN.test(trimmed)) {
    return { status: "error", error: "Enter a whole number" };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { status: "error", error: "Number is too large" };
  }
  return { status: "value", value };
}

function parsePerformedValue(targetType: SetAdjustmentTargetType, raw: string): FieldParseResult {
  if (targetType === "distance_meters") return parseDecimal(raw);
  return parseWhole(raw);
}

function validatePerformedValueRange(
  targetType: SetAdjustmentTargetType,
  value: number,
): string | null {
  if (targetType === "repetitions") {
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      return "Enter a whole number from 1 to 1,000";
    }
    return null;
  }
  if (targetType === "duration_seconds") {
    if (!Number.isInteger(value) || value < 1 || value > 86400) {
      return "Enter a whole number from 1 to 86,400";
    }
    return null;
  }
  if (value <= 0 || value > 100000) {
    return "Enter a distance greater than 0 and at most 100,000 m";
  }
  return null;
}

function validateWeightRange(value: number): string | null {
  if (value < 0 || value > 5000) {
    return "Enter a weight from 0 to 5,000 kg";
  }
  return null;
}

function validateRirRange(value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    return "Enter a whole number from 0 to 10";
  }
  return null;
}

function hasAtMostTwoDecimalPlaces(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

export function parseAdjustment(
  targetType: SetAdjustmentTargetType,
  performedValueRaw: string,
  weightRaw: string,
  rirRaw: string,
): ParseAdjustmentResult {
  const errors: SetAdjustmentFieldErrors = {};
  let performedValue: number | null = null;
  let weight: number | null = null;
  let rir: number | null = null;

  const performed = parsePerformedValue(targetType, performedValueRaw);
  if (performed.status === "error") {
    errors.performed_value = performed.error;
  } else if (performed.status === "null") {
    errors.performed_value = "Enter a value";
  } else {
    const rangeError = validatePerformedValueRange(targetType, performed.value);
    if (rangeError !== null) {
      errors.performed_value = rangeError;
    } else {
      performedValue = performed.value;
    }
  }

  const weightResult = parseDecimal(weightRaw);
  if (weightResult.status === "error") {
    errors.performed_weight_kg = weightResult.error;
  } else if (weightResult.status === "value") {
    const rangeError = validateWeightRange(weightResult.value);
    if (rangeError !== null) {
      errors.performed_weight_kg = rangeError;
    } else {
      weight = weightResult.value;
    }
  }

  const rirResult = parseWhole(rirRaw);
  if (rirResult.status === "error") {
    errors.performed_rir = rirResult.error;
  } else if (rirResult.status === "value") {
    const rangeError = validateRirRange(rirResult.value);
    if (rangeError !== null) {
      errors.performed_rir = rangeError;
    } else {
      rir = rirResult.value;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      performed_value: performedValue as number,
      performed_weight_kg: weight,
      performed_rir: rir,
    },
  };
}

export function validateAdjustedPerformance(
  targetType: SetAdjustmentTargetType,
  performedValue: number,
  performedWeightKg: number | null,
  performedRir: number | null,
): SetAdjustmentFieldErrors {
  const errors: SetAdjustmentFieldErrors = {};

  if (typeof performedValue !== "number" || !Number.isFinite(performedValue)) {
    errors.performed_value = "Invalid performed value";
  } else {
    const rangeError = validatePerformedValueRange(targetType, performedValue);
    if (rangeError !== null) {
      errors.performed_value = rangeError;
    } else if (targetType === "distance_meters" && !hasAtMostTwoDecimalPlaces(performedValue)) {
      errors.performed_value = "Use at most two decimal places";
    }
  }

  if (performedWeightKg !== null) {
    if (typeof performedWeightKg !== "number" || !Number.isFinite(performedWeightKg)) {
      errors.performed_weight_kg = "Invalid weight";
    } else {
      const rangeError = validateWeightRange(performedWeightKg);
      if (rangeError !== null) {
        errors.performed_weight_kg = rangeError;
      } else if (!hasAtMostTwoDecimalPlaces(performedWeightKg)) {
        errors.performed_weight_kg = "Use at most two decimal places";
      }
    }
  }

  if (performedRir !== null) {
    if (
      typeof performedRir !== "number" ||
      !Number.isFinite(performedRir) ||
      !Number.isInteger(performedRir)
    ) {
      errors.performed_rir = "Invalid RIR";
    } else {
      const rangeError = validateRirRange(performedRir);
      if (rangeError !== null) {
        errors.performed_rir = rangeError;
      }
    }
  }

  return errors;
}

export function reconcileAdjustmentDraft(
  draft: SetAdjustmentDraft,
  coords: CurrentSetCoordinates,
): SetAdjustmentDraft | null {
  if (coords.workout_id !== draft.workout_id) return null;
  if (coords.current_exercise_position !== draft.exercise_position) return null;
  if (coords.current_set_position !== draft.set_position) return null;
  if (
    coords.current_set_phase !== "awaiting_set_start" &&
    coords.current_set_phase !== "set_in_progress"
  ) {
    return null;
  }
  return draft;
}

export function draftMatchesSet(
  draft: SetAdjustmentDraft | null,
  workoutId: number,
  exercisePosition: number,
  setPosition: number,
): boolean {
  return (
    draft !== null &&
    draft.workout_id === workoutId &&
    draft.exercise_position === exercisePosition &&
    draft.set_position === setPosition
  );
}

export function parseDisplayValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
