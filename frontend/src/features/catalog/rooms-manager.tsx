"use client";
import { ConfirmRecordAction } from "@/components/ConfirmRecordAction";
import { useState } from "react";
import Link from "next/link";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { useRouter } from "next/navigation";
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
import {
  CatalogPanel,
  CatalogFormDialog,
  CatalogFilters,
  CatalogTable,
  useCatalogFilters,
  matchesCatalog,
} from "./manager-shared";
import styles from "./manager-catalog.module.css";
import { Tabs } from "@/components/primitives";
import { CourtRateEditor } from "./court-pricing";
import { CreateRentalCourt } from "./create-rental-court";
import type { RoomDto } from "@/lib/types";
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
                      href={`/manager/incidents?roomId=${roomId}&incidentId=${b.incidentId}`}
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
          showCloseButton={false}
          title={l.remove}
          onClose={() => {
            if (!mutation.busy) setRemoving(null);
          }}
          footer={
            <>
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
              <button
                className="btn btn--secondary"
                disabled={mutation.busy}
                onClick={() => setRemoving(null)}
              >
                {l.cancel}
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
  const filters = useCatalogFilters();
  const state = useApi((s) => catalogApi.rooms(s), []);
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const mutation = useMutation();
  const empty = { name: "", capacity: 12, sportId: "", isActive: true };
  const [form, setForm] = useState(empty);
  const [id, setId] = useState<number | null>(null);
  const selected = detailId;
  const selectedRoom = state.data?.find((r) => r.roomId === selected);
  const openEditor = (r: RoomDto) => {
    setId(r.roomId);
    setForm({ ...r, sportId: r.sportId ? String(r.sportId) : "" });
    setEditing(true);
    mutation.reset();
  };
  const { values, setValues } = useUrlQuery(
    { tab: "hours" },
    { tab: choiceQuery(["hours", "pricing", "blocks"], "hours") },
  );
  const detailTab = values.tab;
  const setDetailTab = (tab: string) => setValues({ tab });
  const [editing, setEditing] = useState(false);
  const [creatingRental, setCreatingRental] = useState(false);
  const [createdRental, setCreatedRental] = useState<RoomDto | null>(null);
  return (
    <>
      {creatingRental && (
        <CreateRentalCourt
          onCancel={() => setCreatingRental(false)}
          onCreated={(room) => {
            setCreatingRental(false);
            setCreatedRental(room);
            state.reload();
            sports.reload();
          }}
        />
      )}
      {createdRental && (
        <div className="alert alert--success" role="status">
          <strong>{createdRental.name}</strong> {t.rentalCourtSetup.created}{" "}
          <Link
            href={
              createdRental
                ? `/manager/facilities/${createdRental.roomId}?tab=pricing`
                : "/manager/facilities"
            }
          >
            {t.rentalCourtSetup.viewPrices}
          </Link>
        </div>
      )}
      {detailId && (
        <Link className="btn btn--ghost" href="/manager/facilities">
          {t.managerOperations.backToList}
        </Link>
      )}
      {editing && (
        <CatalogFormDialog
          title={`${id ? l.edit : l.create} ${l.room.toLocaleLowerCase()}`}
          busy={mutation.busy}
          mutation={mutation}
          onClose={() => {
            if (!mutation.busy) setEditing(false);
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            const body = {
              ...form,
              sportId: form.sportId ? Number(form.sportId) : null,
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
            <Field label={l.name} required>
              <input
                required
                maxLength={100}
                pattern=".*\S.*"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={l.capacity} required>
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
            <AsyncSection state={sports}>
              {(rows) => (
                <Field label={l.sport} required={!id}>
                  <select
                    required={!id}
                    value={form.sportId}
                    onChange={(e) =>
                      setForm({ ...form, sportId: e.target.value })
                    }
                  >
                    <option value="">Select sport</option>
                    {rows
                      .filter((r) => r.isActive)
                      .map((r) => (
                        <option key={r.sportId} value={r.sportId}>
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
      {!creatingRental && !detailId && (
        <CatalogPanel
          filters={!detailId ? <CatalogFilters filters={filters} /> : undefined}
          actions={
            !detailId ? (
              <>
                <button
                  className="btn"
                  disabled={creatingRental}
                  onClick={() => {
                    setCreatingRental(true);
                    setCreatedRental(null);
                  }}
                >
                  {t.rentalCourtSetup.create}
                </button>
                <button
                  className="btn btn--secondary"
                  disabled={creatingRental}
                  onClick={() => {
                    setId(null);
                    setForm(empty);
                    setEditing(true);
                    mutation.reset();
                  }}
                >
                  {t.rentalCourtSetup.basicRoom}
                </button>
              </>
            ) : undefined
          }
        >
          <CatalogTable
            state={state}
            visibleRowActions={3}
            filters={filters}
            caption={t.managerOperations.facilities}
            rows={(state.data ?? []).filter((r) =>
              detailId
                ? r.roomId === detailId
                : matchesCatalog(r, r.name, filters.values),
            )}
            getRowId={(r) => String(r.roomId)}
            columns={[
              { id: "name", header: l.room, rowHeader: true },
              {
                id: "sportId",
                header: l.sport,
                cell: (r) =>
                  sports.data?.find((x) => x.sportId === r.sportId)?.name,
              },
              { id: "capacity", header: l.capacity, numeric: true },
              {
                id: "isActive",
                header: l.status,
                cell: (r) => (
                  <>
                    <StatusChip value={r.isActive ? "ACTIVE" : "INACTIVE"} />
                  </>
                ),
              },
            ]}
            actions={(r) => (
              <>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => {
                    setId(r.roomId);
                    setForm({
                      ...r,
                      sportId: r.sportId ? String(r.sportId) : "",
                    });
                    setEditing(true);
                    mutation.reset();
                  }}
                >
                  {l.edit}
                </button>
                <ConfirmRecordAction
                  label={t.recordActions.delete}
                  title={t.recordActions.deleteRoom}
                  description={t.recordActions.roomDescription}
                  recordName={r.name}
                  onConfirm={() => catalogApi.deleteRoom(r.roomId)}
                  onCompleted={() => {
                    state.reload();
                    if (detailId) router.push("/manager/training-rooms");
                  }}
                />
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => router.push("/manager/facilities/" + r.roomId)}
                >
                  {l.openingHours} / {l.blocks}
                </button>
              </>
            )}
          />
        </CatalogPanel>
      )}
      {detailId && <AsyncSection state={state}>{() => null}</AsyncSection>}
      {detailId &&
        state.data &&
        !state.data.some((r) => r.roomId === detailId) && (
          <p role="alert">{t.managerCatalog.notFound}</p>
        )}
      {selected && state.data?.some((r) => r.roomId === selected) && (
        <Card
          title={selectedRoom?.name}
          actions={
            <>
              <StatusChip
                value={selectedRoom?.isActive ? "ACTIVE" : "INACTIVE"}
              />
              <Link
                className="btn btn--secondary btn--sm"
                href={`/manager/schedule?roomId=${selected}`}
              >
                View schedule
              </Link>
              <Link
                className="btn btn--secondary btn--sm"
                href={`/manager/incidents?roomId=${selected}`}
              >
                {t.operations.incidents}
              </Link>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => selectedRoom && openEditor(selectedRoom)}
              >
                Edit
              </button>
              <ConfirmRecordAction
                label={t.recordActions.delete}
                title={t.recordActions.deleteRoom}
                description={t.recordActions.roomDescription}
                recordName={selectedRoom?.name ?? ""}
                onConfirm={() => catalogApi.deleteRoom(selected!)}
                onCompleted={() => router.push("/manager/facilities")}
              />
            </>
          }
        >
          <p>
            {l.sports}:{" "}
            {sports.data?.find(
              (sport) =>
                sport.sportId ===
                state.data?.find((room) => room.roomId === selected)?.sportId,
            )?.name || "—"}
          </p>
          <p>
            {l.capacity}: {selectedRoom?.capacity}
          </p>
          <Tabs
            value={detailTab}
            onChange={setDetailTab}
            ariaLabel="Court settings"
            tabs={[
              { id: "hours", label: "Opening hours" },
              { id: "pricing", label: "Rental pricing" },
              { id: "blocks", label: "Blocked times" },
            ]}
          >
            <div className="stack">
              {detailTab === "hours" && (
                <OpeningHoursEditor
                  key={`hours-${selected}`}
                  roomId={selected}
                />
              )}
              {detailTab === "pricing" && <CourtRateEditor roomId={selected} />}
              {detailTab === "blocks" && (
                <Blocks key={`blocks-${selected}`} roomId={selected} />
              )}
            </div>
          </Tabs>
        </Card>
      )}
    </>
  );
}
