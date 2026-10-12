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

import type {
  CourseEnrollmentDto,
  MemberPackageDto,
  Paged,
} from "@/lib/types";

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

  const tx = (
    vietnamese: string,
    english: string,
  ) => (vi ? vietnamese : english);

  const now = useNow();

  const [picked, setPicked] =
    useState<Row | null>(null);

  const enrollments = useApi(
    async (signal) =>
      pagedItems(
        await api.get<
          Paged<CourseEnrollmentDto>
        >(
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

  const membershipRows: Row[] =
    packages
      .filter(
        (p) =>
          p.status === "ACTIVE" &&
          !!p.invoiceItemId,
      )
      .map((p) => ({
        id: `gym:${p.memberPackageId}`,

        type: "membership" as const,

        title: p.packageName,

        detail:
          `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`,

        label: tx(
          "Hủy gói & hoàn điểm",
          "Cancel membership & refund points",
        ),

        target: {
          kind: "gym" as const,
          name: p.packageName,
          itemId:
            p.invoiceItemId ?? null,
          endDate: p.endDate,
        },
      }));

  const classRows: Row[] =
    (enrollments.data ?? [])
      .filter(
        (e) =>
          e.status === "CONFIRMED" &&
          !!e.invoiceItemId &&
          ![
            "COMPLETED",
            "CANCELLED",
          ].includes(e.classStatus),
      )
      .map((e) => {
        const started =
          !!e.firstSessionStartUtc &&
          new Date(
            e.firstSessionStartUtc,
          ).getTime() <= now;

        return {
          id:
            `class:${e.enrollmentId}`,

          type: "class" as const,

          title: e.className,

          detail: tx(
            `Buổi đầu ${formatDate(e.firstSessionStartUtc)}`,
            `First session ${formatDate(e.firstSessionStartUtc)}`,
          ),

          label: started
            ? tx(
                "Gửi yêu cầu hoàn",
                "Send refund request",
              )
            : tx(
                "Hủy lớp & hoàn điểm",
                "Cancel class & refund points",
              ),

          target: {
            kind: "class" as const,
            name: e.className,
            itemId:
              e.invoiceItemId,
            firstSessionStartUtc:
              e.firstSessionStartUtc,
            started,
          },
        };
      });

  if (
    !membershipRows.length &&
    !classRows.length
  ) {
    return null;
  }

  return (
    <div>
      {membershipRows.length > 0 && (
        <section
          className={styles.panel}
          aria-label={tx(
            "Quản lý Membership",
            "Membership management",
          )}
        >
          <h3>
            {tx(
              "Quản lý Membership",
              "Membership management",
            )}
          </h3>

          <p className="small muted">
            {tx(
              "Hủy Membership hợp lệ sẽ hoàn điểm vào ví hội viên theo chính sách hệ thống. Không hoàn tiền mặt.",
              "Eligible membership cancellations refund wallet points according to system policy. Cash refunds are not used.",
            )}
          </p>

          <ul>
            {membershipRows.map(
              (row) => (
                <li key={row.id}>
                  <div>
                    <strong>
                      {row.title}
                    </strong>

                    <span>
                      {row.detail}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={() =>
                      setPicked(row)
                    }
                  >
                    {row.label}
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {classRows.length > 0 && (
        <section
          className={styles.panel}
          aria-label={tx(
            "Quản lý lớp đã đăng ký",
            "Class cancellation",
          )}
        >
          <h3>
            {tx(
              "Lớp đã đăng ký",
              "Registered classes",
            )}
          </h3>

          <ul>
            {classRows.map(
              (row) => (
                <li key={row.id}>
                  <div>
                    <strong>
                      {row.title}
                    </strong>

                    <span>
                      {row.detail}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() =>
                      setPicked(row)
                    }
                  >
                    {row.label}
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {picked && (
        <RefundCancelDialog
          target={picked.target}
          onBehalf
          onClose={() =>
            setPicked(null)
          }
          onDone={() => {
            enrollments.reload();
            onChanged();
          }}
        />
      )}
    </div>
  );
}