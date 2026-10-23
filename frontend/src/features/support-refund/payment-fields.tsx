"use client";

import { api } from "@/lib/apiClient";
import {
  ITEM_TYPE_LABELS,
  formatVnd,
  type BankRefundItemRow,
} from "@/lib/bank-refund";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import styles from "./support-refund.module.css";

export interface PaymentFieldsValue {
  invoiceItemId: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export const EMPTY_PAYMENT_FIELDS: PaymentFieldsValue = {
  invoiceItemId: "",
  bankName: "",
  accountNumber: "",
  accountHolder: "",
};

const BANKS = [
  "Vietcombank",
  "VietinBank",
  "BIDV",
  "Agribank",
  "Techcombank",
  "MB Bank",
  "ACB",
  "VPBank",
  "TPBank",
  "Sacombank",
  "HDBank",
  "VIB",
  "SHB",
  "OCB",
  "MSB",
  "SeABank",
  "Eximbank",
];

export function normalizeAccountNumber(value: string): string {
  return value.replace(/[\s-]/g, "");
}

/** True when every field a refund request needs is present and well-formed (the server validates again). */
export function paymentFieldsReady(value: PaymentFieldsValue): boolean {
  return (
    value.invoiceItemId !== "" &&
    value.bankName.trim().length >= 2 &&
    /^[0-9]{6,20}$/.test(normalizeAccountNumber(value.accountNumber)) &&
    value.accountHolder.trim().length >= 2
  );
}

/** Appends the Payment-only fields to a multipart request. */
export function appendPaymentFields(form: FormData, value: PaymentFieldsValue) {
  form.append("invoiceItemId", value.invoiceItemId);
  form.append("bankName", value.bankName.trim());
  form.append("accountNumber", normalizeAccountNumber(value.accountNumber));
  form.append("accountHolder", value.accountHolder.trim());
}

/**
 * Transaction picker + bank account for a Payment (bank refund) request. A member picks from their own
 * transactions; staff choose the member first (memberId), then one of that member's transactions.
 */
export function PaymentFields({
  value,
  onChange,
  memberId,
  disabled = false,
}: {
  value: PaymentFieldsValue;
  onChange: (value: PaymentFieldsValue) => void;
  /** Staff only: the member whose transactions are listed. Omit for the signed-in member. */
  memberId?: string | null;
  disabled?: boolean;
}) {
  const staff = memberId !== undefined;
  const items = useApi(
    (signal) =>
      staff && !memberId
        ? Promise.resolve([] as BankRefundItemRow[])
        : api.get<BankRefundItemRow[]>("/api/bank-refunds/items", {
            signal,
            query: staff ? { memberId: memberId ?? "" } : {},
          }),
    [staff, memberId],
  );
  const rows = items.data ?? [];
  const chosen = rows.find((r) => r.invoiceItemId === value.invoiceItemId);
  const set = (patch: Partial<PaymentFieldsValue>) =>
    onChange({ ...value, ...patch });

  return (
    <fieldset className={styles.fields} disabled={disabled}>
      <legend className={styles.legend}>Refund to a bank account</legend>
      <p className={styles.notice}>
        This asks the center to{" "}
        <strong>review a refund to your bank account</strong>. It is not
        automatic: nothing is cancelled, refunded or paid until a manager
        approves it, and the manager transfers the money outside the system.
      </p>

      <label className={styles.field}>
        <span>Transaction to refund *</span>
        <select
          value={value.invoiceItemId}
          onChange={(e) => set({ invoiceItemId: e.target.value })}
          required
        >
          <option value="">
            {staff && !memberId
              ? "Choose the member first"
              : items.loading
                ? "Loading transactions…"
                : "Select a transaction"}
          </option>
          {rows.map((row) => (
            <option
              key={row.invoiceItemId}
              value={row.invoiceItemId}
              disabled={!row.eligible}
            >
              {ITEM_TYPE_LABELS[row.itemType] ?? row.itemType} ·{" "}
              {row.description} · {row.invoiceNumber}
              {row.paidAt ? ` · ${formatDate(row.paidAt)}` : ""}
              {row.eligible ? "" : " (not available)"}
            </option>
          ))}
        </select>
        {items.error && (
          <span className={styles.problem} role="alert">
            {items.error.message}
          </span>
        )}
        {chosen && (
          <span className={styles.hint}>
            Paid {formatVnd(chosen.lineAmount)} · at most{" "}
            <strong>{formatVnd(chosen.remainingRefundableVnd)}</strong> can
            still be refunded for this item.
          </span>
        )}
        {rows.some((r) => !r.eligible) && (
          <span className={styles.hint}>
            Unavailable items:{" "}
            {rows
              .filter((r) => !r.eligible)
              .slice(0, 3)
              .map((r) => `${r.description} — ${r.ineligibleReason}`)
              .join("; ")}
          </span>
        )}
      </label>

      <div className={styles.row2}>
        <label className={styles.field}>
          <span>Bank *</span>
          <input
            list="bank-refund-banks"
            value={value.bankName}
            maxLength={100}
            placeholder="e.g. Vietcombank"
            onChange={(e) => set({ bankName: e.target.value })}
            required
          />
          <datalist id="bank-refund-banks">
            {BANKS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label className={styles.field}>
          <span>Account number *</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={value.accountNumber}
            maxLength={30}
            placeholder="6–20 digits"
            onChange={(e) => set({ accountNumber: e.target.value })}
            required
          />
        </label>
      </div>
      <label className={styles.field}>
        <span>Account holder name *</span>
        <input
          autoComplete="off"
          value={value.accountHolder}
          maxLength={120}
          placeholder="As printed on the bank account"
          onChange={(e) => set({ accountHolder: e.target.value })}
          required
        />
      </label>
    </fieldset>
  );
}
