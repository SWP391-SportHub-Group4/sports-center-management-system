"use client";
import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  todayIso,
  addDaysIso,
  formatDateTime,
  formatMoney,
} from "@/lib/format";
import { AsyncSection, Field, Table, Card, StatusChip } from "@/components/ui";
import { dayRange } from "@/lib/vietnam-time";
import type { CourtRentalDto } from "@/lib/types";
import { rentalApi } from "./api";
import { RentalCancelConfirm } from "@/features/member/rental-cancel";
import { RentalPriceBreakdown } from "./rental-price-breakdown";
export function RentalList(props: { rentalId?: string; initialDate?: string }) {
  return props.rentalId ? (
    <RentalDetail key={props.rentalId} rentalId={props.rentalId} />
  ) : (
    <RentalRangeList initialDate={props.initialDate} />
  );
}
function RentalRangeList({ initialDate }: { initialDate?: string }) {
  const { t } = useLanguage();
  const l = t.operations;
  const [from, setFrom] = useState(initialDate || todayIso());
  const [to, setTo] = useState(initialDate || addDaysIso(todayIso(), 29));
  const [status, setStatus] = useState("");
  const [target, setTarget] = useState<CourtRentalDto | null>(null);
  const range = dayRange(from, to);
  const state = useApi(
    (s) => rentalApi.mine(range.fromUtc, range.toUtc, s),
    [from, to],
  );
  return (
    <>
      <p>{l.selfOnly}</p>
      <div className="form-grid">
        <Field label={l.from}>
          <input
            type="date"
            required
            value={from}
            onChange={(e) => {
              if (e.target.value) {
                setFrom(e.target.value);
                setTo(addDaysIso(e.target.value, 29));
              }
            }}
          />
        </Field>
        <Field label={l.to}>
          <input
            type="date"
            required
            min={from}
            max={addDaysIso(from, 30)}
            value={to}
            onChange={(e) => e.target.value && setTo(e.target.value)}
          />
        </Field>
        <Field label={l.status}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{l.all}</option>
            {["PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "CANCELLED"].map(
              (s) => (
                <option value={s} key={s}>
                  {t.wireStatus[s as keyof typeof t.wireStatus]}
                </option>
              ),
            )}
          </select>
        </Field>
      </div>
      <AsyncSection state={state}>
        {(data) => {
          const rows = data.filter((r) => !status || r.status === status);
          return (
            <>
              <Table headers={[l.room, l.start, l.end, l.price, l.status, ""]}>
                {rows.map((r) => (
                  <tr key={r.courtRentalId}>
                    <td>
                      {r.roomName ?? `${l.room} #${r.roomId}`}
                    </td>
                    <td>{formatDateTime(r.startAtUtc)}</td>
                    <td>{formatDateTime(r.endAtUtc)}</td>
                    <td>{formatMoney(r.totalPrice)}</td>
                    <td>
                      <StatusChip value={r.status} />
                    </td>
                    <td>
                      <Link
                        className="btn btn--secondary"
                        href={`/member/rentals/${r.courtRentalId}`}
                      >
                        {l.details}
                      </Link>
                      {(r.invoiceId || r.invoiceItemId) && (
                        <Link
                          className="btn btn--ghost"
                          href={
                            r.invoiceId
                              ? `/member/invoices/${r.invoiceId}`
                              : `/member/finance?tab=invoices&invoiceItemId=${r.invoiceItemId}`
                          }
                        >
                          {l.invoices}
                        </Link>
                      )}
                      {r.status === "CONFIRMED" && (
                        <button
                          className="btn btn--secondary"
                          onClick={() => setTarget(r)}
                        >
                          {l.cancelRental}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          );
        }}
      </AsyncSection>
      {target && (
        <RentalCancelConfirm
          key={target.courtRentalId}
          rental={target}
          onClose={() => setTarget(null)}
          onCancelled={() => {
            setTarget(null);
            state.reload();
          }}
        />
      )}
    </>
  );
}
function RentalDetail({ rentalId }: { rentalId: string }) {
  const { t } = useLanguage();
  const l = t.operations;
  const [cancelling, setCancelling] = useState(false);
  const state = useApi(
    (signal) => rentalApi.detail(rentalId, signal),
    [rentalId],
  );
  return (
    <AsyncSection state={state}>
      {(detail) => (
        <>
          <Card title={`${detail.roomName} · ${detail.sportName}`}>
            <StatusChip value={detail.rental.status} />
            <p>
              {formatDateTime(detail.rental.startAtUtc)} –{" "}
              {formatDateTime(detail.rental.endAtUtc)}
            </p>
            <RentalPriceBreakdown
              quote={{
                totalPrice: detail.rental.totalPrice,
                blocks: detail.blocks,
              }}
            />
            {detail.cancelReason && (
              <p>
                {l.reason}: {detail.cancelReason}
              </p>
            )}
            {detail.cancelledAtUtc && (
              <p>{formatDateTime(detail.cancelledAtUtc)}</p>
            )}
            <p>
              {l.refundPoints}: {detail.refundPoints}
            </p>
            <div className="btn-row">
              {detail.rental.invoiceId && (
                <Link
                  className="btn btn--secondary"
                  href={`/member/invoices/${detail.rental.invoiceId}`}
                >
                  {l.invoices}
                </Link>
              )}
              <Link
                className="btn btn--ghost"
                href="/member/finance?tab=wallet"
              >
                {l.wallet}
              </Link>
              {detail.rental.status === "CONFIRMED" && (
                <button
                  className="btn btn--secondary"
                  onClick={() => setCancelling(true)}
                >
                  {l.cancelRental}
                </button>
              )}
            </div>
          </Card>
          {cancelling && (
            <RentalCancelConfirm
              rental={detail.rental}
              onClose={() => setCancelling(false)}
              onCancelled={() => {
                setCancelling(false);
                state.reload();
              }}
            />
          )}
        </>
      )}
    </AsyncSection>
  );
}
