"use client";
import { ActivitySwitch } from "@/components/ActivitySwitch";
import { ConfirmRecordAction } from "@/components/ConfirmRecordAction";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Dialog, Field, StatusChip } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { SpecialtyEditor } from "@/features/coaches";
import { catalogApi } from "./api";
import {
  CatalogPanel,
  CatalogFilters,
  CatalogTable,
  useCatalogFilters,
} from "./manager-shared";
import styles from "./manager-catalog.module.css";
export function RoomTypesManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const state = useApi((s) => catalogApi.roomTypes(s), []);
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const mutation = useMutation();
  const [id, setId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [sportIds, setSports] = useState<number[]>([]);
  const [active, setActive] = useState(true);
  const [originalActive, setOriginalActive] = useState(true);
  const [statusReason, setStatusReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [partial, setPartial] = useState(false);
  const filters = useCatalogFilters();
  return (
    <>
      {editing && (
        <Dialog
          showCloseButton={false}
          title={`${id ? l.edit : l.create} ${l.roomType.toLocaleLowerCase()}`}
          size="md"
          onClose={() => {
            if (!mutation.busy) setEditing(false);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              let target = id;
              if (
                await mutation.run(async () => {
                  if (target)
                    await api.put(`/api/manager/room-types/${target}`, {
                      name,
                      isActive: active,
                      reason: statusReason,
                    });
                  else {
                    const created = await api.post<{ roomTypeId: number }>(
                      "/api/manager/room-types",
                      { name },
                    );
                    target = created.roomTypeId;
                    setId(target);
                    setPartial(true);
                    state.reload();
                  }
                  await api.put(`/api/manager/room-types/${target}/sports`, {
                    sportIds,
                  });
                })
              ) {
                state.reload();
                setId(null);
                setName("");
                setSports([]);
                setEditing(false);
                setPartial(false);
              }
            }}
          >
            <fieldset
              className={styles.roomTypeFields}
              disabled={mutation.busy}
            >
              {id !== null && (
                <>
                  <ActivitySwitch
                    checked={active}
                    onChange={setActive}
                    hint="Inactive room types stop new bookings; existing bookings stay unchanged."
                  />
                  {active !== originalActive && (
                    <Field label={l.reason} required>
                      <textarea
                        required
                        minLength={3}
                        maxLength={500}
                        value={statusReason}
                        onChange={(event) =>
                          setStatusReason(event.target.value)
                        }
                      />
                    </Field>
                  )}
                </>
              )}
              <Field label={l.name} required>
                <input
                  required
                  maxLength={100}
                  pattern=".*\S.*"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <AsyncSection state={sports}>
                {(rows) => (
                  <SpecialtyEditor
                    legend={l.sports}
                    sports={rows}
                    value={sportIds}
                    onChange={setSports}
                  />
                )}
              </AsyncSection>
              <div className={`btn-row ${styles.roomTypeActions}`}>
                <button className="btn" disabled={mutation.busy}>
                  {id ? l.save : l.create}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={mutation.busy}
                  onClick={() => {
                    setId(null);
                    setName("");
                    setSports([]);
                    setEditing(false);
                  }}
                >
                  {l.cancel}
                </button>
              </div>
            </fieldset>
          </form>
          <MutationFeedback mutation={mutation} />
          {partial && (
            <p role="status">
              {t.managerOperations.completedStep} · {l.roomType} #{id}.{" "}
              {t.managerOperations.partialHint}
            </p>
          )}
        </Dialog>
      )}
      <CatalogPanel
        filters={<CatalogFilters filters={filters} />}
        actions={
          <button
            className="btn"
            onClick={() => {
              setId(null);
              setName("");
              setSports([]);
              setPartial(false);
              setEditing(true);
              mutation.reset();
            }}
          >
            {l.create}
          </button>
        }
      >
        <CatalogTable
          state={state}
          filters={filters}
          caption={l.roomTypes}
          visibleRowActions={3}
          rows={(state.data ?? []).filter(
            (r) =>
              r.name
                .toLocaleLowerCase()
                .includes(filters.values.q.trim().toLocaleLowerCase()) &&
              (!filters.values.status ||
                (r.isActive !== false) ===
                  (filters.values.status === "active")),
          )}
          getRowId={(r) => String(r.roomTypeId)}
          columns={[
            { id: "name", header: l.roomType, rowHeader: true },
            {
              id: "sportIds",
              header: l.sports,
              cell: (r) =>
                r.sportIds
                  .map(
                    (id) =>
                      sports.data?.find((s) => s.sportId === id)?.name ?? id,
                  )
                  .join(", "),
            },
            {
              id: "isActive",
              header: l.status,
              cell: (r) => (
                <StatusChip
                  value={r.isActive !== false ? "ACTIVE" : "INACTIVE"}
                />
              ),
            },
          ]}
          actions={(r) => (
            <>
              <button
                className="btn btn--secondary"
                onClick={() => {
                  setActive(r.isActive !== false);
                  setOriginalActive(r.isActive !== false);
                  setStatusReason("");
                  setId(r.roomTypeId);
                  setName(r.name);
                  setSports(r.sportIds);
                  setEditing(true);
                  setPartial(false);
                  mutation.reset();
                }}
              >
                {l.edit}
              </button>

              <ConfirmRecordAction
                label={t.recordActions.delete}
                title={t.recordActions.deleteRoomType}
                description={t.recordActions.roomTypeDescription}
                recordName={r.name}
                onConfirm={() => catalogApi.deleteRoomType(r.roomTypeId)}
                onCompleted={state.reload}
              />
            </>
          )}
        />
      </CatalogPanel>
    </>
  );
}
