/** Crop and Media preview defaults; the public landing retains its original responsive frames. */
export const homepageImageSpecs = {
  coach: {
    id: "coach",
    ratio: "3 / 2",
    width: 1800,
    height: 1200,
    label: "Landscape · 3:2",
  },
  landscape: {
    id: "landscape",
    ratio: "3 / 2",
    width: 1800,
    height: 1200,
    label: "Landscape · 3:2",
  },
  booking: {
    id: "booking",
    ratio: "4 / 5",
    width: 1200,
    height: 1500,
    label: "Portrait · 4:5",
  },
} as const;
export type HomepageImageSpec =
  (typeof homepageImageSpecs)[keyof typeof homepageImageSpecs];
export function imageSpecForField(key: string) {
  return key.startsWith("booking.")
    ? homepageImageSpecs.booking
    : homepageImageSpecs.landscape;
}
