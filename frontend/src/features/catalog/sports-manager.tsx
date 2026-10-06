"use client";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";
import { useMutation } from "@/features/operations";
import type { SportDto, SportServiceType } from "@/lib/types";
import { catalogApi, type SaveSport } from "./api";
import {
  ActivityDialog,
  CatalogFeedback,
  CatalogFilters,
  CatalogFormDialog,
  CatalogTable,
  matchesCatalog,
  useCatalogFilters,
} from "./manager-shared";
import styles from "./manager-catalog.module.css";

const SERVICE_TYPES: SportServiceType[] = [
  "MEMBERSHIP_ACCESS",
  "GROUP_COURSE",
  "COURT_RENTAL",
  "PERSONAL_TRAINING",
];
const GYM_ONLY: SportServiceType[] = ["MEMBERSHIP_ACCESS", "PERSONAL_TRAINING"];
interface FormState {
  code: string;
  name: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  enabled: Record<SportServiceType, boolean>;
  defaultSessionMinutes: number;
  defaultMaxCapacity: number;
}
const empty: FormState = {
  code: "",
  name: "",
  enabled: {
    MEMBERSHIP_ACCESS: false,
    GROUP_COURSE: true,
    COURT_RENTAL: false,
    PERSONAL_TRAINING: false,
  },
  defaultSessionMinutes: 90,
  defaultMaxCapacity: 12,
  description: "",
  imageUrl: "",
  sortOrder: 0,
};
export function SportsManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const c = t.managerCatalog;
  const state = useApi((s) => catalogApi.sports(s, true), []);
  const types = useApi((s) => catalogApi.roomTypes(s), []);
  const filters = useCatalogFilters();
  const mutation = useMutation();
  const [form, setForm] = useState(empty);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const [activity, setActivity] = useState<SportDto | null>(null);
  const serviceLabel: Record<SportServiceType, string> = {
    MEMBERSHIP_ACCESS: l.serviceMembershipAccess,
    GROUP_COURSE: l.serviceGroupCourse,
    COURT_RENTAL: l.serviceCourtRental,
    PERSONAL_TRAINING: l.servicePersonalTraining,
  };
  const missingLabel: Record<string, string> = {
    room_type: l.missingRoomType,
    room: l.missingRoom,
    opening_hours: l.missingOpeningHours,
    court_rate: l.missingCourtRate,
  };
  const isGym = form.code.trim().toLowerCase() === "gym";
  const visibleServices = SERVICE_TYPES.filter(
    (type) => isGym || !GYM_ONLY.includes(type),
  );
  const edit = (row?: SportDto) => {
    mutation.reset();
    setEditor({ id: row?.sportId ?? null });
    const group = row?.services.find((s) => s.serviceType === "GROUP_COURSE");
    setForm(
      row
        ? {
            name: row.name,
            code: row.code,
            enabled: Object.fromEntries(
              SERVICE_TYPES.map((type) => [
                type,
                row.services.some((s) => s.serviceType === type && s.isEnabled),
              ]),
            ) as FormState["enabled"],
            defaultSessionMinutes: group?.defaultSessionMinutes ?? 90,
            defaultMaxCapacity: group?.defaultMaxCapacity ?? 12,
            description: row.description ?? "",
            imageUrl: row.imageUrl ?? "",
            sortOrder: row.sortOrder,
          }
        : empty,
    );
  };
  return (
    <>
      <Card
        title={l.sports}
        hint={c.sportsHint}
        actions={
          <button
            className="btn"
            disabled={state.loading || !!state.error}
            onClick={() => edit()}
          >
            {c.createSport}
          </button>
        }
      >
        <CatalogFilters filters={filters} />
        <CatalogTable
          state={state}
          filters={filters}
          caption={l.sports}
          rows={(state.data ?? []).filter((s) =>
            matchesCatalog(s, `${s.code} ${s.name}`, filters.values),
          )}
          getRowId={(s) => String(s.sportId)}
          columns={[
            { id: "name", header: l.name, rowHeader: true },
            {
              id: "code",
              header: l.code,
              cell: (s) => <span className={styles.sportCode}>{s.code}</span>,
            },
            {
              id: "services",
              header: l.services,
              cell: (s) => (
                <ul>
                  {s.services.map((svc) => {
                    const readiness = s.readiness?.find(
                      (r) => r.serviceType === svc.serviceType,
                    );
                    return (
                      <li key={svc.serviceType}>
                        {serviceLabel[svc.serviceType]}
                        {!svc.isEnabled && (
                          <span className="muted"> ({l.serviceOff})</span>
                        )}
                        {svc.serviceType === "GROUP_COURSE" && (
                          <span className="muted">
                            {" "}
                            — {svc.defaultSessionMinutes} {c.minutes} ·{" "}
                            {svc.defaultMaxCapacity} {c.people}
                          </span>
                        )}
                        {svc.isEnabled && readiness && !readiness.ready && (
                          <span className="muted">
                            {" "}
                            ({l.notReady}. {l.missingPrefix}{" "}
                            {readiness.missing
                              .map((m) => missingLabel[m] ?? m)
                              .join(", ")}
                            )
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ),
            },
            {
              id: "isActive",
              header: l.status,
              cell: (s) => (
                <StatusChip value={s.isActive ? "ACTIVE" : "INACTIVE"} />
              ),
            },
          ]}
          actions={(s) => (
            <>
              <button
                className="btn btn--secondary btn--sm"
                disabled={mutation.busy}
                onClick={() => edit(s)}
              >
                {l.edit}
              </button>
              <button
                className="btn btn--ghost btn--sm"
                disabled={mutation.busy}
                onClick={() => {
                  mutation.reset();
                  setActivity(s);
                }}
              >
                {s.isActive ? l.deactivate : l.activate}
              </button>
            </>
          )}
        />
        {!editor && !activity && <CatalogFeedback mutation={mutation} />}
      </Card>
      {editor && (
        <CatalogFormDialog
          title={editor.id === null ? c.createSport : c.editSport}
          busy={mutation.busy}
          mutation={mutation}
          onClose={() => setEditor(null)}
          onSubmit={async (e) => {
            e.preventDefault();
            const body: SaveSport = {
              ...(editor.id === null
                ? { code: form.code.trim().toLowerCase() }
                : {}),
              name: form.name.trim(),
              description: form.description,
              imageUrl: form.imageUrl,
              sortOrder: form.sortOrder,
              services: visibleServices
                .filter((type) => form.enabled[type])
                .map((serviceType) => ({
                  serviceType,
                  isEnabled: true,
                  defaultSessionMinutes:
                    serviceType === "GROUP_COURSE"
                      ? form.defaultSessionMinutes
                      : null,
                  defaultMaxCapacity:
                    serviceType === "GROUP_COURSE"
                      ? form.defaultMaxCapacity
                      : null,
                })),
            };
            if (
              await mutation.run(() => catalogApi.saveSport(editor.id, body))
            ) {
              setEditor(null);
              state.reload();
            }
          }}
        >
          <div className="form-grid">
            <Field
              label={l.code}
              required={editor.id === null}
              hint={l.codeHint}
            >
              <input
                required={editor.id === null}
                disabled={editor.id !== null}
                maxLength={32}
                pattern="[a-z0-9_]{2,32}"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label={l.name} required>
              <input
                required
                pattern=".*\S.*"
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            {form.enabled.GROUP_COURSE && (
              <>
                <Field label={l.duration} required>
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
                <Field label={l.capacity} required>
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
                required
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
          <fieldset className={styles.days}>
            <legend>{l.services}</legend>
            {visibleServices.map((type) => (
              <label key={type}>
                <input
                  type="checkbox"
                  checked={form.enabled[type]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      enabled: { ...form.enabled, [type]: e.target.checked },
                    })
                  }
                />
                {serviceLabel[type]}
              </label>
            ))}
          </fieldset>
          {!isGym && <p className="small muted">{l.serviceNote}</p>}
          <Field label={l.description}>
            <textarea
              maxLength={2000}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Field>
          {editor.id !== null && (
            <div>
              <h3>{c.compatibleRooms}</h3>
              <p className="small muted">{c.compatibleRoomsHint}</p>
              <AsyncSection state={types}>
                {(rows) => (
                  <p>
                    {rows
                      .filter((r) => r.sportIds.includes(editor.id!))
                      .map((r) => r.name)
                      .join(", ") || c.noCompatibleRooms}
                  </p>
                )}
              </AsyncSection>
            </div>
          )}
        </CatalogFormDialog>
      )}
      {activity && (
        <ActivityDialog
          name={activity.name}
          active={activity.isActive}
          mutation={mutation}
          onClose={() => setActivity(null)}
          onConfirm={async () => {
            if (await mutation.run(() => catalogApi.setSportActive(activity))) {
              setActivity(null);
              state.reload();
            }
          }}
        />
      )}
    </>
  );
}
