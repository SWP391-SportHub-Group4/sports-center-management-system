"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Feedback, Field, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { MembershipPackageDto } from "@/lib/types";

/**
 * Danh mục gói thành viên — BR-8 (chỉ Quản lý tạo/sửa/ngừng áp dụng), BR-56 (tên duy nhất).
 *
 * "Ngừng áp dụng" thay cho xóa: gói đã bán vẫn trỏ về bản ghi này và hóa đơn liên quan không
 * bao giờ được xóa (BR-40). Sửa giá hay thời hạn cũng không hồi tố lên gói đã bán.
 */
export default function PackageCatalogPage() {
  const emptyForm = {
    name: "",
    price: "",
    durationDays: "30",
    sessionLimit: "",
    description: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<MembershipPackageDto | null>(null);
  const action = useAction();

  const packages = useApi(
    (signal) =>
      api.get<MembershipPackageDto[]>("/api/membership-packages", {
        signal,
        query: { includeInactive: true },
      }),
    [],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      name: form.name.trim(),
      price: Number(form.price),
      durationDays: Number(form.durationDays),
      sessionLimit: form.sessionLimit ? Number(form.sessionLimit) : null,
      description: form.description.trim() || null,
    };

    const done = await action.run(
      () =>
        editing
          ? api.put(`/api/membership-packages/${editing.packageId}`, payload)
          : api.post("/api/membership-packages", payload),
      editing ? "Package update." : "Created new package.",
    );

    if (done !== null) {
      setForm(emptyForm);
      setEditing(null);
      packages.reload();
    }
  };

  const toggle = async (item: MembershipPackageDto) => {
    const done = await action.run(
      () =>
        api.post(
          `/api/membership-packages/${item.packageId}/${item.isActive ? "discontinue" : "reactivate"}`,
        ),
      item.isActive ? "The package has been stopped." : "The package was re-opened.",
    );

    if (done !== null) packages.reload();
  };

  return (
    <AppShell
      title="Members Package"
      description="Package lists are selling and packages are discontinued"
      allow={["CenterManager"]}
    >
      <Card title={editing ? `Edit plan: ${editing.name}` : "Create New Package"}>
        <form className="form" onSubmit={submit}>
          <div className="form form--inline">
            <Field label="Package Name">
              <input
                value={form.name}
                required
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="Price (VND)">
              <input
                type="number"
                min={0}
                step={1}
                value={form.price}
                required
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
            </Field>
            <Field label="Timeout (day)">
              <input
                type="number"
                min={1}
                max={3650}
                value={form.durationDays}
                required
                onChange={(event) => setForm({ ...form, durationDays: event.target.value })}
              />
            </Field>
            <Field
              label="Number of Sessions"
              hint="Leave empty if the package does not limit the number of sessions (e.g. Gym)."
            >
              <input
                type="number"
                min={1}
                max={10000}
                value={form.sessionLimit}
                onChange={(event) => setForm({ ...form, sessionLimit: event.target.value })}
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>

          <Feedback error={action.error} success={action.success} />

          <div className="btn-row">
            <button type="submit" className="btn" disabled={action.busy}>
              {editing ? "Can not open message" : "Create packages"}
            </button>
            {editing && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                }}
              >
                Abort
              </button>
            )}
          </div>

          {editing && (
            <p className="small muted" style={{ margin: 0 }}>
              Change the price or deadline only apply to the next sale — the package of members that have purchased maintaining the value that was key to the trigger.
            </p>
          )}
        </form>
      </Card>

      <Card title="Package List" bodyless>
        <AsyncSection
          state={packages}
          emptyMessage="No membership package yet."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                "Package Name",
                { text: "Price", numeric: true },
                { text: "Timeout", numeric: true },
                { text: "Number of Sessions", numeric: true },
                "Description",
                "Status",
                "",
              ]}
            >
              {data.map((item) => (
                <tr key={item.packageId}>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td className="num">{formatMoney(item.price)}</td>
                  <td className="num">{item.durationDays} days</td>
                  <td className="num">
                    {item.sessionLimit === null ? "No Limit" : item.sessionLimit}
                  </td>
                  <td className="small muted">{item.description ?? "—"}</td>
                  <td>
                    <StatusChip value={item.isActive ? "Active" : "Archived"} />
                  </td>
                  <td className="right">
                    <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setEditing(item);
                          setForm({
                            name: item.name,
                            price: String(item.price),
                            durationDays: String(item.durationDays),
                            sessionLimit: item.sessionLimit ? String(item.sessionLimit) : "",
                            description: item.description ?? "",
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={action.busy}
                        onClick={() => void toggle(item)}
                      >
                        {item.isActive ? "Stop Selling" : "Re-selling."}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}
