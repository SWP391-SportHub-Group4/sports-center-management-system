"use client";

import { useSyncExternalStore } from "react";

const changeEvent = "sporthub:query-change";
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(changeEvent, listener);
  };
}
const getSnapshot = () => window.location.search;
const getServerSnapshot = () => "";

/** Read applied list state from the URL, including browser Back/Forward, without reloading. */
export function useUrlQuery(
  defaults: Readonly<Record<string, string>>,
  validators: Readonly<Record<string, (value: string) => string>> = {},
) {
  const search = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const params = new URLSearchParams(search);
  const values = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => {
      const value = params.get(key) ?? fallback;
      return [key, validators[key] ? validators[key](value) : value];
    }),
  );
  const setValues = (
    next: Record<string, string>,
    { replace = false } = {},
  ) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) {
      if (!(key in defaults)) continue;
      if (!value || value === defaults[key]) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    if (url.search === window.location.search) return;
    const href = `${url.pathname}${url.search}${url.hash}`;
    if (replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
    window.dispatchEvent(new Event(changeEvent));
  };
  return { values, setValues };
}

export const pageQuery = (value: string) =>
  /^[1-9]\d{0,5}$/.test(value) ? value : "1";
export const choiceQuery =
  (options: readonly string[], fallback: string) => (value: string) =>
    options.includes(value) ? value : fallback;
