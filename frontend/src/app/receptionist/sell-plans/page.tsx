"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MemberPicker } from "@/components/MemberPicker";
import {
  AsyncSection,
  Feedback,
  Field,
  StatusChip,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatMoney, label } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import {
  IconCheck,
  IconPrinter,
  IconSparkles,
  StickerPlansEmpty,
  StickerSuccessTrophy,
} from "@/components/icons";
import type {
  InvoiceDetailDto,
  MemberPackageDto,
  MembershipPackageDto,
  UserAdminDto,
} from "@/lib/types";
import styles from "./sell-plans.module.css";

/**
 * Bán gói — BR-30: chọn gói là PHÁT HÀNH HÓA ĐƠN NGAY, trước khi thu bất kỳ khoản nào; gói ở
 * trạng thái Chờ thanh toán và chỉ chuyển Hoạt động sau khi hóa đơn được thanh toán đủ.
 *
 * BR-10: mặc định mỗi hội viên chỉ có một gói cùng loại đang hoạt động. Cờ "cho phép cộng dồn"
 * chỉ Quản lý Trung tâm bật được và bắt buộc kèm lý do — nên nó chỉ hiện với vai trò đó.
 */
export default function SellPackagePage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isManager = user?.role === "CenterManager";

  const [member, setMember] = useState<UserAdminDto | null>(null);
  const [packageId, setPackageId] = useState("");
  const [allowStacking, setAllowStacking] = useState(false);
  const [stackingReason, setStackingReason] = useState("");
  const [invoice, setInvoice] = useState<InvoiceDetailDto | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  const purchase = useAction();
  const payment = useAction();

  const catalog = useApi(
    (signal) =>
      api.get<MembershipPackageDto[]>("/api/membership-packages", { signal }),
    [],
  );

  const memberPackages = useApi(
    (signal) =>
      member
        ? api.get<MemberPackageDto[]>(
            `/api/members/${member.userId}/packages`,
            { signal },
          )
        : Promise.resolve(null),
    [member?.userId],
  );

  const selectedPackage = catalog.data?.find(
    (item) => String(item.packageId) === packageId,
  );

  const submitPurchase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!member || !selectedPackage) return;

    const created = await purchase.run(
      () =>
        api.post<InvoiceDetailDto>("/api/member-packages/purchase", {
          memberId: member.userId,
          packageId: selectedPackage.packageId,
          allowStacking,
          stackingApprovalReason: allowStacking ? stackingReason.trim() : null,
        }),
      language === "en"
        ? "Invoice successfully issued. Proceed to payment settlement (BR-30)."
        : "Đã phát hành hóa đơn thành công. Tiến hành thu tiền tại bước 2 (BR-30).",
    );

    if (created) {
      setInvoice(created);
      setPaymentAmount(String(created.summary.outstanding));
      memberPackages.reload();
    }
  };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!invoice) return;

    const updated = await payment.run(
      () =>
        api.post<InvoiceDetailDto>(
          `/api/invoices/${invoice.summary.invoiceId}/payments`,
          {
            amount: Number(paymentAmount),
            method: paymentMethod,
          },
        ),
      language === "en"
        ? "Payment confirmed. Membership package is activated."
        : "Đã ghi nhận thanh toán. Gói tập đã được kích hoạt thành công.",
    );

    if (updated) {
      setInvoice(updated);
      setPaymentAmount(String(updated.summary.outstanding));
      memberPackages.reload();
      if (updated.summary.outstanding === 0) {
        setShowReceipt(true);
      }
    }
  };

  const applyPreset = (ratio: number) => {
    if (!invoice) return;
    const val = Math.round(invoice.summary.outstanding * ratio);
    setPaymentAmount(String(val));
  };

  const currentStep = !invoice ? 1 : invoice.summary.outstanding > 0 ? 2 : 3;

  return (
    <AppShell
      title={
        language === "en" ? "POS Package Sales & Cashier" : "Bán gói tập & Thu ngân"
      }
      description={
        language === "en"
          ? "Front-desk POS cashier terminal: issue invoices, collect fees, and print official receipts (BR-30)"
          : "Trạm thu ngân quầy lễ tân: phát hành hóa đơn, thu tiền và in biên lai chính thức (BR-30)"
      }
      allow={["Receptionist", "CenterManager"]}
    >
      <div className={styles.container}>
        {/* Step-by-Step Progress Tracker */}
        <div className={styles.workflowTracker}>
          <div
            className={`${styles.stepItem} ${currentStep === 1 ? styles.stepActive : currentStep > 1 ? styles.stepDone : ""}`}
          >
            <span className={styles.stepNumber}>1</span>
            <div className={styles.stepTexts}>
              <span className={styles.stepTitle}>
                {language === "en" ? "Select Package" : "Chọn gói tập"}
              </span>
              <span className={styles.stepDesc}>
                {language === "en" ? "Issue invoice upfront" : "Phát hành hóa đơn"}
              </span>
            </div>
          </div>

          <div
            className={`${styles.stepItem} ${currentStep === 2 ? styles.stepActive : currentStep > 2 ? styles.stepDone : ""}`}
          >
            <span className={styles.stepNumber}>2</span>
            <div className={styles.stepTexts}>
              <span className={styles.stepTitle}>
                {language === "en" ? "Collect Payment" : "Thu tiền tại quầy"}
              </span>
              <span className={styles.stepDesc}>
                {language === "en" ? "Cash, Card, Transfer" : "Tiền mặt, Thẻ, CK"}
              </span>
            </div>
          </div>

          <div
            className={`${styles.stepItem} ${currentStep === 3 ? styles.stepDone : ""}`}
          >
            <span className={styles.stepNumber}>3</span>
            <div className={styles.stepTexts}>
              <span className={styles.stepTitle}>
                {language === "en" ? "Receipt & Activation" : "Biên lai & Kích hoạt"}
              </span>
              <span className={styles.stepDesc}>
                {language === "en" ? "Official record complete" : "Hoàn tất thủ tục"}
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column POS Layout */}
        <div className={styles.posGrid}>
          {/* Left Column: Member & Package Selection */}
          <div className={styles.posCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                {language === "en" ? "1. Member & Package Selection" : "1. Chọn hội viên & Gói tập"}
              </h3>
            </div>

            <form className="form" onSubmit={submitPurchase}>
              <MemberPicker autoFocus value={member} onChange={setMember} />

              <Field
                label={language === "en" ? "Available Packages Catalog" : "Danh mục gói tập SportHub"}
              >
                <div className={styles.packageGrid}>
                  {(catalog.data ?? []).map((pkg) => {
                    const isSelected = String(pkg.packageId) === packageId;
                    return (
                      <div
                        key={pkg.packageId}
                        className={`${styles.packageOption} ${isSelected ? styles.packageSelected : ""}`}
                        onClick={() => setPackageId(String(pkg.packageId))}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setPackageId(String(pkg.packageId));
                          }
                        }}
                      >
                        <div>
                          <div className={styles.packageOptionName}>{pkg.name}</div>
                          <div className={styles.packageOptionMeta}>
                            {pkg.durationDays} {language === "en" ? "days validity" : "ngày hiệu lực"}
                            {pkg.sessionLimit
                              ? ` · ${pkg.sessionLimit} ${language === "en" ? "sessions" : "buổi"}`
                              : ` · ${language === "en" ? "Unlimited access" : "Tập không giới hạn"}`}
                          </div>
                        </div>
                        <div className={styles.packageOptionPrice}>
                          {formatMoney(pkg.price)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Field>

              {isManager && (
                <>
                  <label className="row small" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={allowStacking}
                      style={{ width: "auto" }}
                      onChange={(event) => setAllowStacking(event.target.checked)}
                    />
                    <span>
                      {language === "en"
                        ? "Allow stacking with existing active package of same type (BR-10)"
                        : "Cho phép cộng dồn với gói cùng loại đang hoạt động (BR-10)"}
                    </span>
                  </label>

                  {allowStacking && (
                    <Field
                      label={
                        language === "en"
                          ? "Manager Approval Reason (Required)"
                          : "Lý do phê duyệt cộng dồn (Bắt buộc)"
                      }
                    >
                      <input
                        value={stackingReason}
                        required
                        placeholder={
                          language === "en"
                            ? "e.g. VIP Member special renewal approval"
                            : "Ví dụ: Phê duyệt đặc cách gia hạn trước cho hội viên VIP"
                        }
                        onChange={(event) => setStackingReason(event.target.value)}
                      />
                    </Field>
                  )}
                </>
              )}

              <Feedback error={purchase.error} success={purchase.success} />

              <button
                type="submit"
                className="btn btn--primary"
                disabled={!member || !packageId || purchase.busy}
                style={{ height: 44, fontWeight: 700 }}
              >
                {purchase.busy
                  ? (language === "en" ? "Issuing Invoice..." : "Đang phát hành hóa đơn...")
                  : (language === "en" ? "Issue Invoice (BR-30) →" : "Phát hành hóa đơn (BR-30) →")}
              </button>
            </form>
          </div>

          {/* Right Column: Payment Settlement Workbench */}
          <div className={styles.posCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                {language === "en" ? "2. Payment Settlement & POS Cashier" : "2. Thu tiền & Quyết toán quầy"}
              </h3>
            </div>

            {!invoice ? (
              <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--ink-500, #64748b)" }}>
                <div style={{ display: "grid", placeItems: "center", marginBottom: 14 }}>
                  <StickerPlansEmpty size={80} />
                </div>
                <p style={{ margin: 0, fontSize: "0.95rem" }}>
                  {language === "en"
                    ? "Select a member and package in Step 1 to issue the invoice before collecting payment."
                    : "Chọn hội viên và gói tập ở Bước 1 để phát hành hóa đơn trước khi thu tiền."}
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Invoice Summary Banner */}
                <div className={styles.invoiceBanner}>
                  <div className={styles.invoiceBannerRow}>
                    <span className={styles.invoiceNumber}>
                      {invoice.summary.invoiceNumber}
                    </span>
                    <StatusChip value={invoice.summary.status} />
                  </div>
                  <div className={styles.invoiceBannerRow}>
                    <span style={{ fontSize: "0.85rem", color: "var(--ink-700)" }}>
                      {language === "en" ? "Total Payable:" : "Tổng giá trị:"}{" "}
                      <strong>{formatMoney(invoice.summary.totalAmount)}</strong>
                    </span>
                    <span className={styles.invoiceTotal}>
                      {formatMoney(invoice.summary.outstanding)}
                    </span>
                  </div>
                </div>

                {invoice.summary.outstanding > 0 ? (
                  <form className="form" onSubmit={submitPayment}>
                    <div>
                      <Field
                        label={language === "en" ? "Quick Amount Presets" : "Chọn nhanh số tiền"}
                      >
                        <div className={styles.presetBtnRow}>
                          <button
                            type="button"
                            className={styles.presetBtn}
                            onClick={() => applyPreset(1)}
                          >
                            {language === "en" ? "100% Full Payment" : "100% Thu đủ"}
                          </button>
                          <button
                            type="button"
                            className={styles.presetBtn}
                            onClick={() => applyPreset(0.5)}
                          >
                            {language === "en" ? "50% Deposit" : "50% Đặt cọc"}
                          </button>
                        </div>
                      </Field>

                      <Field
                        label={language === "en" ? "Payment Amount (VND)" : "Số tiền thu (VNĐ)"}
                        hint={
                          language === "en"
                            ? `Max ${formatMoney(invoice.summary.outstanding)} (BR-41: no overpayment).`
                            : `Tối đa ${formatMoney(invoice.summary.outstanding)} (BR-41: không thu vượt quá).`
                        }
                      >
                        <input
                          type="number"
                          min={1}
                          max={invoice.summary.outstanding}
                          step={1}
                          value={paymentAmount}
                          required
                          style={{ height: 44, fontWeight: 700, fontSize: "1.1rem" }}
                          onChange={(event) => setPaymentAmount(event.target.value)}
                        />
                      </Field>
                    </div>

                    <Field
                      label={language === "en" ? "Payment Method" : "Phương thức thanh toán"}
                    >
                      <select
                        value={paymentMethod}
                        style={{ height: 44 }}
                        onChange={(event) => setPaymentMethod(event.target.value)}
                      >
                        {["Cash", "Card", "Transfer", "EWallet"].map((method) => (
                          <option key={method} value={method}>
                            {language === "vi"
                              ? {
                                  Cash: "Tiền mặt tại quầy",
                                  Card: "Quẹt thẻ POS ngân hàng",
                                  Transfer: "Chuyển khoản trực tiếp",
                                  EWallet: "Ví điện tử MoMo/ZaloPay",
                                }[method] || label(method)
                              : label(method)}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Feedback error={payment.error} success={payment.success} />

                    <button
                      type="submit"
                      className={styles.settleBtn}
                      disabled={payment.busy}
                    >
                      {payment.busy ? (
                        <span>{language === "en" ? "Recording..." : "Đang ghi nhận..."}</span>
                      ) : (
                        <>
                          <IconCheck size={18} />
                          <span>{language === "en" ? "Confirm Payment Collection" : "Xác nhận thu tiền"}</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div className="alert alert--success" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <IconSparkles size={20} />
                      <span>
                        {language === "en"
                          ? "Invoice is fully settled! Membership package has been activated."
                          : "Hóa đơn đã thanh toán đầy đủ! Gói tập đã được kích hoạt thành công."}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => setShowReceipt(true)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        <IconPrinter size={16} />
                        <span>{language === "en" ? "Print Official Receipt" : "In biên lai thu tiền"}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => {
                          setInvoice(null);
                          setPackageId("");
                          setPaymentAmount("");
                        }}
                      >
                        {language === "en" ? "New Transaction" : "Giao dịch mới"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Existing Member Passes Overview */}
        {member && (
          <div className={styles.posCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                {language === "en"
                  ? `Active & Past Passes · ${member.fullName || member.email}`
                  : `Các gói tập hiện có của ${member.fullName || member.email}`}
              </h3>
            </div>

            <AsyncSection
              state={memberPackages}
              emptyMessage={
                language === "en"
                  ? "This member has no membership passes on record."
                : "Hội viên chưa có gói tập nào trong hệ thống."
              }
              isEmpty={(data) => !data || data.length === 0}
            >
              {(data) =>
                data ? (
                  <Table
                    headers={[
                      language === "en" ? "Package" : "Gói tập",
                      language === "en" ? "Validity Period" : "Thời hạn",
                      {
                        text:
                          language === "en"
                            ? "Remaining Sessions"
                            : "Buổi còn lại",
                        numeric: true,
                      },
                      language === "en" ? "Status" : "Trạng thái",
                    ]}
                  >
                    {data.map((item) => (
                      <tr key={item.memberPackageId}>
                        <td>
                          <strong>{item.packageName}</strong>
                        </td>
                        <td className="nowrap small">
                          {formatDate(item.startDate)} – {formatDate(item.endDate)}
                        </td>
                        <td className="num">
                          {item.remainingSessions === null
                            ? (language === "en" ? "Unlimited" : "Không giới hạn")
                            : item.remainingSessions}
                        </td>
                        <td>
                          <StatusChip value={item.status} />
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : null
              }
            </AsyncSection>
          </div>
        )}

        {/* Printable Official Receipt Modal */}
        {showReceipt && invoice && (
          <div
            className={styles.receiptModalBackdrop}
            onClick={() => setShowReceipt(false)}
            role="dialog"
            aria-modal="true"
            aria-label={language === "en" ? "Payment Receipt" : "Biên lai thu tiền"}
          >
            <div
              className={styles.receiptCard}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                <StickerSuccessTrophy size={56} />
              </div>
              <div className={styles.receiptBrand}>
                <div className={styles.receiptLogo}>SPORTHUB CENTER</div>
                <div style={{ fontSize: "0.82rem", color: "var(--ink-500)", marginTop: 2 }}>
                  {language === "en" ? "Official Front Desk Payment Receipt" : "Biên lai thanh toán tại quầy"}
                </div>
              </div>

              <div className={styles.receiptMetaRow}>
                <span>{language === "en" ? "Receipt #:" : "Mã biên lai:"}</span>
                <strong>{invoice.summary.invoiceNumber}</strong>
              </div>

              <div className={styles.receiptMetaRow}>
                <span>{language === "en" ? "Date & Time:" : "Thời gian:"}</span>
                <span>{formatDateTime(new Date().toISOString())}</span>
              </div>

              <div className={styles.receiptMetaRow}>
                <span>{language === "en" ? "Member:" : "Hội viên:"}</span>
                <strong>{member?.fullName || invoice.summary.memberName}</strong>
              </div>

              <div className={styles.receiptMetaRow}>
                <span>{language === "en" ? "Cashier:" : "Thu ngân:"}</span>
                <span>{user?.fullName || "Receptionist"}</span>
              </div>

              <div style={{ margin: "8px 0" }}>
                <div className={styles.receiptItemRow}>
                  <span>{selectedPackage?.name || "Membership Package"}</span>
                  <strong>{formatMoney(invoice.summary.totalAmount)}</strong>
                </div>
                <div className={styles.receiptItemRow} style={{ color: "var(--ink-500)", fontSize: "0.85rem" }}>
                  <span>{language === "en" ? "Method:" : "Phương thức:"}</span>
                  <span>{label(paymentMethod)}</span>
                </div>
              </div>

              <div className={styles.receiptTotalRow}>
                <span>{language === "en" ? "TOTAL PAID:" : "ĐÃ THANH TOÁN:"}</span>
                <span>{formatMoney(invoice.summary.totalAmount - invoice.summary.outstanding)}</span>
              </div>

              <div style={{ textAlign: "center", fontSize: "0.78rem", color: "var(--ink-500)", margin: "4px 0" }}>
                {language === "en"
                  ? "Thank you for training with SportHub! Please retain this receipt."
                  : "Cảm ơn quý khách đã đồng hành cùng SportHub! Vui lòng giữ lại biên lai."}
              </div>

              <div className={styles.receiptActions}>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => window.print()}
                  style={{ flex: 1, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 }}
                >
                  <IconPrinter size={16} />
                  <span>{language === "en" ? "Print Receipt" : "In biên lai"}</span>
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowReceipt(false)}
                >
                  {language === "en" ? "Close" : "Đóng"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
