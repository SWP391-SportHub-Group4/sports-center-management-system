"use client";
import { MemberShell } from "@/components/MemberShell";
import { HelpCenter, type HelpTab } from "@/features/member/help-center";
import { useUrlQuery } from "@/lib/useUrlQuery";

/**
 * Trợ giúp của Member: tab "Send a request" gửi yêu cầu (`?topic=PAYMENT&invoiceId=` chọn sẵn loại và hóa đơn),
 * tab "My requests" (`?tab=requests&requestId=`) theo dõi tiến độ và xác nhận đã nhận tiền.
 */
export default function Page() {
  const { values, setValues } = useUrlQuery({
    topic: "",
    invoiceId: "",
    tab: "new",
    requestId: "",
  });
  const tab: HelpTab =
    values.tab === "requests" || values.requestId ? "requests" : "new";
  return (
    <MemberShell title="Help">
      <HelpCenter
        initialTopic={values.topic}
        invoiceId={values.invoiceId}
        tab={tab}
        requestId={values.requestId}
        onChange={(next) =>
          setValues({
            tab: next.tab,
            requestId: next.requestId,
            topic: "",
            invoiceId: "",
          })
        }
      />
    </MemberShell>
  );
}
