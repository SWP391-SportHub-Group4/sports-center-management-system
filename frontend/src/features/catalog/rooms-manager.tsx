"use client";
import { ConfirmRecordAction } from "@/components/ConfirmRecordAction";
import { ActivitySwitch } from "@/components/ActivitySwitch";
import { useState } from "react";
import Link from "next/link";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney } from "@/lib/format";
import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";
import { useMutation } from "@/features/operations";
import { RoomBlocks } from "./room-blocks";
import { courtHourlyPrices } from "./court-hourly-prices";
import { OpeningHoursEditor } from "./opening-hours-editor";
import { catalogApi } from "./api";
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
export function RoomsManager({ detailId }: { detailId?: number } = {}) {
  const { t } = useLanguage();
  const l = t.operations;
  const router = useRouter();
  const filters = useCatalogFilters();
  const state = useApi((s) => catalogApi.rooms(s), []);
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const rates = useApi((s) => catalogApi.rates(s), []);
  const types = useApi((s) => catalogApi.roomTypes(s), []);
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
            rates.reload();
            types.reload();
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
          title={
            id
              ? t.managerCatalog.editCourt
              : `${l.create} ${l.room.toLocaleLowerCase()}`
          }
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
          <ActivitySwitch
            checked={form.isActive}
            onChange={(isActive) => setForm({ ...form, isActive })}
          />
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
            className={styles.courtsTable}
            state={state}
            visibleRowActions={2}
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
                  sports.data?.find((x) => x.sportId === r.sportId)?.name ||
                  "—",
              },
              { id: "capacity", header: l.capacity, numeric: true },
              {
                id: "pricePerHour",
                header: t.managerCatalog.pricePerHour,
                numeric: true,
                cell: (room) => {
                  if (rates.loading || types.loading) return t.common.loading;
                  if (rates.error || types.error)
                    return (
                      <Link
                        href={`/manager/facilities/${room.roomId}?tab=pricing`}
                      >
                        {t.rentalCourtSetup.viewPrices}
                      </Link>
                    );
                  const prices = courtHourlyPrices(
                    room,
                    rates.data ?? [],
                    types.data?.find(
                      (type) => type.roomTypeId === room.roomTypeId,
                    )?.sportIds[0],
                  );
                  if (!prices.length) return t.managerCatalog.noRentalPrice;
                  return prices.length === 1
                    ? formatMoney(prices[0])
                    : `${formatMoney(prices[0])} – ${formatMoney(prices[prices.length - 1])}`;
                },
              },
              {
                id: "isActive",
                header: l.status,
                cell: (r) => (
                  <>
                    <StatusChip value={r.isActive ? "ACTIVE" : "INACTIVE"} />
                    {r.rentalBookingOpensAtUtc &&
                      Date.parse(r.rentalBookingOpensAtUtc) > Date.now() && (
                        <small className={styles.bookingOpens}>
                          {t.managerCatalog.bookingsOpenAt.replace(
                            "{date}",
                            formatDateTime(r.rentalBookingOpensAtUtc),
                          )}
                        </small>
                      )}
                  </>
                ),
              },
            ]}
            actions={(r) => (
              <>
                <Link
                  className="btn btn--secondary btn--sm"
                  href={`/manager/facilities/${r.roomId}`}
                >
                  {t.managerCatalog.viewCourt}
                </Link>
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
          <div className={styles.courtSettings}>
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
                {detailTab === "pricing" && (
                  <CourtRateEditor roomId={selected} />
                )}
                {detailTab === "blocks" && (
                  <RoomBlocks key={`blocks-${selected}`} roomId={selected} />
                )}
              </div>
            </Tabs>
          </div>
        </Card>
      )}
    </>
  );
}
