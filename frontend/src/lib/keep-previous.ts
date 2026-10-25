import { useState } from "react";
import type { AsyncState } from "./useApi";

/**
 * `useApi` clears `data` on every reload. After a write the screen should keep showing what it had
 * until the fresh response arrives, so an open panel and its success notice do not disappear.
 */
export function useKeepPrevious<T>(state: AsyncState<T>): AsyncState<T> {
  const [shown, setShown] = useState<T | null>(state.data);
  if (state.data && state.data !== shown) setShown(state.data);
  return !state.data && state.loading && shown !== null && !state.error
    ? { ...state, data: shown, loading: false }
    : state;
}
