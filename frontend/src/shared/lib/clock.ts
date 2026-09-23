"use client";

import { useSyncExternalStore } from "react";

let currentTime = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      currentTime = Date.now();
      listeners.forEach((notify) => notify());
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  return currentTime;
}

export function useCurrentTime() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
