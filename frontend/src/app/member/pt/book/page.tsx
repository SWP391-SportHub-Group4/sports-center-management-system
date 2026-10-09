import {
  redirectMemberPage,
  type MemberSearchParams,
} from "@/lib/member-route-redirect";

export default function Page({
  searchParams,
}: {
  searchParams: MemberSearchParams;
}) {
  return redirectMemberPage(
    searchParams,
    "/member/training",
    { tab: "book" },
    false,
  );
}
