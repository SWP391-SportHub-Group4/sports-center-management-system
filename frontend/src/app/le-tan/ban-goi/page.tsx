"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MemberPicker } from "@/components/MemberPicker";
import { AsyncSection, Card, Feedback, Field, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatMoney, label } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import type {
  InvoiceDetailDto,
  MemberPackageDto,
  MembershipPackageDto,
  UserAdminDto,
} from "@/lib/types";

/**
 * Bán gói — BR-30: chọn gói là PHÁT HÀNH HÓA ĐƠN NGAY, trước khi thu bất kỳ khoản nào; gói ở
 * trạng thái Chờ thanh toán và chỉ chuyển Hoạt động sau khi hóa đơn được thanh toán đủ.
 *
 * BR-10: mặc định mỗi hội viên chỉ có một gói cùng loại đang hoạt động. Cờ "cho phép cộng dồn"
 * chỉ Quản lý Trung tâm bật được và bắt buộc kèm lý do — nên nó chỉ hiện với vai trò đó.
 */
export default function SellPackagePage() {
  const { user } = useAuth();
  const isManager = user?.role === "CenterManager";

  const [member, setMember] = useState<UserAdminDto | null>(null);
  const [packageId, setPackageId] = useState("");
  const [allowStacking, setAllowStacking] = useState(false);
  const [stackingReason, setStackingReason] = useState("");
  const [invoice, setInvoice] = useState<InvoiceDetailDto | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  const purchase = useAction();
  const payment = useAction();

  const catalog = useApi(
    (signal) => api.get<MembershipPackageDto[]>("/api/membership-packages", { signal }),
    [],
  );

  const memberPackages = useApi(
    (signal) =>
      member
        ? api.get<MemberPackageDto[]>(`/api/members/${member.userId}/packages`, { signal })
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
      "Đã phát hành hóa đơn. Gói sẽ được kích hoạt sau khi thu đủ tiền (BR-30).",
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
        api.post<InvoiceDetailDto>(`/api/invoices/${invoice.summary.invoiceId}/payments`, {
          amount: Number(paymentAmount),
          method: paymentMethod,
        }),
      "Đã ghi nhận khoản thu.",
    );

    if (updated) {
      setInvoice(updated);
      setPaymentAmount(String(updated.summary.outstanding));
      memberPackages.reload();
    }
  };

  return (
    <AppShell
      title="Bán gói thành viên"
      description="Phát hành hóa đơn rồi thu tiền — gói chỉ kích hoạt khi hóa đơn thanh toán đủ"
      allow={["Receptionist", "CenterManager"]}
    >
      <div className="grid grid--2">
        <Card title="1. Chọn hội viên và gói">
          <form className="form" onSubmit={submitPurchase}>
            <MemberPicker value={member} onChange={setMember} />

            <Field label="Gói thành viên">
              <select
                value={packageId}
                required
                onChange={(event) => setPackageId(event.target.value)}
              >
                <option value="">— Chọn gói —</option>
                {(catalog.data ?? []).map((item) => (
                  <option key={item.packageId} value={item.packageId}>
                    {item.name} · {formatMoney(item.price)} · {item.durationDays} ngày
                    {item.sessionLimit ? ` · ${item.sessionLimit} buổi` : " · không giới hạn buổi"}
                  </option>
                ))}
              </select>
            </Field>

            {isManager && (
              <>
                <label className="row small">
                  <input
                    type="checkbox"
                    checked={allowStacking}
                    style={{ width: "auto" }}
                    onChange={(event) => setAllowStacking(event.target.checked)}
                  />
                  Cho phép cộng dồn với gói cùng loại đang hoạt động (BR-10)
                </label>

                {allowStacking && (
                  <Field label="Lý do cho phép cộng dồn (bắt buộc)">
                    <input
                      value={stackingReason}
                      required
                      onChange={(event) => setStackingReason(event.target.value)}
                    />
                  </Field>
                )}
              </>
            )}

            <Feedback error={purchase.error} success={purchase.success} />

            <button
              type="submit"
              className="btn"
              disabled={!member || !packageId || purchase.busy}
            >
              {purchase.busy ? "Đang phát hành…" : "Phát hành hóa đơn"}
            </button>
          </form>
        </Card>

        <Card
          title="2. Thu tiền"
          hint="Ghi nhận thủ công tại quầy — MVP không tích hợp cổng thanh toán thật."
        >
          {!invoice ? (
            <p className="muted">
              Chọn hội viên và gói ở bước 1 để phát hành hóa đơn trước khi thu tiền.
            </p>
          ) : (
            <div className="stack">
              <div className="alert alert--info">
                <strong>{invoice.summary.invoiceNumber}</strong> · Tổng{" "}
                {formatMoney(invoice.summary.totalAmount)} · Còn phải thu{" "}
                {formatMoney(invoice.summary.outstanding)} ·{" "}
                <StatusChip value={invoice.summary.status} />
              </div>

              {invoice.summary.outstanding > 0 ? (
                <form className="form" onSubmit={submitPayment}>
                  <Field
                    label="Số tiền thu (VND)"
                    hint={`Tối đa ${formatMoney(invoice.summary.outstanding)} — thu vượt sẽ bị từ chối (BR-41).`}
                  >
                    <input
                      type="number"
                      min={1}
                      max={invoice.summary.outstanding}
                      step={1}
                      value={paymentAmount}
                      required
                      onChange={(event) => setPaymentAmount(event.target.value)}
                    />
                  </Field>

                  <Field label="Hình thức">
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                    >
                      {["Cash", "Card", "Transfer", "EWallet"].map((method) => (
                        <option key={method} value={method}>
                          {label(method)}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Feedback error={payment.error} success={payment.success} />

                  <button type="submit" className="btn" disabled={payment.busy}>
                    {payment.busy ? "Đang ghi nhận…" : "Ghi nhận thanh toán"}
                  </button>
                </form>
              ) : (
                <>
                  <div className="alert alert--success">
                    Hóa đơn đã thanh toán đủ. Gói thành viên đã được kích hoạt.
                  </div>
                  <Feedback error={payment.error} success={payment.success} />
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      {member && (
        <Card title={`Gói hiện có của ${member.fullName || member.email}`} bodyless>
          <AsyncSection
            state={memberPackages}
            emptyMessage="Hội viên chưa có gói nào."
            isEmpty={(data) => !data || data.length === 0}
          >
            {(data) =>
              data ? (
                <Table
                  headers={[
                    "Gói",
                    "Hiệu lực",
                    { text: "Buổi còn lại", numeric: true },
                    "Trạng thái",
                  ]}
                >
                  {data.map((item) => (
                    <tr key={item.memberPackageId}>
                      <td>{item.packageName}</td>
                      <td className="nowrap small">
                        {formatDate(item.startDate)} – {formatDate(item.endDate)}
                      </td>
                      <td className="num">
                        {item.remainingSessions === null ? "Không giới hạn" : item.remainingSessions}
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
        </Card>
      )}
    </AppShell>
  );
}
