import { useEffect } from "react";

// F26.1 — Active Workout Screen Wake Lock.
//
// Keep the browser boundary behind a tiny controller so unsupported APIs,
// permission denials, and platform revocation never affect workout state.

export interface WorkoutWakeLockSentinel {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void, options?: { once?: boolean }): void;
}

export interface WorkoutWakeLockEnvironment {
  isVisible(): boolean;
  request(): Promise<WorkoutWakeLockSentinel>;
  onVisibilityChange(listener: () => void): () => void;
  onInteraction(listener: () => void): () => void;
}

function releaseSafely(sentinel: WorkoutWakeLockSentinel): void {
  try {
    void sentinel.release().catch(() => {});
  } catch {
    // A release failure cannot leak into navigation or workout completion.
  }
}

function browserEnvironment(): WorkoutWakeLockEnvironment | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (!("wakeLock" in navigator)) return null;

  return {
    isVisible: () => document.visibilityState === "visible",
    request: () => navigator.wakeLock.request("screen"),
    onVisibilityChange: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
    onInteraction: (listener) => {
      document.addEventListener("pointerdown", listener, true);
      document.addEventListener("keydown", listener, true);
      return () => {
        document.removeEventListener("pointerdown", listener, true);
        document.removeEventListener("keydown", listener, true);
      };
    },
  };
}

export function startWorkoutWakeLockSession(environment: WorkoutWakeLockEnvironment): () => void {
  let active = true;
  let sentinel: WorkoutWakeLockSentinel | null = null;
  let requestInFlight = false;

  const request = () => {
    if (!active || sentinel !== null || requestInFlight || !environment.isVisible()) return;
    requestInFlight = true;
    let attempt: Promise<WorkoutWakeLockSentinel>;
    try {
      attempt = environment.request();
    } catch {
      requestInFlight = false;
      return;
    }
    void attempt
      .then((nextSentinel) => {
        if (!active) {
          releaseSafely(nextSentinel);
          return;
        }
        if (nextSentinel.released) return;
        sentinel = nextSentinel;
        nextSentinel.addEventListener(
          "release",
          () => {
            if (sentinel === nextSentinel) sentinel = null;
          },
          { once: true },
        );
      })
      .catch(() => {
        // Unsupported or denied wake locks must never disrupt workout use.
      })
      .finally(() => {
        requestInFlight = false;
      });
  };

  const removeVisibilityListener = environment.onVisibilityChange(() => {
    if (environment.isVisible()) request();
  });
  // Safari may require a fresh user activation. Retrying only on a real
  // interaction is bounded and avoids a background retry loop.
  const removeInteractionListener = environment.onInteraction(request);

  request();

  return () => {
    if (!active) return;
    active = false;
    removeVisibilityListener();
    removeInteractionListener();
    const heldSentinel = sentinel;
    sentinel = null;
    if (heldSentinel && !heldSentinel.released) {
      releaseSafely(heldSentinel);
    }
  };
}

export function useWorkoutWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const environment = browserEnvironment();
    if (!environment) return;
    return startWorkoutWakeLockSession(environment);
  }, [enabled]);
}
