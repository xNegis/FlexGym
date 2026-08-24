import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeRestObservation,
  EMPTY_REST_CUE_STORE,
  observeRestCue,
  restCueReducer,
  sameRestKey,
  type RestIntervalKey,
} from "./restCue.ts";
import type { WorkoutExerciseSnapshot, WorkoutPlannedSetSnapshot } from "../types.ts";

function key(overrides: Partial<RestIntervalKey> = {}): RestIntervalKey {
  return {
    workout_id: 7,
    exercise_position: 1,
    current_set_position: 2,
    previous_set_position: 1,
    previous_completed_at_ms: 1_700_000_000_000,
    rest_after_set_seconds: 90,
    ...overrides,
  };
}

function performedSet(completedAt: string): WorkoutPlannedSetSnapshot["performance"] {
  return {
    performed_value: 10,
    performed_weight_kg: null,
    performed_rir: null,
    entry_mode: "as_planned",
    set_started_at: null,
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

describe("sameRestKey", () => {
  it("matches only identical interval coordinates", () => {
    const a = key();
    assert.equal(sameRestKey(a, key()), true);
    assert.equal(sameRestKey(a, key({ current_set_position: 3 })), false);
    assert.equal(sameRestKey(a, key({ previous_set_position: 2 })), false);
    assert.equal(sameRestKey(a, key({ rest_after_set_seconds: 60 })), false);
    assert.equal(sameRestKey(a, key({ workout_id: 8 })), false);
    assert.equal(sameRestKey(a, key({ exercise_position: 2 })), false);
    assert.equal(sameRestKey(a, key({ previous_completed_at_ms: 1_700_000_001_000 })), false);
    assert.equal(sameRestKey(a, null), false);
    assert.equal(sameRestKey(null, null), true);
  });
});

describe("observeRestCue arming", () => {
  it("arms a positive interval first observed before its deadline without cueing", () => {
    const result = observeRestCue(EMPTY_REST_CUE_STORE, key(), 30_000, false);
    assert.equal(result.action, "arm");
    assert.equal(result.state.armed, true);
    assert.equal(result.state.consumed, false);
  });

  it("does not arm or cue a positive interval first discovered after expiry", () => {
    const result = observeRestCue(EMPTY_REST_CUE_STORE, key(), -5_000, false);
    assert.equal(result.action, "none");
    assert.equal(result.state.armed, false);
    assert.equal(result.state.consumed, true);
  });
});

describe("observeRestCue crossing", () => {
  it("emits one cue at the exact positive-to-non-positive crossing", () => {
    const armed = observeRestCue(EMPTY_REST_CUE_STORE, key(), 10_000, false);
    const crossing = observeRestCue(armed.state, key(), 0, false);
    assert.equal(crossing.action, "cue");
    assert.equal(crossing.state.consumed, true);
  });

  it("emits one cue on a delayed positive-to-overtime crossing", () => {
    const armed = observeRestCue(EMPTY_REST_CUE_STORE, key(), 1_000, false);
    const crossing = observeRestCue(armed.state, key(), -30_000, false);
    assert.equal(crossing.action, "cue");
    assert.equal(crossing.state.consumed, true);
  });
});

describe("observeRestCue one-time semantics", () => {
  it("never cues twice for the same interval during overtime", () => {
    const armed = observeRestCue(EMPTY_REST_CUE_STORE, key(), 10_000, false);
    const consumed = observeRestCue(armed.state, key(), -1_000, false);
    assert.equal(consumed.action, "cue");
    const again = observeRestCue(consumed.state, key(), -2_000, false);
    assert.equal(again.action, "none");
    assert.equal(again.state, consumed.state);
  });

  it("keeps a still-positive armed interval armed without cueing", () => {
    const armed = observeRestCue(EMPTY_REST_CUE_STORE, key(), 30_000, false);
    const stillPositive = observeRestCue(armed.state, key(), 20_000, false);
    assert.equal(stillPositive.action, "none");
    assert.equal(stillPositive.state.armed, true);
    assert.equal(stillPositive.state.consumed, false);
  });
});

describe("observeRestCue zero rest", () => {
  it("cues once when a zero-rest interval is created by a Next set transition", () => {
    const result = observeRestCue(
      EMPTY_REST_CUE_STORE,
      key({ rest_after_set_seconds: 0 }),
      0,
      true,
    );
    assert.equal(result.action, "cue");
    assert.equal(result.state.consumed, true);
  });

  it("does not cue a zero-rest interval first discovered on a fresh mount", () => {
    const result = observeRestCue(
      EMPTY_REST_CUE_STORE,
      key({ rest_after_set_seconds: 0 }),
      0,
      false,
    );
    assert.equal(result.action, "none");
    assert.equal(result.state.consumed, true);
  });
});

describe("observeRestCue identity change and rearming", () => {
  it("discards an armed interval when the identity changes", () => {
    const armed = observeRestCue(EMPTY_REST_CUE_STORE, key(), 10_000, false);
    const next = observeRestCue(armed.state, key({ current_set_position: 3 }), 60_000, false);
    assert.equal(next.action, "arm");
    assert.equal(next.state.key?.current_set_position, 3);
  });

  it("rearms independently for a later rest interval", () => {
    const consumed = observeRestCue(EMPTY_REST_CUE_STORE, key(), -1_000, false);
    const later = observeRestCue(consumed.state, key({ current_set_position: 3 }), 45_000, false);
    assert.equal(later.action, "arm");
    assert.equal(later.state.armed, true);
    assert.equal(later.state.consumed, false);
  });
});

describe("restCueReducer", () => {
  it("increments cueNonce exactly once per cue request", () => {
    let state = restCueReducer(EMPTY_REST_CUE_STORE, {
      type: "observe",
      key: key(),
      remainingMs: 10_000,
      viaTransition: false,
    });
    assert.equal(state.cueNonce, 0);
    state = restCueReducer(state, {
      type: "observe",
      key: key(),
      remainingMs: -1_000,
      viaTransition: false,
    });
    assert.equal(state.cueNonce, 1);
    state = restCueReducer(state, {
      type: "observe",
      key: key(),
      remainingMs: -2_000,
      viaTransition: false,
    });
    assert.equal(state.cueNonce, 1);
  });

  it("returns the same store when an observation changes nothing", () => {
    const armed = restCueReducer(EMPTY_REST_CUE_STORE, {
      type: "observe",
      key: key(),
      remainingMs: 10_000,
      viaTransition: false,
    });
    const again = restCueReducer(armed, {
      type: "observe",
      key: key(),
      remainingMs: 9_000,
      viaTransition: false,
    });
    assert.equal(again, armed);
  });

  it("reset clears an armed interval and retains the cue nonce", () => {
    let state = restCueReducer(EMPTY_REST_CUE_STORE, {
      type: "observe",
      key: key(),
      remainingMs: 10_000,
      viaTransition: false,
    });
    const before = state.cueNonce;
    state = restCueReducer(state, { type: "reset" });
    assert.equal(state.key, null);
    assert.equal(state.armed, false);
    assert.equal(state.consumed, false);
    assert.equal(state.cueNonce, before);
  });

  it("reset on an already-empty store returns the same reference", () => {
    assert.equal(restCueReducer(EMPTY_REST_CUE_STORE, { type: "reset" }), EMPTY_REST_CUE_STORE);
  });
});

describe("restCueReducer cuedKey (live-region announcement)", () => {
  it("records the interval that requested a cue", () => {
    let state = restCueReducer(EMPTY_REST_CUE_STORE, {
      type: "observe",
      key: key(),
      remainingMs: 10_000,
      viaTransition: false,
    });
    assert.equal(state.cuedKey, null);
    state = restCueReducer(state, {
      type: "observe",
      key: key(),
      remainingMs: -1_000,
      viaTransition: false,
    });
    assert.equal(sameRestKey(state.cuedKey, key()), true);
  });

  it("records the zero-rest interval that cues on an authorized transition", () => {
    const state = restCueReducer(EMPTY_REST_CUE_STORE, {
      type: "observe",
      key: key({ rest_after_set_seconds: 0 }),
      remainingMs: 0,
      viaTransition: true,
    });
    assert.equal(sameRestKey(state.cuedKey, key({ rest_after_set_seconds: 0 })), true);
  });

  it("leaves cuedKey null for a fresh already-expired mount", () => {
    const state = restCueReducer(EMPTY_REST_CUE_STORE, {
      type: "observe",
      key: key(),
      remainingMs: -5_000,
      viaTransition: false,
    });
    assert.equal(state.cuedKey, null);
  });

  it("clears cuedKey on reset", () => {
    let state = restCueReducer(EMPTY_REST_CUE_STORE, {
      type: "observe",
      key: key(),
      remainingMs: 10_000,
      viaTransition: false,
    });
    state = restCueReducer(state, {
      type: "observe",
      key: key(),
      remainingMs: -1_000,
      viaTransition: false,
    });
    assert.equal(sameRestKey(state.cuedKey, key()), true);
    state = restCueReducer(state, { type: "reset" });
    assert.equal(state.cuedKey, null);
  });

  it("clears cuedKey when the interval identity changes without a cue", () => {
    let state = restCueReducer(EMPTY_REST_CUE_STORE, {
      type: "observe",
      key: key(),
      remainingMs: 10_000,
      viaTransition: false,
    });
    state = restCueReducer(state, {
      type: "observe",
      key: key(),
      remainingMs: -1_000,
      viaTransition: false,
    });
    assert.equal(sameRestKey(state.cuedKey, key()), true);
    state = restCueReducer(state, {
      type: "observe",
      key: key({ current_set_position: 3 }),
      remainingMs: 60_000,
      viaTransition: false,
    });
    assert.equal(state.cuedKey, null);
  });

  it("preserves cuedKey during the same interval's overtime", () => {
    let state = restCueReducer(EMPTY_REST_CUE_STORE, {
      type: "observe",
      key: key(),
      remainingMs: 10_000,
      viaTransition: false,
    });
    state = restCueReducer(state, {
      type: "observe",
      key: key(),
      remainingMs: -1_000,
      viaTransition: false,
    });
    const cued = state.cuedKey;
    state = restCueReducer(state, {
      type: "observe",
      key: key(),
      remainingMs: -2_000,
      viaTransition: false,
    });
    assert.equal(state.cuedKey, cued);
  });
});

describe("computeRestObservation", () => {
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

  it("builds a stable complete identity including the exercise position", () => {
    const prevCompletedAt = "2026-08-24T10:00:00.000Z";
    const { exercise, currentSet } = makeExercise(prevCompletedAt, 90);
    const obs = computeRestObservation(
      7,
      2,
      exercise,
      currentSet,
      "2026-08-24T10:01:00.000Z",
      NOW,
      NOW,
    );
    assert.ok(obs);
    assert.deepEqual(obs.key, {
      workout_id: 7,
      exercise_position: 2,
      current_set_position: 2,
      previous_set_position: 1,
      previous_completed_at_ms: Date.parse(prevCompletedAt),
      rest_after_set_seconds: 90,
    });
  });

  it("derives positive remaining seconds from the server-relative deadline", () => {
    const prevCompletedAt = new Date(NOW).toISOString();
    const serverNow = new Date(NOW + 45_000).toISOString();
    const { exercise, currentSet } = makeExercise(prevCompletedAt, 90);
    const obs = computeRestObservation(7, 1, exercise, currentSet, serverNow, NOW, NOW);
    assert.ok(obs);
    assert.equal(obs.remaining_ms, 45_000);
    assert.equal(obs.seconds, 45);
    assert.equal(obs.overtime, false);
  });

  it("derives overtime seconds once the deadline has passed", () => {
    const prevCompletedAt = new Date(NOW - 100_000).toISOString();
    const { exercise, currentSet } = makeExercise(prevCompletedAt, 90);
    const obs = computeRestObservation(
      7,
      1,
      exercise,
      currentSet,
      new Date(NOW).toISOString(),
      NOW,
      NOW,
    );
    assert.ok(obs);
    assert.equal(obs.remaining_ms, -10_000);
    assert.equal(obs.seconds, 10);
    assert.equal(obs.overtime, true);
  });

  it("accounts for elapsed client time since the response was received", () => {
    const prevCompletedAt = new Date(NOW).toISOString();
    const { exercise, currentSet } = makeExercise(prevCompletedAt, 90);
    const obs = computeRestObservation(
      7,
      1,
      exercise,
      currentSet,
      new Date(NOW).toISOString(),
      NOW - 2_000,
      NOW,
    );
    assert.ok(obs);
    assert.equal(obs.remaining_ms, 88_000);
  });

  it("produces an overtime observation for a zero-rest interval", () => {
    const prevCompletedAt = new Date(NOW - 5_000).toISOString();
    const { exercise, currentSet } = makeExercise(prevCompletedAt, 0);
    const obs = computeRestObservation(
      7,
      1,
      exercise,
      currentSet,
      new Date(NOW).toISOString(),
      NOW,
      NOW,
    );
    assert.ok(obs);
    assert.equal(obs.key.rest_after_set_seconds, 0);
    assert.equal(obs.overtime, true);
    assert.equal(obs.seconds, 5);
  });

  it("returns null for a null rest interval", () => {
    const { exercise, currentSet } = makeExercise("2026-08-24T10:00:00.000Z", null);
    assert.equal(
      computeRestObservation(7, 1, exercise, currentSet, "2026-08-24T10:01:00.000Z", NOW, NOW),
      null,
    );
  });

  it("returns null for an invalid server timestamp", () => {
    const { exercise, currentSet } = makeExercise("2026-08-24T10:00:00.000Z", 90);
    assert.equal(computeRestObservation(7, 1, exercise, currentSet, "not-a-date", NOW, NOW), null);
  });

  it("returns null for an invalid previous completion timestamp", () => {
    const { exercise, currentSet } = makeExercise("not-a-date", 90);
    assert.equal(
      computeRestObservation(7, 1, exercise, currentSet, "2026-08-24T10:01:00.000Z", NOW, NOW),
      null,
    );
  });

  it("returns null when there is no previous set", () => {
    const exercise = exerciseSnapshot([plannedSet({ position: 1 })]);
    assert.equal(
      computeRestObservation(
        7,
        1,
        exercise,
        exercise.planned_sets[0],
        "2026-08-24T10:00:00.000Z",
        NOW,
        NOW,
      ),
      null,
    );
  });
});
