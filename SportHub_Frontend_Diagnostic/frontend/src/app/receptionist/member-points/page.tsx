import { redirect } from "next/navigation";

/** Tuyến cũ: ví điểm nay là tab trong hồ sơ hội viên. Giữ bookmark. */
export default function Page() {
  redirect("/receptionist/members");
}
