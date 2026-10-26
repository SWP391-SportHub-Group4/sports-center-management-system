import { redirect } from "next/navigation";

export default function CoachChangeRequestsPage() {
  redirect("/coach/support?type=absence");
}
