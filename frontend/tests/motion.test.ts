import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createContentMotion,
  motionMilliseconds,
} from "../src/lib/content-motion.ts";

function fixture(
  appearance = () => ({ opacity: "1", transform: "translateY(0)" }),
) {
  let reduced = false;
  let naturalHeight = 200;
  const animations: {
    finished: Promise<void>;
    finish: () => void;
    cancel: () => void;
    frames: Keyframe[];
    options: KeyframeAnimationOptions;
  }[] = [];
  const animate = (frames: Keyframe[], options: KeyframeAnimationOptions) => {
    let finish!: () => void;
    let reject!: (reason?: unknown) => void;
    const finished = new Promise<void>((resolve, fail) => {
      finish = resolve;
      reject = fail;
    });
    const item = {
      finished,
      finish,
      cancel: () => reject(new Error("cancelled")),
      frames,
      options,
    };
    animations.push(item);
    return item as unknown as Animation;
  };
  const style: Record<string, unknown> = {
    removeProperty(name: string) {
      delete style[name];
    },
  };
  const content = {
    inert: false,
    animate,
    getBoundingClientRect: () => ({ height: naturalHeight }),
  };
  const element = {
    style,
    firstElementChild: content,
    dataset: {} as Record<string, string>,
    removeAttribute: () => {
      delete element.dataset.transitioning;
    },
    getBoundingClientRect: () => ({
      height: Number.parseFloat(String(style.height)) || naturalHeight,
    }),
    animate,
  };
  const motion = createContentMotion(
    () => element as unknown as HTMLElement,
    (change) => change(),
    () => reduced,
    () => ({ fast: 180, normal: 260, easing: "cubic-bezier(.16,1,.3,1)" }),
    appearance,
  );
  return {
    motion,
    animations,
    element,
    content,
    setReduced: (value: boolean) => {
      reduced = value;
    },
    height: (value: number) => {
      naturalHeight = value;
    },
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("view exit precedes commit, height interpolates, and temporary styles are removed", async () => {
  const f = fixture();
  let commits = 0;
  const done = f.motion.change(() => {
    commits++;
    f.height(380);
  });
  assert.equal(commits, 0);
  assert.equal(f.content.inert, true);
  assert.equal(f.animations[0].options.duration, 80);
  f.animations[0].finish();
  await flush();
  assert.equal(commits, 1);
  assert.equal(f.content.inert, false);
  assert.deepEqual(f.animations[1].frames, [
    { height: "200px" },
    { height: "380px" },
  ]);
  assert.equal(f.animations[2].frames[0].transform, "translateY(8px)");
  assert.equal(f.animations[2].options.duration, 180);
  f.animations[1].finish();
  f.animations[2].finish();
  await done;
  assert.equal(f.element.style.height, undefined);
  assert.equal(f.element.style.overflow, undefined);
  assert.equal(f.element.dataset.transitioning, undefined);
});

test("rapid requests commit only the latest target instead of replaying a queue", async () => {
  const f = fixture();
  const commits: string[] = [];
  const stale = f.motion.change(() => commits.push("stale"));
  const latest = f.motion.change(() => commits.push("latest"));
  f.animations[1].finish();
  await flush();
  assert.deepEqual(commits, ["latest"]);
  f.animations[2].finish();
  f.animations[3].finish();
  await Promise.all([stale, latest]);
  assert.equal(f.content.inert, false);
});

test("reduced motion commits synchronously without animation or fixed height", async () => {
  const f = fixture();
  f.setReduced(true);
  let changed = false;
  const done = f.motion.change(() => {
    changed = true;
  });
  assert.equal(changed, true);
  await done;
  assert.equal(f.animations.length, 0);
  assert.equal(f.element.style.height, undefined);
});

test("enabling reduced motion mid-exit finishes directly and skips entrance", async () => {
  const f = fixture();
  let changed = false;
  const done = f.motion.change(() => {
    changed = true;
  });
  f.setReduced(true);
  f.motion.finish();
  await done;
  assert.equal(changed, true);
  assert.equal(f.animations.length, 1);
  assert.equal(f.content.inert, false);
  assert.equal(f.element.style.height, undefined);
});

test("unmount cancellation prevents a deferred state commit and restores interaction", async () => {
  const f = fixture();
  let changed = false;
  const done = f.motion.change(() => {
    changed = true;
  }, -1);
  assert.equal(f.animations[0].frames[1].transform, "translateY(4px)");
  f.motion.cancel();
  await done;
  assert.equal(changed, false);
  assert.equal(f.content.inert, false);
  assert.equal(f.element.style.height, undefined);
});

test("compiled CSS seconds and authored milliseconds resolve to identical durations", () => {
  assert.equal(motionMilliseconds("180ms"), 180);
  assert.equal(motionMilliseconds(".18s"), 180);
  assert.equal(motionMilliseconds(" 0.26s "), 260);
  assert.equal(motionMilliseconds("0ms"), 0);
  assert.equal(motionMilliseconds(""), 0);
});

test("an interrupted view resumes from its current visual frame without snapping to opaque", async () => {
  const f = fixture(() => ({
    opacity: "0.4",
    transform: "matrix(1, 0, 0, 1, 0, 3)",
  }));
  const done = f.motion.change(() => {});
  assert.deepEqual(f.animations[0].frames[0], {
    opacity: "0.4",
    transform: "matrix(1, 0, 0, 1, 0, 3)",
  });
  f.motion.cancel();
  await done;
});
