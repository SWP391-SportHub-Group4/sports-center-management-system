"use client";

import { useState } from "react";
import {
  RefundCancelDialog,
  type RefundCancelTarget,
} from "@/features/payments";
import { api } from "@/lib/apiClient";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import { useApi, useNow } from "@/lib/useApi";
import type { CourseEnrollmentDto, MemberPackageDto, Paged } from "@/lib/types";
import styles from "./member-cancellations.module.css";

interface Row {
  id: string;
  title: string;
  detail: string;
  label: string;
  target: RefundCancelTarget;
}

/** Hủy thay hội viên ngay tại quầy: hiện mức hoàn trước khi xác nhận, hoàn chỉ bằng điểm. */
export function MemberCancellations({
  memberId,
  packages,
  onChanged,
}: {
  memberId: string;
  packages: MemberPackageDto[];
  onChanged: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const now = useNow();
  const [picked, setPicked] = useState<Row | null>(null);
  const enrollments = useApi(
    async (signal) =>
      pagedItems(
        await api.get<Paged<CourseEnrollmentDto>>(
          `/api/members/${memberId}/enrollments`,
          { signal, query: { page: 1, pageSize: 50 } },
        ),
      ),
    [memberId],
  );

  const rows: Row[] = [
    ...packages
      .filter((p) => p.status === "ACTIVE" && p.invoiceItemId)
      .map((p) => ({
        id: `gym:${p.memberPackageId}`,
        title: p.packageName,
        detail: `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`,
        label: tx("Hủy thay", "Cancel for member"),
        target: {
          kind: "gym" as const,
          name: p.packageName,
          itemId: p.invoiceItemId ?? null,
          endDate: p.endDate,
        },
      })),
    ...(enrollments.data ?? [])
      .filter(
        (e) =>
          e.status === "CONFIRMED" &&
          e.invoiceItemId &&
          !["COMPLETED", "CANCELLED"].includes(e.classStatus),
      )
      .map((e) => {
        const started =
          !!e.firstSessionStartUtc &&
          new Date(e.firstSessionStartUtc).getTime() <= now;
        return {
          id: `class:${e.enrollmentId}`,
          title: e.className,
          detail: tx(
            `Buổi đầu ${formatDate(e.firstSessionStartUtc)}`,
            `First session ${formatDate(e.firstSessionStartUtc)}`,
          ),
          label: started
            ? tx("Gửi đơn hoàn", "Send refund request")
            : tx("Hủy thay", "Cancel for member"),
          target: {
            kind: "class" as const,
            name: e.className,
            itemId: e.invoiceItemId,
            firstSessionStartUtc: e.firstSessionStartUtc,
            started,
          },
        };
      }),
  ];

  if (!rows.length) return null;
  return (
    <section
      className={styles.panel}
      aria-label={tx("Hủy thay hội viên", "Cancel for the member")}
    >
      <h3>{tx("Hủy thay hội viên", "Cancel for the member")}</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <div>
              <strong>{row.title}</strong>
              <span>{row.detail}</span>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setPicked(row)}
            >
              {row.label}
            </button>
          </li>
        ))}
      </ul>
      {picked && (
        <RefundCancelDialog
          target={picked.target}
          onBehalf
          onClose={() => setPicked(null)}
          onDone={() => {
            enrollments.reload();
            onChanged();
          }}
        />
      )}
    </section>
  );
}
