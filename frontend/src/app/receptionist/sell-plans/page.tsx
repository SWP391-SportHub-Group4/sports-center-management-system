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
      "The invoice has been released. Package will be activated after having enough money collected (BR-30).",
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
      "Recorded.",
    );

    if (updated) {
      setInvoice(updated);
      setPaymentAmount(String(updated.summary.outstanding));
      memberPackages.reload();
    }
  };

  return (
    <AppShell
      title="Selling member packages"
      description="Release the invoices and collect the money — the package only activates when the invoice is paid enough"
      allow={["Receptionist", "CenterManager"]}
    >
      <div className="grid grid--2">
        <Card title="1. Select membership and packages">
          <form className="form" onSubmit={submitPurchase}>
            <MemberPicker value={member} onChange={setMember} />

            <Field label="Members Package">
              <select
                value={packageId}
                required
                onChange={(event) => setPackageId(event.target.value)}
              >
                <option value="">— Select packages —</option>
                {(catalog.data ?? []).map((item) => (
                  <option key={item.packageId} value={item.packageId}>
                    {item.name} · {formatMoney(item.price)} · {item.durationDays} days
                    {item.sessionLimit ? ` · ${item.sessionLimit} sessions` : "· Unlimited session"}
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
                  Allows the addition to the package of the same type in operation (BR-10)
                </label>

                {allowStacking && (
                  <Field label="Reasons for Coalition (citation)">
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
              {purchase.busy ? "Releaseing..." : "Release invoice"}
            </button>
          </form>
        </Card>

        <Card
          title="2. Retrieved"
          hint="Notes handmade at the counter — MVP did not integrate the actual payment gate."
        >
          {!invoice ? (
            <p className="muted">
              Select membership and package at step 1 to release the invoice before collecting the money.
            </p>
          ) : (
            <div className="stack">
              <div className="alert alert--info">
                <strong>{invoice.summary.invoiceNumber}</strong> · Total{" "}
                {formatMoney(invoice.summary.totalAmount)} . . .{" "}
                {formatMoney(invoice.summary.outstanding)} ·{" "}
                <StatusChip value={invoice.summary.status} />
              </div>

              {invoice.summary.outstanding > 0 ? (
                <form className="form" onSubmit={submitPayment}>
                  <Field
                    label="Retrieved Number (VND)"
                    hint={`Maximum ${formatMoney(invoice.summary.outstanding)} — overpayment will be rejected (BR-41).`}
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

                  <Field label="Format">
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
                    {payment.busy ? "Noting..." : "Payment Records"}
                  </button>
                </form>
              ) : (
                <>
                  <div className="alert alert--success">
                    The invoice is paid in full, the membership package is activated.
                  </div>
                  <Feedback error={payment.error} success={payment.success} />
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      {member && (
        <Card title={`Current plans for ${member.fullName || member.email}`} bodyless>
          <AsyncSection
            state={memberPackages}
            emptyMessage="The members haven't got any packages yet."
            isEmpty={(data) => !data || data.length === 0}
          >
            {(data) =>
              data ? (
                <Table
                  headers={[
                    "Packages",
                    "Effects",
                    { text: "The other day.", numeric: true },
                    "Status",
                  ]}
                >
                  {data.map((item) => (
                    <tr key={item.memberPackageId}>
                      <td>{item.packageName}</td>
                      <td className="nowrap small">
                        {formatDate(item.startDate)} – {formatDate(item.endDate)}
                      </td>
                      <td className="num">
                        {item.remainingSessions === null ? "No Limit" : item.remainingSessions}
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
