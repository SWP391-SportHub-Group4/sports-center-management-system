"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MemberShell } from "@/components/MemberShell";
import { CourseDetail } from "@/features/courses/catalog";
import { useLanguage } from "@/lib/language";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  return (
    <MemberShell title={t.memberPages.discover}>
      <Link href="/member/discover">{t.memberDashboardV2.backDiscover}</Link>
      <CourseDetail key={id} classId={Number(id)} />
    </MemberShell>
  );
}
