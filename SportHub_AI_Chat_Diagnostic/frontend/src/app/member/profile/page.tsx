import { redirect } from "next/navigation";

// The fitness profile lives in the Training workspace; keep the old URL working.
export default function Page() {
  redirect("/member/training?tab=profile");
}
