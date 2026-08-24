import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_START_FRESHNESS_WINDOW_MS,
  autoRestReducer,
  classifyAutoRestReconciliation,
  computeAutoRestObservation,
  crossedBoundaryWhileHidden,
  EMPTY_AUTO_REST_STORE,
  observeAutoRest,
  sameAutoRestKey,
  type AutoRestKey,
  type AutoRestObservation,
} from "./autoRest.ts";
import type {
  WorkoutExerciseSnapshot,
  WorkoutPlannedSetSnapshot,
  WorkoutSession,
} from "../types.ts";

function key(overrides: Partial<AutoRestKey> = {}): AutoRestKey {
  return {
    workout_id: 7,
    exercise_position: 1,
    current_set_position: 2,
    previous_set_position: 1,
    previous_completed_at_ms: 1_700_000_000_000,
    rest_after_set_seconds: 90,
    automatic_start_delay_seconds: 10,
    ...overrides,
  };
}

function observation(
  delayRemainingMs: number,
  overrides: Partial<AutoRestKey> = {},
): AutoRestObservation {
  return {
    key: key(overrides),
    automatic_start_at_ms: 1_700_000_100_000,
    delay_remaining_ms: delayRemainingMs,
  };
}

function performedSet(completedAt: string): WorkoutPlannedSetSnapshot["performance"] {
  return {
    performed_value: 10,
    performed_weight_kg: null,
    performed_rir: null,
    entry_mode: "as_planned",
    set_started_at: null,
    set_start_mode: null,
    completed_at: completedAt,
    observed_duration_seconds: null,
    updated_at: completedAt,
  };
}

function plannedSet(overrides: Partial<WorkoutPlannedSetSnapshot> = {}): WorkoutPlannedSetSnapshot {
  return {
    position: 1,
    target_value: 10,
    target_weight_kg: null,
    target_rir: null,
    tempo: null,
    rest_after_set_seconds: null,
    notes: null,
    performance: null,
    exception: null,
    ...overrides,
  };
}

function exerciseSnapshot(sets: WorkoutPlannedSetSnapshot[]): WorkoutExerciseSnapshot {
  return {
    position: 1,
    source_exercise_id: null,
    exercise_slug: "squat",
    exercise_name: "Squat",
    target_type: "repetitions",
    rest_after_exercise_seconds: null,
    notes: null,
    planned_sets: sets,
    instructions: null,
    started_at: null,
    latest_completed_at: null,
    completed_set_count: 0,
    skipped_set_count: 0,
    total_set_count: sets.length,
    is_complete: false,
    is_resolved: false,
    execution_status: "in_progress",
    exception: null,
  };
}

function workoutSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 7,
    routine_name: "Push",
    local_date: "2026-08-24",
    scheduled_week_position: 1,
    scheduled_slot_was_rest: false,
    scheduled_training_day_id: 1,
    scheduled_training_day_name: "Push",
    selected_training_day_id: 1,
    selected_training_day_name: "Push",
    selected_week_position: 1,
    selection_kind: "scheduled",
    status: "in_progress",
    started_at: "2026-08-24T09:00:00.000Z",
    automatic_set_start_delay_seconds: 10,
    cancelled_at: null,
    completed_at: null,
    duration_seconds: null,
    exercises: [exerciseSnapshot([plannedSet({ position: 1 }), plannedSet({ position: 2 })])],
    server_now: "2026-08-24T09:10:00.000Z",
    completed_set_count: 1,
    skipped_set_count: 0,
    total_set_count: 2,
    all_sets_recorded: false,
    all_sets_resolved: false,
    current_exercise_position: 1,
    current_set_position: 2,
    current_set_phase: "set_in_progress",
    current_set_started_at: null,
    current_set_start_mode: "automatic",
    transition_to_exercise_position: null,
    resume_url: "/workouts/7/exercises/1",
    events: [],
    ...overrides,
  };
}

describe("sameAutoRestKey", () => {
  it("distinguishes the automatic delay from the plain rest identity", () => {
    assert.equal(sameAutoRestKey(key(), key()), true);
    assert.equal(sameAutoRestKey(key(), key({ automatic_start_delay_seconds: 20 })), false);
    assert.equal(sameAutoRestKey(key(), key({ rest_after_set_seconds: 60 })), false);
    assert.equal(sameAutoRestKey(key(), key({ current_set_position: 3 })), false);
    assert.equal(sameAutoRestKey(key(), null), false);
    assert.equal(sameAutoRestKey(null, null), true);
  });
});

