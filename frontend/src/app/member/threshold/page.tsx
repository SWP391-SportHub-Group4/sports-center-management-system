"use client";
import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { MemberShell } from "@/components/MemberShell";
import {
  ThresholdPanel,
  type ThresholdView,
} from "@/features/courses/threshold";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { t } = useLanguage();
  const { user, loading } = useAuth();
  const [link, setLink] = useState<{ token?: string; responseId?: string }>({});
  useEffect(() => {
    if (loading || !user) return;
    const q = new URLSearchParams(window.location.search);
    const token = q.get("token");
    const responseId = q.get("responseId");
    if (token || responseId)
      setTimeout(() => {
        setLink({
          token: token ?? undefined,
          responseId: responseId ?? undefined,
        });
        window.history.replaceState(null, "", window.location.pathname);
      }, 0);
  }, [loading, user]);
  const mine = useApi(
    (signal) =>
      api.get<ThresholdView[]>("/api/class-threshold-responses/mine", {
        signal,
      }),
    [],
  );
  return (
    <MemberShell title={t.refactor.threshold}>
      {link.token || link.responseId ? (
        <ThresholdPanel key={link.token ?? link.responseId} {...link} />
      ) : mine.loading ? (
        <p>{t.refactor.loading}</p>
      ) : mine.error ? (
        <p role="alert">{mine.error.message}</p>
      ) : !mine.data?.length ? (
        <p>{t.refactor.empty}</p>
      ) : (
        mine.data.map((r) => (
          <ThresholdPanel key={r.responseId} responseId={r.responseId} />
        ))
      )}
    </MemberShell>
  );
}
