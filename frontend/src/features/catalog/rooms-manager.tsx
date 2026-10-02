"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { todayIso, addDaysIso, formatDateTime } from "@/lib/format";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { dayRange, vietnamUtc } from "@/lib/vietnam-time";
import { OpeningHoursEditor } from "./opening-hours-editor";
import { catalogApi } from "./api";
function Blocks({ roomId }: { roomId: number }) {
  const { t } = useLanguage();
  const l = t.operations;
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(addDaysIso(todayIso(), 6));
  const range = dayRange(from, to);
  const state = useApi(
    (s) => catalogApi.blocks(roomId, range.fromUtc, range.toUtc, s),
    [roomId, from, to],
  );
  const mutation = useMutation();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  return (
    <>
      <h3>{l.blocks}</h3>
      <div className="form-grid">
        <Field label={l.from}>
          <input
            type="date"
            required
            value={from}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
          />
        </Field>
        <Field label={l.to}>
          <input
            type="date"
            required
            min={from}
            max={addDaysIso(from, 61)}
            value={to}
            onChange={(e) => e.target.value && setTo(e.target.value)}
          />
        </Field>
      </div>
      <AsyncSection state={state}>
        {(rows) => (
          <Table headers={[l.start, l.end, l.reason, ""]}>
            {rows.map((b) => (
              <tr key={b.blockId}>
                <td>{formatDateTime(b.startAtUtc)}</td>
                <td>{formatDateTime(b.endAtUtc)}</td>
                <td>{b.reason}</td>
                <td>
                  {!b.incidentId ? (
                    <button
                      className="btn btn--ghost"
                      disabled={mutation.busy}
                      onClick={async () => {
                        if (
                          await mutation.run(() =>
                            api.del(`/api/manager/room-blocks/${b.blockId}`),
                          )
                        )
                          state.reload();
                      }}
                    >
                      {l.remove}
                    </button>
                  ) : (
                    <Link href="/manager/incidents">{l.incidents}</Link>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AsyncSection>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (end <= start) return;
          if (
            await mutation.run(() =>
              api.post("/api/manager/room-blocks", {
                roomId,
                startAtUtc: vietnamUtc(start),
                endAtUtc: vietnamUtc(end),
                reason,
              }),
            )
          ) {
            state.reload();
            setStart("");
            setEnd("");
            setReason("");
          }
        }}
      >
        <div className="form-grid">
          <Field label={l.start}>
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label={l.end}>
            <input
              type="datetime-local"
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <Field label={l.reason}>
          <textarea
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <button
          className="btn"
          disabled={mutation.busy || !start || end <= start}
        >
          {l.create}
        </button>
      </form>
      <MutationFeedback mutation={mutation} />
    </>
  );
}
export function RoomsManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const state = useApi((s) => catalogApi.rooms(s), []);
  const types = useApi((s) => catalogApi.roomTypes(s), []);
  const mutation = useMutation();
  const empty = { name: "", capacity: 12, roomTypeId: "", isActive: true };
  const [form, setForm] = useState(empty);
  const [id, setId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <>
      <Card>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const body = {
              ...form,
              roomTypeId: form.roomTypeId ? Number(form.roomTypeId) : null,
            };
            if (
              await mutation.run(() =>
                id
                  ? api.put(`/api/rooms/${id}`, body)
                  : api.post("/api/rooms", body),
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
            <Field label={l.capacity}>
              <input
                required
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) =>
                  setForm({ ...form, capacity: Number(e.target.value) })
                }
              />
            </Field>
            <AsyncSection state={types}>
              {(rows) => (
                <Field label={l.roomType}>
                  <select
                    value={form.roomTypeId}
                    onChange={(e) =>
                      setForm({ ...form, roomTypeId: e.target.value })
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
          </div>
          <label>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            {l.active}
          </label>
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
          <Table headers={[l.room, l.roomType, l.capacity, l.status, ""]}>
            {rows.map((r) => (
              <tr key={r.roomId}>
                <td>{r.name}</td>
                <td>
                  {types.data?.find((x) => x.roomTypeId === r.roomTypeId)?.name}
                </td>
                <td>{r.capacity}</td>
                <td>
                  <StatusChip value={r.isActive ? "ACTIVE" : "INACTIVE"} />
                </td>
                <td>
                  <button
                    className="btn btn--secondary"
                    onClick={() => {
                      setId(r.roomId);
                      setForm({
                        ...r,
                        roomTypeId: r.roomTypeId ? String(r.roomTypeId) : "",
                      });
                    }}
                  >
                    {l.edit}
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => setSelected(r.roomId)}
                  >
                    {l.openingHours} / {l.blocks}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AsyncSection>
      {selected && (
        <Card title={state.data?.find((r) => r.roomId === selected)?.name}>
          <OpeningHoursEditor key={`hours-${selected}`} roomId={selected} />
          <Blocks key={`blocks-${selected}`} roomId={selected} />
        </Card>
      )}
    </>
  );
}
