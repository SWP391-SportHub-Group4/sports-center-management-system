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
      mode === "approve" ? "Đã phê duyệt điều chỉnh." : "Đã từ chối yêu cầu.",
    );

    if (done !== null) {
      setTarget(null);
      adjustments.reload();
    }
  };

  return (
    <AppShell
      title="Duyệt điều chỉnh & hoàn tiền"
      description="Yêu cầu phải được phê duyệt trước khi có hiệu lực (BR-42)"
      allow={["CenterManager"]}
    >
      <Card title="Bộ lọc">
        <div className="form form--inline">
          <Field label="Trạng thái">
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
            >
              <option value="">Tất cả</option>
              {["Requested", "Completed", "Rejected"].map((value) => (
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

      <Card title="Yêu cầu điều chỉnh" bodyless>
        <AsyncSection
          state={adjustments}
          emptyMessage="Không có yêu cầu nào khớp bộ lọc."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <>
              <Table
                headers={[
                  "Hóa đơn",
                  "Loại",
                  { text: "Số tiền", numeric: true },
                  "Lý do",
                  "Người tạo",
                  "Trạng thái",
                  "Xử lý",
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
                      <td className="num">{formatMoney(item.amount)}</td>
                      <td className="small">{item.reason}</td>
                      <td className="small">
                        {item.requestedByName}
                        {isOwnRequest && (
                          <div style={{ color: "var(--warn-700)" }}>Bạn tạo yêu cầu này</div>
                        )}
                      </td>
                      <td>
                        <StatusChip value={item.status} />
                      </td>
                      <td className="small">
                        {item.approvedByName ?? "—"}
                        {item.resolvedAt && (
                          <div className="muted">{formatDateTime(item.resolvedAt)}</div>
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
                              Duyệt
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => open(item, "reject")}
                            >
                              Từ chối
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
          title={mode === "approve" ? "Phê duyệt điều chỉnh" : "Từ chối yêu cầu"}
          onClose={() => setTarget(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setTarget(null)}>
                Đóng
              </button>
              <button
                type="submit"
                form="adjustment-form"
                className={`btn ${mode === "reject" ? "btn--danger" : ""}`}
                disabled={action.busy}
              >
                {mode === "approve" ? "Phê duyệt" : "Từ chối"}
              </button>
            </>
          }
        >
          <form id="adjustment-form" className="form" onSubmit={submit}>
            <div className="alert alert--info">
              Hóa đơn <strong>{target.invoiceNumber}</strong> · {label(target.type)} ·{" "}
              {formatMoney(target.amount)}
              <div className="small">Lý do yêu cầu: {target.reason}</div>
            </div>

            {mode === "approve" && (
              <Field
                label="Số tiền phê duyệt (VND)"
                hint="Bạn có thể ghi đè số tiền mặc định khi phê duyệt (BR-52)."
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

            <Field label="Lý do quyết định (bắt buộc, ghi vào nhật ký)">
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
