import { test } from "node:test";
import assert from "node:assert/strict";
import { watchProjects } from "../src/lib/project-polling.ts";
const tick = () => new Promise((resolve) => setImmediate(resolve));
function clock() {
  let callback: (() => void) | undefined;
  return {
    schedule(fn: () => void) {
      assert.equal(callback, undefined);
      callback = fn;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    cancel() {
      callback = undefined;
    },
    get pending() {
      return !!callback;
    },
    async fire() {
      const fn = callback;
      callback = undefined;
      fn?.();
      await tick();
    },
  };
}
for (const terminal of ["succeeded", "failed"]) {
  test(
    "page refresh resumes active polling and stops at " + terminal,
    async () => {
      const timer = clock();
      let state = "analyzing";
      let loads = 0;
      const received: string[] = [];
      const stop = watchProjects({
        ...timer,
        load: async () => {
          loads++;
          return [{ analysis: { state } }];
        },
        publish: (rows) => received.push(rows[0].analysis.state),
        error: () => assert.fail("unexpected error"),
      });
      await tick();
      assert.equal(timer.pending, true);
      state = terminal;
      await timer.fire();
      assert.deepEqual(received, ["analyzing", terminal]);
      assert.equal(timer.pending, false);
      assert.equal(loads, 2);
      stop();
    },
  );
}
test("deleting last active project ends polling", async () => {
  const timer = clock();
  let rows = [{ analysis: { state: "queued" } }];
  const stop = watchProjects({
    ...timer,
    load: async () => rows,
    publish() {},
    error() {},
  });
  await tick();
  rows = [];
  await timer.fire();
  assert.equal(timer.pending, false);
  stop();
});
test("project switch/unmount ignores stale pending responses", async () => {
  let resolve!: (rows: { analysis: { state: string } }[]) => void;
  const timer = clock();
  let updates = 0;
  const stop = watchProjects({
    ...timer,
    load: () =>
      new Promise<{ analysis: { state: string } }[]>((r) => {
        resolve = r;
      }),
    publish() {
      updates++;
    },
    error() {},
  });
  stop();
  resolve([{ analysis: { state: "analyzing" } }]);
  await tick();
  assert.equal(updates, 0);
  assert.equal(timer.pending, false);
});
test("network failures pause after three attempts without inventing an analyzing state", async () => {
  const timer = clock();
  const paused: boolean[] = [];
  const stop = watchProjects({
    ...timer,
    load: async () => {
      throw Error("offline");
    },
    publish() {
      assert.fail("no invented project state");
    },
    error: (_e, value) => paused.push(value),
  });
  await tick();
  await timer.fire();
  await timer.fire();
  assert.deepEqual(paused, [false, false, true]);
  assert.equal(timer.pending, false);
  stop();
});

test("focus revalidates terminal data without overlapping loads or perpetual polling", async () => {
  const target = new EventTarget();
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    value: target,
    configurable: true,
  });
  const timer = clock();
  let loads = 0;
  let finish!: (rows: { analysis: { state: string } }[]) => void;
  try {
    const stop = watchProjects({
      ...timer,
      load: () => {
        loads++;
        return new Promise<{ analysis: { state: string } }[]>((r) => {
          finish = r;
        });
      },
      publish() {},
      error() {
        assert.fail();
      },
    });
    target.dispatchEvent(new Event("focus"));
    assert.equal(loads, 1);
    finish([{ analysis: { state: "succeeded" } }]);
    await tick();
    assert.equal(timer.pending, false);
    target.dispatchEvent(new Event("focus"));
    target.dispatchEvent(new Event("focus"));
    assert.equal(loads, 2);
    finish([{ analysis: { state: "failed" } }]);
    await tick();
    assert.equal(timer.pending, false);
    stop();
    target.dispatchEvent(new Event("focus"));
    assert.equal(loads, 2);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
