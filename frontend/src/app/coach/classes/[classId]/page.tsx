import { CoachClassPage } from "@/features/coaching/coach-class-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ classId }, query] = await Promise.all([params, searchParams]);
  return (
    <CoachClassPage
      classId={Number(classId)}
      initialTab={query.tab === "plans" ? "plans" : "students"}
    />
  );
}
