// F26 — Rest Countdown Focus and Audio Cue.
//
// This module owns the pure rest-interval state transition that decides whether
// to arm or emit the one-time rest cue. It has no browser audio or React
// dependencies so its invariants can be tested directly without Web Audio.
//
// The important distinction is between an interval that was observed and armed
// before its deadline and an interval first discovered after expiry. A fresh
// mount that finds an already-expired (or already-zero) interval must not emit
// stale catch-up audio.

import type { WorkoutExerciseSnapshot, WorkoutPlannedSetSnapshot } from "../types";

export interface RestIntervalKey {
  workout_id: number;
  exercise_position: number;
  current_set_position: number;
  previous_set_position: number;
  previous_completed_at_ms: number;
  rest_after_set_seconds: number;
}

export interface RestObservation {
  key: RestIntervalKey;
  remaining_ms: number;
  seconds: number;
  overtime: boolean;
}

export interface RestCueState {
  key: RestIntervalKey | null;
  armed: boolean;
  consumed: boolean;
}

export interface RestCueStore extends RestCueState {
  cueNonce: number;
  cuedKey: RestIntervalKey | null;
}

export type RestCueAction = "none" | "arm" | "cue";

export type RestCueDispatchAction =
  | { type: "observe"; key: RestIntervalKey; remainingMs: number; viaTransition: boolean }
  | { type: "reset" };

export const EMPTY_REST_CUE_STORE: RestCueStore = {
  key: null,
  armed: false,
  consumed: false,
  cueNonce: 0,
  cuedKey: null,
};

export function sameRestKey(a: RestIntervalKey | null, b: RestIntervalKey | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.workout_id === b.workout_id &&
    a.exercise_position === b.exercise_position &&
    a.current_set_position === b.current_set_position &&
    a.previous_set_position === b.previous_set_position &&
    a.previous_completed_at_ms === b.previous_completed_at_ms &&
    a.rest_after_set_seconds === b.rest_after_set_seconds
  );
}

export interface ObserveRestCueResult {
  state: RestCueState;
  action: RestCueAction;
}

export function observeRestCue(
  prev: RestCueState,
  key: RestIntervalKey,
  remainingMs: number,
  viaTransition: boolean,
): ObserveRestCueResult {
  if (!sameRestKey(prev.key, key)) {
    const rest = key.rest_after_set_seconds;
    if (rest > 0) {
      if (remainingMs > 0) {
        return { state: { key, armed: true, consumed: false }, action: "arm" };
      }
      return { state: { key, armed: false, consumed: true }, action: "none" };
    }
    if (viaTransition) {
      return { state: { key, armed: false, consumed: true }, action: "cue" };
    }
    return { state: { key, armed: false, consumed: true }, action: "none" };
  }

  if (prev.consumed) return { state: prev, action: "none" };
  if (prev.armed) {
    if (remainingMs <= 0) {
      return { state: { key, armed: false, consumed: true }, action: "cue" };
    }
    return { state: prev, action: "none" };
  }
  return { state: prev, action: "none" };
}

export function restCueReducer(state: RestCueStore, action: RestCueDispatchAction): RestCueStore {
  if (action.type === "reset") {
    if (state.key === null && !state.armed && !state.consumed && state.cuedKey === null) {
      return state;
    }
    return { key: null, armed: false, consumed: false, cueNonce: state.cueNonce, cuedKey: null };
  }

  const result = observeRestCue(
    { key: state.key, armed: state.armed, consumed: state.consumed },
    action.key,
    action.remainingMs,
    action.viaTransition,
  );

  const cueNonce = result.action === "cue" ? state.cueNonce + 1 : state.cueNonce;

  let cuedKey: RestIntervalKey | null;
  if (result.action === "cue") {
    cuedKey = action.key;
  } else if (sameRestKey(result.state.key, state.key)) {
    cuedKey = state.cuedKey;
  } else {
    cuedKey = null;
  }

  if (
    cueNonce === state.cueNonce &&
    result.state.key === state.key &&
    result.state.armed === state.armed &&
    result.state.consumed === state.consumed &&
    cuedKey === state.cuedKey
  ) {
    return state;
  }
  return {
    key: result.state.key,
    armed: result.state.armed,
    consumed: result.state.consumed,
    cueNonce,
    cuedKey,
  };
}

export function computeRestObservation(
  workoutId: number,
  exercisePosition: number,
  exercise: WorkoutExerciseSnapshot | undefined,
  currentSet: WorkoutPlannedSetSnapshot | null | undefined,
  serverNow: string,
  clientReceivedAt: number,
  nowMs: number = Date.now(),
): RestObservation | null {
  if (!exercise || !currentSet) return null;
  const serverTime = new Date(serverNow).getTime();
  if (!Number.isFinite(serverTime)) return null;
  const estimatedServerNowMs = serverTime + (nowMs - clientReceivedAt);

  const previousSet = exercise.planned_sets[currentSet.position - 2];
  if (!previousSet?.performance || previousSet.rest_after_set_seconds == null) return null;
  const previousCompletedAtMs = new Date(previousSet.performance.completed_at).getTime();
  if (!Number.isFinite(previousCompletedAtMs)) return null;

  const restSeconds = previousSet.rest_after_set_seconds;
  const targetMs = previousCompletedAtMs + restSeconds * 1000;
  const remainingMs = targetMs - estimatedServerNowMs;

  const key: RestIntervalKey = {
    workout_id: workoutId,
    exercise_position: exercisePosition,
    current_set_position: currentSet.position,
    previous_set_position: previousSet.position,
    previous_completed_at_ms: previousCompletedAtMs,
    rest_after_set_seconds: restSeconds,
  };

  const remaining = Math.ceil(remainingMs / 1000);
  if (remaining > 0) {
    return { key, remaining_ms: remainingMs, seconds: remaining, overtime: false };
  }
  return {
    key,
    remaining_ms: remainingMs,
    seconds: Math.max(0, Math.floor((estimatedServerNowMs - targetMs) / 1000)),
    overtime: true,
  };
}
