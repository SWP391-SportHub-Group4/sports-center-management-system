"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from "lucide-react";
import { AsyncSection } from "@/components/ui";
import { CheckoutPanel } from "@/features/payments";
import { CourtIcon } from "@/components/brand/CourtIcon";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useUrlQuery } from "@/lib/useUrlQuery";
import { hasService } from "@/lib/sports";
import {
  addDaysIso,
  formatDate,
  formatTime,
  formatMoney,
  todayIso,
} from "@/lib/format";
import type { CheckoutDto, SportDto } from "@/lib/types";
import { rentalApi, type CourtCalendarSlot } from "./api";
import styles from "./court-booking-calendar.module.css";

function shiftMonth(month: string, amount: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + amount, 1))
    .toISOString()
    .slice(0, 7);
}
/** Số giờ liên tiếp tối đa cho một lượt thuê. */
const MAX_PICK_HOURS = 4;
type Picked = {
  roomId: number;
  roomName: string;
  date: string;
  slots: CourtCalendarSlot[];
};
type Selection = CourtCalendarSlot & {
  roomId: number;
  roomName: string;
  sportId: number;
  sportName: string;
  date: string;
};

export function CourtBookingCalendar() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const text = (viText: string, enText: string) => (vi ? viText : enText);
  const [sportId, setSport] = useState<number | null>(null);
  const [datePick, setDate] = useState<string | null>(null);
  const [monthPick, setMonth] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [paid, setPaid] = useState<CheckoutDto | null>(null);
  const { values } = useUrlQuery({ checkout: "" });
  const policy = useApi((signal) => rentalApi.policy(signal), []);
  const sports = useApi(
    (signal) =>
      api.get<SportDto[]>("/api/sports", {
        anonymous: true,
        signal,
        query: { service: "COURT_RENTAL" },
      }),
    [],
  );
  const choices = (sports.data ?? []).filter(
    (s) => s.isActive && hasService(s, "COURT_RENTAL"),
  );
  const sport = choices.find((s) => s.sportId === sportId);
  const maxPick = Math.min(
    MAX_PICK_HOURS,
    policy.data?.maxHours ?? MAX_PICK_HOURS,
  );
  const selected: Selection | null =
    picked && sport
      ? {
          startUtc: picked.slots[0].startUtc,
          endUtc: picked.slots[picked.slots.length - 1].endUtc,
          status: "AVAILABLE",
          totalPrice: picked.slots.reduce(
            (sum, slot) => sum + (slot.totalPrice ?? 0),
            0,
          ),
          blocks: picked.slots.flatMap((slot) => slot.blocks),
          roomId: picked.roomId,
          roomName: picked.roomName,
          sportId: sport.sportId,
          sportName: sport.name,
          date: picked.date,
        }
      : null;
  const today = policy.data
    ? new Date(Date.parse(policy.data.serverNowUtc) + 7 * 3600000)
        .toISOString()
        .slice(0, 10)
    : todayIso();
  const maxDate = addDaysIso(today, policy.data?.advanceDays ?? 30);
  const date = datePick ?? today;
  const month = monthPick ?? today.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Array.from(
    { length: Math.ceil((offset + daysInMonth) / 7) * 7 },
    (_, index) =>
      index >= offset && index < offset + daysInMonth
        ? `${month}-${String(index - offset + 1).padStart(2, "0")}`
        : null,
  );
  const monthLabel = new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(firstDay);
  const day = useApi(
    (signal) =>
      sport && policy.data
        ? rentalApi.calendar(sport.sportId, date, 1, signal)
        : Promise.resolve(null),
    [sport?.sportId, date, !!policy.data],
  );
  const reload = day.reload;
  const onPaid = useCallback(
    (checkout: CheckoutDto) => {
      if (checkout.kind !== "COURT_RENTAL") return;
      setPaid(checkout);
      reload();
    },
    [reload],
  );
  function clear() {
    setPicked(null);
    setPaid(null);
  }
  /** Chọn các khung 1 giờ liền kề trong cùng một sân (tối đa ${MAX_PICK_HOURS} giờ); bấm lại ô ở rìa để bỏ. */
  function toggleSlot(
    room: { roomId: number; name: string },
    slot: CourtCalendarSlot,
  ) {
    setPaid(null);
    setPicked((prev) => {
      const fresh = {
        roomId: room.roomId,
        roomName: room.name,
        date,
        slots: [slot],
      };
      if (!prev || prev.roomId !== room.roomId || prev.date !== date)
        return fresh;
      const index = prev.slots.findIndex(
        (item) => item.startUtc === slot.startUtc,
      );
      if (index >= 0) {
        const kept =
          index === 0 ? prev.slots.slice(1) : prev.slots.slice(0, index);
        return kept.length ? { ...prev, slots: kept } : null;
      }
      const first = prev.slots[0];
      const last = prev.slots[prev.slots.length - 1];
      if (prev.slots.length < maxPick) {
        if (slot.startUtc === last.endUtc)
          return { ...prev, slots: [...prev.slots, slot] };
        if (slot.endUtc === first.startUtc)
          return { ...prev, slots: [slot, ...prev.slots] };
      }
      return fresh;
    });
  }
  const statusLabel: Record<CourtCalendarSlot["status"], string> = {
    AVAILABLE: text("Còn trống", "Available"),
    BOOKED: text("Đã đặt", "Booked"),
    HELD: text("Đang giữ chỗ", "On hold"),
    SCHEDULED: text("Đã có lịch", "Scheduled"),
    BLOCKED: text("Tạm khóa", "Blocked"),
    UNAVAILABLE: text("Không thể đặt", "Unavailable"),
    NO_RATE: text("Chưa mở bán", "Not on sale"),
  };
  const reviewSection =
    selected && selected.totalPrice !== null ? (
      <section className={styles.review}>
        <div className={styles.reviewHeading}>
          <div>
            <h2>{text("Lượt thuê đã chọn", "Your selected booking")}</h2>
            <p>
              {selected.sportName} · {selected.roomName} ·{" "}
              {formatDate(selected.date)} · {formatTime(selected.startUtc)}–
              {formatTime(selected.endUtc)}
            </p>
          </div>
          <strong>{formatMoney(selected.totalPrice)}</strong>
        </div>
        <CheckoutPanel
          modal
          vnpayOnly
          key={`${selected.sportId}-${selected.roomId}-${selected.startUtc}-${selected.endUtc}`}
          intent={{
            kind: "court-rental",
            body: {
              sportId: selected.sportId,
              roomId: selected.roomId,
              startUtc: selected.startUtc,
              endUtc: selected.endUtc,
            },
          }}
          onPaid={onPaid}
          onChange={reload}
          review={{
            title: text("Thanh toán đặt sân", "Court booking payment"),
            submitLabel: text("Thanh toán", "Pay"),
            items: [
              { label: text("Môn", "Sport"), value: selected.sportName },
              { label: text("Sân", "Court"), value: selected.roomName },
              {
                label: text("Ngày", "Date"),
                value: formatDate(selected.date),
              },
              {
                label: text("Giờ", "Time"),
                value: `${formatTime(selected.startUtc)}–${formatTime(selected.endUtc)}`,
              },
            ],
          }}
        />
        <p className={styles.policy}>
          {text(
            "Sân được giữ trong thời gian thanh toán. Lượt thuê chỉ được xác nhận khi thanh toán thành công.",
            "Your court is held during checkout. The booking is confirmed after successful payment.",
          )}
        </p>
      </section>
    ) : null;
  return (
    <div className={styles.booking}>
      {paid && (
        <section className={styles.success} role="status" aria-live="polite">
          <CheckCircle2 size={30} aria-hidden="true" />
          <div>
            <h2>{text("Đặt sân thành công", "Court booked successfully")}</h2>
            <p>
              {text(
                "Thanh toán đã được xác nhận. Lượt thuê sân đã có trong lịch của bạn.",
                "Payment is confirmed. Your court booking is now in your schedule.",
              )}
            </p>
            <Link href="/member/schedule">
              {text("Xem lịch của tôi", "View my schedule")}
            </Link>
          </div>
        </section>
      )}
      {values.checkout && !selected && !paid && (
        <section className={styles.resume}>
          <h3>{text("Tiếp tục thanh toán sân", "Resume court payment")}</h3>
          <CheckoutPanel
            modal
            vnpayOnly
            invoiceId={values.checkout}
            onPaid={onPaid}
            onChange={reload}
          />
        </section>
      )}
      <section className={styles.sportSection}>
        <h2>{text("Chọn môn muốn đặt sân", "Choose your sport")}</h2>
        <AsyncSection
          state={sports}
          isEmpty={(rows) =>
            !rows.some((s) => s.isActive && hasService(s, "COURT_RENTAL"))
          }
        >
          {() => (
            <div
              className={styles.sports}
              role="group"
              aria-label={text("Môn thể thao", "Sport")}
            >
              {choices.map((s) => (
                <button
                  type="button"
                  key={s.sportId}
                  aria-pressed={sportId === s.sportId}
                  onClick={() => {
                    setSport(s.sportId);
                    clear();
                  }}
                >
                  {/badminton|cầu\s*lông/i.test(s.name) ? (
                    <CourtIcon name="badminton" size={26} />
                  ) : /basketball|bóng\s*rổ/i.test(s.name) ? (
                    <CourtIcon name="basketball" size={26} />
                  ) : (
                    <MapPin size={26} aria-hidden="true" />
                  )}
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </AsyncSection>
      </section>
      {sport && (
        <AsyncSection state={policy}>
          {(limits) => (
            <div className={styles.layout}>
              <div className={styles.side}>
                <section
                  className={styles.calendar}
                  aria-label={text(
                    "Chọn ngày đặt sân",
                    "Choose a booking date",
                  )}
                >
                  <h2>
                    <CalendarDays size={20} aria-hidden="true" />
                    {text("Chọn ngày", "Choose a date")}
                  </h2>
                  <div className={styles.monthNav}>
                    <button
                      type="button"
                      disabled={month <= today.slice(0, 7)}
                      aria-label={text("Tháng trước", "Previous month")}
                      onClick={() => setMonth(shiftMonth(month, -1))}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <strong>{monthLabel}</strong>
                    <button
                      type="button"
                      disabled={month >= maxDate.slice(0, 7)}
                      aria-label={text("Tháng sau", "Next month")}
                      onClick={() => setMonth(shiftMonth(month, 1))}
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                  <div className={styles.weekdays} aria-hidden="true">
                    {(vi
                      ? ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
                      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                    ).map((d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </div>
                  <div
                    className={styles.dates}
                    role="group"
                    aria-label={monthLabel}
                  >
                    {cells.map((d, i) =>
                      d ? (
                        <button
                          type="button"
                          key={d}
                          disabled={d < today || d > maxDate}
                          aria-label={formatDate(d)}
                          aria-current={d === today ? "date" : undefined}
                          aria-pressed={date === d}
                          data-today={d === today}
                          onClick={() => {
                            setDate(d);
                            clear();
                          }}
                        >
                          {Number(d.slice(-2))}
                        </button>
                      ) : (
                        <span key={`blank-${i}`} />
                      ),
                    )}
                  </div>
                  <p className={styles.policy}>
                    {text(
                      `Đặt trước tối đa ${limits.advanceDays} ngày. Giờ hiển thị theo Việt Nam.`,
                      `Book up to ${limits.advanceDays} days ahead. Times are in Vietnam time.`,
                    )}
                  </p>
                </section>
                {reviewSection}
              </div>
              <section className={styles.slotsPanel}>
                <div className={styles.slotHeading}>
                  <div>
                    <h2>
                      {text("Khung giờ", "Time slots")} · {formatDate(date)}
                    </h2>
                    <p>{sport.name}</p>
                  </div>
                  <p className={styles.pickHint} aria-live="polite">
                    {picked
                      ? text(
                          `Đã chọn ${picked.slots.length}/${maxPick} giờ`,
                          `${picked.slots.length}/${maxPick} hours selected`,
                        )
                      : text(
                          `Chọn tối đa ${maxPick} giờ liên tiếp`,
                          `Pick up to ${maxPick} consecutive hours`,
                        )}
                  </p>
                </div>
                <div className={styles.legend}>
                  <span data-state="available">
                    {text("Còn trống", "Available")}
                  </span>
                  <span data-state="booked">
                    {text("Đã đặt / đã có lịch", "Booked / scheduled")}
                  </span>
                  <span data-state="held">
                    {text("Đang giữ chỗ", "On hold")}
                  </span>
                </div>
                <AsyncSection state={day}>
                  {(data) =>
                    data && (
                      <div className={styles.rooms}>
                        {!data.rooms.length && (
                          <p role="status">
                            {text(
                              "Môn này chưa có sân cho thuê. Vui lòng chọn môn khác.",
                              "No courts are available for this sport. Please choose another sport.",
                            )}
                          </p>
                        )}
                        {data.rooms.map((room) => (
                          <section key={room.roomId} className={styles.room}>
                            <h3>
                              <MapPin size={16} aria-hidden="true" />
                              {room.name}
                            </h3>
                            {room.slots.length ? (
                              <div className={styles.slots}>
                                {room.slots.map((slot) => (
                                  <button
                                    type="button"
                                    key={slot.startUtc}
                                    disabled={
                                      slot.status !== "AVAILABLE" ||
                                      slot.totalPrice === null
                                    }
                                    data-state={slot.status}
                                    aria-pressed={
                                      picked?.roomId === room.roomId &&
                                      picked.date === date &&
                                      picked.slots.some(
                                        (item) =>
                                          item.startUtc === slot.startUtc,
                                      )
                                    }
                                    onClick={() => toggleSlot(room, slot)}
                                  >
                                    <strong>
                                      {formatTime(slot.startUtc)}–
                                      {formatTime(slot.endUtc)}
                                    </strong>
                                    <span>{statusLabel[slot.status]}</span>
                                    {slot.totalPrice !== null && (
                                      <small>
                                        {formatMoney(slot.totalPrice)}
                                      </small>
                                    )}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p>
                                {text(
                                  "Sân đóng cửa ngày này.",
                                  "This court is closed on this day.",
                                )}
                              </p>
                            )}
                          </section>
                        ))}
                      </div>
                    )
                  }
                </AsyncSection>
              </section>
            </div>
          )}
        </AsyncSection>
      )}
    </div>
  );
}
