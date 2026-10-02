"use client";
import { CourseCatalog } from "@/features/courses/catalog";
import { PublicHeader } from "../public-header";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { t } = useLanguage();
  return (
    <>
      <PublicHeader />
      <main className="refactor-public">
        <h1>{t.refactor.courses}</h1>
        <CourseCatalog />
      </main>
    </>
  );
}
