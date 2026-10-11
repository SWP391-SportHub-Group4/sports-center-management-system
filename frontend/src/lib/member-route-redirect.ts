import { redirect } from "next/navigation";

export type MemberSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

/** Preserve old bookmarks and incoming notification links while consolidating member pages. */
export async function redirectMemberPage(
  searchParams: MemberSearchParams,
  path: string,
  defaults: Record<string, string>,
  mapTabToSection = false,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  if (mapTabToSection) {
    const tab = query.get("tab");
    if (tab && ["courses", "gym", "pt", "courts"].includes(tab))
      defaults.section = tab;
    query.delete("tab");
  }
  for (const [key, value] of Object.entries(defaults)) query.set(key, value);
  redirect(`${path}${query.size ? `?${query}` : ""}`);
}
