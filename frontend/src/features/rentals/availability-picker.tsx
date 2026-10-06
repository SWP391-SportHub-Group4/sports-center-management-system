"use client";
import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { todayIso, addDaysIso } from "@/lib/format";
import { api } from "@/lib/apiClient";
import { AsyncSection, Field } from "@/components/ui";
import { vietnamUtc } from "@/lib/vietnam-time";
import { CheckoutPanel } from "@/features/payments";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { RentalAvailabilityDto, SportDto } from "@/lib/types";
import { RentalPriceBreakdown } from "./rental-price-breakdown";
import { rentalApi } from "./api";

/** Đặt sân theo giờ: mọi Member đang hoạt động, không cần Membership, hồ sơ hay số người. */
export function AvailabilityPicker() {
  const { t } = useLanguage();
  const l = t.operations;
  const { refreshUser } = useAuth();
  const policy = useApi((s) => rentalApi.policy(s), []);
  const serverDate = policy.data
    ? new Date(new Date(policy.data.serverNowUtc).getTime() + 7 * 3600000)
        .toISOString()
        .slice(0, 10)
    : undefined;
  // Chỉ môn đang bật dịch vụ thuê sân; không hardcode danh sách môn.
  const sports = useApi(
    (s) =>
      api.get<SportDto[]>("/api/sports", {
        signal: s,
        anonymous: true,
        query: { service: "COURT_RENTAL" },
      }),
    [],
  );
  const mutation = useMutation();
  const revision = useRef(0);
  const [sportId, setSport] = useState("");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("09:00");
  const [hours, setHours] = useState(1);
  const [options, setOptions] = useState<RentalAvailabilityDto[] | null>(null);
  const [selected, setSelected] = useState<RentalAvailabilityDto | null>(null);
  const [snapshot, setSnapshot] = useState<{
    sportId: number;
    startUtc: string;
    endUtc: string;
  } | null>(null);
  function clear() {
    revision.current++;
    setOptions(null);
    setSelected(null);
    setSnapshot(null);
    mutation.reset();
  }
  const maxHours = policy.data?.maxHours ?? 4;
  return (
    <>
      <AsyncSection state={policy}>
        {(limits) => (
          <p>
            {l.hours}: 1-{limits.maxHours} · {l.daysAhead}:{" "}
            {limits.advanceDays} · {l.cancelFreeHours}: {limits.cancelFreeHours}
          </p>
        )}
      </AsyncSection>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const expectedRevision = revision.current;
          const startUtc = vietnamUtc(`${date}T${time}`);
          const endUtc = new Date(
            new Date(startUtc).getTime() + hours * 3600000,
          ).toISOString();
          const body = { sportId: Number(sportId), startUtc, endUtc };
          const ok = await mutation.run(async () => {
            const rows = await rentalApi.availability(
              body.sportId,
              startUtc,
              endUtc,
            );
            if (revision.current !== expectedRevision) return;
            setOptions(rows);
            setSnapshot(body);
            setSelected(null);
          }, "");
          if (!ok) {
            setOptions(null);
            setSelected(null);
            setSnapshot(null);
          }
        }}
      >
        <div className="form-grid">
          <AsyncSection state={sports}>
            {(rows) => (
              <Field label={l.sport}>
                <select
                  required
                  value={sportId}
                  onChange={(e) => {
                    setSport(e.target.value);
                    clear();
                  }}
                >
                  <option value="">-</option>
                  {rows.map((s) => (
                    <option key={s.sportId} value={s.sportId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </AsyncSection>
          <Field label={l.date}>
            <input
              required
              type="date"
              min={serverDate}
              max={
                serverDate && policy.data
                  ? addDaysIso(serverDate, policy.data.advanceDays)
                  : undefined
              }
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clear();
              }}
            />
          </Field>
          <Field label={l.start}>
            <input
              required
              type="time"
              step={3600}
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                clear();
              }}
            />
          </Field>
          <Field label={l.hours}>
            <select
              required
              value={hours}
              onChange={(e) => {
                setHours(Number(e.target.value));
                clear();
              }}
            >
              {Array.from({ length: maxHours }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button
          className="btn"
          disabled={mutation.busy || !sportId || !policy.data}
        >
          {l.availability}
        </button>
      </form>
      <MutationFeedback mutation={mutation} />
      {options && (
        <>
          <Field label={l.room}>
            <select
              value={selected?.roomId ?? ""}
              onChange={(e) =>
                setSelected(
                  options.find((r) => r.roomId === Number(e.target.value)) ??
                    null,
                )
              }
            >
              <option value="">-</option>
              {options.map((r) => (
                <option value={r.roomId} key={r.roomId}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          {!options.length && <p>{l.empty}</p>}
        </>
      )}
      {selected && snapshot && (
        <>
          <RentalPriceBreakdown quote={selected} />
          <CheckoutPanel
            key={`${selected.roomId}-${snapshot.startUtc}-${snapshot.endUtc}`}
            intent={{
              kind: "court-rental",
              body: { ...snapshot, roomId: selected.roomId },
            }}
            onAccessChanged={() => {
              void refreshUser();
            }}
          />
        </>
      )}
    </>
  );
}
