"use client";
import { ConfirmRecordAction } from "@/components/ConfirmRecordAction";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/apiClient";

import { Drawer, buttonClass } from "@/components/primitives";

import { StatusChip } from "@/components/ui";

import { formatDateTime } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { vietnamLocal } from "@/lib/vietnam-time";

import type {
  CourtScheduleEntryDto,
  CourtRentalDto,
  InvoiceDetailDto,
  Paged,
} from "@/lib/types";
import styles from "./CalendarEventDrawer.module.css";

export function CalendarEventDrawer({
  entry,
  roomName,
  affectedRoomNames,
  manager = false,
  coach = false,
  receptionist = false,
  onChanged,
  onClose,
  extraDetails,
  showParticipants = true,
}: {
  entry: CourtScheduleEntryDto;
  roomName?: string | null;
  affectedRoomNames?: string[];
  manager?: boolean;
  coach?: boolean;
  receptionist?: boolean;
  onChanged?: () => void;
  onClose: () => void;
  /** Optional role-specific content inside the same Manager drawer. */
  extraDetails?: ReactNode;
  /** Hide read-only participant summary when role-specific attendance is supplied. */
  showParticipants?: boolean;
}) {
  const { t, language } = useLanguage();
  const vi = language === "vi";

  const l = t.operations;
  const shared = t.calendar;

  const participants = entry.participants ?? [];
  const [rentalBusy, setRentalBusy] = useState(false);
  const [rentalError, setRentalError] = useState("");
  const rentalCheckout = useApi(
    async (signal) => {
      if (
        entry.sourceType !== "COURT_RENTAL" ||
        !entry.memberId ||
        (!manager && !receptionist)
      )
        return null;
      let rental: CourtRentalDto | undefined;
      if (manager) {
        let page = 1;
        while (true) {
          const result = await api.get<Paged<CourtRentalDto>>(
            `/api/manager/members/${entry.memberId}/court-rentals`,
            { signal, query: { page, pageSize: 100 } },
          );
          rental = result.items.find(
            (item) => item.courtRentalId === entry.sourceId,
          );
          if (
            rental ||
            !result.items.length ||
            page * result.pageSize >= result.totalCount
          )
            break;
          page++;
        }
      } else {
        const items = await api.get<CourtRentalDto[]>(
          `/api/members/${entry.memberId}/court-rentals`,
          {
            signal,
            query: { fromUtc: entry.startAtUtc, toUtc: entry.endAtUtc },
          },
        );
        rental = items.find((item) => item.courtRentalId === entry.sourceId);
      }
      return rental?.invoiceId
        ? api.get<InvoiceDetailDto>(`/api/invoices/${rental.invoiceId}`, {
            signal,
          })
        : null;
    },
    [
      entry.sourceId,
      entry.memberId,
      entry.sourceType,
      entry.status,
      entry.startAtUtc,
      entry.endAtUtc,
      manager,
      receptionist,
    ],
  );
  const cancellation = useApi(
    async (signal) => {
      if (entry.status !== "CANCELLED" || entry.cancellationReason?.trim())
        return null;
      const entries = await api.get<CourtScheduleEntryDto[]>(
        coach
          ? "/api/coaches/me/court-schedule"
          : "/api/manager/court-schedule",
        {
          signal,
          query: {
            fromDate: vietnamLocal(entry.startAtUtc).slice(0, 10),
            toDate: vietnamLocal(entry.endAtUtc).slice(0, 10),
            roomId: entry.roomId,
          },
        },
      );
      return (
        entries.find(
          (item) =>
            item.sourceType === entry.sourceType &&
            item.sourceId === entry.sourceId,
        )?.cancellationReason ?? null
      );
    },
    [
      entry.sourceId,
      entry.sourceType,
      entry.status,
      entry.cancellationReason,
      entry.startAtUtc,
      entry.endAtUtc,
      entry.roomId,
      coach,
    ],
  );

  /** BR-159: chỉ Lễ tân đánh dấu Checked-in hoặc No-show cho lượt thuê sân. */
  async function markRental(action: "check-in" | "no-show") {
    setRentalBusy(true);
    setRentalError("");
    try {
      await api.post(`/api/court-rentals/${entry.sourceId}/${action}`);
      onChanged?.();
      onClose();
    } catch (error) {
      setRentalError((error as Error).message);
    } finally {
      setRentalBusy(false);
    }
  }

  let footer = undefined;

  if (coach && entry.sourceType === "CLASS_SESSION" && entry.classId) {
    footer = (
      <Link
        className={buttonClass({
          variant: "secondary",
        })}
        href={`/coach/classes/${entry.classId}`}
      >
        {l.details}
      </Link>
    );
  }

  return (
    <Drawer
      title={entry.title}
      description={`${formatDateTime(entry.startAtUtc)} – ${formatDateTime(
        entry.endAtUtc,
      )}`}
      onClose={onClose}
      size="lg"
      footer={footer}
    >
      <dl
        className={styles.summary}
        style={{
          margin: 0,
        }}
      >
        <div className={styles.summaryRow}>
          <dt>{shared.type}</dt>

          <dd
            style={{
              margin: 0,
            }}
          >
            {shared.types[entry.sourceType]}
          </dd>
        </div>

        <div className={styles.summaryRow}>
          <dt>{entry.incidentScope === "CENTER" ? l.scope : l.room}</dt>

          <dd
            style={{
              margin: 0,
            }}
          >
            {entry.incidentScope === "CENTER"
              ? t.incidentHistory.entireCenter
              : roomName || "—"}
          </dd>
        </div>

        <div className={styles.summaryRow}>
          <dt>{entry.sourceType === "COURT_RENTAL" ? "Renter" : l.coach}</dt>

          <dd
            style={{
              margin: 0,
            }}
          >
            {(entry.sourceType === "COURT_RENTAL"
              ? entry.memberName
              : entry.coachName) || "—"}
          </dd>
        </div>

        <div className={styles.summaryRow}>
          <dt>{l.status}</dt>

          <dd
            style={{
              margin: 0,
            }}
          >
            <StatusChip value={entry.status} />
          </dd>
        </div>
      </dl>
      {entry.sourceType === "COURT_RENTAL" && (manager || receptionist) && (
        <section className={styles.rentalInvoice}>
          <dl className={styles.invoiceDetails}>
            {entry.status === "CANCELLED" && (
              <div className={styles.invoiceRow}>
                <dt>{l.reason}:</dt>
                <dd>
                  {cancellation.loading ? (
                    <span role="status">{t.common.loading}</span>
                  ) : cancellation.error ? (
                    <span role="alert">{cancellation.error.message}</span>
                  ) : (
                    entry.cancellationReason?.trim() ||
                    cancellation.data?.trim() ||
                    shared.noCancellationReason
                  )}
                </dd>
              </div>
            )}
            <div className={styles.invoiceRow}>
              <dt>{vi ? "Hóa đơn" : "Invoice"}:</dt>
              <dd>
                {rentalCheckout.loading
                  ? t.common.loading
                  : rentalCheckout.data?.summary.invoiceNumber || "—"}
              </dd>
            </div>
            <div className={styles.invoiceRow}>
              <dt>{vi ? "Thanh toán" : "Payment"}:</dt>
              <dd>
                {rentalCheckout.data ? (
                  <span className={styles.paymentStatus}>
                    <StatusChip value={rentalCheckout.data.summary.status} />
                    <StatusChip
                      value={rentalCheckout.data.summary.fulfillmentOutcome}
                    />
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className={styles.invoiceRow}>
              <dt>{vi ? "Tình trạng thanh toán" : "Checkout"}:</dt>
              <dd>
                {rentalCheckout.data
                  ? rentalCheckout.data.summary.outstanding > 0
                    ? vi
                      ? "Chờ thanh toán"
                      : "Awaiting payment"
                    : vi
                      ? "Không còn dư nợ"
                      : "No outstanding balance"
                  : "—"}
              </dd>
            </div>
          </dl>
          {rentalCheckout.error && (
            <p role="alert">
              {rentalCheckout.error.message}{" "}
              <button
                type="button"
                className="btn btn--secondary"
                onClick={rentalCheckout.reload}
              >
                {t.common.retry}
              </button>
            </p>
          )}
          {rentalCheckout.data?.summary.reconciliationRequired && (
            <p role="alert">
              {vi ? "Cần đối soát" : "Reconciliation required"}
            </p>
          )}
          {entry.memberId && (
            <Link
              className="btn btn--secondary"
              href={`/${manager ? "manager" : "receptionist"}/members/${entry.memberId}?tab=invoices`}
            >
              {vi ? "Mở hóa đơn hội viên" : "Open member invoices"}
            </Link>
          )}
        </section>
      )}
      {entry.status === "CANCELLED" &&
        !(entry.sourceType === "COURT_RENTAL" && (manager || receptionist)) && (
          <section
            className={`${styles.cancellation} ${entry.sourceType === "COURT_RENTAL" ? styles.rentalReason : ""}`}
          >
            <strong>{l.reason}:</strong>{" "}
            {cancellation.loading ? (
              <p role="status">{t.common.loading}</p>
            ) : cancellation.error ? (
              <p role="alert">{cancellation.error.message}</p>
            ) : (
              <p>
                {entry.cancellationReason?.trim() ||
                  cancellation.data?.trim() ||
                  shared.noCancellationReason}
              </p>
            )}
          </section>
        )}
      {entry.incidentScope === "CENTER" && !!affectedRoomNames?.length && (
        <section>
          <h3>{t.incidentHistory.affectedRooms}</h3>
          <ul>
            {affectedRoomNames.map((name, index) => (
              <li key={index}>{name}</li>
            ))}
          </ul>
        </section>
      )}
      {manager &&
        entry.sourceType === "COURT_RENTAL" &&
        (entry.status === "CONFIRMED" || entry.status === "IN_USE") &&
        onChanged && (
          <ConfirmRecordAction
            label={t.recordActions.cancelRental}
            title={t.recordActions.cancelRentalTitle}
            description={t.recordActions.cancelRentalDescription}
            recordName={`${entry.memberName || entry.title} / ${roomName || t.operations.room} / ${formatDateTime(entry.startAtUtc)}`}
            requireReason
            onConfirm={(reason) =>
              api.post(`/api/manager/court-rentals/${entry.sourceId}/cancel`, {
                reason,
              })
            }
            onCompleted={() => {
              onChanged();
              onClose();
            }}
          />
        )}
      {receptionist &&
        entry.sourceType === "COURT_RENTAL" &&
        entry.status === "CONFIRMED" && (
          <section>
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={rentalBusy}
                onClick={() => markRental("check-in")}
              >
                Check-in
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={rentalBusy}
                onClick={() => markRental("no-show")}
              >
                No-show
              </button>
            </div>
            <p className="muted">
              Check-in opens 5 minutes before the start. If the rental is not
              marked by its end time, the system records No-show automatically.
            </p>
            {rentalError && <p role="alert">{rentalError}</p>}
          </section>
        )}
      {manager && entry.incidentId && (
        <Link
          className={buttonClass({ variant: "secondary" })}
          href={`/manager/incidents/${entry.incidentId}`}
        >
          {t.incidentHistory.details}
        </Link>
      )}

      {showParticipants &&
        entry.sourceType === "CLASS_SESSION" &&
        (entry.status !== "CANCELLED" || participants.length > 0) && (
          <section className={styles.participants}>
            <h3>{shared.participants}</h3>

            {participants.length ? (
              <table
                className={styles.participantTable}
                aria-label={shared.participants}
              >
                <thead>
                  <tr>
                    <th scope="col">{l.member}</th>
                    <th scope="col">{l.attendance}</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((participant) => (
                    <tr key={participant.memberId}>
                      <td>{participant.memberName}</td>
                      <td>
                        <StatusChip value={participant.attendanceStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">{shared.noParticipants}</p>
            )}
          </section>
        )}
      {extraDetails}
    </Drawer>
  );
}
