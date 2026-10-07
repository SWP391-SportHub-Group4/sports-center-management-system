"use client";
import { MemberShell } from "@/components/MemberShell";
import { CourseCatalog } from "@/features/courses/catalog";
import { useLanguage } from "@/lib/language";

export default function Page() {
  const { t } = useLanguage();
  return (
    <MemberShell
      title={t.memberPages.discover}
      description={t.mDiscover.description}
    >
      <CourseCatalog detailBasePath="/member/discover" />
    </MemberShell>
  );
}
