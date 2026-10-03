"use client";
import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { createContentMotion, motionMilliseconds } from "@/lib/content-motion";

/** A stable outer box plus one natural-height inner child. */
export function useContentMotion() {
  const ref = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createContentMotion> | null>(
    null,
  );
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = createContentMotion(
      () => ref.current,
      (change) => flushSync(change),
      () => preference.matches,
      (element) => {
        const style = getComputedStyle(element);
        return {
          fast: motionMilliseconds(style.getPropertyValue("--duration-fast")),
          normal: motionMilliseconds(
            style.getPropertyValue("--duration-normal"),
          ),
          easing: style.getPropertyValue("--ease-out").trim(),
        };
      },
      (element) => {
        const style = getComputedStyle(element);
        return { opacity: style.opacity, transform: style.transform };
      },
    );
    controller.current = motion;
    const finish = () => {
      if (preference.matches) motion.finish();
    };
    preference.addEventListener("change", finish);
    return () => {
      preference.removeEventListener("change", finish);
      motion.cancel();
      controller.current = null;
    };
  }, []);
  const transition = useCallback((change: () => void, direction = 1) => {
    if (controller.current) return controller.current.change(change, direction);
    flushSync(change);
    return Promise.resolve();
  }, []);
  return { ref, transition };
}
