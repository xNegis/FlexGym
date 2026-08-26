import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeExerciseRestObservation,
  computeLaterUnresolvedExercises,
  formatTimer,
  resolveEffectiveSetMetrics,
  shouldShowCurrentSetMetrics,
  targetTypeLabel,
} from "./workoutPresentation.ts";
import type { WorkoutExerciseSnapshot, WorkoutPlannedSetSnapshot } from "../types.ts";
import type { SetAdjustmentDraft } from "./setAdjustment.ts";

function plannedSet(overrides: Partial<WorkoutPlannedSetSnapshot> = {}): WorkoutPlannedSetSnapshot {
  return {
    position: 1,
    target_value: 10,
    target_weight_kg: 40,
    target_rir: 2,
    tempo: null,
    rest_after_set_seconds: null,
    notes: null,
    performance: null,
    exception: null,
    ...overrides,
  };
}

function draft(overrides: Partial<SetAdjustmentDraft> = {}): SetAdjustmentDraft {
  return {
    workout_id: 7,
    exercise_position: 1,
    set_position: 1,
    performed_value: "12",
    performed_weight_kg: "45,5",
    performed_rir: "3",
    ...overrides,
  };
}

function exerciseSnapshot(
  overrides: Partial<WorkoutExerciseSnapshot> = {},
): WorkoutExerciseSnapshot {
  return {
    position: 1,
    source_exercise_id: null,
    exercise_slug: "squat",
    exercise_name: "Squat",
    target_type: "repetitions",
    rest_after_exercise_seconds: null,
    notes: null,
    planned_sets: [plannedSet()],
    instructions: null,
    started_at: null,
    latest_completed_at: null,
    completed_set_count: 0,
    skipped_set_count: 0,
    total_set_count: 1,
    is_complete: false,
    is_resolved: false,
    execution_status: "in_progress",
    exception: null,
    ...overrides,
  };
}

describe("targetTypeLabel", () => {
  it("maps every target type to its visible label", () => {
    assert.equal(targetTypeLabel("repetitions"), "Reps");
    assert.equal(targetTypeLabel("duration_seconds"), "Seconds");
    assert.equal(targetTypeLabel("distance_meters"), "Metres");
  });
});

describe("resolveEffectiveSetMetrics", () => {
  it("uses the planned snapshot when there is no draft", () => {
    assert.deepEqual(resolveEffectiveSetMetrics(plannedSet(), null), {
      value: 10,
      weight: 40,
      rir: 2,
    });
  });

  it("replaces value, RIR, and weight with a matching draft", () => {
    assert.deepEqual(resolveEffectiveSetMetrics(plannedSet(), draft()), {
      value: 12,
      weight: 45.5,
      rir: 3,
    });
  });

  it("keeps a blank draft weight and RIR as null rather than falling back to the plan", () => {
    assert.deepEqual(
      resolveEffectiveSetMetrics(
        plannedSet(),
        draft({ performed_weight_kg: "", performed_rir: "" }),
      ),
      { value: 12, weight: null, rir: null },
    );
  });

  it("preserves explicit-zero draft RIR and weight as zero", () => {
    assert.deepEqual(
      resolveEffectiveSetMetrics(
        plannedSet(),
        draft({ performed_weight_kg: "0", performed_rir: "0" }),
      ),
      { value: 12, weight: 0, rir: 0 },
    );
  });

  it("falls back to the planned target when a draft value is not parseable", () => {
    assert.deepEqual(resolveEffectiveSetMetrics(plannedSet(), draft({ performed_value: "" })), {
      value: 10,
      weight: 45.5,
      rir: 3,
    });
  });
});

