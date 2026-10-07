import { redirect } from "next/navigation";

/** Tuyến cũ: đăng ký khóa nay là tab Khóa học nhóm của Bán dịch vụ. Giữ bookmark. */
export default function Page() {
  redirect("/receptionist/sales?tab=courses");
}
