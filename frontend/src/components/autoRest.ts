// F27 — Configurable Automatic Same-exercise Set Start.
//
// This module owns the pure automatic-rest state transition that decides whether
// to arm or dispatch a one-time automatic set start at the server-derived
// automatic boundary. It has no browser or React dependencies so its invariants
// can be tested directly. Like restCue.ts, the important distinction is between
// an interval that was observed and armed before its boundary and an interval
// first discovered after expiry; a fresh mount must never perform a stale
// catch-up start.

import type { WorkoutExerciseSnapshot, WorkoutPlannedSetSnapshot, WorkoutSession } from "../types";

export const ALLOWED_AUTO_START_DELAYS = [0, 5, 10, 15, 20, 30] as const;

export interface AutoRestKey {
  workout_id: number;
  exercise_position: number;
  current_set_position: number;
  previous_set_position: number;
  previous_completed_at_ms: number;
  rest_after_set_seconds: number;
  automatic_start_delay_seconds: number;
}

export interface AutoRestObservation {
  key: AutoRestKey;
  automatic_start_at_ms: number;
  delay_remaining_ms: number;
}

export interface AutoRestState {
  key: AutoRestKey | null;
  armed: boolean;
  consumed: boolean;
}

export interface AutoRestStore extends AutoRestState {
  dispatchNonce: number;
}

export type AutoRestAction = "none" | "arm" | "dispatch";

export const EMPTY_AUTO_REST_STORE: AutoRestStore = {
  key: null,
  armed: false,
  consumed: false,
  dispatchNonce: 0,
};

export function sameAutoRestKey(a: AutoRestKey | null, b: AutoRestKey | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.workout_id === b.workout_id &&
    a.exercise_position === b.exercise_position &&
    a.current_set_position === b.current_set_position &&
    a.previous_set_position === b.previous_set_position &&
    a.previous_completed_at_ms === b.previous_completed_at_ms &&
    a.rest_after_set_seconds === b.rest_after_set_seconds &&
    a.automatic_start_delay_seconds === b.automatic_start_delay_seconds
  );
}

export interface ObserveAutoRestResult {
  state: AutoRestState;
  action: AutoRestAction;
}

// Matches the backend's five-second freshness window. A dispatch is only
// attempted when the boundary is observed at or within five seconds after the
// server-derived automatic start time; a later observation is consumed without
// dispatch instead of sending a request the server is guaranteed to reject.
export const AUTO_START_FRESHNESS_WINDOW_MS = 5000;

export function observeAutoRest(
  prev: AutoRestState,
  observation: AutoRestObservation,
  visible: boolean,
): ObserveAutoRestResult {
  const { key } = observation;
  if (key.automatic_start_delay_seconds <= 0) {
    return { state: { key: null, armed: false, consumed: false }, action: "none" };
  }

  if (!sameAutoRestKey(prev.key, key)) {
    if (observation.delay_remaining_ms > 0) {
      return { state: { key, armed: true, consumed: false }, action: "arm" };
    }
    return { state: { key, armed: false, consumed: true }, action: "none" };
  }

  if (prev.consumed) return { state: prev, action: "none" };

  if (prev.armed) {
    if (observation.delay_remaining_ms <= 0) {
      if (observation.delay_remaining_ms < -AUTO_START_FRESHNESS_WINDOW_MS) {
        return { state: { key, armed: false, consumed: true }, action: "none" };
      }
      if (visible) {
        return { state: { key, armed: false, consumed: true }, action: "dispatch" };
      }
      return { state: { key, armed: false, consumed: true }, action: "none" };
    }
    return { state: prev, action: "none" };
  }

  return { state: prev, action: "none" };
}

export type AutoRestDispatchAction =
  | { type: "observe"; observation: AutoRestObservation; visible: boolean }
  | { type: "consume" }
  | { type: "reset" };

