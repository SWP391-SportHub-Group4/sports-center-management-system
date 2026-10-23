import {
  FEATURED_COACH_IDS,
  suggestHomepageCoaches,
  type HomepageCoach,
} from "@/components/homepage/homepage-showcase";
import { originalHeroBackground } from "@/components/homepage/hero-background";

/**
 * Restore the built-in landing page from main (9c695b74), with the Gym label.
 * An absent override uses the same original copy/image in Media and the public
 * page, including each language's own copy. Never reuse a published Media draft
 * as the original. Sports and coach profiles remain owned by their catalogs.
 */
export function restoreMediaBaseline(
  coaches: HomepageCoach[],
): Record<string, string> {
  const ids = suggestHomepageCoaches(coaches).map((coach) => coach.userId);
  // The publishing API requires three eligible coach IDs; everything else
  // falls back to the original shared defaults rather than a database snapshot.
  return { [FEATURED_COACH_IDS]: ids.join(","), ...originalHeroBackground };
}
