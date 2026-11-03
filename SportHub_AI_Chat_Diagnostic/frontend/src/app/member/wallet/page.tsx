import { redirect } from "next/navigation";

/** Tuyến cũ: ví điểm nay là tab của Tài chính. Giữ bookmark. */
export default function Page() {
  redirect("/member/finance?tab=wallet");
}
