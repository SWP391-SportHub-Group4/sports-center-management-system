import baseline from "./media-restore-baseline.json";
import {
  FEATURED_COACH_IDS,
  featuredCoachIds,
  suggestHomepageCoaches,
  type HomepageCoach,
} from "@/components/homepage/homepage-showcase";

/** A fixed restore point, independent of subsequent Media publishes. Catalog names stay live. */
export function restoreMediaBaseline(
  current: Record<string, string>,
  coaches: HomepageCoach[],
): Record<string, string> {
  const available = new Set(coaches.map((coach) => coach.userId));
  const preferred = featuredCoachIds(baseline.values) ?? [];
  const ids = [
    ...new Set([
      ...preferred,
      ...(featuredCoachIds(current) ?? []),
      ...suggestHomepageCoaches(coaches).map((coach) => coach.userId),
    ]),
  ]
    .filter((id) => available.has(id))
    .slice(0, 3);
  // Locked copy is preserved; reset every image and legacy coach crop to the saved restore point.
  const copy = Object.fromEntries(
    Object.entries(current).filter(
      ([key]) =>
        !/\.(image|src)$/.test(key) &&
        key !== FEATURED_COACH_IDS &&
        !key.startsWith("bookmarks.coachFrame."),
    ),
  );
  return { ...copy, ...baseline.values, [FEATURED_COACH_IDS]: ids.join(",") };
}
