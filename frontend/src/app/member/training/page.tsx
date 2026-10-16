import { redirect } from "next/navigation";

/** Preserve old bookmarks after removing the Training workspace. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  redirect(tab === "profile" ? "/member/profile" : "/member/schedule");
}
