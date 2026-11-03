"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/apiClient";
import { useKeepPrevious } from "@/lib/keep-previous";
import { paymentSupportErrorCodes } from "@/lib/payment-support-errors";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import type { CheckoutDto, InvoiceDetailDto } from "@/lib/types";
import { AsyncSection, Card, Dialog, StatusChip, Table } from "@/components/ui";
import { Button, PageHeader, buttonClass } from "@/components/primitives";
import { DownloadInvoiceButton } from "./download-invoice-button";
import styles from "./checkout-panel.module.css";

/**
 * Chi tiết một hóa đơn của Member (A13): từng item với giá snapshot, tách điểm/tiền, lịch sử
 * payment và adjustment. Chỉ đọc dữ liệu server; quyền sở hữu do API quyết định (đổi ID trong URL
 * sang hóa đơn người khác trả 403/404 và trang chỉ hiện lỗi, không lộ nội dung).
 */
/** Paid with VNPay but the service could not be activated: the member picks points or a support request, once. */
function UnactivatedChoice({
  invoiceId,
  cashAmount,
  onResolved,
}: {
  invoiceId: string;
  cashAmount: number;
  onResolved: (message: string) => void;
}) {
  const key = useRef(crypto.randomUUID());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  async function convert() {
    setBusy(true);
    try {
      const done = await api.post<{ points: number }>(
        `/api/invoices/${invoiceId}/convert-to-points`,
        undefined,
        { idempotencyKey: key.current },
      );
      setConfirming(false);
      onResolved(`${formatPoints(done.points)} points were added to your wallet.`);
    } catch (error) {
      setConfirming(false);
      const resolved =
        error instanceof ApiError &&
        error.code === paymentSupportErrorCodes.reconciliationAlreadyResolved;
      setResult({
        ok: false,
        text: resolved
          ? "This payment was already resolved. Refresh to see the latest status."
          : error instanceof Error
            ? error.message
            : "We could not convert this payment. Please try again.",
      });
      if (resolved) onResolved("This payment was already resolved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Paid, but your service was not activated">
      <p>
        We received your VNPay payment of <strong>{formatMoney(cashAmount)}</strong>
        , but we could not activate the service (for example the seat or time
        slot was no longer available). Choose one option. You can only choose
        once.
      </p>
      <ul>
        <li>
          <strong>Receive points now.</strong> The paid amount is added to your
          wallet at 1 point = 1,000 VND.
        </li>
        <li>
          <strong>Send a support request.</strong> Ask for a bank refund and our
          manager reviews it. Your request will show its response deadline.
        </li>
      </ul>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <Button type="button" onClick={() => setConfirming(true)} disabled={busy}>
          Receive points now
        </Button>
        <Link
          className={buttonClass({ variant: "secondary" })}
          href={`/member/help?topic=PAYMENT&invoiceId=${invoiceId}`}
        >
          Send a support request
        </Link>
      </div>
      {result && (
        <p role={result.ok ? "status" : "alert"} style={{ color: result.ok ? undefined : "var(--danger-text)" }}>
          {result.text}
        </p>
      )}
      {confirming && (
        <Dialog title="Receive points instead?" onClose={() => setConfirming(false)}>
          <p>
            The paid amount becomes points in your wallet. After this you
            cannot ask for a bank refund for this payment.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
            <Button type="button" loading={busy} onClick={() => void convert()}>
              Yes, receive points
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

export function MemberInvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { t, language } = useLanguage();
  const f = t.finance;
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(
    null,
  );
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [resolution, setResolution] = useState<string | null>(null);
  const state = useApi(
    (signal) =>
      api.get<InvoiceDetailDto>(`/api/invoices/${invoiceId}`, { signal }),
    [invoiceId],
  );
  const unactivated = useApi(
    (signal) =>
      api.get<{ invoiceId: string }[]>("/api/members/me/unactivated-payments", {
        signal,
      }),
    [invoiceId],
  );
  const awaitingChoice = (unactivated.data ?? []).some(
    (x) => x.invoiceId === invoiceId,
  );
  const keptState = useKeepPrevious(state);
  const missing =
    state.error instanceof ApiError &&
    (state.error.status === 404 || state.error.status === 403);
  async function verifyPayment() {
    setCheckingPayment(true);
    setVerificationMessage(null);
    setVerificationFailed(false);
    try {
      const result = await api.post<{
        verified: boolean;
        checkout: CheckoutDto;
      }>(`/api/checkouts/${invoiceId}/verify-payment`);
      state.reload();
      setVerificationMessage(
        result.verified
          ? "VNPay returned a verified result. The invoice status has been refreshed."
          : "VNPay has not confirmed this payment yet. Keep your bank receipt and contact reception with this invoice number if the charge remains.",
      );
    } catch (error) {
      setVerificationFailed(true);
      setVerificationMessage(
        error instanceof ApiError && error.code === "payment_attempt_not_found"
          ? language === "vi"
            ? "Chưa có giao dịch VNPay cho hóa đơn này. Hãy chọn Tiếp tục thanh toán để quay lại phiên đang giữ chỗ."
            : "No VNPay payment attempt exists yet. Choose Continue payment to return to your active checkout."
          : error instanceof ApiError && error.code === "vnp_query_invalid"
            ? "VNPay has no record of a payment for this invoice."
            : error instanceof Error
              ? error.message
              : "Payment check failed. Please try again.",
      );
    } finally {
      setCheckingPayment(false);
    }
  }
  return (
    <>
      <AsyncSection
        state={
          missing
            ? { ...state, error: new ApiError(404, "not_found", f.notFound) }
            : keptState
        }
      >
        {(d) => {
          const s = d.summary;
          const paid = ["PAID", "PAID_AFTER_RECONCILIATION"].includes(
            s.status.toUpperCase(),
          );
          const resumable =
            s.status === "ISSUED" &&
            s.checkoutExpiresAtUtc !== null &&
            s.checkoutExpiresAtUtc !== undefined &&
            !s.reconciliationRequired;
          return (
            <>
              <PageHeader
                as="h2"
                title={s.invoiceNumber}
                description={`${f.issuedAt}: ${formatDateTime(s.issuedAt)}`}
                meta={
                  <>
                    <StatusChip value={s.status} />
                    {s.fulfillmentOutcome !== "PENDING" && (
                      <StatusChip value={s.fulfillmentOutcome} />
                    )}
                  </>
                }
                actions={
                  <>
                    {paid && <DownloadInvoiceButton invoiceId={s.invoiceId} />}
                    {resumable && (
                      <Link
                        className={buttonClass({ variant: "primary" })}
                        href={`/checkout/${s.invoiceId}`}
                      >
                        {f.continuePayment}
                      </Link>
                    )}
                  </>
                }
              />
              {s.cashAmount > 0 &&
                (s.status === "ISSUED" || s.status === "VOID") && (
                  <Card title="Paid with VNPay but not shown here?">
                    <p>
                      Check the payment directly with VNPay before paying again.
                      Your bank receipt alone does not confirm that SportHub has
                      received the payment.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      loading={checkingPayment}
                      onClick={() => void verifyPayment()}
                    >
                      Check payment with VNPay
                    </Button>
                    {verificationMessage && (
                      <p
                        role="status"
                        style={{
                          color: verificationFailed
                            ? "var(--danger-text)"
                            : undefined,
                        }}
                      >
                        {verificationMessage}
                      </p>
                    )}
                  </Card>
                )}
              {resolution && (
                <p
                  className={styles.banner + " " + styles.bannerWarning}
                  role="status"
                >
                  <strong>{resolution}</strong>
                </p>
              )}
              {awaitingChoice && !resolution && (
                <UnactivatedChoice
                  invoiceId={s.invoiceId}
                  cashAmount={s.cashAmount}
                  onResolved={(message) => {
                    setResolution(message);
                    state.reload();
                    unactivated.reload();
                  }}
                />
              )}
              {s.reconciliationRequired && !awaitingChoice && !resolution && (
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
                  {d.payments.some((p) => p.status === "SUCCESS") && (
                    <div>
                      <dt>{f.paidAt}</dt>
                      <dd>
                        {formatDateTime(
                          d.payments.find((p) => p.status === "SUCCESS")!
                            .paidAt,
                        )}
                      </dd>
                    </div>
                  )}
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
                  {s.status === "ISSUED" && (
                    <div className={styles.rowsTotal}>
                      <dt>{f.outstanding}</dt>
                      <dd>{formatMoney(s.outstanding)}</dd>
                    </div>
                  )}
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
            </>
          );
        }}
      </AsyncSection>
    </>
  );
}
