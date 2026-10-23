"use client";
import { MemberShell } from "@/components/MemberShell";
import { HelpCenter } from "@/features/member/help-center";
import { useUrlQuery } from "@/lib/useUrlQuery";

/** Trợ giúp của Member: gửi mọi yêu cầu hỗ trợ (kể cả hoàn điểm); `?topic=PAYMENT` chọn sẵn loại. */
export default function Page() {
  const { values } = useUrlQuery({ topic: "" });
  return (
    <MemberShell title="Help">
      <HelpCenter initialTopic={values.topic} />
    </MemberShell>
  );
}
