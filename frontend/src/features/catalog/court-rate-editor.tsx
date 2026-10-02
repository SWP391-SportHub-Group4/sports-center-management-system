"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney } from "@/lib/format";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { catalogApi } from "./api";
export function CourtRateEditor() {
  const { t } = useLanguage();
  const l = t.operations;
  const state = useApi((s) => catalogApi.rates(s), []);
  const types = useApi((s) => catalogApi.roomTypes(s), []);
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const mutation = useMutation();
  const empty = {
    roomTypeId: "",
    sportId: "",
    daysOfWeek: ["MON"],
    startTimeLocal: "06:00",
    endTimeLocal: "22:00",
    pricePerHour: 100000,
    isActive: true,
  };
  const [form, setForm] = useState(empty);
  const [id, setId] = useState<number | null>(null);
  const codes = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return (
    <>
      <Card>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              !form.daysOfWeek.length ||
              form.endTimeLocal <= form.startTimeLocal
            )
              return;
            const body = {
              ...form,
              roomTypeId: Number(form.roomTypeId),
              sportId: form.sportId ? Number(form.sportId) : null,
            };
            if (
              await mutation.run(() =>
                id
                  ? api.put(`/api/manager/court-rates/${id}`, body)
                  : api.post("/api/manager/court-rates", body),
              )
            ) {
              state.reload();
              setId(null);
              setForm(empty);
            }
          }}
        >
          <div className="form-grid">
            <AsyncSection state={types}>
              {(rows) => (
                <Field label={l.roomType}>
                  <select
                    required
                    value={form.roomTypeId}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        roomTypeId: e.target.value,
                        sportId: "",
                      })
                    }
                  >
                    <option value="">—</option>
                    {rows.map((r) => (
                      <option key={r.roomTypeId} value={r.roomTypeId}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </AsyncSection>
            <AsyncSection state={sports}>
              {(rows) => (
                <Field label={l.sport}>
                  <select
                    value={form.sportId}
                    onChange={(e) =>
                      setForm({ ...form, sportId: e.target.value })
                    }
                  >
                    <option value="">{l.all}</option>
                    {rows
                      .filter((s) =>
                        types.data
                          ?.find(
                            (r) => r.roomTypeId === Number(form.roomTypeId),
                          )
                          ?.sportIds.includes(s.sportId),
                      )
                      .map((s) => (
                        <option key={s.sportId} value={s.sportId}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
            </AsyncSection>
            <Field label={l.start}>
              <input
                required
                type="time"
                value={form.startTimeLocal}
                onChange={(e) =>
                  setForm({ ...form, startTimeLocal: e.target.value })
                }
              />
            </Field>
            <Field label={l.end}>
              <input
                required
                type="time"
                value={form.endTimeLocal}
                onChange={(e) =>
                  setForm({ ...form, endTimeLocal: e.target.value })
                }
              />
            </Field>
            <Field label={l.priceHour}>
              <input
                required
                type="number"
                min={1000}
                step={1000}
                value={form.pricePerHour}
                onChange={(e) =>
                  setForm({ ...form, pricePerHour: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <fieldset>
            <legend>{l.day}</legend>
            {codes.map((code, i) => (
              <label key={code}>
                <input
                  type="checkbox"
                  checked={form.daysOfWeek.includes(code)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      daysOfWeek: e.target.checked
                        ? [...form.daysOfWeek, code]
                        : form.daysOfWeek.filter((c) => c !== code),
                    })
                  }
                />
                {l.weekdays[i]}
              </label>
            ))}
          </fieldset>
          <label>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            {l.active}
          </label>
          <div className="btn-row">
            <button
              className="btn"
              disabled={
                mutation.busy ||
                !form.daysOfWeek.length ||
                form.endTimeLocal <= form.startTimeLocal
              }
            >
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
          <Table
            headers={[
              l.roomType,
              l.sport,
              l.day,
              l.start,
              l.end,
              l.priceHour,
              l.status,
              "",
            ]}
          >
            {rows.map((r) => (
              <tr key={r.rateId}>
                <td>
                  {types.data?.find((x) => x.roomTypeId === r.roomTypeId)
                    ?.name ?? r.roomTypeId}
                </td>
                <td>
                  {sports.data?.find((x) => x.sportId === r.sportId)?.name ??
                    l.all}
                </td>
                <td>
                  {r.daysOfWeek
                    .split(",")
                    .map((code) => {
                      const day = codes.indexOf(code.trim());
                      return day >= 0 ? l.weekdays[day] : code;
                    })
                    .join(", ")}
                </td>
                <td>{r.startTimeLocal}</td>
                <td>{r.endTimeLocal}</td>
                <td>{formatMoney(r.pricePerHour)}</td>
                <td>
                  <StatusChip value={r.isActive ? "ACTIVE" : "INACTIVE"} />
                </td>
                <td>
                  <button
                    className="btn btn--secondary"
                    onClick={() => {
                      setId(r.rateId);
                      setForm({
                        ...r,
                        roomTypeId: String(r.roomTypeId),
                        sportId: r.sportId ? String(r.sportId) : "",
                        daysOfWeek: r.daysOfWeek
                          .split(",")
                          .map((x) => x.trim()),
                      });
                    }}
                  >
                    {l.edit}
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
