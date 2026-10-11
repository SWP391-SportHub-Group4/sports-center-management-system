import { redirect } from "next/navigation";

/** Tuyến cũ: hoàn điểm nay là tab của Tài chính. Giữ bookmark. */
export default function Page() {
  redirect("/manager/finance?tab=refunds");
}
