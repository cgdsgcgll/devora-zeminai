/** CSS compilation may normalize 180ms to .18s. WAAPI always expects milliseconds. */
export function motionMilliseconds(value: string) {
  const match = value.trim().match(/^(\d*\.?\d+)(ms|s)$/);
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : 0;
}

/** Interruptible view changes. Only the latest requested view may commit. */
export function createContentMotion(
  root: () => HTMLElement | null,
  commit: (change: () => void) => void,
  reduced: () => boolean,
  settings: (element: HTMLElement) => {
    fast: number;
    normal: number;
    easing: string;
  },
  appearance: (element: HTMLElement) => {
    opacity: string | number;
    transform: string;
  } = () => ({ opacity: 1, transform: "translateY(0)" }),
) {
  let generation = 0;
  let animations: Animation[] = [];
  let activeRoot: HTMLElement | null = null;
  let activeContent: HTMLElement | null = null;
  function clear() {
    for (const animation of animations) animation.cancel();
    animations = [];
    if (activeContent) activeContent.inert = false;
    if (activeRoot) {
      activeRoot.style.removeProperty("height");
      activeRoot.style.removeProperty("overflow");
      activeRoot.removeAttribute("data-transitioning");
    }
    activeRoot = activeContent = null;
  }
  return {
    cancel() {
      generation++;
      clear();
    },
    finish() {
      for (const animation of animations) animation.finish();
    },
    async change(update: () => void, direction = 1) {
      const ticket = ++generation;
      const element = root();
      const startHeight = element?.getBoundingClientRect().height ?? 0;
      const content = element?.firstElementChild as HTMLElement | null;
      const previousAppearance = content
        ? appearance(content)
        : { opacity: 1, transform: "translateY(0)" };
      clear();
      if (!element || !content || reduced() || !content.animate) {
        commit(update);
        return;
      }
      const motion = settings(element);
      activeRoot = element;
      activeContent = content;
      element.dataset.transitioning = "true";
      element.style.height = `${startHeight}px`;
      element.style.overflow = "clip";
      content.inert = true;
      const exit = content.animate(
        [
          previousAppearance,
          { opacity: 0, transform: `translateY(${-4 * direction}px)` },
        ],
        {
          duration: Math.max(0, motion.normal - motion.fast),
          easing: motion.easing,
          fill: "forwards",
        },
      );
      animations.push(exit);
      try {
        await exit.finished;
      } catch {
        /* Superseded or unmounted. */
      }
      if (ticket !== generation) return;
      exit.cancel();
      content.inert = false;
      commit(update);
      if (ticket !== generation) return;
      if (reduced()) {
        clear();
        return;
      }
      const endHeight = content.getBoundingClientRect().height;
      element.style.height = `${endHeight}px`;
      const resize = element.animate(
        [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
        { duration: motion.fast, easing: motion.easing },
      );
      const enter = content.animate(
        [
          { opacity: 0, transform: `translateY(${8 * direction}px)` },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: motion.fast, easing: motion.easing },
      );
      animations = [resize, enter];
      try {
        await Promise.all(animations.map((animation) => animation.finished));
      } catch {
        /* Latest interaction wins. */
      }
      if (ticket === generation) clear();
    },
  };
}
