"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { SportDto } from "@/lib/types";
import { catalogApi } from "./api";
export function SportsManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const state = useApi((s) => catalogApi.sports(s, true), []);
  const mutation = useMutation();
  const empty = {
    name: "",
    operationType: "GROUP_COURSE" as SportDto["operationType"],
    defaultSessionMinutes: 90,
    defaultMaxCapacity: 12,
    description: "",
    imageUrl: "",
    sortOrder: 0,
  };
  const [form, setForm] = useState(empty);
  const [id, setId] = useState<number | null>(null);
  return (
    <>
      <Card>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const body = {
              ...form,
              defaultSessionMinutes:
                form.operationType === "GROUP_COURSE"
                  ? form.defaultSessionMinutes
                  : null,
              defaultMaxCapacity:
                form.operationType === "GROUP_COURSE"
                  ? form.defaultMaxCapacity
                  : null,
            };
            if (
              await mutation.run(() =>
                id
                  ? api.put(`/api/manager/sports/${id}`, body)
                  : api.post("/api/manager/sports", body),
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
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={l.operation}>
              <select
                disabled={id !== null}
                value={form.operationType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    operationType: e.target.value as SportDto["operationType"],
                  })
                }
              >
                <option value="WALK_IN">{l.walkIn}</option>
                <option value="ONE_ON_ONE">{l.oneOnOne}</option>
                <option value="GROUP_COURSE">{l.groupCourse}</option>
              </select>
            </Field>
            {form.operationType === "GROUP_COURSE" && (
              <>
                <Field label={l.duration}>
                  <input
                    required
                    type="number"
                    min={15}
                    max={480}
                    value={form.defaultSessionMinutes}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        defaultSessionMinutes: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label={l.capacity}>
                  <input
                    required
                    type="number"
                    min={1}
                    max={500}
                    value={form.defaultMaxCapacity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        defaultMaxCapacity: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </>
            )}
            <Field label={l.sortOrder}>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm({ ...form, sortOrder: Number(e.target.value) })
                }
              />
            </Field>
            <Field label={l.image}>
              <input
                maxLength={500}
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              />
            </Field>
          </div>
          <Field label={l.description}>
            <textarea
              maxLength={2000}
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
        <MutationFeedback mutation={mutation} />
      </Card>
      <AsyncSection state={state}>
        {(rows) => (
          <Table headers={[l.name, l.operation, l.status, ""]}>
            {rows.map((s) => (
              <tr key={s.sportId}>
                <td>{s.name}</td>
                <td>
                  {s.operationType === "GROUP_COURSE"
                    ? l.groupCourse
                    : s.operationType === "ONE_ON_ONE"
                      ? l.oneOnOne
                      : l.walkIn}
                </td>
                <td>
                  <StatusChip value={s.isActive ? "ACTIVE" : "INACTIVE"} />
                </td>
                <td>
                  <button
                    className="btn btn--secondary"
                    onClick={() => {
                      setId(s.sportId);
                      setForm({
                        ...empty,
                        ...s,
                        defaultSessionMinutes: s.defaultSessionMinutes ?? 90,
                        defaultMaxCapacity: s.defaultMaxCapacity ?? 12,
                        description: s.description ?? "",
                        imageUrl: s.imageUrl ?? "",
                      });
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
                            `/api/manager/sports/${s.sportId}/${s.isActive ? "deactivate" : "activate"}`,
                          ),
                        )
                      )
                        state.reload();
                    }}
                  >
                    {s.isActive ? l.deactivate : l.activate}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AsyncSection>
    </>
  );
}
