"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUrlQuery } from "@/lib/useUrlQuery";
import { FilterBar } from "@/components/data";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { todayIso, addDaysIso, formatDateTime } from "@/lib/format";
import {
  AsyncSection,
  Card,
  Field,
  StatusChip,
  Table,
  Dialog,
} from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { dayRange, vietnamUtc } from "@/lib/vietnam-time";
import { OpeningHoursEditor } from "./opening-hours-editor";
import { catalogApi } from "./api";
import type { RoomBlockDto } from "@/lib/types";
import { CatalogFormDialog } from "./manager-shared";
import styles from "./manager-catalog.module.css";
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
  const [removing, setRemoving] = useState<RoomBlockDto | null>(null);
  return (
    <>
      <h3>{l.blocks}</h3>
      <div className={styles.facilityGrid}>
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
                      onClick={() => setRemoving(b)}
                    >
                      {l.remove}
                    </button>
                  ) : (
                    <Link
                      href={`/manager/incidents/${b.incidentId}`}
                    >
                      {l.incidents}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AsyncSection>
      <form
        className="stack"
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
        <div className={styles.facilityGrid}>
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
      <p>{t.managerOperations.blockImpactHint}</p>
      <Link
        className="btn btn--secondary"
        href={`/manager/incidents?roomId=${roomId}${start && end ? `&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` : ""}`}
      >
        {l.incidents}
      </Link>
      {removing && (
        <Dialog
          title={l.remove}
          onClose={() => {
            if (!mutation.busy) setRemoving(null);
          }}
          footer={
            <>
              <button
                className="btn btn--secondary"
                disabled={mutation.busy}
                onClick={() => setRemoving(null)}
              >
                {l.cancel}
              </button>
              <button
                className="btn"
                disabled={mutation.busy}
                onClick={async () => {
                  if (
                    await mutation.run(() =>
                      api.del(`/api/manager/room-blocks/${removing.blockId}`),
                    )
                  ) {
                    setRemoving(null);
                    state.reload();
                  }
                }}
              >
                {l.confirm}
              </button>
            </>
          }
        >
          <p>{t.managerOperations.deleteBlockReview}</p>
          <p>
            {formatDateTime(removing.startAtUtc)} –{" "}
            {formatDateTime(removing.endAtUtc)}
          </p>
          <p>{removing.reason}</p>
          <MutationFeedback mutation={mutation} />
        </Dialog>
      )}
    </>
  );
}
export function RoomsManager({ detailId }: { detailId?: number } = {}) {
  const { t } = useLanguage();
  const l = t.operations;
  const router = useRouter();
  const { values, setValues } = useUrlQuery({ q: "", status: "" });
  const state = useApi((s) => catalogApi.rooms(s), []);
  const types = useApi((s) => catalogApi.roomTypes(s), []);
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const mutation = useMutation();
  const empty = { name: "", capacity: 12, roomTypeId: "", isActive: true };
  const [form, setForm] = useState(empty);
  const [id, setId] = useState<number | null>(null);
  const selected = detailId;
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="btn-row">
        {detailId ? (
          <Link className="btn btn--ghost" href="/manager/facilities">
            {t.managerOperations.backToList}
          </Link>
        ) : (
          <button
            className="btn"
            onClick={() => {
              setId(null);
              setForm(empty);
              setEditing(true);
              mutation.reset();
            }}
          >
            {l.create}
          </button>
        )}
      </div>
      {editing && (
        <CatalogFormDialog
          title={id ? l.edit : l.create}
          busy={mutation.busy}
          mutation={mutation}
          onClose={() => {
            if (!mutation.busy) setEditing(false);
          }}
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
              setEditing(false);
            }
          }}
        >
          <div className="form-grid">
            <Field label={l.name}>
              <input
                required
                maxLength={100}
                pattern=".*\S.*"
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
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            {l.active}
          </label>
        </CatalogFormDialog>
      )}
      {!detailId && (
        <FilterBar
          fields={[
            { id: "q", label: l.search, kind: "search" },
            {
              id: "status",
              label: l.status,
              kind: "select",
              options: [
                { value: "", label: l.all },
                { value: "active", label: l.active },
                { value: "inactive", label: t.wireStatus.INACTIVE },
              ],
            },
          ]}
          values={values}
          onChange={setValues}
          onReset={() => setValues({ q: "", status: "" })}
        />
      )}
      <AsyncSection state={state}>
        {(rows) => (
          <div className={styles.roomsTable}>
            <Table headers={[l.room, l.roomType, l.capacity, l.status, ""]}>
              {rows
                .filter((r) =>
                  detailId
                    ? r.roomId === detailId
                    : r.name
                        .toLocaleLowerCase()
                        .includes(values.q.trim().toLocaleLowerCase()) &&
                      (!values.status ||
                        r.isActive === (values.status === "active")),
                )
                .map((r) => (
                  <tr key={r.roomId}>
                    <td>{r.name}</td>
                    <td>
                      {
                        types.data?.find((x) => x.roomTypeId === r.roomTypeId)
                          ?.name
                      }
                    </td>
                    <td>{r.capacity}</td>
                    <td>
                      <StatusChip value={r.isActive ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    <td>
                      <div className="btn-row">
                        <button
                          className="btn btn--secondary"
                          onClick={() => {
                            setId(r.roomId);
                            setForm({
                              ...r,
                              roomTypeId: r.roomTypeId
                                ? String(r.roomTypeId)
                                : "",
                            });
                            setEditing(true);
                            mutation.reset();
                          }}
                        >
                          {l.edit}
                        </button>
                        <button
                          className="btn btn--ghost"
                          onClick={() =>
                            router.push(`/manager/facilities/${r.roomId}`)
                          }
                        >
                          {l.openingHours} / {l.blocks}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </Table>
          </div>
        )}
      </AsyncSection>
      {detailId &&
        state.data &&
        !state.data.some((r) => r.roomId === detailId) && (
          <p role="alert">{t.managerCatalog.notFound}</p>
        )}
      {selected && state.data?.some((r) => r.roomId === selected) && (
        <Card title={state.data?.find((r) => r.roomId === selected)?.name}>
          <p>
            {l.sports}:{" "}
            {types.data
              ?.find(
                (r) =>
                  r.roomTypeId ===
                  state.data?.find((room) => room.roomId === selected)
                    ?.roomTypeId,
              )
              ?.sportIds.map(
                (id) =>
                  sports.data?.find((s) => s.sportId === id)?.name ??
                  t.managerAudit.nameUnavailable,
              )
              .join(", ") || "—"}
          </p>
          <Link
            className="btn btn--secondary"
            href={`/manager/schedule?roomId=${selected}`}
          >
            {t.managerOperations.schedule}
          </Link>
          <p>{t.managerOperations.openingHint}</p>
          <OpeningHoursEditor key={`hours-${selected}`} roomId={selected} />
          <Blocks key={`blocks-${selected}`} roomId={selected} />
        </Card>
      )}
    </>
  );
}
