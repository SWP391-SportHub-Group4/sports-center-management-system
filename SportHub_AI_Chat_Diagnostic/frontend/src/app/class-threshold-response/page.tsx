"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  useEffect(() => {
    if (loading) return;
    const token = new URLSearchParams(window.location.search).get("token");
    const target = `/member/threshold${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    router.replace(user ? target : `/login?next=${encodeURIComponent(target)}`);
  }, [loading, user, router]);
  return <p>{t.refactor.loading}</p>;
}