export function autoRestReducer(
  state: AutoRestStore,
  action: AutoRestDispatchAction,
): AutoRestStore {
  if (action.type === "reset") {
    if (state.key === null && !state.armed && !state.consumed) {
      return state;
    }
    return { key: null, armed: false, consumed: false, dispatchNonce: state.dispatchNonce };
  }

  if (action.type === "consume") {
    if (state.key === null || state.consumed) {
      return state;
    }
    return { key: state.key, armed: false, consumed: true, dispatchNonce: state.dispatchNonce };
  }

  const result = observeAutoRest(
    { key: state.key, armed: state.armed, consumed: state.consumed },
    action.observation,
    action.visible,
  );

  const dispatchNonce =
    result.action === "dispatch" ? state.dispatchNonce + 1 : state.dispatchNonce;

  if (
    dispatchNonce === state.dispatchNonce &&
    result.state.key === state.key &&
    result.state.armed === state.armed &&
    result.state.consumed === state.consumed
  ) {
    return state;
  }
  return {
    key: result.state.key,
    armed: result.state.armed,
    consumed: result.state.consumed,
    dispatchNonce,
  };
}

export function computeAutoRestObservation(
  workoutId: number,
  exercisePosition: number,
  automaticStartDelaySeconds: number,
  exercise: WorkoutExerciseSnapshot | undefined,
  currentSet: WorkoutPlannedSetSnapshot | null | undefined,
  serverNow: string,
  clientReceivedAt: number,
  nowMs: number = Date.now(),
): AutoRestObservation | null {
  if (!exercise || !currentSet) return null;
  if (!Number.isInteger(automaticStartDelaySeconds) || automaticStartDelaySeconds <= 0) {
    return null;
  }
  const serverTime = new Date(serverNow).getTime();
  if (!Number.isFinite(serverTime)) return null;
  const estimatedServerNowMs = serverTime + (nowMs - clientReceivedAt);

  const previousSet = exercise.planned_sets[currentSet.position - 2];
  if (!previousSet?.performance || previousSet.rest_after_set_seconds == null) return null;
  const previousCompletedAtMs = new Date(previousSet.performance.completed_at).getTime();
  if (!Number.isFinite(previousCompletedAtMs)) return null;

  const restSeconds = previousSet.rest_after_set_seconds;
  const automaticStartAtMs =
    previousCompletedAtMs + restSeconds * 1000 + automaticStartDelaySeconds * 1000;

  const key: AutoRestKey = {
    workout_id: workoutId,
    exercise_position: exercisePosition,
    current_set_position: currentSet.position,
    previous_set_position: previousSet.position,
    previous_completed_at_ms: previousCompletedAtMs,
    rest_after_set_seconds: restSeconds,
    automatic_start_delay_seconds: automaticStartDelaySeconds,
  };

  return {
    key,
    automatic_start_at_ms: automaticStartAtMs,
    delay_remaining_ms: automaticStartAtMs - estimatedServerNowMs,
  };
}

export interface AutoRestTarget {
  exercise_position: number;
  current_set_position: number;
}

export type AutoRestReconciliationOutcome =
  { kind: "success" } | { kind: "still_awaiting" } | { kind: "changed" };

export function classifyAutoRestReconciliation(
  target: AutoRestTarget,
  workout: WorkoutSession,
): AutoRestReconciliationOutcome {
  if (workout.status !== "in_progress") return { kind: "changed" };

  const isSameSet =
    workout.current_exercise_position === target.exercise_position &&
    workout.current_set_position === target.current_set_position;

  if (!isSameSet) return { kind: "changed" };
  if (workout.current_set_phase === "set_in_progress") return { kind: "success" };
  if (workout.current_set_phase === "awaiting_set_start") return { kind: "still_awaiting" };
  return { kind: "changed" };
}

export interface AutoRestHiddenWindow {
  from: number;
  to: number;
}

// The most recent hidden window is enough to decide whether an interval's
// boundary was crossed while the document was hidden. If the page is currently
// hidden, the caller already reports visible=false; this helper covers the case
// where the page returned visible after the boundary passed during a hidden
// period, which must be consumed rather than dispatched as a catch-up start.
export function crossedBoundaryWhileHidden(
  automaticStartAtMs: number,
  lastHiddenWindow: AutoRestHiddenWindow | null,
): boolean {
  if (lastHiddenWindow === null) return false;
  return automaticStartAtMs >= lastHiddenWindow.from && automaticStartAtMs <= lastHiddenWindow.to;
}
