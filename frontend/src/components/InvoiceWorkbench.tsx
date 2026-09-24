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
import type {
  InvoiceDetailDto,
  InvoiceSummaryDto,
  Paged,
  PaymentAdjustmentDto,
} from "@/lib/types";

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
  const payout = useAction();

  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "Cash",
    reference: "",
  });
  const [adjustmentForm, setAdjustmentForm] = useState({
    type: "Refund",
    amount: "",
    reason: "",
  });

  /** Refund đang chờ xác nhận thực trả; null = dialog đóng. */
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
          keyword: keyword || undefined,
          status: status || undefined,
          overdueOnly,
        },
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
      "Recorded.",
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
      "The request has been sent, the Center Manager will approve (BR-42).",
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

  /**
   * BR-42 v1.4 — bước xác nhận THỰC TRẢ. Cố ý không có ô nhập số tiền: số đã được Manager
   * chốt lúc duyệt và quầy không được trả khác số đó.
   */
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
      "Reported real timeout. balance and report updated.",
    );

    if (done !== null) {
      setPayoutTarget(null);
      detail.reload();
      invoices.reload();
    }
  };

  return (
    <>
      <Card title="Filter">
        <div className="form form--inline">
          <Field label="Schedule">
            <input
              value={keyword}
              placeholder="Number of invoices, names or membership emails"
              onChange={(event) => {
                setPage(1);
                setKeyword(event.target.value);
              }}
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
            >
              <option value="">All</option>
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
            Only display invoices expired
          </label>
        </div>
      </Card>

      <Card title="Invoices" bodyless>
        <AsyncSection
          state={invoices}
          emptyMessage="No invoice matches the filter."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <>
              <Table
                headers={[
                  "Number of invoices",
                  "Members",
                  { text: "Total Money", numeric: true },
                  { text: "In fact.", numeric: true },
                  { text: "We're gonna take it.", numeric: true },
                  { text: "Need to Complete", numeric: true },
                  "Limit",
                  "Status",
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
                    <td className="num">{formatMoney(invoice.netCollected)}</td>
                    <td className="num">{formatMoney(invoice.outstanding)}</td>
                    <td className="num">
                      {invoice.refundDue > 0 ? (
                        <strong style={{ color: "var(--danger-700)" }}>
                          {formatMoney(invoice.refundDue)}
                        </strong>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="nowrap small">
                      {formatDate(invoice.dueDateUtc)}
                      {invoice.isOverdue && (
                        <div style={{ color: "var(--danger-700)" }}>
                          Expiration
                        </div>
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
                        Open
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
        <Dialog title="Invoices" onClose={() => setSelected(null)}>
          <AsyncSection state={detail} emptyMessage="Can't load the invoice.">
            {(data) =>
              data ? (
                <div className="stack">
                  <div className="alert alert--info">
                    <strong>{data.summary.invoiceNumber}</strong> —{" "}
                    {data.summary.memberName}
                    {/*
                      BR-41 v1.4 — "cần hoàn" và "đã hoàn" là hai con số khác nhau và phải
                      hiện riêng: một khoản được duyệt hoàn nhưng chưa chi thì vẫn là tiền
                      trung tâm đang giữ của hội viên.
                    */}
                    <div className="small">
                      Total {formatMoney(data.summary.totalAmount)} · Retrieved{" "}
                      {formatMoney(data.summary.grossCollected)}
                      {data.summary.obligationReduction > 0 &&
                        ` · Obligation reduction ${formatMoney(data.summary.obligationReduction)}`}
                      {"· The Obligation"}
                      {formatMoney(data.summary.netPayable)} . . . .{" "}
                      {formatMoney(data.summary.netCollected)}
                    </div>
                    <div className="small">
                      Balance due:{" "}
                      <strong>{formatMoney(data.summary.outstanding)}</strong>
                      {data.summary.refundDue > 0 && (
                        <>
                          {" · "}
                          <strong style={{ color: "var(--danger-700)" }}>
                            Need to Complete{" "}
                            {formatMoney(data.summary.refundDue)}
                          </strong>
                        </>
                      )}
                      {data.summary.refundedAmount > 0 &&
                        ` · Refunded ${formatMoney(data.summary.refundedAmount)}`}
                    </div>
                    <div className="small">
                      Release {formatDate(data.summary.issuedAt)} › Payback{" "}
                      {formatDate(data.summary.dueDateUtc)}
                      {data.summary.firstDepositAtUtc
                        ? ` (deposit received: ${formatDate(data.summary.firstDepositAtUtc)} → due in 12 months under BR-55)`
                        : "(finals 2 months from the release date in BR-55)"}
                    </div>
                  </div>

                  <Table
                    headers={["Contents", { text: "The Money", numeric: true }]}
                  >
                    {data.items.map((item) => (
                      <tr key={item.itemId}>
                        <td>{item.description}</td>
                        <td className="num">{formatMoney(item.amount)}</td>
                      </tr>
                    ))}
                  </Table>

                  {data.payments.length > 0 && (
                    <div>
                      <h3>Retrieved</h3>
                      <Table
                        headers={[
                          "Schedule",
                          "Format",
                          { text: "The Money", numeric: true },
                          "Recorder",
                        ]}
                      >
                        {data.payments.map((item) => (
                          <tr key={item.paymentId}>
                            <td className="nowrap small">
                              {formatDateTime(item.paidAt)}
                            </td>
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
                      <h3>Adjust</h3>
                      <Table
                        headers={[
                          "Category",
                          { text: "The Money", numeric: true },
                          "Reasons",
                          "Status",
                          "",
                        ]}
                      >
                        {data.adjustments.map((item) => (
                          <tr key={item.adjustmentId}>
                            <td>{label(item.type)}</td>
                            <td className="num">
                              {formatMoney(item.amount)}
                              {item.requestedAmount !== item.amount && (
                                <div className="small muted">
                                  recommended{" "}
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
                                  style={{ color: "var(--danger-700)" }}
                                >
                                  Wait for the reception.
                                </div>
                              )}
                              {item.completedAtUtc &&
                                item.type === "Refund" && (
                                  <div className="small muted">
                                    Payed {formatDateTime(item.completedAtUtc)}
                                    {item.completedByName &&
                                      ` · ${item.completedByName}`}
                                    {item.refundMethod &&
                                      ` · ${label(item.refundMethod)}`}
                                    {item.refundReferenceCode &&
                                      ` · ${item.refundReferenceCode}`}
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
                                  Confirmed payment
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  )}

                  {data.summary.status !== "Void" &&
                    data.summary.outstanding > 0 && (
                      <form className="form" onSubmit={submitPayment}>
                        <h3>Payment Records</h3>
                        <div className="form form--inline">
                          <Field label="Money (VND)">
                            <input
                              type="number"
                              min={1}
                              max={data.summary.outstanding}
                              value={paymentForm.amount}
                              required
                              onChange={(event) =>
                                setPaymentForm({
                                  ...paymentForm,
                                  amount: event.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Format">
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
                          <Field label="Reference Code">
                            <input
                              value={paymentForm.reference}
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
                            Record
                          </button>
                        </div>
                      </form>
                    )}

                  {data.summary.status !== "Void" && (
                    <form className="form" onSubmit={submitAdjustment}>
                      <h3>Create an adjustment request</h3>
                      <p className="small muted" style={{ margin: 0 }}>
                        The request must be managed by the approved Center and
                        the non-conscionable creator (BR-42).
                        {data.suggestedRefundAmount > 0 &&
                          ` Suggested refund for the unused portion: ${formatMoney(data.suggestedRefundAmount)} (BR-52).`}
                      </p>
                      <div className="form form--inline">
                        <Field label="Category">
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
                        <Field label="Money (VND)">
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
                      <Field label="Reasons">
                        <input
                          value={adjustmentForm.reason}
                          required
                          minLength={3}
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
                          disabled={adjustment.busy}
                        >
                          Send Adjusted Request
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

      {payoutTarget && (
        <Dialog
          title="Confirmed payment."
          onClose={() => setPayoutTarget(null)}
        >
          <form className="form" onSubmit={submitPayout}>
            <div className="alert alert--info">
              Done <strong>{formatMoney(payoutTarget.amount)}</strong> For the
              invoice. {payoutTarget.invoiceNumber}.
              <div className="small">
                The money has been approved by the Center for Review
                {payoutTarget.approvedAtUtc &&
                  ` on ${formatDate(payoutTarget.approvedAtUtc)}`}
                {payoutTarget.approvedByName &&
                  ` by ${payoutTarget.approvedByName}`}{" "}
                and not able to fix at this step (BR-42). only press
                confirmation after the actual money has been paid to the
                membership.
              </div>
            </div>

            <div className="form form--inline">
              <Field label="Pay form">
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
                    ? "Reference Code (non-required with cash)"
                    : "Reference Code (requiring)"
                }
              >
                <input
                  value={payoutForm.reference}
                  required={payoutForm.method !== "Cash"}
                  onChange={(event) =>
                    setPayoutForm({
                      ...payoutForm,
                      reference: event.target.value,
                    })
                  }
                />
              </Field>
            </div>

            <Field label="Objective Note">
              <input
                value={payoutForm.note}
                required
                minLength={3}
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
                Confirmed payment
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
