"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import type { InvoiceDetailDto } from "@/lib/types";
import { AsyncSection, Card, StatusChip, Table } from "@/components/ui";
import { PageHeader, buttonClass } from "@/components/primitives";
import { RefundRequestForm } from "./refund-request-form";
import styles from "./checkout-panel.module.css";

/**
 * Chi tiết một hóa đơn của Member (A13): từng item với giá snapshot, tách điểm/tiền, lịch sử
 * payment và adjustment. Chỉ đọc dữ liệu server; quyền sở hữu do API quyết định (đổi ID trong URL
 * sang hóa đơn người khác trả 403/404 và trang chỉ hiện lỗi, không lộ nội dung).
 */
export function MemberInvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { t } = useLanguage();
  const f = t.finance;
  const [refundSent, setRefundSent] = useState(false);
  const state = useApi(
    (signal) =>
      api.get<InvoiceDetailDto>(`/api/invoices/${invoiceId}`, { signal }),
    [invoiceId],
  );
  const missing =
    state.error instanceof ApiError &&
    (state.error.status === 404 || state.error.status === 403);
  return (
    <>
      {refundSent && (
        <p role="status" className="state">
          {t.finOps.refundSent}
        </p>
      )}
      <AsyncSection
        state={
          missing
            ? { ...state, error: new ApiError(404, "not_found", f.notFound) }
            : state
        }
      >
        {(d) => {
          const s = d.summary;
          const resumable =
            s.status === "ISSUED" &&
            s.checkoutExpiresAtUtc !== null &&
            s.checkoutExpiresAtUtc !== undefined &&
            !s.reconciliationRequired;
          return (
            <>
              <PageHeader
                as="h2"
                back={{
                  href: "/member/finance?tab=invoices",
                  label: f.backToInvoices,
                }}
                title={s.invoiceNumber}
                description={`${f.issuedAt}: ${formatDateTime(s.issuedAt)}`}
                meta={
                  <>
                    <StatusChip value={s.status} />
                    <StatusChip value={s.fulfillmentOutcome} />
                  </>
                }
                actions={
                  resumable && (
                    <Link
                      className={buttonClass({ variant: "primary" })}
                      href={`/checkout/${s.invoiceId}`}
                    >
                      {f.continuePayment}
                    </Link>
                  )
                }
              />
              {s.reconciliationRequired && (
                <p
                  className={styles.banner + " " + styles.bannerWarning}
                  role="status"
                >
                  <strong>{t.refactor.reconciliation}</strong>
                </p>
              )}
              {s.fulfillmentOutcome === "COMPENSATED" && (
                <p
                  className={styles.banner + " " + styles.bannerWarning}
                  role="status"
                >
                  <strong>{t.refactor.compensated}</strong>
                </p>
              )}
              <Card title={f.items} bodyless>
                <Table
                  headers={[
                    f.description2,
                    { text: f.quantity, numeric: true },
                    { text: f.unitPrice, numeric: true },
                    { text: f.lineAmount, numeric: true },
                  ]}
                >
                  {d.items.map((item) => (
                    <tr key={item.itemId}>
                      <td>{item.description}</td>
                      <td className="num">{item.quantity}</td>
                      <td className="num">{formatMoney(item.unitPrice)}</td>
                      <td className="num">{formatMoney(item.lineAmount)}</td>
                    </tr>
                  ))}
                </Table>
              </Card>
              <Card title={t.checkout.summary}>
                <dl className={styles.rows}>
                  <div>
                    <dt>{t.checkout.totalLine}</dt>
                    <dd>{formatMoney(s.totalAmount)}</dd>
                  </div>
                  <div>
                    <dt>{f.pointsPaid}</dt>
                    <dd>
                      {formatPoints(s.pointsSpent ?? 0)}{" "}
                      {t.refactor.points.toLowerCase()}
                    </dd>
                  </div>
                  <div>
                    <dt>{f.cashPaid}</dt>
                    <dd>{formatMoney(s.cashAmount ?? 0)}</dd>
                  </div>
                  <div className={styles.rowsTotal}>
                    <dt>{f.outstanding}</dt>
                    <dd>{formatMoney(s.outstanding)}</dd>
                  </div>
                </dl>
              </Card>
              <Card title={f.payments} bodyless>
                {d.payments.length ? (
                  <Table
                    headers={[
                      f.receivedAt,
                      f.method,
                      t.refactor.status,
                      { text: f.lineAmount, numeric: true },
                    ]}
                  >
                    {d.payments.map((p) => (
                      <tr key={p.paymentId}>
                        <td>{formatDateTime(p.paidAt)}</td>
                        <td>{p.method}</td>
                        <td>
                          <StatusChip value={p.status} />
                        </td>
                        <td className="num">{formatMoney(p.amount)}</td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <p className="state">{f.noPayments}</p>
                )}
              </Card>
              <Card title={f.adjustments}>
                {d.adjustments.length ? (
                  <ul>
                    {d.adjustments.map((a) => (
                      <li key={a.adjustmentId}>
                        <StatusChip value={a.status} /> ·{" "}
                        {formatPoints(
                          a.status === "REQUESTED"
                            ? a.systemCalculatedPoints
                            : (a.approvedPoints ?? 0),
                        )}{" "}
                        {t.refactor.points.toLowerCase()} · {a.reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="state">{f.noAdjustments}</p>
                )}
              </Card>
              <Card>
                <RefundRequestForm
                  items={d.items}
                  onChange={state.reload}
                  onSent={() => setRefundSent(true)}
                />
              </Card>
            </>
          );
        }}
      </AsyncSection>
    </>
  );
}
