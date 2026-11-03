import { validLandingImage } from "./landing-content-context";
import { HOMEPAGE_PLACEHOLDER } from "./image-placeholder";

export interface GallerySport {
  sportId: number;
  code: string;
  name: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

export const sportGalleryTitle = "Energy across every court";
const legacySports: Record<string, { index: number; image: string }> = {
  badminton: { index: 0, image: "/sporthub/court-volt/course-badminton.png" },
  basketball: { index: 1, image: "/sporthub/court-volt/course-basketball.png" },
  gym: { index: 2, image: "/sporthub/court-volt/program-gym.png" },
};
export const sportGalleryImageKey = (sportId: number) =>
  `gallery.sports.${sportId}.image`;

/** IDs own images; names always come from the catalog. Existing three sport images survive the upgrade. */
export function resolveSportGallery(
  sports: GallerySport[],
  values: Record<string, string>,
) {
  return [...sports]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.sportId - b.sportId)
    .map((sport) => {
      const legacy = legacySports[sport.code.toLowerCase()];
      const key = sportGalleryImageKey(sport.sportId);
      const original =
        sport.imageUrl && validLandingImage(sport.imageUrl)
          ? sport.imageUrl
          : (legacy?.image ?? HOMEPAGE_PLACEHOLDER);
      const candidates = [
        values[key],
        legacy ? values[`gallery.photos.${legacy.index}.src`] : undefined,
        original,
      ];
      return {
        ...sport,
        key,
        original,
        src:
          candidates.find(
            (value): value is string => !!value && validLandingImage(value),
          ) ?? HOMEPAGE_PLACEHOLDER,
      };
    });
}
