import { redirect } from "next/navigation";

/** Giữ bookmark cũ. */
export default function Page() {
  redirect("/manager/coaches");
}
