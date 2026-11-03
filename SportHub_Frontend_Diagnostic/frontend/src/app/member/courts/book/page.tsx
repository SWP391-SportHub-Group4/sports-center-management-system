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
    "/member/services",
    { section: "courts", view: "explore" },
    false,
  );
}
