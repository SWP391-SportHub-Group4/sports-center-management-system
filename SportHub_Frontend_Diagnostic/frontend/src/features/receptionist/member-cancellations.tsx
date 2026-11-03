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
  type: "membership" | "class";
  target: RefundCancelTarget;
}

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

  const tx = (vietnamese: string, english: string) =>
    vi ? vietnamese : english;

  const now = useNow();

  const [picked, setPicked] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const enrollments = useApi(
    async (signal) =>
      pagedItems(
        await api.get<Paged<CourseEnrollmentDto>>(
          `/api/members/${memberId}/enrollments`,
          {
            signal,
            query: {
              page: 1,
              pageSize: 50,
            },
          },
        ),
      ),
    [memberId],
  );

  const membershipRows: Row[] = packages
    .filter((p) => p.status === "ACTIVE" && !!p.invoiceItemId)
    .map((p) => ({
      id: `gym:${p.memberPackageId}`,

      type: "membership" as const,

      title: p.packageName,

      detail: `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`,

      label: tx("Hủy gói (không hoàn)", "Cancel membership (no refund)"),

      target: {
        kind: "gym" as const,
        name: p.packageName,
        itemId: p.invoiceItemId ?? null,
        endDate: p.endDate,
      },
    }));

  const classRows: Row[] = (enrollments.data ?? [])
    .filter(
      (e) =>
        e.status === "CONFIRMED" &&
        !!e.invoiceItemId &&
        !["COMPLETED", "CANCELLED"].includes(e.classStatus),
    )
    .map((e) => {
      const started =
        !!e.firstSessionStartUtc &&
        new Date(e.firstSessionStartUtc).getTime() <= now;

      return {
        id: `class:${e.enrollmentId}`,

        type: "class" as const,

        title: e.className,

        detail: tx(
          `Buổi đầu ${formatDate(e.firstSessionStartUtc)}`,
          `First session ${formatDate(e.firstSessionStartUtc)}`,
        ),

        label: tx("Hủy lớp (không hoàn)", "Cancel class (no refund)"),

        target: {
          kind: "class" as const,
          name: e.className,
          itemId: e.invoiceItemId,
          firstSessionStartUtc: e.firstSessionStartUtc,
          started,
        },
      };
    });

  if (!membershipRows.length && !classRows.length && !notice) {
    return null;
  }

  return (
    <div>
      {notice && (
        <p className="alert alert--success" role="status">
          {notice}
        </p>
      )}
      {membershipRows.length > 0 && (
        <section
          className={styles.panel}
          aria-label={tx("Quản lý Membership", "Membership management")}
        >
          <h3>{tx("Quản lý Membership", "Membership management")}</h3>

          <ul>
            {membershipRows.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.title}</strong>

                  <span>{row.detail}</span>
                </div>

                <button
                  type="button"
                  className="btn btn--danger btn--sm"
                  onClick={() => {
                    setNotice(null);
                    setPicked(row);
                  }}
                >
                  {row.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {classRows.length > 0 && (
        <section
          className={styles.panel}
          aria-label={tx("Quản lý lớp đã đăng ký", "Class cancellation")}
        >
          <h3>{tx("Lớp đã đăng ký", "Registered classes")}</h3>

          <ul>
            {classRows.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.title}</strong>

                  <span>{row.detail}</span>
                </div>

                <button
                  type="button"
                  className={
                    row.target.kind === "class" && row.target.started
                      ? "btn btn--secondary btn--sm"
                      : "btn btn--danger btn--sm"
                  }
                  onClick={() => {
                    setNotice(null);
                    setPicked(row);
                  }}
                >
                  {row.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {picked && (
        <RefundCancelDialog
          target={picked.target}
          onBehalf
          onClose={() => setPicked(null)}
          onDone={(message) => {
            setNotice(message);
            setPicked(null);
            enrollments.reload();
            onChanged();
          }}
        />
      )}
    </div>
  );
}
