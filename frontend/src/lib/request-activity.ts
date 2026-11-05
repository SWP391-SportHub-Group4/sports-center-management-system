/** A delayed, non-blocking activity signal for API consumers with their own loading copy. */
let pending = 0;
let visible = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function publish(value: boolean) {
  if (visible === value) return;
  visible = value;
  listeners.forEach((listener) => listener());
}

export function beginRequestActivity(): () => void {
  if (typeof window === "undefined") return () => undefined;
  pending += 1;
  if (pending === 1) timer = setTimeout(() => publish(true), 300);
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pending -= 1;
    if (pending === 0) {
      clearTimeout(timer);
      timer = undefined;
      publish(false);
    }
  };
}

export async function withRequestActivity<T>(
  work: () => Promise<T>,
): Promise<T> {
  const finish = beginRequestActivity();
  try {
    return await work();
  } finally {
    finish();
  }
}

export const subscribeToRequests = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const requestActivitySnapshot = () => visible;
export const serverActivitySnapshot = () => false;
