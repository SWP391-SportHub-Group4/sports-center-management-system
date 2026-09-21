"use client";

import { useState } from "react";
import {
  AsyncSection,
  Card,
  Dialog,
  Feedback,
  Field,
  Pager,
  StatusChip,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatMoney, label } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { InvoiceDetailDto, InvoiceSummaryDto, Paged } from "@/lib/types";

/**
 * Tra cứu hóa đơn + thu tiền + tạo yêu cầu điều chỉnh.
 *
 * Dùng chung cho Lễ tân và Quản lý vì thao tác giống hệt nhau (BR-42 cho cả hai tạo yêu cầu;
 * chỉ việc DUYỆT mới là quyền riêng của Quản lý và nằm ở màn hình khác).
 */
export function InvoiceWorkbench() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const payment = useAction();
  const adjustment = useAction();

  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "Cash", reference: "" });
  const [adjustmentForm, setAdjustmentForm] = useState({
    type: "Refund",
    amount: "",
    reason: "",
  });

  const invoices = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/invoices", {
        signal,
        query: { page, pageSize: 10, keyword: keyword || undefined, status: status || undefined, overdueOnly },
      }),
    [page, keyword, status, overdueOnly],
  );

  const detail = useApi(
    (signal) =>
      selected
        ? api.get<InvoiceDetailDto>(`/api/invoices/${selected}`, { signal })
        : Promise.resolve(null),
    [selected],
  );

  const openDetail = (invoiceId: string) => {
    setSelected(invoiceId);
    payment.reset();
    adjustment.reset();
    setPaymentForm({ amount: "", method: "Cash", reference: "" });
    setAdjustmentForm({ type: "Refund", amount: "", reason: "" });
  };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    const done = await payment.run(
      () =>
        api.post(`/api/invoices/${selected}/payments`, {
          amount: Number(paymentForm.amount),
          method: paymentForm.method,
          referenceCode: paymentForm.reference.trim() || null,
        }),
      "Đã ghi nhận khoản thu.",
    );

    if (done !== null) {
      detail.reload();
      invoices.reload();
      setPaymentForm({ amount: "", method: "Cash", reference: "" });
    }
  };

  const submitAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    const done = await adjustment.run(
      () =>
        api.post(`/api/invoices/${selected}/adjustments`, {
          type: adjustmentForm.type,
          amount: Number(adjustmentForm.amount),
          reason: adjustmentForm.reason.trim(),
        }),
      "Đã gửi yêu cầu điều chỉnh. Quản lý Trung tâm sẽ phê duyệt (BR-42).",
    );

    if (done !== null) {
      detail.reload();
      setAdjustmentForm({ type: "Refund", amount: "", reason: "" });
    }
  };

  return (
    <>
      <Card title="Bộ lọc">
        <div className="form form--inline">
          <Field label="Tìm kiếm">
            <input
              value={keyword}
              placeholder="Số hóa đơn, tên hoặc email hội viên"
              onChange={(event) => {
                setPage(1);
                setKeyword(event.target.value);
              }}
            />
          </Field>
          <Field label="Trạng thái">
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
            >
              <option value="">Tất cả</option>
              {["Issued", "PartiallyPaid", "Paid", "Void"].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </Field>
          <label className="row small">
            <input
              type="checkbox"
              checked={overdueOnly}
              style={{ width: "auto" }}
              onChange={(event) => {
                setPage(1);
                setOverdueOnly(event.target.checked);
              }}
            />
            Chỉ hiện hóa đơn quá hạn
          </label>
        </div>
      </Card>

      <Card title="Hóa đơn" bodyless>
        <AsyncSection
          state={invoices}
          emptyMessage="Không có hóa đơn nào khớp bộ lọc."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <>
              <Table
                headers={[
                  "Số hóa đơn",
                  "Hội viên",
                  { text: "Tổng tiền", numeric: true },
                  { text: "Đã thu", numeric: true },
                  { text: "Còn lại", numeric: true },
                  "Hạn",
                  "Trạng thái",
                  "",
                ]}
              >
                {data.items.map((invoice) => (
                  <tr key={invoice.invoiceId}>
                    <td>{invoice.invoiceNumber}</td>
                    <td>
                      {invoice.memberName}
                      <div className="small muted">{invoice.memberEmail}</div>
                    </td>
                    <td className="num">{formatMoney(invoice.totalAmount)}</td>
                    <td className="num">{formatMoney(invoice.collectedAmount)}</td>
                    <td className="num">{formatMoney(invoice.outstanding)}</td>
                    <td className="nowrap small">
                      {formatDate(invoice.dueDateUtc)}
                      {invoice.isOverdue && (
                        <div style={{ color: "var(--danger-700)" }}>Quá hạn</div>
                      )}
                    </td>
                    <td>
                      <StatusChip value={invoice.status} />
                    </td>
                    <td className="right">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => openDetail(invoice.invoiceId)}
                      >
                        Mở
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
        <Dialog title="Hóa đơn" onClose={() => setSelected(null)}>
          <AsyncSection state={detail} emptyMessage="Không tải được hóa đơn.">
            {(data) =>
              data ? (
                <div className="stack">
                  <div className="alert alert--info">
                    <strong>{data.summary.invoiceNumber}</strong> — {data.summary.memberName}
                    <div className="small">
                      Tổng {formatMoney(data.summary.totalAmount)} · Đã thu{" "}
                      {formatMoney(data.summary.collectedAmount)} · Điều chỉnh{" "}
                      {formatMoney(data.summary.adjustmentAmount)} · Còn lại{" "}
                      {formatMoney(data.summary.outstanding)}
                      {data.summary.refundedAmount > 0 &&
                        ` · Đã hoàn ${formatMoney(data.summary.refundedAmount)}`}
                    </div>
                    <div className="small">
                      Phát hành {formatDate(data.summary.issuedAt)} · Hạn thanh toán{" "}
                      {formatDate(data.summary.dueDateUtc)}
                      {data.summary.firstDepositAtUtc
                        ? ` (đã nhận cọc ${formatDate(data.summary.firstDepositAtUtc)} → hạn 12 tháng theo BR-55)`
                        : " (hạn 2 tháng kể từ ngày phát hành theo BR-55)"}
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

                  {data.payments.length > 0 && (
                    <div>
                      <h3>Đã thu</h3>
                      <Table
                        headers={["Thời điểm", "Hình thức", { text: "Số tiền", numeric: true }, "Người thu"]}
                      >
                        {data.payments.map((item) => (
                          <tr key={item.paymentId}>
                            <td className="nowrap small">{formatDateTime(item.paidAt)}</td>
                            <td>{label(item.method)}</td>
                            <td className="num">{formatMoney(item.amount)}</td>
                            <td className="small">{item.receivedByName}</td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  )}

                  {data.adjustments.length > 0 && (
                    <div>
                      <h3>Điều chỉnh</h3>
                      <Table
                        headers={["Loại", { text: "Số tiền", numeric: true }, "Lý do", "Trạng thái"]}
                      >
                        {data.adjustments.map((item) => (
                          <tr key={item.adjustmentId}>
                            <td>{label(item.type)}</td>
                            <td className="num">{formatMoney(item.amount)}</td>
                            <td className="small">{item.reason}</td>
                            <td>
                              <StatusChip value={item.status} />
                            </td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  )}

                  {data.summary.status !== "Void" && data.summary.outstanding > 0 && (
                    <form className="form" onSubmit={submitPayment}>
                      <h3>Ghi nhận thanh toán</h3>
                      <div className="form form--inline">
                        <Field label="Số tiền (VND)">
                          <input
                            type="number"
                            min={1}
                            max={data.summary.outstanding}
                            value={paymentForm.amount}
                            required
                            onChange={(event) =>
                              setPaymentForm({ ...paymentForm, amount: event.target.value })
                            }
                          />
                        </Field>
                        <Field label="Hình thức">
                          <select
                            value={paymentForm.method}
                            onChange={(event) =>
                              setPaymentForm({ ...paymentForm, method: event.target.value })
                            }
                          >
                            {["Cash", "Card", "Transfer", "EWallet"].map((method) => (
                              <option key={method} value={method}>
                                {label(method)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Mã tham chiếu">
                          <input
                            value={paymentForm.reference}
                            onChange={(event) =>
                              setPaymentForm({ ...paymentForm, reference: event.target.value })
                            }
                          />
                        </Field>
                      </div>
                      <Feedback error={payment.error} success={payment.success} />
                      <div>
                        <button type="submit" className="btn btn--sm" disabled={payment.busy}>
                          Ghi nhận thu
                        </button>
                      </div>
                    </form>
                  )}

                  {data.summary.status !== "Void" && (
                    <form className="form" onSubmit={submitAdjustment}>
                      <h3>Tạo yêu cầu điều chỉnh</h3>
                      <p className="small muted" style={{ margin: 0 }}>
                        Yêu cầu phải được Quản lý Trung tâm phê duyệt và người tạo không được
                        tự duyệt (BR-42).
                        {data.suggestedRefundAmount > 0 &&
                          ` Gợi ý hoàn tiền theo phần chưa sử dụng: ${formatMoney(data.suggestedRefundAmount)} (BR-52).`}
                      </p>
                      <div className="form form--inline">
                        <Field label="Loại">
                          <select
                            value={adjustmentForm.type}
                            onChange={(event) =>
                              setAdjustmentForm({ ...adjustmentForm, type: event.target.value })
                            }
                          >
                            {["Refund", "Correction", "Discount"].map((type) => (
                              <option key={type} value={type}>
                                {label(type)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Số tiền (VND)">
                          <input
                            type="number"
                            min={1}
                            value={adjustmentForm.amount}
                            required
                            onChange={(event) =>
                              setAdjustmentForm({ ...adjustmentForm, amount: event.target.value })
                            }
                          />
                        </Field>
                      </div>
                      <Field label="Lý do">
                        <input
                          value={adjustmentForm.reason}
                          required
                          minLength={3}
                          onChange={(event) =>
                            setAdjustmentForm({ ...adjustmentForm, reason: event.target.value })
                          }
                        />
                      </Field>
                      <Feedback error={adjustment.error} success={adjustment.success} />
                      <div>
                        <button type="submit" className="btn btn--sm btn--ghost" disabled={adjustment.busy}>
                          Gửi yêu cầu điều chỉnh
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : null
            }
          </AsyncSection>
        </Dialog>
      )}
    </>
  );
}
