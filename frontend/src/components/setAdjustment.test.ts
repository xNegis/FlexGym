import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  draftMatchesSet,
  parseAdjustment,
  parseDisplayValue,
  reconcileAdjustmentDraft,
  validateAdjustedPerformance,
  type ParsedAdjustment,
  type SetAdjustmentDraft,
  type SetAdjustmentFieldErrors,
  type SetAdjustmentTargetType,
} from "./setAdjustment.ts";

function parseOk(
  targetType: SetAdjustmentTargetType,
  performed: string,
  weight: string,
  rir: string,
): ParsedAdjustment {
  const result = parseAdjustment(targetType, performed, weight, rir);
  if (!result.ok) assert.fail(`expected valid adjustment, got: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function parseFail(
  targetType: SetAdjustmentTargetType,
  performed: string,
  weight: string,
  rir: string,
): SetAdjustmentFieldErrors {
  const result = parseAdjustment(targetType, performed, weight, rir);
  if (result.ok) assert.fail("expected invalid adjustment");
  return result.errors;
}

describe("parseAdjustment decimal-capable fields", () => {
  it("normalizes comma and point decimals to the same value", () => {
    assert.equal(parseOk("distance_meters", "12,5", "2,5", "").performed_weight_kg, 2.5);
    assert.equal(parseOk("distance_meters", "12.5", "2.5", "").performed_weight_kg, 2.5);
    assert.equal(parseOk("distance_meters", "12,5", "2,5", "").performed_value, 12.5);
    assert.equal(parseOk("distance_meters", "12.5", "2.5", "").performed_value, 12.5);
  });

  it("accepts a decimal weight with a whole performed value", () => {
    const value = parseOk("repetitions", "10", "12,5", "2");
    assert.equal(value.performed_value, 10);
    assert.equal(value.performed_weight_kg, 12.5);
    assert.equal(value.performed_rir, 2);
  });
});

describe("parseAdjustment blank semantics", () => {
  it("maps blank optional weight and RIR to null", () => {
    const value = parseOk("repetitions", "10", "   ", "");
    assert.equal(value.performed_weight_kg, null);
    assert.equal(value.performed_rir, null);
  });

  it("keeps explicit zero distinct from blank", () => {
    const value = parseOk("repetitions", "10", "0", "0");
    assert.equal(value.performed_weight_kg, 0);
    assert.equal(value.performed_rir, 0);
  });

  it("rejects a blank required performed value", () => {
    assert.equal(parseFail("repetitions", "  ", "", "").performed_value, "Enter a value");
  });
});

describe("parseAdjustment invalid syntax", () => {
  it("rejects mixed separators", () => {
    assert.ok(parseFail("distance_meters", "12,5.5", "", "").performed_value);
  });

  it("rejects exponent notation", () => {
    assert.ok(parseFail("repetitions", "1e3", "", "").performed_value);
  });

  it("rejects signs and embedded whitespace", () => {
    assert.ok(parseFail("distance_meters", "-5", "", "").performed_value);
    assert.ok(parseFail("distance_meters", "1 2", "", "").performed_value);
  });

  it("rejects over-precision weight and distance", () => {
    assert.ok(parseFail("repetitions", "10", "12,345", "").performed_weight_kg);
    assert.ok(parseFail("distance_meters", "12.345", "", "").performed_value);
  });

  it("rejects a non-empty invalid optional value rather than mapping to null", () => {
    assert.equal(parseFail("repetitions", "10", "abc", "").performed_weight_kg, "Enter a number");
  });
});

describe("parseAdjustment target-specific ranges", () => {
  it("enforces repetition bounds", () => {
    assert.ok(parseFail("repetitions", "0", "", "").performed_value);
    assert.ok(parseFail("repetitions", "1001", "", "").performed_value);
    assert.equal(parseOk("repetitions", "1000", "", "").performed_value, 1000);
  });

  it("enforces duration bounds", () => {
    assert.ok(parseFail("duration_seconds", "0", "", "").performed_value);
    assert.ok(parseFail("duration_seconds", "86401", "", "").performed_value);
    assert.equal(parseOk("duration_seconds", "86400", "", "").performed_value, 86400);
  });

  it("rejects non-integer repetitions and duration", () => {
    assert.ok(parseFail("repetitions", "10.5", "", "").performed_value);
    assert.ok(parseFail("duration_seconds", "10,5", "", "").performed_value);
  });

  it("enforces distance bounds", () => {
    assert.ok(parseFail("distance_meters", "0", "", "").performed_value);
    assert.ok(parseFail("distance_meters", "100000.01", "", "").performed_value);
    assert.equal(parseOk("distance_meters", "100000", "", "").performed_value, 100000);
  });

  it("enforces RIR whole-number bounds", () => {
    assert.ok(parseFail("repetitions", "10", "", "-1").performed_rir);
    assert.ok(parseFail("repetitions", "10", "", "11").performed_rir);
    assert.ok(parseFail("repetitions", "10", "", "2.5").performed_rir);
    assert.equal(parseOk("repetitions", "10", "", "10").performed_rir, 10);
  });
});

describe("validateAdjustedPerformance (API boundary)", () => {
  it("accepts valid finite adjusted numbers", () => {
    assert.deepEqual(validateAdjustedPerformance("repetitions", 10, 12.5, 2), {});
  });

  it("rejects NaN and Infinity performed values", () => {
    assert.ok(validateAdjustedPerformance("repetitions", Number.NaN, null, null).performed_value);
    assert.ok(
      validateAdjustedPerformance("repetitions", Number.POSITIVE_INFINITY, null, null)
        .performed_value,
    );
  });

  it("rejects non-finite and over-precision weight", () => {
    assert.ok(validateAdjustedPerformance("repetitions", 10, Number.NaN, null).performed_weight_kg);
    assert.ok(validateAdjustedPerformance("repetitions", 10, 12.345, null).performed_weight_kg);
  });

  it("rejects non-integer RIR", () => {
    assert.ok(validateAdjustedPerformance("repetitions", 10, null, 2.5).performed_rir);
  });
});

describe("reconcileAdjustmentDraft", () => {
  const draft: SetAdjustmentDraft = {
    workout_id: 7,
    exercise_position: 1,
    set_position: 2,
    performed_value: "10",
    performed_weight_kg: "12,5",
    performed_rir: "",
  };

  it("preserves the draft when its set remains current and in progress", () => {
    assert.equal(
      reconcileAdjustmentDraft(draft, {
        workout_id: 7,
        current_exercise_position: 1,
        current_set_position: 2,
        current_set_phase: "set_in_progress",
      }),
      draft,
    );
  });

  it("preserves the draft while awaiting start for the same set", () => {
    assert.equal(
      reconcileAdjustmentDraft(draft, {
        workout_id: 7,
        current_exercise_position: 1,
        current_set_position: 2,
        current_set_phase: "awaiting_set_start",
      }),
      draft,
    );
  });

  it("clears the draft when the current set advances", () => {
    assert.equal(
      reconcileAdjustmentDraft(draft, {
        workout_id: 7,
        current_exercise_position: 1,
        current_set_position: 3,
        current_set_phase: "awaiting_set_start",
      }),
      null,
    );
  });

  it("clears the draft when the exercise or phase changes", () => {
    assert.equal(
      reconcileAdjustmentDraft(draft, {
        workout_id: 7,
        current_exercise_position: 2,
        current_set_position: 2,
        current_set_phase: "awaiting_set_start",
      }),
      null,
    );
    assert.equal(
      reconcileAdjustmentDraft(draft, {
        workout_id: 7,
        current_exercise_position: 1,
        current_set_position: 2,
        current_set_phase: null,
      }),
      null,
    );
  });

  it("clears the draft when the workout changes despite matching positions", () => {
    assert.equal(
      reconcileAdjustmentDraft(draft, {
        workout_id: 8,
        current_exercise_position: 1,
        current_set_position: 2,
        current_set_phase: "awaiting_set_start",
      }),
      null,
    );
  });
});

describe("draftMatchesSet", () => {
  const draft: SetAdjustmentDraft = {
    workout_id: 7,
    exercise_position: 1,
    set_position: 2,
    performed_value: "10",
    performed_weight_kg: "",
    performed_rir: "",
  };

  it("matches only the exact coordinates", () => {
    assert.equal(draftMatchesSet(draft, 7, 1, 2), true);
    assert.equal(draftMatchesSet(draft, 7, 1, 3), false);
    assert.equal(draftMatchesSet(draft, 7, 2, 2), false);
    assert.equal(draftMatchesSet(draft, 8, 1, 2), false);
    assert.equal(draftMatchesSet(null, 7, 1, 2), false);
  });
});

describe("parseDisplayValue", () => {
  it("returns null for blank and a number for valid strings", () => {
    assert.equal(parseDisplayValue(""), null);
    assert.equal(parseDisplayValue("   "), null);
    assert.equal(parseDisplayValue("0"), 0);
    assert.equal(parseDisplayValue("12,5"), 12.5);
    assert.equal(parseDisplayValue("not-a-number"), null);
  });
});
