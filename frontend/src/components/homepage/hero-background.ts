/** Built-in media stays available independently of saved landing-page edits. */
export const originalHeroBackground = {
  "hero.background.webm": "/sporthub/hero/arena-loop.webm?v=2",
  "hero.background.mp4": "/sporthub/hero/arena-loop.mp4?v=2",
  "hero.background.image": "/sporthub/hero/arena-poster-v2.jpg",
} as const;

export const HERO_PLAYLIST = "hero.background.playlist";
export type HeroVideo = { url: string; poster: string; name: string };

function mediaUrl(value: string, preview: boolean) {
  if (
    preview &&
    typeof window !== "undefined" &&
    value.startsWith(`blob:${window.location.origin}/`)
  )
    return true;
  if (value.startsWith("/sporthub/"))
    return !value.includes("..") && !/[\\\x00-\x1f\x7f]/.test(value);
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function heroPlaylist(
  values: Record<string, string>,
  preview = false,
): HeroVideo[] {
  try {
    const list: unknown = JSON.parse(values[HERO_PLAYLIST] ?? "[]");
    if (!Array.isArray(list) || list.length > 3) return [];
    return list.every(
      (item) =>
        item &&
        typeof item.url === "string" &&
        typeof item.poster === "string" &&
        typeof item.name === "string" &&
        mediaUrl(item.url, preview) &&
        mediaUrl(item.poster, preview),
    )
      ? list
      : [];
  } catch {
    return [];
  }
}
