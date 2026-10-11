import { redirect } from "next/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ memberId?: string }>;
}) {
  const { memberId } = await searchParams;
  redirect(
    memberId
      ? `/coach/members?memberId=${encodeURIComponent(memberId)}&tab=plan`
      : "/coach/members",
  );
}
