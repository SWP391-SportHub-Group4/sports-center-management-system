import { redirect } from "next/navigation";

/** Preserve old Training links while using one canonical schedule. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tab, ...values } = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  const target =
    (Array.isArray(tab) ? tab[0] : tab) === "profile"
      ? "/member/profile"
      : "/member/schedule";
  redirect(query.size ? `${target}?${query}` : target);
}