describe("observeAutoRest arming", () => {
  it("arms a positive interval first observed before its boundary", () => {
    const result = observeAutoRest(EMPTY_AUTO_REST_STORE, observation(10_000), true);
    assert.equal(result.action, "arm");
    assert.equal(result.state.armed, true);
    assert.equal(result.state.consumed, false);
  });

  it("does not arm or dispatch a fresh interval discovered at or after expiry", () => {
    const result = observeAutoRest(EMPTY_AUTO_REST_STORE, observation(-1_000), true);
    assert.equal(result.action, "none");
    assert.equal(result.state.armed, false);
    assert.equal(result.state.consumed, true);
  });

  it("produces no state for a manual (zero) delay", () => {
    const result = observeAutoRest(
      EMPTY_AUTO_REST_STORE,
      observation(5_000, { automatic_start_delay_seconds: 0 }),
      true,
    );
    assert.equal(result.action, "none");
    assert.equal(result.state.key, null);
    assert.equal(result.state.armed, false);
  });
});

describe("observeAutoRest crossing", () => {
  it("dispatches once at the exact boundary when visible", () => {
    const armed = observeAutoRest(EMPTY_AUTO_REST_STORE, observation(1_000), true);
    const crossing = observeAutoRest(armed.state, observation(0), true);
    assert.equal(crossing.action, "dispatch");
    assert.equal(crossing.state.consumed, true);
  });

  it("dispatches once on a delayed crossing while visible", () => {
    const armed = observeAutoRest(EMPTY_AUTO_REST_STORE, observation(1_000), true);
    const crossing = observeAutoRest(armed.state, observation(-500), true);
    assert.equal(crossing.action, "dispatch");
  });

  it("consumes without dispatch when the boundary crosses while hidden", () => {
    const armed = observeAutoRest(EMPTY_AUTO_REST_STORE, observation(1_000), true);
    const crossing = observeAutoRest(armed.state, observation(-500), false);
    assert.equal(crossing.action, "none");
    assert.equal(crossing.state.consumed, true);
  });
});

describe("observeAutoRest one-time semantics", () => {
  it("never dispatches twice for the same interval", () => {
    const armed = observeAutoRest(EMPTY_AUTO_REST_STORE, observation(1_000), true);
    const consumed = observeAutoRest(armed.state, observation(-1_000), true);
    assert.equal(consumed.action, "dispatch");
    const again = observeAutoRest(consumed.state, observation(-2_000), true);
    assert.equal(again.action, "none");
    assert.equal(again.state, consumed.state);
  });

  it("keeps a still-before-boundary armed interval armed", () => {
    const armed = observeAutoRest(EMPTY_AUTO_REST_STORE, observation(30_000), true);
    const stillWaiting = observeAutoRest(armed.state, observation(20_000), true);
    assert.equal(stillWaiting.action, "none");
    assert.equal(stillWaiting.state.armed, true);
    assert.equal(stillWaiting.state.consumed, false);
  });
});

describe("observeAutoRest identity change and rearming", () => {
  it("rearms independently for a later interval", () => {
    const consumed = observeAutoRest(EMPTY_AUTO_REST_STORE, observation(-1_000), true);
    const later = observeAutoRest(
      consumed.state,
      observation(45_000, { current_set_position: 3 }),
      true,
    );
    assert.equal(later.action, "arm");
    assert.equal(later.state.armed, true);
    assert.equal(later.state.consumed, false);
  });
});

describe("autoRestReducer", () => {
  it("increments dispatchNonce exactly once per dispatch", () => {
    let state = autoRestReducer(EMPTY_AUTO_REST_STORE, {
      type: "observe",
      observation: observation(10_000),
      visible: true,
    });
    assert.equal(state.dispatchNonce, 0);
    state = autoRestReducer(state, {
      type: "observe",
      observation: observation(-1_000),
      visible: true,
    });
    assert.equal(state.dispatchNonce, 1);
    state = autoRestReducer(state, {
      type: "observe",
      observation: observation(-2_000),
      visible: true,
    });
    assert.equal(state.dispatchNonce, 1);
  });

  it("does not increment dispatchNonce on a hidden crossing", () => {
    let state = autoRestReducer(EMPTY_AUTO_REST_STORE, {
      type: "observe",
      observation: observation(10_000),
      visible: true,
    });
    state = autoRestReducer(state, {
      type: "observe",
      observation: observation(-1_000),
      visible: false,
    });
    assert.equal(state.dispatchNonce, 0);
    assert.equal(state.consumed, true);
  });

  it("returns the same store when an observation changes nothing", () => {
    const armed = autoRestReducer(EMPTY_AUTO_REST_STORE, {
      type: "observe",
      observation: observation(10_000),
      visible: true,
    });
    const again = autoRestReducer(armed, {
      type: "observe",
      observation: observation(9_000),
      visible: true,
    });
    assert.equal(again, armed);
  });

  it("reset clears an armed interval and retains the dispatch nonce", () => {
    let state = autoRestReducer(EMPTY_AUTO_REST_STORE, {
      type: "observe",
      observation: observation(10_000),
      visible: true,
    });
    const before = state.dispatchNonce;
    state = autoRestReducer(state, { type: "reset" });
    assert.equal(state.key, null);
    assert.equal(state.armed, false);
    assert.equal(state.consumed, false);
    assert.equal(state.dispatchNonce, before);
  });

  it("reset on an already-empty store returns the same reference", () => {
    assert.equal(autoRestReducer(EMPTY_AUTO_REST_STORE, { type: "reset" }), EMPTY_AUTO_REST_STORE);
  });
});

