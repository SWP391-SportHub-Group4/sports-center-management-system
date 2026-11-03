"use client";

import { Table } from "@/components/ui";
import { formatDateTime, formatPoints } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import type { IncidentRefundRowDto } from "@/lib/types";
import styles from "./incident-refund-table.module.css";

export type RefundEdits = Record<string, { points: string; reason: string }>;
export const refundEdit = (row: IncidentRefundRowDto, edits: RefundEdits) =>
  edits[row.sourceId] ?? {
    points: String(row.suggestedRefundPoints),
    reason: "",
  };
export function validRefunds(rows: IncidentRefundRowDto[], edits: RefundEdits) {
  return rows.every((row) => {
    const edit = refundEdit(row, edits);
    const points = Number(edit.points);
    return (
      /^\d+$/.test(edit.points) &&
      Number.isSafeInteger(points) &&
      points <= row.maximumRefundPoints &&
      (points === row.suggestedRefundPoints ||
        (edit.reason.trim().length >= 3 && edit.reason.trim().length <= 500))
    );
  });
}

export function IncidentRefundTable({
  rows,
  edits = {},
  onChange,
  readOnly = false,
  disabled = false,
}: {
  rows: IncidentRefundRowDto[];
  edits?: RefundEdits;
  onChange?: (edits: RefundEdits) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const c = t.incidentRefunds;
  const state: Record<string, string> = {
    Active: c.active,
    ACTIVE: c.active,
    Confirmed: c.active,
    CONFIRMED: c.active,
    Expired: c.expired,
    EXPIRED: c.expired,
    Cancelled: c.cancelled,
    CANCELLED: c.cancelled,
    InUse: c.inUse,
    IN_USE: c.inUse,
    Completed: c.completed,
    COMPLETED: c.completed,
    NoShow: c.noShow,
    NO_SHOW: c.noShow,
    CheckInRecorded: c.checkedIn,
    CHECK_IN_RECORDED: c.checkedIn,
  };
  const total = rows.reduce(
    (sum, row) => sum + (Number(refundEdit(row, edits).points) || 0),
    0,
  );
  return (
    <section
      className={styles.root}
      aria-label={readOnly ? c.summary : c.title}
    >
      <div className={styles.heading}>
        <h3>{readOnly ? c.summary : c.title}</h3>
      </div>
      {!rows.length ? (
        <p className={styles.empty}>{c.empty}</p>
      ) : (
        <>
          <Table
            headers={[
              c.member,
              c.service,
              c.schedule,
              c.status,
              { text: c.points, numeric: true },
            ]}
          >
            {rows.map((row) => {
              const edit = refundEdit(row, edits);
              const points = Number(edit.points);
              const changed = points !== row.suggestedRefundPoints;
              const invalid =
                !/^\d+$/.test(edit.points) ||
                !Number.isSafeInteger(points) ||
                points > row.maximumRefundPoints;
              const locked = !row.isPaid || row.maximumRefundPoints === 0;
              const inputId = `refund-${row.sourceId}`;
              return (
                <tr key={row.sourceId}>
                  <td>
                    <strong>{row.memberName || c.unknown}</strong>
                  </td>
                  <td>
                    <strong>{row.serviceName}</strong>
                    <small>
                      {row.sourceType === "GYM_DAY_PASS" ? c.dayPass : c.rental}
                    </small>
                  </td>
                  <td>
                    <time dateTime={row.startAtUtc}>
                      {formatDateTime(row.startAtUtc)}
                    </time>
                    <small>{formatDateTime(row.endAtUtc)}</small>
                  </td>
                  <td>
                    <span className={styles.status}>
                      {!row.isPaid
                        ? c.unpaid
                        : row.maximumRefundPoints === 0 && !readOnly
                          ? c.fullyRefunded
                          : (state[row.status] ?? row.status)}
                    </span>
                  </td>
                  <td className="num">
                    {readOnly ? (
                      <strong className={styles.amount}>
                        {formatPoints(points)}
                      </strong>
                    ) : (
                      <>
                        <label className="sr-only" htmlFor={inputId}>
                          {c.points} · {row.memberName || c.unknown} ·{" "}
                          {row.serviceName}
                        </label>
                        <input
                          id={inputId}
                          type="number"
                          min={0}
                          max={row.maximumRefundPoints}
                          step={1}
                          inputMode="numeric"
                          value={edit.points}
                          disabled={disabled || locked}
                          aria-invalid={invalid}
                          aria-describedby={`${inputId}-hint`}
                          onChange={(event) =>
                            onChange?.({
                              ...edits,
                              [row.sourceId]: {
                                ...edit,
                                points: event.target.value,
                              },
                            })
                          }
                        />
                      </>
                    )}
                    <small id={`${inputId}-hint`}>
                      {!row.isPaid
                        ? readOnly
                          ? c.releaseReceipt
                          : c.released
                        : row.refundedPoints > 0
                          ? (readOnly ? c.previousOnly : c.previous)
                              .replace(
                                "{points}",
                                formatPoints(row.refundedPoints),
                              )
                              .replace(
                                "{max}",
                                formatPoints(row.maximumRefundPoints),
                              )
                          : !readOnly
                            ? c.maximum.replace(
                                "{points}",
                                formatPoints(row.maximumRefundPoints),
                              )
                            : null}
                    </small>
                    {!readOnly && invalid && (
                      <small className={styles.error} role="alert">
                        {c.invalid}
                      </small>
                    )}
                    {(changed || (readOnly && edit.reason)) && (
                      <div className={styles.reason}>
                        {readOnly ? (
                          <small>{edit.reason}</small>
                        ) : (
                          <>
                            <label htmlFor={`${inputId}-reason`}>
                              {c.reason}
                            </label>
                            <textarea
                              id={`${inputId}-reason`}
                              rows={2}
                              minLength={3}
                              maxLength={500}
                              value={edit.reason}
                              disabled={disabled}
                              aria-invalid={edit.reason.trim().length < 3}
                              placeholder={c.reasonHint}
                              onChange={(event) =>
                                onChange?.({
                                  ...edits,
                                  [row.sourceId]: {
                                    ...edit,
                                    reason: event.target.value,
                                  },
                                })
                              }
                            />
                            {edit.reason.trim().length < 3 && (
                              <small className={styles.error}>
                                {c.reasonHint}
                              </small>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
          <div className={styles.total}>
            <span>
              {new Set(rows.map((r) => r.memberId)).size} {c.members} ·{" "}
              {rows.length} {c.services}
            </span>
            <span>
              {c.total}{" "}
              <strong aria-live="polite" aria-atomic="true">
                {formatPoints(total)} <small>{c.unit}</small>
              </strong>
            </span>
          </div>
        </>
      )}
    </section>
  );
}
