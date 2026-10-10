"use client";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney } from "@/lib/format";
import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";
import { useMutation } from "@/features/operations";
import type { CourtRateDto } from "@/lib/types";
import { catalogApi, type SaveRate } from "./api";
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
const empty = {
  roomTypeId: "",
  sportId: "",
  daysOfWeek: ["MON"],
  startTimeLocal: "06:00",
  endTimeLocal: "22:00",
  pricePerHour: 100000,
  isActive: true,
};
const codes = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export function CourtRateEditor() {
  const { t } = useLanguage();
  const l = t.operations;
  const c = t.managerCatalog;
  const state = useApi((s) => catalogApi.rates(s), []);
  const types = useApi((s) => catalogApi.roomTypes(s), []);
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const filters = useCatalogFilters();
  const mutation = useMutation();
  const [form, setForm] = useState(empty);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const [activity, setActivity] = useState<CourtRateDto | null>(null);
  const [validation, setValidation] = useState("");
  const roomName = (id: number) =>
    types.data?.find((x) => x.roomTypeId === id)?.name ?? "#" + id;
  const sportName = (id: number | null) =>
    id === null
      ? l.all
      : (sports.data?.find((x) => x.sportId === id)?.name ?? "#" + id);
  const edit = (r?: CourtRateDto) => {
    mutation.reset();
    setValidation("");
    setEditor({ id: r?.rateId ?? null });
    setForm(
      r
        ? {
            roomTypeId: String(r.roomTypeId),
            sportId: r.sportId === null ? "" : String(r.sportId),
            daysOfWeek: r.daysOfWeek.split(",").map((x) => x.trim()),
            startTimeLocal: r.startTimeLocal.slice(0, 5),
            endTimeLocal: r.endTimeLocal.slice(0, 5),
            pricePerHour: r.pricePerHour,
            isActive: r.isActive,
          }
        : empty,
    );
  };
  const ready =
    !!types.data?.length &&
    !!sports.data &&
    !types.loading &&
    !sports.loading &&
    !types.error &&
    !sports.error;
  return (
    <>
      <Card
        title={l.rates}
        hint={c.ratesHint}
        actions={
          <button
            className="btn"
            disabled={!ready || state.loading || !!state.error}
            onClick={() => edit()}
          >
            {c.createRate}
          </button>
        }
      >
        <AsyncSection
          state={types}
          isEmpty={(rows) => rows.length === 0}
          emptyMessage={
            <p>
              {c.noCompatibleRooms} {c.compatibleRoomsHint}
            </p>
          }
        >
          {() => null}
        </AsyncSection>
        <AsyncSection state={sports}>{() => null}</AsyncSection>
        <CatalogFilters
          filters={filters}
          extra={[
            {
              id: "roomType",
              label: l.roomType,
              kind: "select",
              options: [
                { value: "", label: l.all },
                ...(types.data ?? []).map((r) => ({
                  value: String(r.roomTypeId),
                  label: r.name,
                })),
              ],
            },
          ]}
        />
        <CatalogTable
          state={state}
          filters={filters}
          caption={l.rates}
          getRowId={(r) => String(r.rateId)}
          rows={(state.data ?? []).filter(
            (r) =>
              matchesCatalog(
                r,
                roomName(r.roomTypeId) + " " + sportName(r.sportId),
                filters.values,
              ) &&
              (!filters.values.roomType ||
                String(r.roomTypeId) === filters.values.roomType),
          )}
          columns={[
            {
              id: "roomTypeId",
              header: l.roomType,
              rowHeader: true,
              cell: (r) => roomName(r.roomTypeId),
            },
            {
              id: "sportId",
              header: l.sport,
              cell: (r) => sportName(r.sportId),
            },
            {
              id: "daysOfWeek",
              header: l.day,
              cell: (r) =>
                codes.every((code) =>
                  r.daysOfWeek
                    .split(",")
                    .map((day) => day.trim())
                    .includes(code),
                )
                  ? c.everyDay
                  : r.daysOfWeek
                      .split(",")
                      .map(
                        (day) => l.weekdays[codes.indexOf(day.trim())] ?? day,
                      )
                      .join(", "),
            },
            {
              id: "window",
              header: c.timeWindow,
              cell: (r) =>
                r.startTimeLocal.slice(0, 5) +
                " – " +
                r.endTimeLocal.slice(0, 5),
            },
            {
              id: "pricePerHour",
              header: l.priceHour,
              numeric: true,
              cell: (r) => (
                <span className={styles.courtRatePrice}>
                  {formatMoney(r.pricePerHour)}
                </span>
              ),
            },
            {
              id: "isActive",
              header: l.status,
              cell: (r) => (
                <StatusChip value={r.isActive ? "ACTIVE" : "INACTIVE"} />
              ),
            },
          ]}
          actions={(r) => (
            <>
              <button
                className="btn btn--secondary btn--sm"
                disabled={!ready || mutation.busy}
                onClick={() => edit(r)}
              >
                {l.edit}
              </button>
              <button
                className="btn btn--ghost btn--sm"
                disabled={!ready || mutation.busy}
                onClick={() => {
                  mutation.reset();
                  setActivity(r);
                }}
              >
                {r.isActive ? l.deactivate : l.activate}
              </button>
            </>
          )}
        />
        {!editor && !activity && <CatalogFeedback mutation={mutation} />}
      </Card>
      {editor && (
        <CatalogFormDialog
          title={editor.id === null ? c.createRate : c.editRate}
          busy={mutation.busy}
          mutation={mutation}
          onClose={() => setEditor(null)}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.daysOfWeek.length) {
              setValidation(c.daysRequired);
              return;
            }
            if (form.endTimeLocal <= form.startTimeLocal) {
              setValidation(c.invalidWindow);
              return;
            }
            setValidation("");
            const body: SaveRate = {
              ...form,
              roomTypeId: Number(form.roomTypeId),
              sportId: form.sportId ? Number(form.sportId) : null,
            };
            if (
              await mutation.run(() => catalogApi.saveRate(editor.id, body))
            ) {
              setEditor(null);
              state.reload();
            }
          }}
        >
          <div className="form-grid">
            <Field label={l.roomType} required>
              <select
                required
                value={form.roomTypeId}
                onChange={(e) =>
                  setForm({ ...form, roomTypeId: e.target.value, sportId: "" })
                }
              >
                <option value="">—</option>
                {(types.data ?? []).map((r) => (
                  <option key={r.roomTypeId} value={r.roomTypeId}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={l.sport}>
              <select
                value={form.sportId}
                onChange={(e) => setForm({ ...form, sportId: e.target.value })}
              >
                <option value="">{l.all}</option>
                {(sports.data ?? [])
                  .filter(
                    (s) =>
                      types.data
                        ?.find((r) => r.roomTypeId === Number(form.roomTypeId))
                        ?.sportIds.includes(s.sportId) ||
                      String(s.sportId) === form.sportId,
                  )
                  .map((s) => (
                    <option key={s.sportId} value={s.sportId}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={l.start} required>
              <input
                required
                type="time"
                value={form.startTimeLocal}
                onChange={(e) =>
                  setForm({ ...form, startTimeLocal: e.target.value })
                }
              />
            </Field>
            <Field label={l.end} required>
              <input
                required
                type="time"
                value={form.endTimeLocal}
                onChange={(e) =>
                  setForm({ ...form, endTimeLocal: e.target.value })
                }
              />
            </Field>
            <Field label={l.priceHour} required hint={c.priceHint}>
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
          <fieldset className={styles.days}>
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
                        : form.daysOfWeek.filter((x) => x !== code),
                    })
                  }
                />
                {l.weekdays[i]}
              </label>
            ))}
          </fieldset>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            {l.active}
          </label>
          {validation && (
            <p className="alert alert--error" role="alert">
              {validation}
            </p>
          )}
        </CatalogFormDialog>
      )}
      {activity && (
        <ActivityDialog
          name={
            roomName(activity.roomTypeId) +
            " · " +
            activity.startTimeLocal +
            " – " +
            activity.endTimeLocal
          }
          active={activity.isActive}
          mutation={mutation}
          onClose={() => setActivity(null)}
          onConfirm={async () => {
            // Court-rate API has no separate activation endpoint: send the complete existing contract.
            const body: SaveRate = {
              roomTypeId: activity.roomTypeId,
              sportId: activity.sportId,
              daysOfWeek: activity.daysOfWeek.split(",").map((x) => x.trim()),
              startTimeLocal: activity.startTimeLocal.slice(0, 5),
              endTimeLocal: activity.endTimeLocal.slice(0, 5),
              pricePerHour: activity.pricePerHour,
              isActive: !activity.isActive,
            };
            if (
              await mutation.run(() =>
                catalogApi.saveRate(activity.rateId, body),
              )
            ) {
              setActivity(null);
              state.reload();
            }
          }}
        />
      )}
    </>
  );
}
