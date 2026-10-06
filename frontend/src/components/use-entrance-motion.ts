"use client";
import { useLayoutEffect, useRef } from "react";
import { motionMilliseconds } from "@/lib/content-motion";

/** Animate presentation only: never defer a selection or remount focused fields. */
export function useEntranceMotion(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!element || preference.matches || !element.animate) return;
    const style = getComputedStyle(element);
    const animation = element.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: motionMilliseconds(
          style.getPropertyValue("--duration-normal"),
        ),
        easing: style.getPropertyValue("--ease-out").trim(),
      },
    );
    const reduce = () => {
      if (preference.matches) animation.cancel();
    };
    preference.addEventListener("change", reduce);
    return () => {
      animation.cancel();
      preference.removeEventListener("change", reduce);
    };
  }, [key]);
  return ref;
}
