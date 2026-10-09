import {
  redirectMemberPage,
  type MemberSearchParams,
} from "@/lib/member-route-redirect";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: MemberSearchParams;
}) {
  const { id } = await params;
  return redirectMemberPage(searchParams, `/member/services/courses/${id}`, {});
}
