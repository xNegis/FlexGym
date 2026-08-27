import type { RestIntervalKey, RestObservation } from "./restCue";

export interface RestCueDeliveryTarget {
  identifier: string;
  delayMs: number;
}

export interface RestCueDeliveryAdapter {
  schedule(target: RestCueDeliveryTarget): Promise<boolean>;
  cancel(identifier: string): Promise<void>;
  play(identifier: string): Promise<void> | void;
}

type DeliveryStatus = "pending" | "scheduled" | "unavailable";

interface ActiveDelivery {
  identifier: string;
  status: DeliveryStatus;
  revision: number;
}

export function restCueDeliveryIdentifier(key: RestIntervalKey): string {
  return [
    "formcadence-rest",
    key.workout_id,
    key.exercise_position,
    key.current_set_position,
    key.previous_set_position,
    key.previous_completed_at_ms,
    key.rest_after_set_seconds,
  ].join("-");
}

function ignoreFailure(promise: Promise<unknown>): void {
  promise.catch(() => {});
}

/**
 * Owns the single native notification associated with the mounted execution
 * screen. The controller deliberately has no React or Capacitor dependency so
 * scheduling, cancellation, and async races can be tested in Node.
 */
export class RestCueDeliveryController {
  private active: ActiveDelivery | null = null;
  private revision = 0;
  private disposed = false;
  private readonly adapter: RestCueDeliveryAdapter;

  constructor(adapter: RestCueDeliveryAdapter) {
    this.adapter = adapter;
  }

  sync(observation: RestObservation | null): void {
    if (this.disposed) return;

    const nextIdentifier = observation ? restCueDeliveryIdentifier(observation.key) : null;
    if (this.active?.identifier === nextIdentifier) {
      // Keep ownership through the crossing. A successfully scheduled native
      // request remains the sole cue owner when JavaScript later observes zero.
      return;
    }

    this.clearActive();
    if (!observation || observation.remaining_ms <= 0) return;

    const revision = ++this.revision;
    const active: ActiveDelivery = {
      identifier: nextIdentifier!,
      status: "pending",
      revision,
    };
    this.active = active;

    let scheduleResult: Promise<boolean>;
    try {
      scheduleResult = this.adapter.schedule({
        identifier: active.identifier,
        delayMs: observation.remaining_ms,
      });
    } catch {
      active.status = "unavailable";
      return;
    }

    scheduleResult
      .then((scheduled) => {
        if (
          this.disposed ||
          this.active?.identifier !== active.identifier ||
          this.active.revision !== revision
        ) {
          if (scheduled) ignoreFailure(this.adapter.cancel(active.identifier));
          return;
        }
        this.active.status = scheduled ? "scheduled" : "unavailable";
      })
      .catch(() => {
        if (
          !this.disposed &&
          this.active?.identifier === active.identifier &&
          this.active.revision === revision
        ) {
          this.active.status = "unavailable";
        }
      });
  }

  cue(key: RestIntervalKey): void {
    if (this.disposed) return;
    const identifier = restCueDeliveryIdentifier(key);
    const active = this.active?.identifier === identifier ? this.active : null;

    if (active?.status === "scheduled") {
      // iOS delivers the request in every application state. Its foreground
      // handler plays the ducked cue, so direct playback would duplicate it.
      return;
    }

    if (active) this.clearActive();
    try {
      const result = this.adapter.play(identifier);
      if (result instanceof Promise) ignoreFailure(result);
    } catch {
      // Native audio remains supplemental to the visible completion state.
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearActive();
  }

  private clearActive(): void {
    const previous = this.active;
    this.active = null;
    this.revision += 1;
    if (previous) ignoreFailure(this.adapter.cancel(previous.identifier));
  }
}