describe("autoRestReducer consume", () => {
  it("consumes an armed interval without dispatching", () => {
    const armed = autoRestReducer(EMPTY_AUTO_REST_STORE, {
      type: "observe",
      observation: observation(10_000),
      visible: true,
    });
    assert.equal(armed.armed, true);

    const consumed = autoRestReducer(armed, { type: "consume" });
    assert.equal(consumed.armed, false);
    assert.equal(consumed.consumed, true);
    assert.equal(consumed.key, armed.key);
    assert.equal(consumed.dispatchNonce, armed.dispatchNonce);
  });

  it("prevents a subsequent boundary crossing from dispatching", () => {
    const armed = autoRestReducer(EMPTY_AUTO_REST_STORE, {
      type: "observe",
      observation: observation(10_000),
      visible: true,
    });
    const consumed = autoRestReducer(armed, { type: "consume" });
    const crossing = autoRestReducer(consumed, {
      type: "observe",
      observation: observation(-1_000),
      visible: true,
    });
    assert.equal(crossing.dispatchNonce, consumed.dispatchNonce);
    assert.equal(crossing.consumed, true);
  });

  it("consume on an empty store returns the same reference", () => {
    assert.equal(
      autoRestReducer(EMPTY_AUTO_REST_STORE, { type: "consume" }),
      EMPTY_AUTO_REST_STORE,
    );
  });

  it("consume on an already-consumed store returns the same reference", () => {
    const consumed = autoRestReducer(
      autoRestReducer(EMPTY_AUTO_REST_STORE, {
        type: "observe",
        observation: observation(-1_000),
        visible: true,
      }),
      { type: "consume" },
    );
    assert.equal(autoRestReducer(consumed, { type: "consume" }), consumed);
  });
});

describe("computeAutoRestObservation", () => {
  const NOW = 1_700_000_000_000;

  function makeExercise(
    prevCompletedAt: string,
    restSeconds: number | null,
  ): { exercise: WorkoutExerciseSnapshot; currentSet: WorkoutPlannedSetSnapshot } {
    const sets = [
      plannedSet({
        position: 1,
        rest_after_set_seconds: restSeconds,
        performance: performedSet(prevCompletedAt),
      }),
      plannedSet({ position: 2 }),
    ];
    return { exercise: exerciseSnapshot(sets), currentSet: sets[1] };
  }

  it("derives the automatic boundary from rest plus delay", () => {
    const prevCompletedAt = new Date(NOW).toISOString();
    const { exercise, currentSet } = makeExercise(prevCompletedAt, 90);
    const obs = computeAutoRestObservation(
      7,
      1,
      10,
      exercise,
      currentSet,
      new Date(NOW).toISOString(),
      NOW,
      NOW,
    );
    assert.ok(obs);
    assert.equal(obs.automatic_start_at_ms, NOW + 100_000);
    assert.equal(obs.delay_remaining_ms, 100_000);
    assert.deepEqual(obs.key, {
      workout_id: 7,
      exercise_position: 1,
      current_set_position: 2,
      previous_set_position: 1,
      previous_completed_at_ms: Date.parse(prevCompletedAt),
      rest_after_set_seconds: 90,
      automatic_start_delay_seconds: 10,
    });
  });

  it("returns a negative delay remaining once the boundary has passed", () => {
    const prevCompletedAt = new Date(NOW - 110_000).toISOString();
    const { exercise, currentSet } = makeExercise(prevCompletedAt, 90);
    const obs = computeAutoRestObservation(
      7,
      1,
      10,
      exercise,
      currentSet,
      new Date(NOW).toISOString(),
      NOW,
      NOW,
    );
    assert.ok(obs);
    assert.equal(obs.delay_remaining_ms, -10_000);
  });

  it("returns null for a manual (zero) delay", () => {
    const { exercise, currentSet } = makeExercise(new Date(NOW).toISOString(), 90);
    assert.equal(
      computeAutoRestObservation(
        7,
        1,
        0,
        exercise,
        currentSet,
        new Date(NOW).toISOString(),
        NOW,
        NOW,
      ),
      null,
    );
  });

  it("returns null for a null rest interval", () => {
    const { exercise, currentSet } = makeExercise("2026-08-24T10:00:00.000Z", null);
    assert.equal(
      computeAutoRestObservation(
        7,
        1,
        10,
        exercise,
        currentSet,
        "2026-08-24T10:01:00.000Z",
        NOW,
        NOW,
      ),
      null,
    );
  });

  it("returns null when there is no previous set", () => {
    const exercise = exerciseSnapshot([plannedSet({ position: 1 })]);
    assert.equal(
      computeAutoRestObservation(
        7,
        1,
        10,
        exercise,
        exercise.planned_sets[0],
        "2026-08-24T10:00:00.000Z",
        NOW,
        NOW,
      ),
      null,
    );
  });

  it("returns null for an invalid server timestamp", () => {
    const { exercise, currentSet } = makeExercise("2026-08-24T10:00:00.000Z", 90);
    assert.equal(
      computeAutoRestObservation(7, 1, 10, exercise, currentSet, "not-a-date", NOW, NOW),
      null,
    );
  });
});

