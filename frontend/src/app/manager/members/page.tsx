<<<<<<< Updated upstream
"use client";
import { AppShell } from "@/components/AppShell";
import { useLanguage } from "@/lib/language";
import { ManagerMemberList } from "@/features/coaching/manager-members";

=======
import { redirect } from "next/navigation";
>>>>>>> Stashed changes
export default function Page() {
  redirect("/manager/people?role=Member");
}
