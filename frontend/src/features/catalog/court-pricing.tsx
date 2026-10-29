"use client";
import { ActivitySwitch } from "@/components/ActivitySwitch";

import { useEffect, useId, useState } from "react";
import {
  loadCenterHours,
  minutesToTime,
  timeToMinutes,
} from "@/lib/center-hours";
import { useLanguage } from "@/lib/language";
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
import styles from "./court-pricing.module.css";

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
  pricePerHour: number | "";
  isActive: boolean;
};
export function CourtRateEditor({ roomId }: { roomId?: number }) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const formId = useId();
  const rates = useApi((s) => catalogApi.rates(s), []);
  const rooms = useApi((s) => catalogApi.rooms(s), []);
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const types = useApi((s) => catalogApi.roomTypes(s), []);
  const action = useAction();
  const [editor, setEditor] = useState<{
    id: number | null;
    form: RateForm;
  } | null>(null);
  const [timesEdited, setTimesEdited] = useState(false);
  const center = useApi((signal) => loadCenterHours(signal), []);
  const selectedRoomId = Number(editor?.form.roomId) || null;
  const openingHours = useApi(
    async (signal) => ({
      roomId: selectedRoomId,
      hours: selectedRoomId
        ? await catalogApi.hours(selectedRoomId, signal)
        : [],
    }),
    [selectedRoomId],
  );
  const selectedDays = editor?.form.daysOfWeek ?? [];
  const applicableHours = selectedDays.map((day) =>
    openingHours.data?.hours.find(
      (hour) => hour.dayOfWeek === (days.indexOf(day) + 1) % 7,
    ),
  );
  const hoursMissing =
    !!selectedRoomId && applicableHours.some((hour) => !hour);
  const opening = Math.max(
    6 * 60,
    center.data?.openingMinute ?? 6 * 60,
    ...applicableHours.flatMap((hour) =>
      hour ? [timeToMinutes(hour.openTimeLocal.slice(0, 5))] : [],
    ),
  );
  const closing = Math.min(
    22 * 60,
    center.data?.closingMinute ?? 22 * 60,
    ...applicableHours.flatMap((hour) =>
      hour ? [timeToMinutes(hour.closeTimeLocal.slice(0, 5))] : [],
    ),
  );
  const hoursReady =
    !!center.data &&
    !center.loading &&
    !center.error &&
    openingHours.data?.roomId === selectedRoomId &&
    !openingHours.loading &&
    !openingHours.error &&
    !hoursMissing &&
    opening < closing;
  const hoursMessage =
    openingHours.error || center.error
      ? vi
        ? "Không tải được giờ hoạt động. Hãy thử lại."
        : "Opening hours could not be loaded. Please retry."
      : !center.loading && !openingHours.loading && !hoursReady
        ? vi
          ? "Hãy cấu hình giờ hoạt động cho các ngày đã chọn tại phòng và Settings. Các ngày cần có khung giờ thuê chung hợp lệ."
          : "Configure opening hours for the selected days in the room and Settings. The selected days need a common rental window."
        : hoursReady
          ? `${vi ? "Khung giờ giá thuê hợp lệ" : "Allowed rental price window"}: ${minutesToTime(opening)}–${minutesToTime(closing)}`
          : "";
  const validWindow =
    !!editor &&
    hoursReady &&
    !!editor.form.startTimeLocal &&
    !!editor.form.endTimeLocal &&
    timeToMinutes(editor.form.startTimeLocal) >= opening &&
    timeToMinutes(editor.form.endTimeLocal) <= closing &&
    editor.form.endTimeLocal > editor.form.startTimeLocal;
  const validPrice =
    !!editor &&
    editor.form.pricePerHour !== "" &&
    Number.isFinite(editor.form.pricePerHour) &&
    editor.form.pricePerHour >= 2000 &&
    editor.form.pricePerHour % 2000 === 0;
  const creating = editor?.id === null;
  useEffect(() => {
    if (!hoursReady) return;
    // Initialize a new draft only after its configured hours have loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditor((current) =>
      current?.id === null &&
      !timesEdited &&
      (current.form.startTimeLocal !== minutesToTime(opening) ||
        current.form.endTimeLocal !== minutesToTime(closing))
        ? {
            ...current,
            form: {
              ...current.form,
              startTimeLocal: minutesToTime(opening),
              endTimeLocal: minutesToTime(closing),
            },
          }
        : current,
    );
  }, [hoursReady, opening, closing, creating, timesEdited]);
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
      (!r.roomId && r.roomTypeId === court?.roomTypeId),
  );
  function edit(rate?: CourtRateDto) {
    action.reset();
    setTimesEdited(false);
    setEditor({
      id: rate?.rateId ?? null,
      form: {
        sportId: String(rate ? (rate.sportId ?? "") : (currentSport ?? "")),
        roomId: String(rate ? (rate.roomId ?? "") : (roomId ?? "")),
        roomTypeId: rate?.roomTypeId ?? court?.roomTypeId ?? 0,
        daysOfWeek: rate?.daysOfWeek.split(",") ?? ["MON"],
        startTimeLocal: rate?.startTimeLocal.slice(0, 5) ?? "",
        endTimeLocal: rate?.endTimeLocal.slice(0, 5) ?? "",
        pricePerHour: rate?.pricePerHour ?? "",
        isActive: rate?.isActive ?? true,
      },
    });
  }
  const update = (patch: Partial<RateForm>) => {
    if ("startTimeLocal" in patch || "endTimeLocal" in patch)
      setTimesEdited(true);
    setEditor((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));
  };
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
          rows.length ? null : <p>Create a room before adding rental prices.</p>
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
          className={styles.dialog}
          closeIconOnly
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={action.busy}
                onClick={() => setEditor(null)}
              >
                {t.operations.cancel}
              </button>
              <button
                type="submit"
                form={formId}
                className="btn"
                disabled={
                  action.busy ||
                  !validWindow ||
                  !validPrice ||
                  (!editor.id && !editor.form.sportId) ||
                  editor.form.endTimeLocal <= editor.form.startTimeLocal ||
                  !editor.form.roomTypeId ||
                  !editor.form.daysOfWeek.length
                }
              >
                {action.busy ? t.common.loading : t.operations.save}
              </button>
            </>
          }
          onClose={() => {
            if (!action.busy) setEditor(null);
          }}
        >
          <form
            id={formId}
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                const f = editor.form;
                if (!validWindow || !validPrice || !f.daysOfWeek.length) return;
                const body: SaveRate = {
                  ...f,
                  pricePerHour: Number(f.pricePerHour),
                  sportId: f.sportId ? Number(f.sportId) : null,
                  roomId: f.roomId ? Number(f.roomId) : null,
                };
                await catalogApi.saveRate(editor.id, body);
                setEditor(null);
                rates.reload();
              });
            }}
          >
            <fieldset className={styles.fields} disabled={action.busy}>
              <ActivitySwitch
                checked={editor.form.isActive}
                onChange={(isActive) => update({ isActive })}
              />
              <div className={styles.grid}>
                <Field label="Sport" required={!editor.id}>
                  <select
                    disabled={!!editor.id}
                    required={!editor.id}
                    value={editor.form.sportId}
                    onChange={(e) =>
                      update({
                        sportId: e.target.value,
                        roomId: roomId ? String(roomId) : "",
                        roomTypeId:
                          court?.roomTypeId ??
                          types.data?.find((t) =>
                            t.sportIds.includes(Number(e.target.value)),
                          )?.roomTypeId ??
                          0,
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
                          (r.isActive && r.allowRental),
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
                    min={minutesToTime(opening)}
                    max={minutesToTime(closing)}
                    required
                    value={editor.form.startTimeLocal}
                    onChange={(e) => update({ startTimeLocal: e.target.value })}
                  />
                </Field>
                <Field label="End" required>
                  <input
                    type="time"
                    min={minutesToTime(opening)}
                    max={minutesToTime(closing)}
                    required
                    value={editor.form.endTimeLocal}
                    onChange={(e) => update({ endTimeLocal: e.target.value })}
                  />
                </Field>
              </div>
              <div className={styles.price}>
                <Field label="Price per hour (VND)" required>
                  <input
                    type="number"
                    required
                    min={2000}
                    step={2000}
                    value={editor.form.pricePerHour}
                    onChange={(e) =>
                      update({
                        pricePerHour:
                          e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <fieldset className={styles.days}>
                <legend>Days</legend>
                <div className={styles.dayActions}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => update({ daysOfWeek: [...days] })}
                    disabled={editor.form.daysOfWeek.length === 7}
                  >
                    {t.managerCatalog.allWeek}
                  </button>
                </div>
                <div className={styles.dayGrid}>
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
                      {dayLabels[day]}
                    </label>
                  ))}
                </div>
                {!editor.form.daysOfWeek.length && (
                  <p className={styles.error} role="alert">
                    {t.managerCatalog.daysRequired}
                  </p>
                )}
              </fieldset>
              {hoursMessage && <p role="status">{hoursMessage}</p>}
              {(center.error || openingHours.error) && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    center.reload();
                    openingHours.reload();
                  }}
                >
                  {t.common.retry}
                </button>
              )}
              {hoursReady &&
                editor.form.startTimeLocal &&
                editor.form.endTimeLocal &&
                !validWindow && (
                  <p role="alert">
                    {vi
                      ? "Khung giá phải nằm hoàn toàn trong giờ thuê hợp lệ."
                      : "The price window must be entirely within the allowed rental hours."}
                  </p>
                )}
              {editor.form.endTimeLocal <= editor.form.startTimeLocal && (
                <p className={styles.error} role="alert">
                  End time must be after start time.
                </p>
              )}
              {action.error && (
                <p className={styles.error} role="alert">
                  {action.error}
                </p>
              )}
            </fieldset>
          </form>
        </Dialog>
      )}
    </section>
  );
}
