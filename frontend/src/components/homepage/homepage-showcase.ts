import {
  homepageCategories,
  type ShowcaseItem,
  type CoachImageFrame,
} from "./homepage-content";
import { DEFAULT_AVATAR } from "@/lib/avatar";

export interface HomepageCoach {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  sportIds: number[];
  sportNames?: string[];
}
export interface HomepageOverview {
  coachCount: number;
  memberCount: number;
  facilityCount: number;
  facilities: {
    roomId: number;
    name: string;
    roomTypeId: number | null;
    capacity: number;
  }[];
}
export interface HomepageShowcaseSources {
  coaches: HomepageCoach[];
  overview: HomepageOverview;
}

export const FEATURED_COACH_IDS = "bookmarks.coachIds";
export function coachFramePrefix(coachId: string) {
  return `bookmarks.coachFrame.${coachId.replaceAll("-", "").toLowerCase()}`;
}
export function readCoachFrame(
  values: Record<string, string>,
  coachId: string,
): CoachImageFrame {
  const prefix = coachFramePrefix(coachId);
  const numeric = (key: string, fallback: number, min: number, max: number) => {
    const value = values[`${prefix}.${key}`];
    const parsed = value === undefined ? fallback : Number(value);
    return Number.isFinite(parsed)
      ? Math.max(min, Math.min(max, parsed))
      : fallback;
  };
  return {
    fit: values[`${prefix}.fit`] === "cover" ? "cover" : "contain",
    x: numeric("x", 50, 0, 100),
    y: numeric("y", 50, 0, 100),
    zoom: numeric("zoom", 1, 1, 2),
  };
}
export function featuredCoachIds(
  values: Record<string, string>,
): string[] | null {
  return values[FEATURED_COACH_IDS] === undefined
    ? null
    : values[FEATURED_COACH_IDS].split(",").filter(Boolean);
}
export function suggestHomepageCoaches(
  coaches: HomepageCoach[],
): HomepageCoach[] {
  return [...coaches]
    .sort(
      (a, b) =>
        Number(!!b.avatarUrl?.trim()) - Number(!!a.avatarUrl?.trim()) ||
        a.fullName.localeCompare(b.fullName) ||
        a.userId.localeCompare(b.userId),
    )
    .slice(0, 3);
}
export function coachSportsLabel(coach: HomepageCoach): string {
  return coach.sportNames?.length
    ? coach.sportNames.join(" · ")
    : coach.sportIds
        .map((id) => ({ 1: "Gym", 3: "Badminton", 4: "Basketball" })[id])
        .filter(Boolean)
        .join(" · ") || "Coach";
}
const facilityRoomTypes = [1, 3, 4];

/** The homepage and Media editor must resolve the same live defaults before applying editorial overrides. */
export function resolveHomepageShowcase(
  coaches: HomepageCoach[] | null,
  overview: HomepageOverview | null,
  selectedCoachIds?: string[] | null,
  frameValues: Record<string, string> = {},
) {
  const selected =
    selectedCoachIds == null
      ? suggestHomepageCoaches(coaches ?? [])
      : selectedCoachIds
          .flatMap((id) => {
            const coach = coaches?.find(
              (entry) => entry.userId.toLowerCase() === id.toLowerCase(),
            );
            return coach ? [coach] : [];
          })
          .slice(0, 3);
  const showcase: ShowcaseItem[] = selected.map((coach) => {
    const sports = coachSportsLabel(coach);
    return {
      name: { en: coach.fullName, vi: coach.fullName },
      detail: { en: sports, vi: sports },
      highlight: {
        en: "SportHub coach",
        vi: "SportHub coach",
      },
      image: coach.avatarUrl || DEFAULT_AVATAR,
      frame: readCoachFrame(frameValues, coach.userId),
      alt: {
        en: `Portrait of coach ${coach.fullName}`,
        vi: `Chân dung minh họa huấn luyện viên ${coach.fullName}`,
      },
    };
  });
  return homepageCategories.map((category) => ({
    ...category,
    value: overview
      ? category.id === "coaches"
        ? overview.coachCount
        : category.id === "facilities"
          ? overview.facilityCount
          : overview.memberCount
      : null,
    items:
      category.id === "coaches"
        ? showcase
        : category.id === "facilities"
          ? category.items.map((item, index) => {
              const room = overview?.facilities.find(
                (facility) => facility.roomTypeId === facilityRoomTypes[index],
              );
              return room
                ? {
                    ...item,
                    detail: { en: room.name, vi: room.name },
                    highlight: {
                      en: `Capacity: ${room.capacity}`,
                      vi: `Capacity: ${room.capacity}`,
                    },
                  }
                : item;
            })
          : category.items,
  }));
}
