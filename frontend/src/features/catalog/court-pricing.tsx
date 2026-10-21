"use client";
import { useState } from "react";
import { useApi, useAction } from "@/lib/useApi";
import { formatMoney } from "@/lib/format";
import {
  AsyncSection,
  Dialog,
  Field,
  StatusChip,
  Table,
} from "@/components/ui";
import { ConfirmRecordAction } from "@/components/ConfirmRecordAction";
import type { CourtRateDto } from "@/lib/types";
import { catalogApi, type SaveRate } from "./api";

const dayLabels: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};
const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
type RateForm = {
  sportId: string;
  roomId: string;
  roomTypeId: number;
  daysOfWeek: string[];
  startTimeLocal: string;
  endTimeLocal: string;
  pricePerHour: number;
  isActive: boolean;
};
export function CourtRateEditor({ roomId }: { roomId?: number }) {
  const rates = useApi((s) => catalogApi.rates(s), []);
  const rooms = useApi((s) => catalogApi.rooms(s), []);
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const types = useApi((s) => catalogApi.roomTypes(s), []);
  const action = useAction();
  const [editor, setEditor] = useState<{
    id: number | null;
    form: RateForm;
  } | null>(null);
  const court = rooms.data?.find((r) => r.roomId === roomId);
  const sportOf = (
    id: number | null | undefined,
    typeId: number | null | undefined,
  ) => id ?? types.data?.find((t) => t.roomTypeId === typeId)?.sportIds[0];
  const ready =
    !!types.data?.length &&
    !!sports.data?.length &&
    !rooms.loading &&
    !sports.loading &&
    !types.loading &&
    !rooms.error &&
    !sports.error &&
    !types.error;
  const currentSport = sportOf(court?.sportId, court?.roomTypeId);
  const visible = (rates.data ?? []).filter(
    (r) =>
      !roomId ||
      r.roomId === roomId ||
      (!r.roomId &&
        r.roomTypeId === court?.roomTypeId &&
        (!r.sportId || r.sportId === currentSport)),
  );
  function edit(rate?: CourtRateDto) {
    action.reset();
    setEditor({
      id: rate?.rateId ?? null,
      form: {
        sportId: String(rate ? (rate.sportId ?? "") : (currentSport ?? "")),
        roomId: String(rate ? (rate.roomId ?? "") : (roomId ?? "")),
        roomTypeId: rate?.roomTypeId ?? court?.roomTypeId ?? 0,
        daysOfWeek: rate?.daysOfWeek.split(",") ?? ["MON"],
        startTimeLocal: rate?.startTimeLocal.slice(0, 5) ?? "06:00",
        endTimeLocal: rate?.endTimeLocal.slice(0, 5) ?? "22:00",
        pricePerHour: rate?.pricePerHour ?? 100000,
        isActive: rate?.isActive ?? true,
      },
    });
  }
  const update = (patch: Partial<RateForm>) =>
    setEditor((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));
  return (
    <section className="stack" aria-label="Rental pricing">
      <div className="row">
        <h3>Rental pricing</h3>
        <button
          type="button"
          className="btn"
          disabled={!ready || rates.loading || !!rates.error}
          onClick={() => edit()}
        >
          Create court rate
        </button>
      </div>
      {action.error && <p role="alert">{action.error}</p>}
      <AsyncSection state={rooms}>{() => null}</AsyncSection>
      <AsyncSection state={types}>
        {(rows) =>
          rows.length ? null : (
            <p>Create a court with its sport before adding rental prices.</p>
          )
        }
      </AsyncSection>
      <AsyncSection state={sports}>{() => null}</AsyncSection>
      <AsyncSection state={rates}>
        {() =>
          visible.length ? (
            <Table
              headers={[
                "Applies to",
                "Sport",
                "Days",
                "Time",
                "Price / hour",
                "Status",
                "Actions",
              ]}
            >
              {visible.map((r) => (
                <tr key={r.rateId}>
                  <td>
                    {r.roomId
                      ? (rooms.data?.find((c) => c.roomId === r.roomId)?.name ??
                        "Unavailable court")
                      : "Shared price"}
                  </td>
                  <td>
                    {sports.data?.find((s) => s.sportId === r.sportId)?.name ??
                      "All compatible sports"}
                  </td>
                  <td>
                    {r.daysOfWeek.split(",").length === 7
                      ? "All week"
                      : r.daysOfWeek
                          .split(",")
                          .map((day) => dayLabels[day] ?? day)
                          .join(", ")}
                  </td>
                  <td>
                    {r.startTimeLocal.slice(0, 5)}–{r.endTimeLocal.slice(0, 5)}
                  </td>
                  <td>{formatMoney(r.pricePerHour)}</td>
                  <td>
                    <StatusChip value={r.isActive ? "ACTIVE" : "INACTIVE"} />
                  </td>
                  <td>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={!ready}
                        onClick={() => edit(r)}
                      >
                        Edit
                      </button>
                      <ConfirmRecordAction
                        label={r.isActive ? "Deactivate" : "Activate"}
                        title={
                          r.isActive
                            ? "Deactivate rental price"
                            : "Activate rental price"
                        }
                        description="Existing bookings keep their purchased price."
                        recordName={formatMoney(r.pricePerHour)}
                        disabled={!ready}
                        onConfirm={() => {
                          const { daysOfWeek } = r;
                          const body = {
                            roomId: r.roomId ?? null,
                            roomTypeId: r.roomTypeId,
                            sportId: r.sportId,
                            startTimeLocal: r.startTimeLocal,
                            endTimeLocal: r.endTimeLocal,
                            pricePerHour: r.pricePerHour,
                          };
                          return catalogApi.saveRate(r.rateId, {
                            ...body,
                            daysOfWeek: daysOfWeek.split(","),
                            isActive: !r.isActive,
                          });
                        }}
                        onCompleted={rates.reload}
                      />
                      <ConfirmRecordAction
                        label="Delete"
                        title="Delete rental price"
                        recordName={formatMoney(r.pricePerHour)}
                        description="Existing bookings keep their purchased price."
                        onConfirm={() => catalogApi.deleteRate(r.rateId)}
                        onCompleted={rates.reload}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <p role="status">No rental prices yet.</p>
          )
        }
      </AsyncSection>
      {editor && (
        <Dialog
          title={editor.id ? "Edit rental price" : "Add rental price"}
          onClose={() => {
            if (!action.busy) setEditor(null);
          }}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                const f = editor.form;
                if (!f.daysOfWeek.length || f.endTimeLocal <= f.startTimeLocal)
                  return;
                const body: SaveRate = {
                  ...f,
                  sportId: f.sportId ? Number(f.sportId) : null,
                  roomId: f.roomId ? Number(f.roomId) : null,
                };
                await catalogApi.saveRate(editor.id, body);
                setEditor(null);
                rates.reload();
              });
            }}
          >
            <div className="form-grid">
              <Field label="Sport" required={!editor.id}>
                <select
                  disabled={!!roomId || !!editor.id}
                  required={!editor.id}
                  value={editor.form.sportId}
                  onChange={(e) =>
                    update({
                      sportId: e.target.value,
                      roomId: "",
                      roomTypeId:
                        types.data?.find((t) =>
                          t.sportIds.includes(Number(e.target.value)),
                        )?.roomTypeId ?? 0,
                    })
                  }
                >
                  <option value="">
                    {editor.id ? "All compatible sports" : "Select sport"}
                  </option>
                  {sports.data
                    ?.filter((s) => s.code !== "gym")
                    .map((s) => (
                      <option key={s.sportId} value={s.sportId}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Applies to">
                <select
                  disabled={!!roomId || !!editor.id}
                  value={editor.form.roomId}
                  onChange={(e) =>
                    update({
                      roomId: e.target.value,
                      roomTypeId:
                        rooms.data?.find(
                          (r) => r.roomId === Number(e.target.value),
                        )?.roomTypeId ??
                        types.data?.find((t) =>
                          t.sportIds.includes(Number(editor.form.sportId)),
                        )?.roomTypeId ??
                        0,
                    })
                  }
                >
                  <option value="">Shared price</option>
                  {rooms.data
                    ?.filter(
                      (r) =>
                        r.roomId === Number(editor.form.roomId) ||
                        sportOf(r.sportId, r.roomTypeId) ===
                          Number(editor.form.sportId),
                    )
                    .map((r) => (
                      <option key={r.roomId} value={r.roomId}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Start" required>
                <input
                  type="time"
                  required
                  value={editor.form.startTimeLocal}
                  onChange={(e) => update({ startTimeLocal: e.target.value })}
                />
              </Field>
              <Field label="End" required>
                <input
                  type="time"
                  required
                  value={editor.form.endTimeLocal}
                  onChange={(e) => update({ endTimeLocal: e.target.value })}
                />
              </Field>
              <Field label="Price per hour (VND)" required>
                <input
                  type="number"
                  required
                  min={2000}
                  step={2000}
                  value={editor.form.pricePerHour}
                  onChange={(e) =>
                    update({ pricePerHour: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
            <fieldset>
              <legend>Days</legend>
              <div className="btn-row">
                {days.map((day) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      checked={editor.form.daysOfWeek.includes(day)}
                      onChange={(e) =>
                        update({
                          daysOfWeek: e.target.checked
                            ? [...editor.form.daysOfWeek, day]
                            : editor.form.daysOfWeek.filter((d) => d !== day),
                        })
                      }
                    />{" "}
                    {
                      {
                        MON: "Monday",
                        TUE: "Tuesday",
                        WED: "Wednesday",
                        THU: "Thursday",
                        FRI: "Friday",
                        SAT: "Saturday",
                        SUN: "Sunday",
                      }[day]
                    }
                  </label>
                ))}
              </div>
            </fieldset>
            {editor.form.endTimeLocal <= editor.form.startTimeLocal && (
              <p role="alert">End time must be after start time.</p>
            )}
            {action.error && <p role="alert">{action.error}</p>}
            <button
              className="btn"
              disabled={
                action.busy ||
                (!editor.id && !editor.form.sportId) ||
                editor.form.endTimeLocal <= editor.form.startTimeLocal ||
                !editor.form.roomTypeId ||
                !editor.form.daysOfWeek.length
              }
            >
              {action.busy ? "Saving…" : "Save"}
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