describe("classifyAutoRestReconciliation", () => {
  const TARGET = { exercise_position: 1, current_set_position: 2 };

  it("classifies a same-set in-progress result as success", () => {
    assert.deepEqual(classifyAutoRestReconciliation(TARGET, workoutSession()), { kind: "success" });
  });

  it("classifies a same-set awaiting result as still_awaiting", () => {
    assert.deepEqual(
      classifyAutoRestReconciliation(
        TARGET,
        workoutSession({ current_set_phase: "awaiting_set_start" }),
      ),
      { kind: "still_awaiting" },
    );
  });

  it("classifies a changed set position as changed", () => {
    assert.deepEqual(
      classifyAutoRestReconciliation(TARGET, workoutSession({ current_set_position: 3 })),
      { kind: "changed" },
    );
  });

  it("classifies a changed exercise position as changed", () => {
    assert.deepEqual(
      classifyAutoRestReconciliation(TARGET, workoutSession({ current_exercise_position: 2 })),
      { kind: "changed" },
    );
  });

  it("classifies a terminal workout as changed", () => {
    assert.deepEqual(
      classifyAutoRestReconciliation(TARGET, workoutSession({ status: "completed" })),
      { kind: "changed" },
    );
    assert.deepEqual(
      classifyAutoRestReconciliation(TARGET, workoutSession({ status: "cancelled" })),
      { kind: "changed" },
    );
  });
});

describe("observeAutoRest freshness window", () => {
  it("dispatches when an armed interval crosses within the freshness window", () => {
    const armed = observeAutoRest(EMPTY_AUTO_REST_STORE, observation(1_000), true);
    const crossing = observeAutoRest(
      armed.state,
      observation(-(AUTO_START_FRESHNESS_WINDOW_MS - 1)),
      true,
    );
    assert.equal(crossing.action, "dispatch");
    assert.equal(crossing.state.consumed, true);
  });

  it("consumes without dispatch when the crossing is observed outside the freshness window", () => {
    const armed = observeAutoRest(EMPTY_AUTO_REST_STORE, observation(1_000), true);
    const crossing = observeAutoRest(
      armed.state,
      observation(-(AUTO_START_FRESHNESS_WINDOW_MS + 1)),
      true,
    );
    assert.equal(crossing.action, "none");
    assert.equal(crossing.state.consumed, true);
  });

  it("consumes outside the freshness window even while visible", () => {
    const armed = observeAutoRest(EMPTY_AUTO_REST_STORE, observation(1_000), true);
    const crossing = observeAutoRest(armed.state, observation(-60_000), true);
    assert.equal(crossing.action, "none");
    assert.equal(crossing.state.consumed, true);
  });
});

describe("crossedBoundaryWhileHidden", () => {
  it("returns true when the boundary fell inside the last hidden window", () => {
    assert.equal(crossedBoundaryWhileHidden(5_000, { from: 2_000, to: 8_000 }), true);
    assert.equal(crossedBoundaryWhileHidden(2_000, { from: 2_000, to: 8_000 }), true);
    assert.equal(crossedBoundaryWhileHidden(8_000, { from: 2_000, to: 8_000 }), true);
  });

  it("returns false when the boundary is outside the last hidden window", () => {
    assert.equal(crossedBoundaryWhileHidden(1_000, { from: 2_000, to: 8_000 }), false);
    assert.equal(crossedBoundaryWhileHidden(9_000, { from: 2_000, to: 8_000 }), false);
  });

  it("returns false when there is no hidden window", () => {
    assert.equal(crossedBoundaryWhileHidden(5_000, null), false);
  });
});
