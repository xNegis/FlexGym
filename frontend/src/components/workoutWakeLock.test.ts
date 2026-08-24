import assert from "node:assert/strict";
import test from "node:test";
import {
  startWorkoutWakeLockSession,
  type WorkoutWakeLockEnvironment,
  type WorkoutWakeLockSentinel,
} from "./workoutWakeLock.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function createSentinel() {
  let releaseListener: (() => void) | null = null;
  let releaseCount = 0;
  const sentinel: WorkoutWakeLockSentinel = {
    released: false,
    async release() {
      releaseCount += 1;
    },
    addEventListener(_type, listener) {
      releaseListener = listener;
    },
  };
  return {
    sentinel,
    release: () => releaseListener?.(),
    releaseCount: () => releaseCount,
  };
}

function createEnvironment(request: WorkoutWakeLockEnvironment["request"]) {
  let visible = true;
  let visibilityListener: (() => void) | null = null;
  let interactionListener: (() => void) | null = null;
  const environment: WorkoutWakeLockEnvironment = {
    isVisible: () => visible,
    request,
    onVisibilityChange(listener) {
      visibilityListener = listener;
      return () => {
        visibilityListener = null;
      };
    },
    onInteraction(listener) {
      interactionListener = listener;
      return () => {
        interactionListener = null;
      };
    },
  };
  return {
    environment,
    setVisible(nextVisible: boolean) {
      visible = nextVisible;
      visibilityListener?.();
    },
    interact: () => interactionListener?.(),
    hasListeners: () => visibilityListener !== null && interactionListener !== null,
  };
}

test("acquires while active and releases on cleanup", async () => {
  const held = createSentinel();
  let requestCount = 0;
  const fixture = createEnvironment(async () => {
    requestCount += 1;
    return held.sentinel;
  });

  const stop = startWorkoutWakeLockSession(fixture.environment);
  await Promise.resolve();

  assert.equal(requestCount, 1);
  assert.equal(fixture.hasListeners(), true);
  stop();
  await Promise.resolve();
  assert.equal(held.releaseCount(), 1);
  assert.equal(fixture.hasListeners(), false);
});

test("retries a denied request only after a user interaction", async () => {
  const held = createSentinel();
  let requestCount = 0;
  const fixture = createEnvironment(async () => {
    requestCount += 1;
    if (requestCount === 1) throw new Error("denied");
    return held.sentinel;
  });

  const stop = startWorkoutWakeLockSession(fixture.environment);
  await flushPromises();
  assert.equal(requestCount, 1);

  fixture.interact();
  await flushPromises();
  assert.equal(requestCount, 2);
  stop();
});

test("isolates a synchronous platform request failure", () => {
  let requestCount = 0;
  const fixture = createEnvironment(() => {
    requestCount += 1;
    throw new Error("unsupported");
  });

  const stop = startWorkoutWakeLockSession(fixture.environment);
  assert.equal(requestCount, 1);
  assert.doesNotThrow(stop);
});

test("waits for visibility and reacquires after platform release", async () => {
  const first = createSentinel();
  const second = createSentinel();
  const sentinels = [first.sentinel, second.sentinel];
  let requestCount = 0;
  const fixture = createEnvironment(async () => sentinels[requestCount++]!);
  fixture.setVisible(false);

  const stop = startWorkoutWakeLockSession(fixture.environment);
  await Promise.resolve();
  assert.equal(requestCount, 0);

  fixture.setVisible(true);
  await flushPromises();
  assert.equal(requestCount, 1);

  first.release();
  fixture.interact();
  await flushPromises();
  assert.equal(requestCount, 2);
  stop();
});

test("releases a lock that resolves after the session already stopped", async () => {
  const pending = deferred<WorkoutWakeLockSentinel>();
  const held = createSentinel();
  const fixture = createEnvironment(() => pending.promise);

  const stop = startWorkoutWakeLockSession(fixture.environment);
  stop();
  pending.resolve(held.sentinel);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(held.releaseCount(), 1);
});