describe("shouldShowCurrentSetMetrics", () => {
  const base = {
    hasCurrentSet: true,
    isAwaitingStart: false,
    isSetInProgress: false,
    isExerciseSkipped: false,
    isWorkoutCancelled: false,
    isWorkoutCompleted: false,
  };

  it("shows while awaiting set start with a current set", () => {
    assert.equal(shouldShowCurrentSetMetrics({ ...base, isAwaitingStart: true }), true);
  });

  it("shows while a set is in progress with a current set", () => {
    assert.equal(shouldShowCurrentSetMetrics({ ...base, isSetInProgress: true }), true);
  });

  it("hides for a null or unstarted phase", () => {
    assert.equal(shouldShowCurrentSetMetrics(base), false);
  });

  it("hides when the exercise is skipped", () => {
    assert.equal(
      shouldShowCurrentSetMetrics({ ...base, isAwaitingStart: true, isExerciseSkipped: true }),
      false,
    );
  });

  it("hides when the workout is cancelled", () => {
    assert.equal(
      shouldShowCurrentSetMetrics({ ...base, isAwaitingStart: true, isWorkoutCancelled: true }),
      false,
    );
  });

  it("hides when the workout is completed", () => {
    assert.equal(
      shouldShowCurrentSetMetrics({ ...base, isSetInProgress: true, isWorkoutCompleted: true }),
      false,
    );
  });

  it("hides when there is no current set", () => {
    assert.equal(
      shouldShowCurrentSetMetrics({ ...base, isAwaitingStart: true, hasCurrentSet: false }),
      false,
    );
  });
});

describe("computeLaterUnresolvedExercises", () => {
  function exercise(
    position: number,
    resolved: boolean,
    name = `Exercise ${position}`,
  ): WorkoutExerciseSnapshot {
    return exerciseSnapshot({ position, exercise_name: name, is_resolved: resolved });
  }

  it("returns later unresolved exercises in ascending order excluding the next one", () => {
    const exercises = [
      exercise(1, true),
      exercise(2, false, "Press"),
      exercise(3, false, "Pull-down"),
      exercise(4, true),
      exercise(5, false, "Curl"),
    ];
    const result = computeLaterUnresolvedExercises(exercises, 2);
    assert.deepEqual(
      result.map((e) => e.position),
      [3, 5],
    );
  });

  it("excludes the immediate next exercise even when unresolved", () => {
    const exercises = [exercise(1, true), exercise(2, false), exercise(3, false)];
    const result = computeLaterUnresolvedExercises(exercises, 2);
    assert.deepEqual(
      result.map((e) => e.position),
      [3],
    );
  });

  it("returns an empty list when nothing remains after the next exercise", () => {
    const exercises = [exercise(1, true), exercise(2, false)];
    assert.deepEqual(computeLaterUnresolvedExercises(exercises, 2), []);
  });
});

