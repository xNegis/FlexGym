import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPerformedSet, isWorkoutSession } from "./workoutParsing.ts";
import type {
  WorkoutExerciseSnapshot,
  WorkoutPlannedSetSnapshot,
  WorkoutSession,
} from "../types.ts";

function performedSet(
  overrides: Record<string, unknown> = {},
): WorkoutPlannedSetSnapshot["performance"] {
  return {
    performed_value: 10,
    performed_weight_kg: null,
    performed_rir: null,
    entry_mode: "as_planned",
    set_started_at: null,
    set_start_mode: null,
    completed_at: "2026-08-24T10:00:00.000Z",
    observed_duration_seconds: null,
    updated_at: "2026-08-24T10:00:00.000Z",
    ...overrides,
  };
}

function plannedSet(overrides: Record<string, unknown> = {}): WorkoutPlannedSetSnapshot {
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

function exercise(overrides: Record<string, unknown> = {}): WorkoutExerciseSnapshot {
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
    execution_status: "pending",
    exception: null,
    ...overrides,
  };
}

function workout(overrides: Record<string, unknown> = {}): WorkoutSession {
  return {
    id: 1,
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
    automatic_set_start_delay_seconds: 0,
    cancelled_at: null,
    completed_at: null,
    duration_seconds: null,
    exercises: [exercise()],
    server_now: "2026-08-24T09:10:00.000Z",
    completed_set_count: 0,
    skipped_set_count: 0,
    total_set_count: 1,
    all_sets_recorded: false,
    all_sets_resolved: false,
    current_exercise_position: null,
    current_set_position: null,
    current_set_phase: null,
    current_set_started_at: null,
    current_set_start_mode: null,
    transition_to_exercise_position: null,
    resume_url: "/workouts/1",
    events: [
      {
        sequence: 1,
        event_type: "workout_started",
        exercise_position: null,
        set_position: null,
        occurred_at: "2026-08-24T09:00:00.000Z",
        exception: null,
      },
    ],
    ...overrides,
  };
}

describe("isPerformedSet start provenance consistency", () => {
  it("accepts a legacy performed set with both fields null", () => {
    assert.equal(isPerformedSet(performedSet()), true);
  });

  it("accepts a manual start with a timestamp", () => {
    assert.equal(
      isPerformedSet(
        performedSet({ set_started_at: "2026-08-24T09:00:00.000Z", set_start_mode: "manual" }),
      ),
      true,
    );
  });

  it("accepts an automatic start with a timestamp", () => {
    assert.equal(
      isPerformedSet(
        performedSet({
          set_started_at: "2026-08-24T09:00:00.000Z",
          set_start_mode: "automatic",
        }),
      ),
      true,
    );
  });

  it("rejects a set with a mode but no timestamp", () => {
    assert.equal(isPerformedSet(performedSet({ set_start_mode: "automatic" })), false);
  });

  it("rejects a set with a timestamp but no mode", () => {
    assert.equal(
      isPerformedSet(performedSet({ set_started_at: "2026-08-24T09:00:00.000Z" })),
      false,
    );
  });

  it("rejects an unsupported start mode", () => {
    assert.equal(
      isPerformedSet(
        performedSet({
          set_started_at: "2026-08-24T09:00:00.000Z",
          set_start_mode: "sensor",
        }),
      ),
      false,
    );
  });

  it("rejects an empty start timestamp with a mode", () => {
    assert.equal(
      isPerformedSet(performedSet({ set_started_at: "", set_start_mode: "manual" })),
      false,
    );
  });
});

describe("isWorkoutSession current-field consistency", () => {
  it("accepts an in-progress set with a timestamp and mode", () => {
    assert.equal(
      isWorkoutSession(
        workout({
          current_exercise_position: 1,
          current_set_position: 1,
          current_set_phase: "set_in_progress",
          current_set_started_at: "2026-08-24T09:05:00.000Z",
          current_set_start_mode: "automatic",
        }),
      ),
      true,
    );
  });

  it("rejects an in-progress set with a null timestamp", () => {
    assert.equal(
      isWorkoutSession(
        workout({
          current_set_phase: "set_in_progress",
          current_set_started_at: null,
          current_set_start_mode: "manual",
        }),
      ),
      false,
    );
  });

  it("rejects an in-progress set with a null mode", () => {
    assert.equal(
      isWorkoutSession(
        workout({
          current_set_phase: "set_in_progress",
          current_set_started_at: "2026-08-24T09:05:00.000Z",
          current_set_start_mode: null,
        }),
      ),
      false,
    );
  });

  it("accepts an awaiting set with both fields null", () => {
    assert.equal(
      isWorkoutSession(
        workout({
          current_exercise_position: 1,
          current_set_position: 1,
          current_set_phase: "awaiting_set_start",
        }),
      ),
      true,
    );
  });

  it("rejects an awaiting set with a non-null timestamp", () => {
    assert.equal(
      isWorkoutSession(
        workout({
          current_set_phase: "awaiting_set_start",
          current_set_started_at: "2026-08-24T09:05:00.000Z",
        }),
      ),
      false,
    );
  });

  it("rejects an awaiting set with a non-null mode", () => {
    assert.equal(
      isWorkoutSession(
        workout({ current_set_phase: "awaiting_set_start", current_set_start_mode: "manual" }),
      ),
      false,
    );
  });

  it("accepts a null phase with both fields null", () => {
    assert.equal(isWorkoutSession(workout()), true);
  });

  it("rejects a null phase with a non-null timestamp", () => {
    assert.equal(
      isWorkoutSession(workout({ current_set_started_at: "2026-08-24T09:05:00.000Z" })),
      false,
    );
  });

  it("rejects a null phase with a non-null mode", () => {
    assert.equal(isWorkoutSession(workout({ current_set_start_mode: "manual" })), false);
  });

  it("rejects an unknown current-set phase", () => {
    assert.equal(isWorkoutSession(workout({ current_set_phase: "bogus" })), false);
  });
});

describe("isWorkoutSession event sequence consistency", () => {
  it("accepts a contiguous timeline", () => {
    const base = workout();
    assert.equal(
      isWorkoutSession(
        workout({
          events: [
            ...base.events,
            {
              sequence: 2,
              event_type: "exercise_started",
              exercise_position: 1,
              set_position: null,
              occurred_at: "2026-08-24T09:01:00.000Z",
              exception: null,
            },
          ],
        }),
      ),
      true,
    );
  });

  it("rejects a timeline with a sequence gap", () => {
    const base = workout();
    assert.equal(
      isWorkoutSession(
        workout({
          events: [
            ...base.events,
            {
              sequence: 3,
              event_type: "exercise_started",
              exercise_position: 1,
              set_position: null,
              occurred_at: "2026-08-24T09:01:00.000Z",
              exception: null,
            },
          ],
        }),
      ),
      false,
    );
  });
});
