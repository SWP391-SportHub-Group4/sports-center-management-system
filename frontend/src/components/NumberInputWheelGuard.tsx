"use client";

import { useEffect } from "react";

/** Prevent accidental number edits without blurring the field or disabling keyboard controls. */
export function NumberInputWheelGuard() {
  useEffect(() => {
    const preventNumberStep = (event: WheelEvent) => {
      const input = event.target;
      if (
        !event.ctrlKey &&
        input instanceof HTMLInputElement &&
        input.type === "number" &&
        document.activeElement === input
      ) {
        event.preventDefault();
      }
    };

    document.addEventListener("wheel", preventNumberStep, {
      capture: true,
      passive: false,
    });
    return () => document.removeEventListener("wheel", preventNumberStep, true);
  }, []);

  return null;
}
