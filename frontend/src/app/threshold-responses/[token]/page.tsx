"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  useEffect(() => {
    if (loading) return;
    const target = `/member/threshold?token=${encodeURIComponent(token)}`;
    router.replace(user ? target : `/login?next=${encodeURIComponent(target)}`);
  }, [user, loading, router, token]);
  return <p>{t.refactor.loading}</p>;
}
