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
    <AppShell title="Hóa đơn của tôi" description="Theo dõi công nợ và lịch sử thanh toán" allow={["Member"]}>
      <Card title="Danh sách hóa đơn" bodyless>
        <AsyncSection
          state={invoices}
          emptyMessage="Bạn chưa có hóa đơn nào."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <>
              <Table
                headers={[
                  "Số hóa đơn",
                  "Ngày phát hành",
                  { text: "Tổng tiền", numeric: true },
                  { text: "Đã thanh toán", numeric: true },
                  { text: "Còn lại", numeric: true },
                  "Hạn thanh toán",
                  "Trạng thái",
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
                        <div style={{ color: "var(--danger-700)" }}>Quá hạn</div>
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
                        Chi tiết
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
        <Dialog title="Chi tiết hóa đơn" onClose={() => setSelected(null)}>
          <AsyncSection state={detail} emptyMessage="Không tải được chi tiết.">
            {(data) =>
              data ? (
                <div className="stack">
                  <div>
                    <strong>{data.summary.invoiceNumber}</strong>
                    <div className="small muted">
                      Phát hành {formatDateTime(data.summary.issuedAt)} · Hạn thanh toán{" "}
                      {formatDate(data.summary.dueDateUtc)}
                    </div>
                  </div>

                  <Table headers={["Nội dung", { text: "Số tiền", numeric: true }]}>
                    {data.items.map((item) => (
                      <tr key={item.itemId}>
                        <td>{item.description}</td>
                        <td className="num">{formatMoney(item.amount)}</td>
                      </tr>
                    ))}
                  </Table>

                  <div>
                    <h3>Các lần thanh toán</h3>
                    {data.payments.length === 0 ? (
                      <p className="small muted">Chưa có khoản thanh toán nào.</p>
                    ) : (
                      <Table
                        headers={["Thời điểm", "Hình thức", { text: "Số tiền", numeric: true }, "Trạng thái"]}
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
                      <h3>Điều chỉnh</h3>
                      <Table
                        headers={["Loại", { text: "Số tiền", numeric: true }, "Lý do", "Trạng thái"]}
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
                    Tổng tiền {formatMoney(data.summary.totalAmount)} · Đã thu{" "}
                    {formatMoney(data.summary.grossCollected)}
                    {data.summary.obligationReduction > 0 &&
                      ` · Được giảm ${formatMoney(data.summary.obligationReduction)}`}{" "}
                    · Còn phải trả {formatMoney(data.summary.outstanding)}
                  </div>

                  {data.summary.refundDue > 0 && (
                    <div className="alert alert--warn">
                      Trung tâm cần hoàn lại bạn{" "}
                      <strong>{formatMoney(data.summary.refundDue)}</strong>. Khoản này chưa
                      được chi trả — vui lòng liên hệ quầy lễ tân.
                    </div>
                  )}

                  {data.summary.refundedAmount > 0 && (
                    <div className="alert alert--success">
                      Đã hoàn cho bạn{" "}
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
