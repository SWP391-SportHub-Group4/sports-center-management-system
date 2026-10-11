import {
  redirectMemberPage,
  type MemberSearchParams,
} from "@/lib/member-route-redirect";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ rentalId: string }>;
  searchParams: MemberSearchParams;
}) {
  const { rentalId } = await params;
  return redirectMemberPage(searchParams, "/member/schedule", {
    rental: rentalId,
  });
}
