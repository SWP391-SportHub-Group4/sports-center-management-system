"use client";

import { useState } from "react";
import { MemberShell } from "@/components/MemberShell";
import {
  AsyncSection,
  Card,
  Dialog,
  Pager,
  StatusChip,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatMoney, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  IconPrinter,
  StickerPlansEmpty,
  StickerSuccessTrophy,
} from "@/components/icons";
import type { InvoiceDetailDto, InvoiceSummaryDto, Paged } from "@/lib/types";

/**
 * Member Invoices & Receipts. Read-only member portal view.
 * All billing adjustments and payments are managed through the reception desk.
 */
export default function MyInvoicesPage() {
  const { language } = useLanguage();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [showPrintReceipt, setShowPrintReceipt] = useState(false);

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
    <MemberShell
      title={language === "en" ? "Invoices & Payments" : "Hóa đơn & Thanh toán"}
      description={
        language === "en"
          ? "Track membership packages, desk charges, and payment transaction history"
          : "Theo dõi hóa đơn gói tập, các khoản thanh toán tại quầy và lịch sử giao dịch"
      }
      allow={["Member"]}
    >
      <Card
        title={language === "en" ? "Billing History" : "Danh sách hóa đơn"}
        bodyless
      >
        <AsyncSection
          state={invoices}
          emptyMessage={
            <div style={{ textAlign: "center", padding: "36px 16px" }}>
              <StickerPlansEmpty size={72} style={{ marginBottom: 12 }} />
              <p style={{ margin: 0, fontWeight: 500, color: "var(--ink-700, #334155)" }}>
                {language === "en"
                  ? "You do not have any invoices or payment transactions yet."
                  : "Bạn chưa có hóa đơn hay giao dịch thanh toán nào."}
              </p>
            </div>
          }
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <>
              <Table
                headers={[
                  language === "en" ? "Invoice #" : "Số hóa đơn",
                  language === "en" ? "Issued Date" : "Ngày phát hành",
                  { text: language === "en" ? "Total Amount" : "Tổng tiền", numeric: true },
                  { text: language === "en" ? "Paid" : "Đã thanh toán", numeric: true },
                  { text: language === "en" ? "Balance Due" : "Còn lại", numeric: true },
                  language === "en" ? "Due Date" : "Hạn nộp",
                  language === "en" ? "Status" : "Trạng thái",
                  "",
                ]}
              >
                {data.items.map((item) => (
                  <tr key={item.invoiceId}>
                    <td>
                      <strong>{item.invoiceNumber}</strong>
                    </td>
                    <td className="nowrap small">
                      {formatDate(item.issuedAt)}
                    </td>
                    <td className="num">{formatMoney(item.totalAmount)}</td>
                    <td className="num">{formatMoney(item.netCollected)}</td>
                    <td className="num">{formatMoney(item.outstanding)}</td>
                    <td className="nowrap small">
                      {formatDate(item.dueDateUtc)}
                      {item.isOverdue && (
                        <div style={{ color: "var(--danger-700)", fontWeight: 600 }}>
                          {language === "en" ? "Overdue" : "Quá hạn"}
                        </div>
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
                        aria-label={
                          language === "en"
                            ? `View details for invoice ${item.invoiceNumber}`
                            : `Xem chi tiết hóa đơn ${item.invoiceNumber}`
                        }
                      >
                        {language === "en" ? "Details" : "Chi tiết"}
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
          title={language === "en" ? "Invoice Details" : "Chi tiết hóa đơn"}
          onClose={() => setSelected(null)}
        >
          <AsyncSection
            state={detail}
            emptyMessage={
              language === "en"
                ? "The invoice details could not be loaded."
                : "Không thể tải chi tiết hóa đơn."
            }
          >
            {(data) =>
              data ? (
                <div className="stack" style={{ gap: 18 }}>
                  <div
                    style={{
                      paddingBottom: 14,
                      borderBottom: "1px solid var(--line, #dfe5ec)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--brand-900, #0b2d4d)" }}>
                          {data.summary.invoiceNumber}
                        </span>
                        <StatusChip value={data.summary.status} />
                      </div>
                      <div className="small muted" style={{ marginTop: 4 }}>
                        {language === "en" ? "Issued: " : "Ngày phát hành: "}
                        {formatDateTime(data.summary.issuedAt)} ·{" "}
                        {language === "en" ? "Payment Deadline: " : "Hạn thanh toán: "}
                        {formatDate(data.summary.dueDateUtc)}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                      onClick={() => setShowPrintReceipt(true)}
                    >
                      <IconPrinter size={15} />
                      <span>{language === "en" ? "Print Receipt" : "In hóa đơn"}</span>
                    </button>
                  </div>

                  {/* Line Items */}
                  <div>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 8px" }}>
                      {language === "en" ? "Service Items" : "Dịch vụ đã đăng ký"}
                    </h3>
                    <Table
                      headers={[
                        language === "en" ? "Item Description" : "Tên dịch vụ",
                        { text: language === "en" ? "Amount" : "Thành tiền", numeric: true },
                      ]}
                    >
                      {data.items.map((item) => (
                        <tr key={item.itemId}>
                          <td>{item.description}</td>
                          <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {formatMoney(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>

                  {/* Payments Recorded */}
                  <div>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "8px 0 8px" }}>
                      {language === "en" ? "Payment History" : "Lịch sử thanh toán"}
                    </h3>
                    {data.payments.length === 0 ? (
                      <p className="small muted">
                        {language === "en"
                          ? "No payments recorded yet for this invoice."
                          : "Chưa ghi nhận khoản thanh toán nào cho hóa đơn này."}
                      </p>
                    ) : (
                      <Table
                        headers={[
                          language === "en" ? "Payment Time" : "Thời gian",
                          language === "en" ? "Method" : "Hình thức",
                          { text: language === "en" ? "Amount Paid" : "Số tiền", numeric: true },
                          language === "en" ? "Status" : "Trạng thái",
                        ]}
                      >
                        {data.payments.map((payment) => (
                          <tr key={payment.paymentId}>
                            <td className="nowrap small">
                              {formatDateTime(payment.paidAt)}
                            </td>
                            <td>{label(payment.method)}</td>
                            <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                              {formatMoney(payment.amount)}
                            </td>
                            <td>
                              <StatusChip value={payment.status} />
                            </td>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </div>

                  {/* Adjustments */}
                  {data.adjustments.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "8px 0 8px" }}>
                        {language === "en" ? "Adjustments & Discounts" : "Điều chỉnh & Khấu trừ"}
                      </h3>
                      <Table
                        headers={[
                          language === "en" ? "Type" : "Loại điều chỉnh",
                          { text: language === "en" ? "Amount" : "Số tiền", numeric: true },
                          language === "en" ? "Reason" : "Lý do",
                          language === "en" ? "Status" : "Trạng thái",
                        ]}
                      >
                        {data.adjustments.map((adjustment) => (
                          <tr key={adjustment.adjustmentId}>
                            <td>{label(adjustment.type)}</td>
                            <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                              {formatMoney(adjustment.amount)}
                            </td>
                            <td className="small">{adjustment.reason}</td>
                            <td>
                              <StatusChip value={adjustment.status} />
                            </td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  )}

                  {/* Structured Summary Breakdown Card */}
                  <div
                    style={{
                      background: "var(--surface-alt, #f8fafc)",
                      border: "1.5px solid var(--line, #e2e8f0)",
                      borderRadius: "var(--radius, 10px)",
                      padding: "16px 20px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                      <span className="muted">{language === "en" ? "Total Obligation:" : "Tổng nghĩa vụ:"}</span>
                      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(data.summary.totalAmount)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                      <span className="muted">{language === "en" ? "Amount Paid:" : "Đã thanh toán:"}</span>
                      <strong style={{ fontVariantNumeric: "tabular-nums", color: "var(--ok-700, #15803d)" }}>
                        {formatMoney(data.summary.grossCollected)}
                      </strong>
                    </div>
                    {data.summary.obligationReduction > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                        <span className="muted">{language === "en" ? "Discount / Adjustment:" : "Giảm trừ / Khấu trừ:"}</span>
                        <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                          -{formatMoney(data.summary.obligationReduction)}
                        </strong>
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        borderTop: "1px dashed var(--line, #cbd5e1)",
                        paddingTop: 10,
                        marginTop: 4,
                        fontSize: "0.98rem",
                        fontWeight: 800,
                      }}
                    >
                      <span>{language === "en" ? "Remaining Balance Due:" : "Số dư còn nợ:"}</span>
                      <span
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          color: data.summary.outstanding > 0 ? "var(--warning-700, #b45309)" : "var(--ok-700, #15803d)",
                        }}
                      >
                        {formatMoney(data.summary.outstanding)}
                      </span>
                    </div>
                  </div>

                  {data.summary.refundDue > 0 && (
                    <div className="alert alert--warn">
                      {language === "en" ? (
                        <>
                          SportHub refund balance due: <strong>{formatMoney(data.summary.refundDue)}</strong>. Please visit the reception desk to collect your refund.
                        </>
                      ) : (
                        <>
                          Số tiền trung tâm hoàn trả cho bạn: <strong>{formatMoney(data.summary.refundDue)}</strong>. Vui lòng ghé quầy Lễ tân để nhận khoản tiền này.
                        </>
                      )}
                    </div>
                  )}

                  {data.summary.refundedAmount > 0 && (
                    <div className="alert alert--success">
                      {language === "en" ? (
                        <>
                          Refund completed: <strong>{formatMoney(data.summary.refundedAmount)}</strong> has been disbursed to you.
                        </>
                      ) : (
                        <>
                          Đã hoàn trả thành công <strong>{formatMoney(data.summary.refundedAmount)}</strong> cho bạn.
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : null
            }
          </AsyncSection>
        </Dialog>
      )}

      {/* Printable Receipt Modal for Member */}
      {showPrintReceipt && detail.data && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={language === "en" ? "Official Member Receipt" : "Hóa đơn thanh toán hội viên"}
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
          onClick={() => setShowPrintReceipt(false)}
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
                {language === "en" ? "Official Member Payment Receipt & Tax Voucher" : "Biên lai thanh toán & Chứng từ dịch vụ"}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span>{language === "en" ? "Invoice / Receipt #:" : "Mã hóa đơn / Biên lai:"}</span>
              <strong>{detail.data.summary.invoiceNumber}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span>{language === "en" ? "Date of Issue:" : "Ngày phát hành:"}</span>
              <span>{formatDate(detail.data.summary.issuedAt)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
              <span>{language === "en" ? "Member Account:" : "Hội viên:"}</span>
              <strong>{detail.data.summary.memberName}</strong>
            </div>

            {/* Line items on thermal print */}
            <div style={{ borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", padding: "8px 0" }}>
              {detail.data.items.map((item) => (
                <div
                  key={item.itemId}
                  style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", padding: "3px 0" }}
                >
                  <span>{item.description}</span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(item.amount)}</strong>
                </div>
              ))}
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
              <span>{language === "en" ? "TOTAL PAID:" : "TỔNG ĐÃ NỘP:"}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(detail.data.summary.grossCollected)}
              </span>
            </div>

            <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--ink-500, #64748b)", margin: "4px 0" }}>
              {language === "en"
                ? "SportHub Health & Fitness Club · Retain this electronic slip for expense filing."
                : "Câu lạc bộ Thể thao SportHub · Vui lòng lưu biên lai điện tử này để thanh toán hoặc quyết toán chi phí."}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                type="button"
                className="btn btn--primary"
                style={{ flex: 1, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 }}
                onClick={() => window.print()}
              >
                <IconPrinter size={16} />
                <span>{language === "en" ? "Print Receipt" : "In biên lai"}</span>
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowPrintReceipt(false)}
              >
                {language === "en" ? "Close" : "Đóng"}
              </button>
            </div>
          </div>
        </div>
      )}
    </MemberShell>
  );
}
