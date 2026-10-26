"use client";
import { ConfirmRecordAction } from "@/components/ConfirmRecordAction";

import { useState } from "react";
import Link from "next/link";
import { Search, Trash2 } from "lucide-react";

import { useRouter } from "next/navigation";

import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney } from "@/lib/format";
import { AsyncSection, Card, Dialog } from "@/components/ui";

import { courtHourlyPrices } from "./court-hourly-prices";

import { catalogApi } from "./api";
import {
  CatalogTable,
  useCatalogFilters,
  matchesCatalog,
} from "./manager-shared";

import roomStyles from "./rooms-manager.module.css";

import { CreateRoomForm } from "./create-room-form";
import type { RoomDto } from "@/lib/types";
import { RoomDetails } from "./room-details";
import { RoomEditDialog } from "./room-edit-dialog";

export function RoomsManager({ detailId }: { detailId?: number } = {}) {
  const { t } = useLanguage();
  const l = t.operations;
  const router = useRouter();
  const filters = useCatalogFilters();
  const state = useApi((s) => catalogApi.rooms(s), []);
  const rates = useApi((s) => catalogApi.rates(s), []);
  const types = useApi((s) => catalogApi.roomTypes(s), []);
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [editingRoom, setEditingRoom] = useState<{
    room: RoomDto;
    apply: (updated: RoomDto) => void;
  } | null>(null);
  const selectedRoom = state.data?.find((room) => room.roomId === detailId);
  const openEditor = (room: RoomDto, apply: (updated: RoomDto) => void) =>
    setEditingRoom({ room, apply });
  return (
    <>
      {!detailId && (
        <p className={roomStyles.intro}>
          {t.managerCatalog.independentRoomsHint}
        </p>
      )}
      {creating && (
        <Dialog
          title={t.managerCatalog.createRoom}
          size="lg"
          closeIconOnly
          onClose={() => {
            if (!creatingBusy) setCreating(false);
          }}
        >
          <CreateRoomForm
            onBusyChange={setCreatingBusy}
            onCancel={() => setCreating(false)}
            onCreated={() => {
              state.reload();
              rates.reload();
              types.reload();
              setCreating(false);
              setCreatingBusy(false);
            }}
          />
        </Dialog>
      )}
      {editingRoom && (
        <RoomEditDialog
          key={editingRoom.room.roomId}
          room={editingRoom.room}
          onClose={() => setEditingRoom(null)}
          onSaved={(updated) => {
            editingRoom.apply(updated);
            setEditingRoom(null);
          }}
        />
      )}
      {!detailId && (
        <Card>
          <div className={roomStyles.toolbar}>
            <div className={roomStyles.filters}>
              <label className={roomStyles.search}>
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  aria-label={t.common.search}
                  placeholder={t.managerCatalog.searchRooms}
                  value={filters.values.q}
                  onChange={(event) => filters.set({ q: event.target.value })}
                />
              </label>
              <select
                aria-label={l.status}
                value={filters.values.status}
                onChange={(event) =>
                  filters.set({ status: event.target.value })
                }
              >
                <option value="">{t.managerCatalog.allRoomStatuses}</option>
                <option value="active">{t.wireStatus.ACTIVE}</option>
                <option value="inactive">{t.wireStatus.INACTIVE}</option>
              </select>
              <select
                aria-label={t.managerCatalog.rentalStatus}
                value={filters.values.rentalStatus}
                onChange={(event) =>
                  filters.set({ rentalStatus: event.target.value })
                }
              >
                <option value="">{t.managerCatalog.allRentalStatuses}</option>
                <option value="enabled">{t.managerCatalog.rentalEnabled}</option>
                <option value="disabled">{t.managerCatalog.rentalDisabled}</option>
              </select>
            </div>
            <button className="btn" onClick={() => setCreating(true)}>
              {t.managerCatalog.createRoom}
            </button>
          </div>
          <CatalogTable
            className={roomStyles.table}
            state={state}
            visibleRowActions={2}
            filters={filters}
            caption={t.managerOperations.facilities}
            rows={(state.data ?? []).filter((r) =>
              detailId
                ? r.roomId === detailId
                : matchesCatalog(r, r.name, filters.values) &&
                  (!filters.values.rentalStatus ||
                    !!r.allowRental ===
                      (filters.values.rentalStatus === "enabled")),
            )}
            getRowId={(r) => String(r.roomId)}
            columns={[
              {
                id: "name",
                header: l.room,
                rowHeader: true,
                cell: (room) => (
                  <div className={roomStyles.roomName}>
                    <Link href={`/manager/facilities/${room.roomId}`}>
                      {room.name}
                    </Link>
                  </div>
                ),
              },
              {
                id: "allowRental",
                header: t.managerCatalog.rentalStatus,
                cell: (r) => (
                  <span
                    className={roomStyles.statusLabel}
                    data-enabled={!!r.allowRental}
                  >
                    {r.allowRental
                      ? t.managerCatalog.rentalEnabled
                      : t.managerCatalog.rentalDisabled}
                  </span>
                ),
              },
              { id: "capacity", header: l.capacity, numeric: true },
              {
                id: "pricePerHour",
                header: t.managerCatalog.pricePerHour,
                numeric: true,
                cell: (room) => {
                  if (!room.allowRental) return "—";
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
                  <span
                    className={roomStyles.statusLabel}
                    data-enabled={r.isActive}
                  >
                    {r.isActive
                      ? t.wireStatus.ACTIVE
                      : t.managerCatalog.roomDeactive}
                  </span>
                ),
              },
            ]}
            actions={(r) => (
              <>
                <Link
                  className="btn btn--ghost btn--sm"
                  href={`/manager/facilities/${r.roomId}`}
                >
                  {t.managerCatalog.viewCourt}
                </Link>
                <ConfirmRecordAction
                  label={t.recordActions.delete}
                  triggerIcon={<Trash2 size={17} aria-hidden="true" />}
                  title={t.recordActions.deleteRoom}
                  description={t.recordActions.roomDescription}
                  recordName={r.name}
                  onConfirm={() => catalogApi.deleteRoom(r.roomId)}
                  onCompleted={() => {
                    state.reload();
                    if (detailId) router.push("/manager/facilities");
                  }}
                />
              </>
            )}
          />
        </Card>
      )}
      {detailId && <AsyncSection state={state}>{() => null}</AsyncSection>}
      {detailId &&
        state.data &&
        !state.data.some((r) => r.roomId === detailId) && (
          <p role="alert">{t.managerCatalog.notFound}</p>
        )}
      {selectedRoom && (
        <RoomDetails
          key={selectedRoom.roomId}
          room={selectedRoom}
          onEdit={openEditor}
          onDeleted={() => router.push("/manager/facilities")}
        />
      )}
    </>
  );
}
