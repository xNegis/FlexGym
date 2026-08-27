import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RestIntervalKey, RestObservation } from "./restCue.ts";
import {
  RestCueDeliveryController,
  restCueDeliveryIdentifier,
  type RestCueDeliveryAdapter,
  type RestCueDeliveryTarget,
} from "./restCueDelivery.ts";

const KEY: RestIntervalKey = {
  workout_id: 7,
  exercise_position: 2,
  current_set_position: 3,
  previous_set_position: 2,
  previous_completed_at_ms: 1_700_000_000_000,
  rest_after_set_seconds: 90,
};

function observation(remainingMs: number, key: RestIntervalKey = KEY): RestObservation {
  return {
    key,
    remaining_ms: remainingMs,
    seconds: Math.ceil(Math.abs(remainingMs) / 1000),
    overtime: remainingMs <= 0,
  };
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

class FakeAdapter implements RestCueDeliveryAdapter {
  readonly scheduled: RestCueDeliveryTarget[] = [];
  readonly cancelled: string[] = [];
  readonly played: string[] = [];
  scheduleResult: Promise<boolean> = Promise.resolve(true);

  schedule(target: RestCueDeliveryTarget): Promise<boolean> {
    this.scheduled.push(target);
    return this.scheduleResult;
  }

  async cancel(identifier: string): Promise<void> {
    this.cancelled.push(identifier);
  }

  async play(identifier: string): Promise<void> {
    this.played.push(identifier);
  }
}

describe("RestCueDeliveryController", () => {
  it("builds a stable identifier from the complete rest identity", () => {
    assert.equal(restCueDeliveryIdentifier(KEY), "formcadence-rest-7-2-3-2-1700000000000-90");
  });

  it("schedules one positive interval despite repeated timer observations", async () => {
    const adapter = new FakeAdapter();
    const controller = new RestCueDeliveryController(adapter);

    controller.sync(observation(75_000));
    controller.sync(observation(74_000));
    await flushPromises();

    assert.deepEqual(adapter.scheduled, [
      { identifier: restCueDeliveryIdentifier(KEY), delayMs: 75_000 },
    ]);
    assert.deepEqual(adapter.cancelled, []);
  });

  it("does not schedule a fresh zero, overtime, or absent interval", () => {
    const adapter = new FakeAdapter();
    const controller = new RestCueDeliveryController(adapter);

    controller.sync(observation(0));
    controller.sync(observation(-5_000));
    controller.sync(null);

    assert.deepEqual(adapter.scheduled, []);
  });

  it("cancels the previous request when identity changes or eligibility ends", async () => {
    const adapter = new FakeAdapter();
    const controller = new RestCueDeliveryController(adapter);
    const nextKey = { ...KEY, current_set_position: 4, previous_set_position: 3 };

    controller.sync(observation(60_000));
    await flushPromises();
    controller.sync(observation(45_000, nextKey));
    await flushPromises();
    controller.sync(null);
    await flushPromises();

    assert.deepEqual(adapter.cancelled, [
      restCueDeliveryIdentifier(KEY),
      restCueDeliveryIdentifier(nextKey),
    ]);
    assert.equal(adapter.scheduled.length, 2);
  });

  it("lets a scheduled native request own the crossing without direct playback", async () => {
    const adapter = new FakeAdapter();
    const controller = new RestCueDeliveryController(adapter);

    controller.sync(observation(2_000));
    await flushPromises();
    controller.sync(observation(-10));
    controller.cue(KEY);

    assert.deepEqual(adapter.played, []);
    assert.deepEqual(adapter.cancelled, []);
  });

  it("falls back to direct foreground playback when scheduling is unavailable", async () => {
    const adapter = new FakeAdapter();
    adapter.scheduleResult = Promise.resolve(false);
    const controller = new RestCueDeliveryController(adapter);

    controller.sync(observation(2_000));
    await flushPromises();
    controller.cue(KEY);
    await flushPromises();

    assert.deepEqual(adapter.played, [restCueDeliveryIdentifier(KEY)]);
    assert.deepEqual(adapter.cancelled, [restCueDeliveryIdentifier(KEY)]);
  });

  it("cancels a schedule that resolves after direct crossing fallback", async () => {
    let resolveSchedule!: (scheduled: boolean) => void;
    const adapter = new FakeAdapter();
    adapter.scheduleResult = new Promise<boolean>((resolve) => {
      resolveSchedule = resolve;
    });
    const controller = new RestCueDeliveryController(adapter);

    controller.sync(observation(500));
    controller.cue(KEY);
    resolveSchedule(true);
    await flushPromises();

    assert.deepEqual(adapter.played, [restCueDeliveryIdentifier(KEY)]);
    assert.deepEqual(adapter.cancelled, [
      restCueDeliveryIdentifier(KEY),
      restCueDeliveryIdentifier(KEY),
    ]);
  });

  it("cancels its owned request on disposal", async () => {
    const adapter = new FakeAdapter();
    const controller = new RestCueDeliveryController(adapter);

    controller.sync(observation(30_000));
    await flushPromises();
    controller.dispose();
    controller.cue(KEY);

    assert.deepEqual(adapter.cancelled, [restCueDeliveryIdentifier(KEY)]);
    assert.deepEqual(adapter.played, []);
  });
});
