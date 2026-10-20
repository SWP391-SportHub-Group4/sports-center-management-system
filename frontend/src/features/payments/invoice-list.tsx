"use client";

import { pagedItems } from "@/lib/paged";

import { useEffect, useState } from "react";

import { api, downloadFile } from "@/lib/apiClient";

import { useApi } from "@/lib/useApi";

import { useLanguage } from "@/lib/language";

import { formatMoney } from "@/lib/format";
import styles from "./invoice-list.module.css";

import type { InvoiceSummaryDto, InvoiceDetailDto, Paged } from "@/lib/types";

import { StatusChip } from "@/components/ui";

import { InvoiceDetail } from "./invoice-detail";

// Keep print/download on the same authoritative server-rendered PDF path used by email receipts.
async function printInvoice(invoiceId: string) {
  await downloadFile(`/api/invoices/${invoiceId}/receipt.pdf`, `SportHub-${invoiceId}.pdf`);
}

const localDate = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(value))
  : "";

const statusLabel = (status: string) => {
  switch (status.toUpperCase()) {
    case "PAID": case "PAID_AFTER_RECONCILIATION": return "Paid";
    case "ISSUED": return "Awaiting payment";
    case "VOID": return "Void";
    default: return status.replaceAll("_", " ");
  }
};

const methodLabel = (method: string) => {
  switch (method.toLowerCase()) {
    case "vnpay": return "VNPay";
    case "cash": return "Cash";
    case "transfer": return "Bank transfer";
    case "ewallet": return "E-wallet";
    case "card": return "Card";
    default: return method;
  }
};

