import {
  redirectMemberPage,
  type MemberSearchParams,
} from "@/lib/member-route-redirect";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: MemberSearchParams;
}) {
  const { classId } = await params;
  return redirectMemberPage(searchParams, "/member/schedule", {
    course: classId,
  });
}
