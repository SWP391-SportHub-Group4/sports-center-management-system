import { redirect } from "next/navigation";

/** Tuyến cũ: nay là tab của Huấn luyện cá nhân. Giữ bookmark. */
export default function Page() {
  redirect("/manager/pt?tab=relationships");
}