// Semicolon delimiter and BOM improve direct Excel opening on Vietnamese locale.
// Protect text cells from CSV formula injection; leave numeric cells unquoted numerics.
function csvValue(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const raw = String(value ?? "");
  const safe = /^[\s\t\r\n]*[=+@\-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

async function exportInvoiceCsv(invoiceId: string) {
  const invoice = await api.get<InvoiceDetailDto>(`/api/invoices/${invoiceId}`);
  const summary = invoice.summary;
  if (!["PAID", "PAID_AFTER_RECONCILIATION"].includes(summary.status.toUpperCase())) {
    throw new Error("Only paid invoices can be exported.");
  }
  const payments = invoice.payments.filter((p) => p.status.toLowerCase() === "success");
  const paidAt = payments.length ? localDate(payments[payments.length - 1].paidAt) : "";
  const methods = [...new Set(payments.map((p) => methodLabel(p.method)))].join(", ");
  const references = [...new Set(payments.map((p) => p.referenceCode).filter((r): r is string => !!r))].join(", ");
  const paid = ["PAID", "PAID_AFTER_RECONCILIATION"].includes(summary.status.toUpperCase());
  const voided = summary.status.toUpperCase() === "VOID";
  type CsvCell = string | number;
  const rows: CsvCell[][] = [[
    "Invoice number", "Issued at (GMT+7)", "Paid at (GMT+7)", "Member", "Email",
    "Status", "Service", "Quantity", "Unit price (VND)", "Line amount (VND)",
    "Points used", "Cash amount (VND)", "Payment method", "Transaction reference",
    "Outstanding (VND)", "Invoice total (VND)",
  ]];
  // Invoice-level amounts are populated only on the first service row.
  // This prevents SUM() from double-counting the same invoice across multiple items.
  invoice.items.forEach((item, i) => rows.push([
    summary.invoiceNumber, localDate(summary.issuedAt), paidAt,
    summary.memberName, summary.memberEmail, statusLabel(summary.status),
    item.description, item.quantity, item.unitPrice, item.lineAmount,
    i === 0 && !voided ? summary.pointsSpent : "",
    i === 0 && !voided ? summary.cashAmount : "",
    paid ? methods : "", paid ? references : "",
    i === 0 && !voided ? summary.outstanding : "",
    i === 0 ? summary.totalAmount : "",
  ]));
  if (!invoice.items.length) {
    rows.push([summary.invoiceNumber, localDate(summary.issuedAt), paidAt,
      summary.memberName, summary.memberEmail, statusLabel(summary.status),
      "", "", "", "", "", "", "", "", "", summary.totalAmount]);
  }
  const csv = "\uFEFFsep=;\r\n" + rows.map((row) => row.map(csvValue).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${summary.invoiceNumber}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function invoiceDescription(status: string) {
  switch (status.toUpperCase()) {
    case "VOID": return "This order was cancelled. No payment is currently due for this invoice.";
    case "ISSUED": return "Payment is pending. Open Details to review this order or continue checkout.";
    case "PAID": return "Payment confirmed. The receipt and transaction details are available.";
    case "PAID_AFTER_RECONCILIATION": return "Payment confirmed after reconciliation. Review its final details below.";
    default: return "Review this invoice's details and current payment status.";
  }
}

export function InvoiceList({
  staff = false,
  memberId,
  rental = false,
}: {
  staff?: boolean;
  memberId?: string;
  rental?: boolean;
}) {
  const { t } = useLanguage();

  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<string | null>(null);

  const [linkError, setLinkError] = useState("");

  const [status, setStatus] = useState("");

  const [actionError, setActionError] = useState("");

  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    const item = new URLSearchParams(window.location.search).get(
      "invoiceItemId",
    );

    const controller = new AbortController();

    const accept = (d: InvoiceDetailDto) => {
      if (controller.signal.aborted) {
        return;
      }

      if (staff && memberId && d.summary.memberId !== memberId) {
        setLinkError(t.operations.invoiceMemberMismatch);

        return;
      }

      setSelected(d.summary.invoiceId);
    };

    if (item && /^[0-9a-f-]{36}$/i.test(item)) {
      api
        .get<InvoiceDetailDto>(`/api/invoices/by-item/${item}`, {
          signal: controller.signal,
        })
        .then(accept)
        .catch((error) => {
          if (!controller.signal.aborted) {
            setLinkError(error.message);
          }
        });
    }

    const id = new URLSearchParams(window.location.search).get("invoiceId");

    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      if (staff && memberId) {
        api
          .get<InvoiceDetailDto>(`/api/invoices/${id}`, {
            signal: controller.signal,
          })
          .then(accept)
          .catch((error) => {
            if (!controller.signal.aborted) {
              setLinkError(error.message);
            }
          });
      } else {
        const timer = setTimeout(() => setSelected(id), 0);

        controller.signal.addEventListener("abort", () => clearTimeout(timer), {
          once: true,
        });
      }
    }

    return () => controller.abort();
  }, [staff, memberId, t.operations.invoiceMemberMismatch]);

  const state = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>(
        staff
          ? "/api/invoices"
          : rental
            ? "/api/members/me/rental-invoices"
            : "/api/members/me/invoices",
        {
          signal,
          query: {
            page,
            pageSize: 10,
            status,
            memberId,
          },
        },
      ),
    [staff, rental, page, status, memberId],
  );

  async function runInvoiceAction(invoiceId: string, action: "print" | "csv") {
    setActionError("");

    setExporting(`${action}:${invoiceId}`);

    try {
      if (action === "print") {
        await printInvoice(invoiceId);
      } else {
        await exportInvoiceCsv(invoiceId);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to export invoice.",
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      {linkError && <p role="alert">{linkError}</p>}

      {actionError && <p role="alert">{actionError}</p>}

      {selected && (
        <InvoiceDetail
          key={selected}
          invoiceId={selected}
          staff={staff}
          rental={rental}
          onClose={() => setSelected(null)}
        />
      )}

      <label>
        {t.refactor.status}

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);

            setPage(1);
          }}
        >
          <option value="">—</option>

          {["ISSUED", "PAID", "VOID", "PAID_AFTER_RECONCILIATION"].map((s) => (
            <option key={s} value={s}>
              {t.wireStatus[s as keyof typeof t.wireStatus]}
            </option>
          ))}
        </select>
      </label>

      {state.loading ? (
        <p>{t.refactor.loading}</p>
      ) : state.error ? (
        <p role="alert">{state.error.message}</p>
      ) : !pagedItems(state.data).length ? (
        <p>{t.refactor.empty}</p>
      ) : (
        pagedItems(state.data).map((i) => {
          const isPaid = ["PAID", "PAID_AFTER_RECONCILIATION"].includes(i.status.toUpperCase());
          const isVoid = i.status.toUpperCase() === "VOID";
          return (
            <div className={styles.card} key={i.invoiceId}>
              <div className={styles.top}>
                <div className={styles.headerInfo}>
                  <strong className={styles.number}>{i.invoiceNumber}</strong>
                  <span className={styles.date}>Issued: {localDate(i.issuedAt)}</span>
                </div>
                <StatusChip value={i.status} />
              </div>
              <p className={styles.description}>{invoiceDescription(i.status)}</p>
              <dl className={styles.infoGrid}>
                <div><dt>Member</dt><dd>{i.memberName || i.memberEmail || "Not available"}</dd></div>
                <div><dt>Member email</dt><dd>{i.memberEmail || "Not available"}</dd></div>
                <div><dt>Order value</dt><dd>{formatMoney(i.totalAmount)}</dd></div>
                <div><dt>{isVoid ? "Payment obligation" : isPaid ? "Outstanding" : "Amount due"}</dt>
                  <dd>{isVoid ? "Cancelled" : formatMoney(i.outstanding)}</dd></div>
              </dl>
              <p className={styles.detailHint}>
                Open Details to view purchased services, their sport (if recorded), quantities, unit prices, and available payment records.
              </p>
              <div className={styles.actions}>
                <button type="button" className="btn btn--secondary" onClick={() => setSelected(i.invoiceId)}>
                  {t.refactor.details}
                </button>
                {staff && isPaid && (
                  <>
                    <button type="button" className="btn btn--secondary" disabled={exporting !== null}
                      onClick={() => void runInvoiceAction(i.invoiceId, "print")}>
                      {exporting === `print:${i.invoiceId}` ? "Preparing..." : "Print PDF"}
                    </button>
                    <button type="button" className="btn btn--secondary" disabled={exporting !== null}
                      onClick={() => void runInvoiceAction(i.invoiceId, "csv")}>
                      {exporting === `csv:${i.invoiceId}` ? "Exporting..." : "Export CSV"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}

      <div className="btn-row">
        <button
          className="btn btn--secondary"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          {t.refactor.previous}
        </button>

        <button
          className="btn btn--secondary"
          disabled={!state.data || page * 10 >= state.data.totalCount}
          onClick={() => setPage(page + 1)}
        >
          {t.refactor.more}
        </button>
      </div>
    </>
  );
}
