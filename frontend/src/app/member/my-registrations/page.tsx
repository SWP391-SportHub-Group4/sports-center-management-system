"use client";
import { pagedItems } from "@/lib/paged";
import { useState } from "react";
import { MemberShell } from "@/components/MemberShell";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import type { Paged, CourseEnrollmentDto } from "@/lib/types";
import { Card, StatusChip } from "@/components/ui";
import { CourseSessions } from "@/features/courses/catalog";
import Link from "next/link";
export default function Page() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const state = useApi(
    (signal) =>
      api.get<Paged<CourseEnrollmentDto>>("/api/members/me/enrollments", {
        signal,
        query: { page, pageSize: 10 },
      }),
    [page],
  );
  return (
    <MemberShell title={t.nav.myRegistrations}>
      {state.loading ? (
        <p>{t.refactor.loading}</p>
      ) : state.error ? (
        <p role="alert">{state.error.message}</p>
      ) : !pagedItems(state.data).length ? (
        <p>{t.refactor.empty}</p>
      ) : (
        pagedItems(state.data).map((e) => (
          <Card key={e.enrollmentId} title={e.className}>
            <p>
              {e.sportName} · <StatusChip value={e.status} /> ·{" "}
              <StatusChip value={e.classStatus} />
            </p>
            <button onClick={() => setSelected(e.classId)}>
              {t.refactor.schedule}
            </button>
            <Link
              href={
                e.invoiceItemId
                  ? `/member/invoices?invoiceItemId=${e.invoiceItemId}`
                  : "/member/invoices"
              }
            >
              {t.refactor.invoices}
            </Link>
          </Card>
        ))
      )}
      {selected && <CourseSessions key={selected} classId={selected} mine />}
      <button disabled={page === 1} onClick={() => setPage(page - 1)}>
        {t.refactor.previous}
      </button>
      <button
        disabled={
          !state.data ||
          page * 10 >=
            (state.data.totalCount ?? pagedItems(state.data).length)
        }
        onClick={() => setPage(page + 1)}
      >
        {t.refactor.more}
      </button>
      <Link href="/member/threshold">{t.refactor.threshold}</Link>
    </MemberShell>
  );
}
