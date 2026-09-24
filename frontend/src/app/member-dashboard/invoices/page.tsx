"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Dialog, Pager, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatMoney, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { InvoiceDetailDto, InvoiceSummaryDto, Paged } from "@/lib/types";

/** Hóa đơn của hội viên. Chỉ ĐỌC — mọi thay đổi đi qua quầy và PaymentAdjustment (BR-40, BR-42). */
export default function MyInvoicesPage() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const invoices = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/members/me/invoices", {
        signal,
        query: { page, pageSize: 10 },
      }),
    [page],
  );

  const detail = useApi(
    (signal) =>
      selected
        ? api.get<InvoiceDetailDto>(`/api/invoices/${selected}`, { signal })
        : Promise.resolve(null),
    [selected],
  );

  return (
    <AppShell title="My invoice." description="Tracking Accounts and Payment History" allow={["Member"]}>
      <Card title="Invoiceing List" bodyless>
        <AsyncSection
          state={invoices}
          emptyMessage="You don't have a receipt."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <>
              <Table
                headers={[
                  "Number of invoices",
                  "Name",
                  { text: "Total Money", numeric: true },
                  { text: "Payed", numeric: true },
                  { text: "The rest", numeric: true },
                  "Pay limit",
                  "Status",
                  "",
                ]}
              >
                {data.items.map((item) => (
                  <tr key={item.invoiceId}>
                    <td>{item.invoiceNumber}</td>
                    <td className="nowrap small">{formatDate(item.issuedAt)}</td>
                    <td className="num">{formatMoney(item.totalAmount)}</td>
                    <td className="num">{formatMoney(item.netCollected)}</td>
                    <td className="num">{formatMoney(item.outstanding)}</td>
                    <td className="nowrap small">
                      {formatDate(item.dueDateUtc)}
                      {item.isOverdue && (
                        <div style={{ color: "var(--danger-700)" }}>Expiration</div>
                      )}
                    </td>
                    <td>
                      <StatusChip value={item.status} />
                    </td>
                    <td className="right">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setSelected(item.invoiceId)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>

              <div style={{ padding: "0 18px 14px" }}>
                <Pager
                  page={data.page}
                  pageSize={data.pageSize}
                  totalCount={data.totalCount}
                  onChange={setPage}
                />
              </div>
            </>
          )}
        </AsyncSection>
      </Card>

      {selected && (
        <Dialog title="Invoiceing Details" onClose={() => setSelected(null)}>
          <AsyncSection state={detail} emptyMessage="The details could not be loaded.">
            {(data) =>
              data ? (
                <div className="stack">
                  <div>
                    <strong>{data.summary.invoiceNumber}</strong>
                    <div className="small muted">
                      Release {formatDateTime(data.summary.issuedAt)} › Payback{" "}
                      {formatDate(data.summary.dueDateUtc)}
                    </div>
                  </div>

                  <Table headers={["Contents", { text: "The Money", numeric: true }]}>
                    {data.items.map((item) => (
                      <tr key={item.itemId}>
                        <td>{item.description}</td>
                        <td className="num">{formatMoney(item.amount)}</td>
                      </tr>
                    ))}
                  </Table>

                  <div>
                    <h3>Payouts</h3>
                    {data.payments.length === 0 ? (
                      <p className="small muted">No payments yet.</p>
                    ) : (
                      <Table
                        headers={["Schedule", "Format", { text: "The Money", numeric: true }, "Status"]}
                      >
                        {data.payments.map((payment) => (
                          <tr key={payment.paymentId}>
                            <td className="nowrap small">{formatDateTime(payment.paidAt)}</td>
                            <td>{label(payment.method)}</td>
                            <td className="num">{formatMoney(payment.amount)}</td>
                            <td>
                              <StatusChip value={payment.status} />
                            </td>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </div>

                  {data.adjustments.length > 0 && (
                    <div>
                      <h3>Adjust</h3>
                      <Table
                        headers={["Category", { text: "The Money", numeric: true }, "Reasons", "Status"]}
                      >
                        {data.adjustments.map((adjustment) => (
                          <tr key={adjustment.adjustmentId}>
                            <td>{label(adjustment.type)}</td>
                            <td className="num">{formatMoney(adjustment.amount)}</td>
                            <td className="small">{adjustment.reason}</td>
                            <td>
                              <StatusChip value={adjustment.status} />
                            </td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  )}

                  {/*
                    BR-41 v1.4 — hội viên phải phân biệt được "trung tâm còn nợ mình" với
                    "trung tâm đã trả rồi": gộp hai con số là lý do người dùng không đối
                    chiếu được với thực tế.
                  */}
                  <div className="alert alert--info">
                    Total Money {formatMoney(data.summary.totalAmount)} · Retrieved{" "}
                    {formatMoney(data.summary.grossCollected)}
                    {data.summary.obligationReduction > 0 &&
                      ` · Discounted ${formatMoney(data.summary.obligationReduction)}`}{" "}
                    · Still to Pay {formatMoney(data.summary.outstanding)}
                  </div>

                  {data.summary.refundDue > 0 && (
                    <div className="alert alert--warn">
                      Centre Needs to Return You{" "}
                      <strong>{formatMoney(data.summary.refundDue)}</strong>This was not paid — please contact the front desk.
                    </div>
                  )}

                  {data.summary.refundedAmount > 0 && (
                    <div className="alert alert--success">
                      Completed for You{" "}
                      <strong>{formatMoney(data.summary.refundedAmount)}</strong>.
                    </div>
                  )}
                </div>
              ) : null
            }
          </AsyncSection>
        </Dialog>
      )}
    </AppShell>
  );
}
