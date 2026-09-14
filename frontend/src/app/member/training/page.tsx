import { Suspense } from "react";
import { MemberPage } from "@/application/member/pages";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Đang tải…</p>}>
      <MemberPage page="training" />
    </Suspense>
  );
}
