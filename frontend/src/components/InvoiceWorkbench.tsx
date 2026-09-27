"use client";

import { useState, useEffect } from "react";
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
import { useLanguage } from "@/lib/language";
import type {
  InvoiceDetailDto,
  InvoiceSummaryDto,
  Paged,
  PaymentAdjustmentDto,
} from "@/lib/types";
import {
  IconClipboard,
  IconClose,
  IconCreditCard,
  IconInvoice,
  IconLightning,
  IconPrinter,
  StickerPlansEmpty,
  StickerSuccessTrophy,
} from "@/components/icons";

export function InvoiceWorkbench() {
  const { language } = useLanguage();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dialogTab, setDialogTab] = useState<"overview" | "payments" | "adjustments">("overview");
  const [showThermalReceipt, setShowThermalReceipt] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  const hasActiveFilters = Boolean(keyword || status);

  const resetFilters = () => {
    setPage(1);
    setKeyword("");
    setDebouncedKeyword("");
    setStatus("");
  };

  const payment = useAction();
  const adjustment = useAction();
  const payout = useAction();

  const [paymentForm, setPaymentForm] = useState({
    method: "Cash",
    reference: "",
  });
  const [adjustmentForm, setAdjustmentForm] = useState({
    type: "Refund",
    amount: "",
    reason: "",
  });

  const [payoutTarget, setPayoutTarget] = useState<PaymentAdjustmentDto | null>(
    null,
  );
  const [payoutForm, setPayoutForm] = useState({
    method: "Cash",
    reference: "",
    note: "",
  });

  const invoices = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/invoices", {
        signal,
        query: {
          page,
          pageSize: 10,
          keyword: debouncedKeyword || undefined,
          status: status || undefined,
        },
      }),
    [page, debouncedKeyword, status],
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
    setDialogTab("overview");
    payment.reset();
    adjustment.reset();
    setPaymentForm({ method: "Cash", reference: "" });
    setAdjustmentForm({ type: "Refund", amount: "", reason: "" });
  };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !detail.data) return;

    const done = await payment.run(
      () =>
        api.post(`/api/invoices/${selected}/payments`, {
          amount: detail.data!.summary.outstanding,
          method: paymentForm.method,
          referenceCode: paymentForm.reference.trim() || null,
        }),
      language === "en" ? "Payment successfully recorded." : "Đã ghi nhận thanh toán thành công.",
    );

    if (done !== null) {
      detail.reload();
      invoices.reload();
      setShowThermalReceipt(true);
      setPaymentForm({ method: "Cash", reference: "" });
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
      language === "en"
        ? "Adjustment request submitted for Center Manager approval (BR-42)."
        : "Đã gửi yêu cầu điều chỉnh, chờ Quản lý trung tâm duyệt (BR-42).",
    );

    if (done !== null) {
      detail.reload();
      setAdjustmentForm({ type: "Refund", amount: "", reason: "" });
    }
  };

  const openPayout = (item: PaymentAdjustmentDto) => {
    payout.reset();
    setPayoutTarget(item);
    setPayoutForm({ method: "Cash", reference: "", note: "" });
  };

  const submitPayout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!payoutTarget) return;

    const done = await payout.run(
      () =>
        api.post(
          `/api/payment-adjustments/${payoutTarget.adjustmentId}/complete`,
          {
            refundMethod: payoutForm.method,
            refundReferenceCode: payoutForm.reference.trim() || null,
            note: payoutForm.note.trim(),
          },
        ),
      language === "en"
        ? "Payout completed. Member ledger and financial balance updated."
        : "Đã hoàn tất chi trả thực tế. Sổ cái và báo cáo tài chính đã cập nhật.",
    );

    if (done !== null) {
      setPayoutTarget(null);
      detail.reload();
      invoices.reload();
    }
  };

  return (
    <>
      <Card
        title={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <span>{language === "en" ? "Filter Invoices" : "Tra cứu & Lọc hóa đơn"}</span>
            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ fontSize: "0.78rem", padding: "2px 8px", color: "var(--brand-700, #12527f)" }}
                onClick={resetFilters}
              >
                {language === "en" ? "Reset Filters" : "Xóa bộ lọc"}
              </button>
            )}
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="small muted" style={{ fontWeight: 600 }}>
              {language === "en" ? "Quick Presets:" : "Bộ lọc nhanh:"}
            </span>
            <button
              type="button"
              className={`btn btn--sm ${!status ? "btn--primary" : "btn--ghost"}`}
              style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: 6 }}
              onClick={() => {
                setPage(1);
                setStatus("");
              }}
            >
              {language === "en" ? "All" : "Tất cả"}
            </button>
            <button
              type="button"
              className={`btn btn--sm ${status === "Issued" ? "btn--primary" : "btn--ghost"}`}
              style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: 6 }}
              onClick={() => {
                setPage(1);
                setStatus(status === "Issued" ? "" : "Issued");
              }}
            >
              {language === "en" ? "Unpaid (Issued)" : "Chưa thanh toán (Mới phát hành)"}
            </button>
            <button
              type="button"
              className={`btn btn--sm ${status === "Paid" ? "btn--primary" : "btn--ghost"}`}
              style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: 6 }}
              onClick={() => {
                setPage(1);
                setStatus(status === "Paid" ? "" : "Paid");
              }}
            >
              {language === "en" ? "Paid (Settled)" : "Đã thanh toán đủ"}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
              alignItems: "flex-end",
            }}
          >
            <Field label={language === "en" ? "Keyword Search" : "Từ khóa tìm kiếm"}>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  value={keyword}
                  placeholder={
                    language === "en"
                      ? "Search invoice #, member name or email..."
                      : "Mã HĐ (INV-...), tên hoặc email hội viên..."
                  }
                  style={{ paddingRight: keyword ? 32 : 10 }}
                  onChange={(event) => {
                    setPage(1);
                    setKeyword(event.target.value);
                  }}
                />
                {keyword && (
                  <button
                    type="button"
                    onClick={() => {
                      setPage(1);
                      setKeyword("");
                    }}
                    style={{
                      position: "absolute",
                      right: 8,
                      background: "transparent",
                      border: "none",
                      color: "var(--ink-500, #64748b)",
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                      padding: 2,
                    }}
                    title={language === "en" ? "Clear search" : "Xóa từ khóa"}
                  >
                    <IconClose size={14} />
                  </button>
                )}
              </div>
            </Field>

            <Field label={language === "en" ? "Invoice Status" : "Trạng thái hóa đơn"}>
              <select
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value);
                }}
              >
                <option value="">{language === "en" ? "All Statuses" : "Tất cả trạng thái"}</option>
                {["Issued", "Paid", "Void"].map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Card>

      <Card title={language === "en" ? "Invoices Ledger" : "Danh sách hóa đơn"} bodyless>
        <AsyncSection
          state={invoices}
          emptyMessage={
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <StickerPlansEmpty size={68} style={{ marginBottom: 12 }} />
              <p style={{ margin: 0, fontWeight: 500, color: "var(--ink-700, #334155)" }}>
                {language === "en"
                  ? "No invoices match the filter criteria."
                  : "Không tìm thấy hóa đơn phù hợp."}
              </p>
            </div>
          }
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <>
              <Table
                headers={[
                  language === "en" ? "Invoice #" : "Mã HĐ",
                  language === "en" ? "Member" : "Hội viên",
                  { text: language === "en" ? "Total Amount" : "Tổng tiền", numeric: true },
                  { text: language === "en" ? "Collected" : "Đã thu", numeric: true },
                  { text: language === "en" ? "Outstanding" : "Cần thu", numeric: true },
                  { text: language === "en" ? "Refund Due" : "Cần hoàn", numeric: true },
                  language === "en" ? "Status" : "Trạng thái",
                  "",
                ]}
              >
                {data.items.map((invoice) => (
                  <tr key={invoice.invoiceId}>
                    <td>
                      <strong>{invoice.invoiceNumber}</strong>
                    </td>
                    <td>
                      {invoice.memberName}
                      <div className="small muted">{invoice.memberEmail}</div>
                    </td>
                    <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(invoice.totalAmount)}
                    </td>
                    <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(invoice.netCollected)}
                    </td>
                    <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                      <strong style={{ color: invoice.outstanding > 0 ? "var(--warning-700, #b45309)" : "inherit" }}>
                        {formatMoney(invoice.outstanding)}
                      </strong>
                    </td>
                    <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {invoice.refundDue > 0 ? (
                        <strong style={{ color: "var(--danger-700)" }}>
                          {formatMoney(invoice.refundDue)}
                        </strong>
                      ) : (
                        "—"
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
                        {invoice.outstanding > 0
                          ? (language === "en" ? "Collect" : "Thu tiền")
                          : (language === "en" ? "View" : "Xem")}
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
        <Dialog
          title={language === "en" ? "Invoice Workbench" : "Chi tiết & Xử lý hóa đơn"}
          onClose={() => setSelected(null)}
        >
          <AsyncSection
            state={detail}
            emptyMessage={
              language === "en"
                ? "Unable to load invoice details."
                : "Không thể tải chi tiết hóa đơn."
            }
          >
            {(data) =>
              data ? (
                <div className="stack" style={{ gap: 20 }}>
                  <div className="alert alert--info">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                      <div>
                        <strong style={{ fontSize: "1.1rem" }}>{data.summary.invoiceNumber}</strong>
                        <div className="muted">{data.summary.memberName} ({data.summary.memberEmail})</div>
                      </div>
                      <StatusChip value={data.summary.status} />
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                      <div>
                        <span className="small muted">{language === "en" ? "Total Obligation:" : "Tổng nghĩa vụ:"} </span>
                        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(data.summary.totalAmount)}</strong>
                      </div>
                      <div>
                        <span className="small muted">{language === "en" ? "Gross Collected:" : "Đã thu vào:"} </span>
                        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(data.summary.grossCollected)}</strong>
                      </div>
                      <div>
                        <span className="small muted">{language === "en" ? "Outstanding Balance:" : "Còn nợ:"} </span>
                        <strong style={{ fontVariantNumeric: "tabular-nums", color: data.summary.outstanding > 0 ? "var(--warning-700, #b45309)" : "inherit" }}>
                          {formatMoney(data.summary.outstanding)}
                        </strong>
                      </div>
                      {data.summary.refundDue > 0 && (
                        <div>
                          <span className="small muted">{language === "en" ? "Refund Due:" : "Chờ hoàn trả:"} </span>
                          <strong style={{ fontVariantNumeric: "tabular-nums", color: "var(--danger-700)" }}>
                            {formatMoney(data.summary.refundDue)}
                          </strong>
                        </div>
                      )}
                    </div>

                    <div className="small muted" style={{ marginTop: 10 }}>
                      {language === "en" ? "Issued on" : "Ngày phát hành"}: {formatDate(data.summary.issuedAt)}
                    </div>
                  </div>

                  <div
                    className="btn-row"
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      paddingBottom: 12,
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className={`btn btn--sm ${
                        dialogTab === "overview" ? "" : "btn--ghost"
                      }`}
                      onClick={() => setDialogTab("overview")}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <IconClipboard size={16} />
                        <span>{language === "en" ? "Overview & Line Items" : "Tổng quan & Khoản thu"}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${
                        dialogTab === "payments" ? "" : "btn--ghost"
                      }`}
                      onClick={() => setDialogTab("payments")}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <IconCreditCard size={16} />
                        <span>{language === "en" ? "Payments Collected" : "Lịch sử thu tiền"} ({data.payments.length})</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${
                        dialogTab === "adjustments" ? "" : "btn--ghost"
                      }`}
                      onClick={() => setDialogTab("adjustments")}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <IconInvoice size={16} />
                        <span>{language === "en" ? "Adjustments & Refunds" : "Điều chỉnh & Hoàn tiền"} ({data.adjustments.length})</span>
                        {data.adjustments.some((a) => a.awaitingPayout) && (
                          <span
                            style={{
                              marginLeft: 6,
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: "var(--danger-600, #dc2626)",
                            }}
                          />
                        )}
                      </span>
                    </button>
                  </div>

                  {dialogTab === "overview" && (
                    <div className="stack" style={{ gap: 16 }}>
                      <div>
                        <h4 style={{ margin: "0 0 8px 0" }}>{language === "en" ? "Invoice Line Items" : "Nội dung thu"}</h4>
                        <Table
                          headers={[
                            language === "en" ? "Description" : "Diễn giải",
                            { text: language === "en" ? "Amount" : "Số tiền", numeric: true },
                          ]}
                        >
                          {data.items.map((item) => (
                            <tr key={item.itemId}>
                              <td>{item.description}</td>
                              <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                                {formatMoney(item.lineAmount)}
                              </td>
                            </tr>
                          ))}
                        </Table>
                      </div>

                      {data.summary.status !== "Void" &&
                        data.summary.outstanding > 0 && (
                          <div
                            style={{
                              borderTop: "1px solid var(--border-color)",
                              paddingTop: 16,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: 12,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                                {language === "en" ? "Uncollected Balance:" : "Số tiền chưa thanh toán:"}{" "}
                                <span style={{ color: "var(--warning-700, #b45309)" }}>
                                  {formatMoney(data.summary.outstanding)}
                                </span>
                              </div>
                              <div className="small muted">
                                {language === "en"
                                  ? "Collect the full balance in one payment (cash/card/transfer)."
                                  : "Thu đủ toàn bộ số còn lại trong một lần (tiền mặt, quẹt thẻ hoặc chuyển khoản)."}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                              onClick={() => setDialogTab("payments")}
                            >
                              <IconCreditCard size={15} />
                              <span>
                                {language === "en" ? "Collect Payment (" : "Thu tiền ("}
                                {formatMoney(data.summary.outstanding)}) →
                              </span>
                            </button>
                          </div>
                        )}
                    </div>
                  )}

                  {dialogTab === "payments" && (
                    <div className="stack" style={{ gap: 16 }}>
                      {data.payments.length > 0 ? (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <h4 style={{ margin: 0 }}>{language === "en" ? "Payments Collected" : "Lịch sử thu tiền"}</h4>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                              onClick={() => setShowThermalReceipt(true)}
                            >
                              <IconPrinter size={16} />
                              <span>{language === "en" ? "Print Receipt" : "In phiếu thu"}</span>
                            </button>
                          </div>
                          <Table
                            headers={[
                              language === "en" ? "Date" : "Thời gian",
                              language === "en" ? "Method" : "Hình thức",
                              { text: language === "en" ? "Amount" : "Số tiền", numeric: true },
                              language === "en" ? "Cashier" : "Người thu",
                            ]}
                          >
                            {data.payments.map((item) => (
                              <tr key={item.paymentId}>
                                <td className="nowrap small">
                                  {formatDateTime(item.paidAt)}
                                </td>
                                <td>{label(item.method)}</td>
                                <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                                  {formatMoney(item.amount)}
                                </td>
                                <td className="small">{item.receivedByName}</td>
                              </tr>
                            ))}
                          </Table>
                        </div>
                      ) : (
                        <div className="alert alert--info">
                          {language === "en" ? "No payments collected for this invoice yet." : "Hóa đơn này chưa có khoản thanh toán nào."}
                        </div>
                      )}

                      {data.summary.status !== "Void" &&
                        data.summary.outstanding > 0 && (
                          <form className="form" onSubmit={submitPayment} style={{ borderTop: "1px solid var(--border-color)", paddingTop: 16 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <h4 style={{ margin: 0 }}>{language === "en" ? "Collect Payment" : "Ghi nhận thanh toán tại quầy"}</h4>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
                                <IconLightning size={14} />
                                <span>{language === "en" ? "Full balance" : "Toàn bộ số còn lại"}: {formatMoney(data.summary.outstanding)}</span>
                              </span>
                            </div>
                            <p className="small muted" style={{ margin: 0 }}>
                              {language === "en"
                                ? "Only full, one-time payment is accepted — no partial or installment payments (BR-41)."
                                : "Chỉ chấp nhận thanh toán đủ một lần — không nhận trả thiếu hay trả góp (BR-41)."}
                            </p>

                            <div className="form form--inline">
                              <Field label={language === "en" ? "Method" : "Hình thức"}>
                                <select
                                  value={paymentForm.method}
                                  onChange={(event) =>
                                    setPaymentForm({
                                      ...paymentForm,
                                      method: event.target.value,
                                    })
                                  }
                                >
                                  {["Cash", "Card", "Transfer", "EWallet"].map(
                                    (method) => (
                                      <option key={method} value={method}>
                                        {label(method)}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </Field>
                              <Field label={language === "en" ? "Reference Code" : "Mã tham chiếu"}>
                                <input
                                  value={paymentForm.reference}
                                  placeholder={language === "en" ? "Transfer code, slip #..." : "Mã chuyển khoản, số phiếu..."}
                                  onChange={(event) =>
                                    setPaymentForm({
                                      ...paymentForm,
                                      reference: event.target.value,
                                    })
                                  }
                                />
                              </Field>
                            </div>
                            <Feedback
                              error={payment.error}
                              success={payment.success}
                            />
                            <div>
                              <button
                                type="submit"
                                className="btn btn--sm"
                                disabled={payment.busy}
                              >
                                {payment.busy
                                  ? (language === "en" ? "Recording..." : "Đang ghi nhận...")
                                  : (language === "en" ? "Confirm Payment" : "Xác nhận thu tiền")}
                              </button>
                            </div>
                          </form>
                        )}
                    </div>
                  )}

                  {dialogTab === "adjustments" && (
                    <div className="stack" style={{ gap: 16 }}>
                      {data.adjustments.length > 0 ? (
                        <div>
                          <h4 style={{ margin: "0 0 8px 0" }}>{language === "en" ? "Adjustment Ledger (BR-42)" : "Yêu cầu điều chỉnh & Hoàn tiền (BR-42)"}</h4>
                          <Table
                            headers={[
                              language === "en" ? "Type" : "Loại",
                              { text: language === "en" ? "Amount" : "Số tiền", numeric: true },
                              language === "en" ? "Reason" : "Lý do",
                              language === "en" ? "Status" : "Trạng thái",
                              "",
                            ]}
                          >
                            {data.adjustments.map((item) => (
                              <tr key={item.adjustmentId}>
                                <td>{label(item.type)}</td>
                                <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                                  {formatMoney(item.amount)}
                                  {item.requestedAmount !== item.amount && (
                                    <div className="small muted">
                                      {language === "en" ? "requested" : "đề xuất"}{" "}
                                      {formatMoney(item.requestedAmount)}
                                    </div>
                                  )}
                                </td>
                                <td className="small">{item.reason}</td>
                                <td>
                                  <StatusChip value={item.status} />
                                  {item.awaitingPayout && (
                                    <div
                                      className="small"
                                      style={{ color: "var(--danger-700)", fontWeight: 600 }}
                                    >
                                      {language === "en" ? "Awaiting Payout" : "Chờ quầy hoàn tiền"}
                                    </div>
                                  )}
                                  {item.completedAtUtc &&
                                    item.type === "Refund" && (
                                      <div className="small muted">
                                        {language === "en" ? "Paid" : "Đã chi"}{" "}
                                        {formatDateTime(item.completedAtUtc)}
                                        {item.completedByName &&
                                          ` · ${item.completedByName}`}
                                        {item.refundMethod &&
                                          ` · ${label(item.refundMethod)}`}
                                      </div>
                                    )}
                                </td>
                                <td className="right">
                                  {item.awaitingPayout && (
                                    <button
                                      type="button"
                                      className="btn btn--sm"
                                      onClick={() => openPayout(item)}
                                    >
                                      {language === "en" ? "Execute Refund" : "Xác nhận chi trả"}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </Table>
                        </div>
                      ) : (
                        <div className="alert alert--info">
                          {language === "en" ? "No adjustments or refund requests on this invoice." : "Chưa có yêu cầu điều chỉnh hoặc hoàn tiền nào cho hóa đơn này."}
                        </div>
                      )}

                      {data.summary.status !== "Void" && (
                        <form className="form" onSubmit={submitAdjustment} style={{ borderTop: "1px solid var(--border-color)", paddingTop: 16 }}>
                          <h4 style={{ margin: 0 }}>{language === "en" ? "Create Adjustment Request" : "Tạo yêu cầu điều chỉnh"}</h4>
                          <p className="small muted" style={{ margin: 0 }}>
                            {language === "en"
                              ? "All adjustment requests must be approved by the Center Manager (BR-42)."
                              : "Tất cả yêu cầu điều chỉnh phải được Quản lý trung tâm phê duyệt (BR-42)."}
                            {data.suggestedRefundAmount > 0 &&
                              (language === "en"
                                ? ` Suggested refund for unused sessions: ${formatMoney(data.suggestedRefundAmount)} (BR-52).`
                                : ` Đề xuất hoàn tiền cho các buổi chưa tập: ${formatMoney(data.suggestedRefundAmount)} (BR-52).`)}
                          </p>
                          <div className="form form--inline">
                            <Field label={language === "en" ? "Type" : "Loại điều chỉnh"}>
                              <select
                                value={adjustmentForm.type}
                                onChange={(event) =>
                                  setAdjustmentForm({
                                    ...adjustmentForm,
                                    type: event.target.value,
                                  })
                                }
                              >
                                {["Refund", "Correction", "Discount"].map(
                                  (type) => (
                                    <option key={type} value={type}>
                                      {label(type)}
                                    </option>
                                  ),
                                )}
                              </select>
                            </Field>
                            <Field label={language === "en" ? "Amount (VND)" : "Số tiền (VND)"}>
                              <input
                                type="number"
                                min={1}
                                value={adjustmentForm.amount}
                                required
                                onChange={(event) =>
                                  setAdjustmentForm({
                                    ...adjustmentForm,
                                    amount: event.target.value,
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <Field label={language === "en" ? "Reason" : "Lý do điều chỉnh"}>
                            <input
                              value={adjustmentForm.reason}
                              required
                              minLength={3}
                              placeholder={
                                language === "en"
                                  ? "E.g., Medical refund, billing typo, promotional adjustment..."
                                  : "Vd: Hội viên bận công tác xin hoàn, sửa sai sót nhập liệu..."
                              }
                              onChange={(event) =>
                                setAdjustmentForm({
                                  ...adjustmentForm,
                                  reason: event.target.value,
                                })
                              }
                            />
                          </Field>
                          <Feedback
                            error={adjustment.error}
                            success={adjustment.success}
                          />
                          <div>
                            <button
                              type="submit"
                              className="btn btn--sm btn--ghost"
                              disabled={adjustment.busy || !adjustmentForm.amount}
                            >
                              {adjustment.busy
                                ? (language === "en" ? "Submitting..." : "Đang gửi...")
                                : (language === "en" ? "Submit Adjustment Request" : "Gửi yêu cầu điều chỉnh")}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              ) : null
            }
          </AsyncSection>
        </Dialog>
      )}

      {payoutTarget && (
        <Dialog
          title={language === "en" ? "Execute Refund Payout" : "Xác nhận chi trả hoàn tiền"}
          onClose={() => setPayoutTarget(null)}
        >
          <form className="form" onSubmit={submitPayout}>
            <div className="alert alert--info">
              {language === "en"
                ? `Execute payout of ${formatMoney(payoutTarget.amount)} for invoice ${payoutTarget.invoiceNumber}.`
                : `Thực hiện chi trả ${formatMoney(payoutTarget.amount)} cho hóa đơn ${payoutTarget.invoiceNumber}.`}
              <div className="small" style={{ marginTop: 4 }}>
                {language === "en"
                  ? `Approved by Center Manager${payoutTarget.approvedByName ? ` (${payoutTarget.approvedByName})` : ""} on ${formatDate(payoutTarget.approvedAtUtc)}. Amount cannot be modified at the cashier desk (BR-42). Confirm only after money has been physically handed to member.`
                  : `Đã được Quản lý duyệt${payoutTarget.approvedByName ? ` (${payoutTarget.approvedByName})` : ""} vào ${formatDate(payoutTarget.approvedAtUtc)}. Số tiền cố định không thể sửa tại quầy (BR-42). Chỉ bấm xác nhận sau khi đã chuyển khoản hoặc trao tiền mặt cho hội viên.`}
              </div>
            </div>

            <div className="form form--inline">
              <Field label={language === "en" ? "Payout Method" : "Phương thức chi trả"}>
                <select
                  value={payoutForm.method}
                  onChange={(event) =>
                    setPayoutForm({ ...payoutForm, method: event.target.value })
                  }
                >
                  {["Cash", "Card", "Transfer", "EWallet"].map((method) => (
                    <option key={method} value={method}>
                      {label(method)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={
                  payoutForm.method === "Cash"
                    ? language === "en"
                      ? "Reference (Optional for cash)"
                      : "Mã tham chiếu (Không bắt buộc với tiền mặt)"
                    : language === "en"
                    ? "Transaction Reference (Required)"
                    : "Mã giao dịch / Mã ủy nhiệm chi (Bắt buộc)"
                }
              >
                <input
                  value={payoutForm.reference}
                  required={payoutForm.method !== "Cash"}
                  placeholder={language === "en" ? "Bank ref #..." : "Mã giao dịch ngân hàng..."}
                  onChange={(event) =>
                    setPayoutForm({
                      ...payoutForm,
                      reference: event.target.value,
                    })
                  }
                />
              </Field>
            </div>

            <Field label={language === "en" ? "Cashier Note" : "Ghi chú quầy"}>
              <input
                value={payoutForm.note}
                required
                minLength={3}
                placeholder={language === "en" ? "E.g., Cash handed over at desk with signed receipt" : "Vd: Đã chi tiền mặt tại quầy, hội viên đã ký nhận"}
                onChange={(event) =>
                  setPayoutForm({ ...payoutForm, note: event.target.value })
                }
              />
            </Field>

            <Feedback error={payout.error} success={payout.success} />

            <div>
              <button
                type="submit"
                className="btn btn--sm"
                disabled={payout.busy}
              >
                {payout.busy
                  ? (language === "en" ? "Processing..." : "Đang xử lý...")
                  : (language === "en" ? "Confirm Payout Completed" : "Xác nhận đã chi tiền")}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {showThermalReceipt && detail.data && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={language === "en" ? "Official Payment Receipt" : "Biên lai thu tiền tại quầy"}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11, 45, 77, 0.45)",
            backdropFilter: "blur(4px)",
            display: "grid",
            placeItems: "center",
            zIndex: 1050,
            padding: 16,
          }}
          onClick={() => setShowThermalReceipt(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 14,
              width: "100%",
              maxWidth: 480,
              padding: 28,
              boxShadow: "0 20px 48px rgba(11, 45, 77, 0.22)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "center" }}>
              <StickerSuccessTrophy size={54} />
            </div>

            <div style={{ textAlign: "center", borderBottom: "2px dashed #dfe5ec", paddingBottom: 12 }}>
              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--brand-900, #0b2d4d)" }}>
                SPORTHUB CENTER
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--ink-500, #64748b)", marginTop: 2 }}>
                {language === "en" ? "Official Front Desk Payment Receipt" : "Biên lai thanh toán tại quầy thu ngân"}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span>{language === "en" ? "Invoice #:" : "Mã hóa đơn:"}</span>
              <strong>{detail.data.summary.invoiceNumber}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span>{language === "en" ? "Date & Time:" : "Thời gian in:"}</span>
              <span>{formatDateTime(new Date().toISOString())}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span>{language === "en" ? "Member:" : "Hội viên:"}</span>
              <strong>{detail.data.summary.memberName}</strong>
            </div>

            <div style={{ borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", padding: "8px 0" }}>
              {detail.data.items.map((item) => (
                <div
                  key={item.itemId}
                  style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", padding: "3px 0" }}
                >
                  <span>{item.description}</span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(item.lineAmount)}</strong>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
              <span>{language === "en" ? "Total Obligation:" : "Tổng tiền hóa đơn:"}</span>
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(detail.data.summary.totalAmount)}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "1.1rem",
                fontWeight: 800,
                color: "var(--brand-900, #0b2d4d)",
                borderTop: "2px dashed #dfe5ec",
                paddingTop: 10,
              }}
            >
              <span>{language === "en" ? "TOTAL COLLECTED:" : "ĐÃ THU VÀO:"}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(detail.data.summary.grossCollected)}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
              <span>{language === "en" ? "Remaining Balance:" : "Còn nợ lại:"}</span>
              <strong
                style={{
                  fontVariantNumeric: "tabular-nums",
                  color: detail.data.summary.outstanding > 0 ? "var(--warning-700, #b45309)" : "var(--ok-700, #15803d)",
                }}
              >
                {formatMoney(detail.data.summary.outstanding)}
              </strong>
            </div>

            <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--ink-500, #64748b)", margin: "4px 0" }}>
              {language === "en"
                ? "Thank you for training with SportHub! Please retain this receipt."
                : "Cảm ơn quý khách đã tin chọn SportHub! Vui lòng lưu lại phiếu thu."}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                type="button"
                className="btn btn--primary"
                style={{ flex: 1, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 }}
                onClick={() => window.print()}
              >
                <IconPrinter size={16} />
                <span>{language === "en" ? "Print Receipt" : "In phiếu thu"}</span>
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowThermalReceipt(false)}
              >
                {language === "en" ? "Close" : "Đóng"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
