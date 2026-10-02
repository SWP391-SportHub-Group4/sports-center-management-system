"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney } from "@/lib/format";
import type { MembershipPackageDto } from "@/lib/types";
import { AsyncSection, Card, Field, Table, StatusChip } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
export function MembershipManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const state = useApi(
    (s) =>
      api.get<MembershipPackageDto[]>("/api/membership-packages", {
        signal: s,
        query: { includeInactive: true },
      }),
    [],
  );
  const pricing = useApi(
    (s) =>
      api.get<{ pricePerSessionVnd: number; priceVersion: string }>(
        "/api/pt-pricing",
        { signal: s },
      ),
    [],
  );
  const mutation = useMutation();
  const [ptPrice, setPtPrice] = useState("");
  const empty = {
    name: "",
    price: 100000,
    durationDays: 30,
    description: "",
    isActive: true,
  };
  const [form, setForm] = useState(empty);
  const [id, setId] = useState<number | null>(null);
  return (
    <>
      <Card title={l.gym}>
        <p>{l.snapshotHint}</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await mutation.run(() =>
                id
                  ? api.put(`/api/membership-packages/${id}`, {
                      ...form,
                      sessionLimit: null,
                    })
                  : api.post("/api/membership-packages", {
                      ...form,
                      sessionLimit: null,
                    }),
              )
            ) {
              state.reload();
              setId(null);
              setForm(empty);
            }
          }}
        >
          <div className="form-grid">
            <Field label={l.name}>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={l.price}>
              <input
                required
                type="number"
                min={1000}
                step={1000}
                value={form.price}
                onChange={(e) =>
                  setForm({ ...form, price: Number(e.target.value) })
                }
              />
            </Field>
            <Field label={t.refactor.days}>
              <input
                required
                type="number"
                min={1}
                value={form.durationDays}
                onChange={(e) =>
                  setForm({ ...form, durationDays: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <Field label={l.description}>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Field>
          <div className="btn-row">
            <button className="btn" disabled={mutation.busy}>
              {id ? l.save : l.create}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setId(null);
                setForm(empty);
              }}
            >
              {id ? l.cancel : l.resetForm}
            </button>
          </div>
        </form>
        <AsyncSection state={state}>
          {(rows) => (
            <Table headers={[l.name, l.price, t.refactor.days, l.status, ""]}>
              {rows.map((p) => (
                <tr key={p.packageId}>
                  <td>{p.name}</td>
                  <td>{formatMoney(p.price)}</td>
                  <td>{p.durationDays}</td>
                  <td>
                    <StatusChip value={p.isActive ? "ACTIVE" : "INACTIVE"} />
                  </td>
                  <td>
                    <button
                      className="btn btn--secondary"
                      onClick={() => {
                        setId(p.packageId);
                        setForm({ ...p, description: p.description ?? "" });
                      }}
                    >
                      {l.edit}
                    </button>
                    <button
                      className="btn btn--ghost"
                      disabled={mutation.busy}
                      onClick={async () => {
                        if (
                          await mutation.run(() =>
                            api.post(
                              `/api/membership-packages/${p.packageId}/${p.isActive ? "discontinue" : "reactivate"}`,
                            ),
                          )
                        )
                          state.reload();
                      }}
                    >
                      {p.isActive ? l.deactivate : l.activate}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>
      <Card title={l.pt}>
        <p>{l.ptPriceHint}</p>
        <AsyncSection state={pricing}>
          {(p) => (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutation.run(() =>
                    api.put("/api/manager/pt-pricing", { value: ptPrice }),
                  )
                ) {
                  pricing.reload();
                  setPtPrice("");
                }
              }}
            >
              <p>{formatMoney(p.pricePerSessionVnd)}</p>
              <Field label={l.ptPrice}>
                <input
                  required
                  type="number"
                  min={1000}
                  max={100000000}
                  step={1000}
                  value={ptPrice}
                  onChange={(e) => setPtPrice(e.target.value)}
                />
              </Field>
              <button className="btn" disabled={mutation.busy || !ptPrice}>
                {l.save}
              </button>
            </form>
          )}
        </AsyncSection>
      </Card>
      <MutationFeedback mutation={mutation} />
    </>
  );
}
