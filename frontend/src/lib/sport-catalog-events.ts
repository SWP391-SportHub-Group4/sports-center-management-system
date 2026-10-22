export const SPORT_CATALOG_CHANGED = "sporthub:sport-catalog-changed";

/** Notify the current view and other same-origin tabs after a successful catalog mutation. */
export function notifySportCatalogChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SPORT_CATALOG_CHANGED));
  try {
    localStorage.setItem(
      SPORT_CATALOG_CHANGED,
      `${Date.now()}:${Math.random()}`,
    );
  } catch {
    // Focus refresh and visible-page polling also cover browsers with blocked storage.
  }
}