describe("computeExerciseRestObservation", () => {
  const NOW = 1_700_000_000_000;

  function resolvedExercise(
    completedAt: string,
    restSeconds: number | null,
  ): WorkoutExerciseSnapshot {
    return exerciseSnapshot({
      is_resolved: true,
      latest_completed_at: completedAt,
      rest_after_exercise_seconds: restSeconds,
    });
  }

  const NEXT = exerciseSnapshot({ position: 2, exercise_name: "Next" });

  it("counts down the remaining planned exercise rest", () => {
    const completedAt = new Date(NOW - 30_000).toISOString();
    const exercise = resolvedExercise(completedAt, 120);
    const obs = computeExerciseRestObservation(
      exercise,
      new Date(NOW).toISOString(),
      NEXT,
      NOW,
      NOW,
    );
    assert.ok(obs);
    assert.equal(obs.seconds, 90);
    assert.equal(obs.overtime, false);
  });

  it("reports the final second as still positive remaining time", () => {
    const completedAt = new Date(NOW - 119_000).toISOString();
    const exercise = resolvedExercise(completedAt, 120);
    const obs = computeExerciseRestObservation(
      exercise,
      new Date(NOW).toISOString(),
      NEXT,
      NOW,
      NOW,
    );
    assert.ok(obs);
    assert.equal(obs.seconds, 1);
    assert.equal(obs.overtime, false);
  });

  it("enters overtime at the exact deadline", () => {
    const completedAt = new Date(NOW - 120_000).toISOString();
    const exercise = resolvedExercise(completedAt, 120);
    const obs = computeExerciseRestObservation(
      exercise,
      new Date(NOW).toISOString(),
      NEXT,
      NOW,
      NOW,
    );
    assert.ok(obs);
    assert.equal(obs.seconds, 0);
    assert.equal(obs.overtime, true);
  });

  it("keeps counting overtime beyond the planned boundary", () => {
    const completedAt = new Date(NOW - 180_000).toISOString();
    const exercise = resolvedExercise(completedAt, 120);
    const obs = computeExerciseRestObservation(
      exercise,
      new Date(NOW).toISOString(),
      NEXT,
      NOW,
      NOW,
    );
    assert.ok(obs);
    assert.equal(obs.seconds, 60);
    assert.equal(obs.overtime, true);
  });

  it("begins zero rest immediately in overtime", () => {
    const completedAt = new Date(NOW).toISOString();
    const exercise = resolvedExercise(completedAt, 0);
    const obs = computeExerciseRestObservation(
      exercise,
      new Date(NOW).toISOString(),
      NEXT,
      NOW,
      NOW,
    );
    assert.ok(obs);
    assert.equal(obs.seconds, 0);
    assert.equal(obs.overtime, true);
  });

  it("returns null for a null rest interval", () => {
    const exercise = resolvedExercise(new Date(NOW).toISOString(), null);
    assert.equal(
      computeExerciseRestObservation(exercise, new Date(NOW).toISOString(), NEXT, NOW, NOW),
      null,
    );
  });

  it("accounts for elapsed client time since the response was received", () => {
    const completedAt = new Date(NOW).toISOString();
    const exercise = resolvedExercise(completedAt, 90);
    const obs = computeExerciseRestObservation(
      exercise,
      new Date(NOW).toISOString(),
      NEXT,
      NOW - 10_000,
      NOW,
    );
    assert.ok(obs);
    assert.equal(obs.seconds, 80);
    assert.equal(obs.overtime, false);
  });

  it("does not reset the deadline on a delayed tick", () => {
    const completedAt = new Date(NOW - 100_000).toISOString();
    const exercise = resolvedExercise(completedAt, 120);
    const first = computeExerciseRestObservation(
      exercise,
      new Date(NOW).toISOString(),
      NEXT,
      NOW,
      NOW,
    );
    const delayed = computeExerciseRestObservation(
      exercise,
      new Date(NOW).toISOString(),
      NEXT,
      NOW,
      NOW + 5_000,
    );
    assert.ok(first);
    assert.ok(delayed);
    assert.equal(first.seconds, 20);
    assert.equal(delayed.seconds, 15);
  });

  it("returns null without a next exercise or an unresolved exercise", () => {
    const completedAt = new Date(NOW).toISOString();
    const exercise = resolvedExercise(completedAt, 90);
    assert.equal(
      computeExerciseRestObservation(exercise, new Date(NOW).toISOString(), undefined, NOW, NOW),
      null,
    );
    assert.equal(
      computeExerciseRestObservation(
        exerciseSnapshot({
          is_resolved: false,
          latest_completed_at: completedAt,
          rest_after_exercise_seconds: 90,
        }),
        new Date(NOW).toISOString(),
        NEXT,
        NOW,
        NOW,
      ),
      null,
    );
  });

  it("returns null for invalid server or completion timestamps", () => {
    const exercise = resolvedExercise("not-a-date", 90);
    assert.equal(
      computeExerciseRestObservation(exercise, new Date(NOW).toISOString(), NEXT, NOW, NOW),
      null,
    );
    const noCompletedAt = resolvedExercise(new Date(NOW).toISOString(), 90);
    noCompletedAt.latest_completed_at = null;
    assert.equal(computeExerciseRestObservation(noCompletedAt, "not-a-date", NEXT, NOW, NOW), null);
  });
});

describe("formatTimer", () => {
  it("formats countdown time as M:SS", () => {
    assert.equal(formatTimer(0, false), "0:00");
    assert.equal(formatTimer(9, false), "0:09");
    assert.equal(formatTimer(65, false), "1:05");
    assert.equal(formatTimer(600, false), "10:00");
  });

  it("formats overtime with a plus prefix", () => {
    assert.equal(formatTimer(0, true), "+0:00");
    assert.equal(formatTimer(5, true), "+0:05");
    assert.equal(formatTimer(125, true), "+2:05");
  });
});
