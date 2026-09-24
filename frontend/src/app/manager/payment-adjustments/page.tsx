"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Dialog, Feedback, Field, Pager, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime, formatMoney, label } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import type { Paged, PaymentAdjustmentDto } from "@/lib/types";

/**
 * Duyệt điều chỉnh/hoàn tiền — BR-42: yêu cầu do Lễ tân tạo phải được Quản lý Trung tâm phê
 * duyệt, và người tạo KHÔNG được tự duyệt yêu cầu của mình (kể cả khi họ là Quản lý).
 * BR-52: Quản lý được ghi đè số tiền hoàn mặc định khi phê duyệt.
 */
export default function AdjustmentsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState("Requested");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<PaymentAdjustmentDto | null>(null);
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [form, setForm] = useState({ overrideAmount: "", reason: "" });
  const action = useAction();

  const adjustments = useApi(
    (signal) =>
      api.get<Paged<PaymentAdjustmentDto>>("/api/payment-adjustments", {
        signal,
        query: { status: status || undefined, page, pageSize: 15 },
      }),
    [status, page],
  );

  const open = (item: PaymentAdjustmentDto, nextMode: "approve" | "reject") => {
    action.reset();
    setMode(nextMode);
    setForm({ overrideAmount: String(item.amount), reason: "" });
    setTarget(item);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target) return;

    const done = await action.run(
      () =>
        mode === "approve"
          ? api.post(`/api/payment-adjustments/${target.adjustmentId}/approve`, {
              overrideAmount:
                Number(form.overrideAmount) === target.amount
                  ? null
                  : Number(form.overrideAmount),
              reason: form.reason.trim(),
            })
          : api.post(`/api/payment-adjustments/${target.adjustmentId}/reject`, {
              reason: form.reason.trim(),
            }),
      mode === "approve" ? "Adjusted approval." : "Denied the request.",
    );

    if (done !== null) {
      setTarget(null);
      adjustments.reload();
    }
  };

  return (
    <AppShell
      title="Browse for money & adjust"
      description="The request must be approved before validation (BR-42)"
      allow={["CenterManager"]}
    >
      <Card title="Filter">
        <div className="form form--inline">
          <Field label="Status">
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
            >
              <option value="">All</option>
              {/*
                BR-42 v1.4 — "Approved" là trạng thái thật và quan trọng: Refund đã duyệt
                nhưng quầy chưa chi tiền. Thiếu nó khỏi bộ lọc thì Manager không có cách nào
                thấy danh sách khoản đang treo.
              */}
              {["Requested", "Approved", "Completed", "Rejected"].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Feedback error={action.error} success={action.success} />
        </div>
      </Card>

      <Card title="Adaption Requirements" bodyless>
        <AsyncSection
          state={adjustments}
          emptyMessage="No request matches the filter."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <>
              <Table
                headers={[
                  "Invoices",
                  "Category",
                  { text: "The Money", numeric: true },
                  "Reasons",
                  "Maker",
                  "Status",
                  "Processing",
                  "",
                ]}
              >
                {data.items.map((item) => {
                  // BR-42 — không tự duyệt yêu cầu của chính mình. Ẩn nút ở đây chỉ để đỡ
                  // thao tác thừa; backend vẫn từ chối bằng 403 nếu cố gọi thẳng API.
                  const isOwnRequest = item.requestedByUserId === user?.userId;

                  return (
                    <tr key={item.adjustmentId}>
                      <td>{item.invoiceNumber}</td>
                      <td>{label(item.type)}</td>
                      <td className="num">
                        {formatMoney(item.amount)}
                        {item.requestedAmount !== item.amount && (
                          <div className="small muted">
                            recommended {formatMoney(item.requestedAmount)}
                          </div>
                        )}
                      </td>
                      <td className="small">{item.reason}</td>
                      <td className="small">
                        {item.requestedByName}
                        {isOwnRequest && (
                          <div style={{ color: "var(--warn-700)" }}>You created this request</div>
                        )}
                      </td>
                      <td>
                        <StatusChip value={item.status} />
                        {/*
                          BR-42 v1.4 — Approved KHÔNG phải đã trả tiền. Nói rõ ở đây để Manager
                          không tưởng việc mình bấm duyệt là đã kết thúc quy trình.
                        */}
                        {item.awaitingPayout && (
                          <div className="small" style={{ color: "var(--warn-700)" }}>
                            Wait for the reception.
                          </div>
                        )}
                      </td>
                      <td className="small">
                        {item.approvedByName ?? "—"}
                        {item.approvedAtUtc && (
                          <div className="muted">Browse {formatDateTime(item.approvedAtUtc)}</div>
                        )}
                        {item.type === "Refund" && item.completedAtUtc && (
                          <div className="muted">
                            Payed {formatDateTime(item.completedAtUtc)}
                            {item.completedByName && ` · ${item.completedByName}`}
                            {item.refundMethod && ` · ${label(item.refundMethod)}`}
                            {item.refundReferenceCode && ` · ${item.refundReferenceCode}`}
                          </div>
                        )}
                      </td>
                      <td className="right">
                        {item.status === "Requested" && !isOwnRequest && (
                          <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="btn btn--sm"
                              onClick={() => open(item, "approve")}
                            >
                              Browse
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => open(item, "reject")}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
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

      {target && (
        <Dialog
          title={mode === "approve" ? "Adjusted Browser" : "Reject the Request"}
          onClose={() => setTarget(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setTarget(null)}>
                Close
              </button>
              <button
                type="submit"
                form="adjustment-form"
                className={`btn ${mode === "reject" ? "btn--danger" : ""}`}
                disabled={action.busy}
              >
                {mode === "approve" ? "Browse" : "Reject"}
              </button>
            </>
          }
        >
          <form id="adjustment-form" className="form" onSubmit={submit}>
            <div className="alert alert--info">
              Invoices <strong>{target.invoiceNumber}</strong> · {label(target.type)} ·{" "}
              {formatMoney(target.requestedAmount)} (numbering)
              <div className="small">Reason requires: {target.reason}</div>
            </div>

            {mode === "approve" && target.type === "Refund" && (
              <div className="alert alert--warn">
                Approval authorizes the refund. <strong>No money has been paid out yet.</strong> After approval, Reception must confirm the actual payout before balances and reports change (BR-42).
              </div>
            )}

            {mode === "approve" && (
              <Field
                label="Number of approves (VND)"
                hint="You can overwrite the default amount when approved (BR-52)."
              >
                <input
                  type="number"
                  min={1}
                  value={form.overrideAmount}
                  required
                  onChange={(event) =>
                    setForm({ ...form, overrideAmount: event.target.value })
                  }
                />
              </Field>
            )}

            <Field label="Decision Reasons (requiring, written in journals)">
              <input
                value={form.reason}
                required
                minLength={3}
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
              />
            </Field>

            <Feedback error={action.error} success={null} />
          </form>
        </Dialog>
      )}
    </AppShell>
  );
}
