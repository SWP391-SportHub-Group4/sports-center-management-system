import {
  redirectMemberPage,
  type MemberSearchParams,
} from "@/lib/member-route-redirect";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ responseId: string }>;
  searchParams: MemberSearchParams;
}) {
  const { responseId } = await params;
  return redirectMemberPage(searchParams, "/member/services", {
    section: "courses",
    view: "owned",
    responseId,
  });
}
