"use client";
import { MemberShell } from "@/components/MemberShell";
import { CourseCatalog } from "@/features/courses/catalog";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import type { CourseMemberSessionDto } from "@/lib/types";
import { Card, StatusChip } from "@/components/ui";
export default function Page() {
  const { t } = useLanguage();
  const state = useApi(
    (signal) =>
      api.get<CourseMemberSessionDto[]>("/api/members/me/schedule", { signal }),
    [],
  );
  return (
    <MemberShell title={t.refactor.courses}>
      <Card title={t.refactor.schedule}>
        {state.loading ? (
          <p>{t.refactor.loading}</p>
        ) : state.error ? (
          <p role="alert">{state.error.message}</p>
        ) : !state.data?.length ? (
          <p>{t.refactor.empty}</p>
        ) : (
          <ul>
            {state.data.map((s) => (
              <li key={s.sessionId}>
                {s.className} · {s.sportName} · {formatDateTime(s.startAtUtc)} ·{" "}
                {s.roomName} · <StatusChip value={s.status} /> ·{" "}
                <StatusChip value={s.attendanceStatus} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CourseCatalog />
    </MemberShell>
  );
}
