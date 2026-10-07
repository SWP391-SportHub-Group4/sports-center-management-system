import { redirect } from "next/navigation";

/** Tuyến cũ: hồ sơ tập nay là tab Hồ sơ của Tập luyện. Giữ bookmark. */
export default function Page() {
  redirect("/member/training?tab=profile");
}
