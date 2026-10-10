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
import type { CheckoutDto, InvoiceDetailDto, SportDto } from "@/lib/types";
import { rentalApi, type CourtCalendarSlot } from "./api";
import styles from "./court-booking-calendar.module.css";

/** Mỗi ô lịch là đúng 1 giờ; thuê lâu hơn bằng cách chọn nhiều ô liền nhau. */
const MAX_PICK_HOURS = 4;

function shiftMonth(month: string, amount: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + amount, 1))
    .toISOString()
    .slice(0, 7);
}

/** Các ô giờ liền nhau của một sân trong một ngày. */
type Pick = {
  roomId: number;
  roomName: string;
  sportId: number;
  sportName: string;
  date: string;
  slots: CourtCalendarSlot[];
};

const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);

/** Bảng giá chung của môn: giá một giờ và tổng tiền theo số giờ thuê. */
function PriceGuide({
  rate,
  maxHours,
  pickedHours,
}: {
  rate: number;
  maxHours: number;
  pickedHours: number;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  return (
    <section
      className={styles.priceGuide}
      aria-label={vi ? "Bảng giá thuê sân" : "Court rental prices"}
    >
      <div className={styles.priceRate}>
        <span>{vi ? "Giá thuê" : "Rental price"}</span>
        <strong>{formatMoney(rate)}</strong>
        <span>{vi ? "mỗi giờ" : "per hour"}</span>
      </div>
      <ul className={styles.priceTiers}>
        {Array.from({ length: maxHours }, (_, i) => i + 1).map((h) => (
          <li key={h} data-active={pickedHours === h}>
            <span>
              {h} {vi ? "giờ" : h === 1 ? "hour" : "hours"}
            </span>
            <strong>{formatMoney(rate * h)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Lượt thuê đang chờ thanh toán: nói rõ đang trả cho sân, ngày và giờ nào. */
function ResumePayment({
  invoiceId,
  onPaid,
  onChange,
}: {
  invoiceId: string;
  onPaid: (checkout: CheckoutDto) => void;
  onChange: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const info = useApi(
    async (signal) => {
      const invoice = await api.get<InvoiceDetailDto>(
        `/api/invoices/${invoiceId}`,
        { signal },
      );
      const item = invoice.items.find((i) => i.courtRentalId);
      const rental = item?.courtRentalId
        ? await rentalApi.detail(item.courtRentalId, signal)
        : null;
      return { invoice, rental, fallback: invoice.items[0]?.description };
    },
    [invoiceId],
  );
  const data = info.data;
  const rental = data?.rental;
  const hours = rental?.blocks.length;
  const expires = data?.invoice.summary.checkoutExpiresAtUtc;
  return (
    <section className={styles.resume} role="status">
      <span className={styles.resumeDot} aria-hidden="true" />
      <div className={styles.resumeBody}>
        <p className={styles.resumeTitle}>
          {vi
            ? "Bạn có một lượt thuê sân đang chờ thanh toán"
            : "You have a court booking waiting for payment"}
        </p>
        {rental ? (
          <p className={styles.resumeDetail}>
            {rental.sportName} · {rental.roomName} ·{" "}
            {formatDate(rental.rental.startAtUtc)} ·{" "}
            {formatTime(rental.rental.startAtUtc)}–
            {formatTime(rental.rental.endAtUtc)}
            {hours ? ` (${hours} ${vi ? "giờ" : "h"})` : ""}
          </p>
        ) : (
          data?.fallback && (
            <p className={styles.resumeDetail}>{data.fallback}</p>
          )
        )}
        {data && (
          <p className={styles.resumeMeta}>
            {formatMoney(data.invoice.summary.outstanding)}
            {expires &&
              ` · ${vi ? "Giữ chỗ đến" : "Held until"} ${formatTime(expires)}`}
          </p>
        )}
        <CheckoutPanel
          modal
          vnpayOnly
          invoiceId={invoiceId}
          onPaid={onPaid}
          onChange={onChange}
          review={{
            title: vi ? "Thanh toán đặt sân" : "Court booking payment",
            submitLabel: vi ? "Thanh toán" : "Pay",
            items: [],
          }}
        />
      </div>
    </section>
  );
}

export function CourtBookingCalendar() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const text = (viText: string, enText: string) => (vi ? viText : enText);
  const [sportId, setSport] = useState<number | null>(null);
  const [datePick, setDate] = useState<string | null>(null);
  const [monthPick, setMonth] = useState<string | null>(null);
  const [picked, setPicked] = useState<Pick | null>(null);
  const [limitHit, setLimitHit] = useState(false);
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
    setLimitHit(false);
  }
  function toggleSlot(
    room: { roomId: number; name: string },
    slot: CourtCalendarSlot,
    maxHours: number,
  ) {
    if (!sport) return;
    setPaid(null);
    setLimitHit(false);
    const make = (slots: CourtCalendarSlot[]): Pick => ({
      roomId: room.roomId,
      roomName: room.name,
      sportId: sport.sportId,
      sportName: sport.name,
      date,
      slots,
    });
    const sameRoom =
      picked &&
      picked.roomId === room.roomId &&
      picked.sportId === sport.sportId &&
      picked.date === date;
    if (!sameRoom) {
      setPicked(make([slot]));
      return;
    }
    const slots = picked.slots;
    const index = slots.findIndex((s) => s.startUtc === slot.startUtc);
    if (index >= 0) {
      // Bấm lại ô đã chọn: ô đầu thì bỏ ô đó, ô khác thì cắt từ ô đó trở đi.
      const rest = index === 0 ? slots.slice(1) : slots.slice(0, index);
      setPicked(rest.length ? make(rest) : null);
      return;
    }
    const after = sameInstant(slot.startUtc, slots[slots.length - 1].endUtc);
    const before = sameInstant(slot.endUtc, slots[0].startUtc);
    if (!after && !before) {
      setPicked(make([slot]));
      return;
    }
    if (slots.length >= maxHours) {
      setLimitHit(true);
      return;
    }
    setPicked(make(after ? [...slots, slot] : [slot, ...slots]));
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
  const pickedStart = picked?.slots[0].startUtc;
  const pickedEnd = picked?.slots[picked.slots.length - 1].endUtc;
  const pickedTotal = picked
    ? picked.slots.reduce((sum, s) => sum + (s.totalPrice ?? 0), 0)
    : 0;
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
      {values.checkout && !picked && !paid && (
        <ResumePayment
          invoiceId={values.checkout}
          onPaid={onPaid}
          onChange={reload}
        />
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
          {(limits) => {
            const maxHours = Math.min(limits.maxHours, MAX_PICK_HOURS);
            return (
              <div className={styles.layout}>
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
                      `Bạn có thể đặt sân cho các ngày trong ${limits.advanceDays} ngày tới.`,
                      `You can book any day within the next ${limits.advanceDays} days.`,
                    )}
                  </p>
                </section>
                <section className={styles.slotsPanel}>
                  <div className={styles.slotHeading}>
                    <h2>
                      {text("Khung giờ", "Time slots")} · {formatDate(date)}
                    </h2>
                    <p>
                      {sport.name} ·{" "}
                      {text(
                        `Mỗi ô là 1 giờ. Chọn các ô liền nhau để thuê lâu hơn, tối đa ${maxHours} giờ.`,
                        `Each slot is 1 hour. Pick adjacent slots to book longer, up to ${maxHours} hours.`,
                      )}
                    </p>
                  </div>
                  <AsyncSection state={day}>
                    {(data) => {
                      if (!data) return null;
                      const prices = data.rooms.flatMap((r) =>
                        r.slots
                          .map((s) => s.totalPrice)
                          .filter((p): p is number => p !== null),
                      );
                      const rate = prices.length ? Math.min(...prices) : null;
                      return (
                        <>
                          {rate !== null && (
                            <PriceGuide
                              rate={rate}
                              maxHours={maxHours}
                              pickedHours={picked?.slots.length ?? 0}
                            />
                          )}
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
                          {limitHit && (
                            <p className={styles.limitNote} role="status">
                              {text(
                                `Mỗi lần đặt tối đa ${maxHours} giờ. Bỏ bớt một ô để chọn ô khác.`,
                                `You can book up to ${maxHours} hours at a time. Deselect a slot to pick another.`,
                              )}
                            </p>
                          )}
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
                              <section
                                key={room.roomId}
                                className={styles.room}
                              >
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
                                          picked.slots.some(
                                            (s) => s.startUtc === slot.startUtc,
                                          )
                                        }
                                        onClick={() =>
                                          toggleSlot(room, slot, maxHours)
                                        }
                                      >
                                        <strong>
                                          {formatTime(slot.startUtc)}–
                                          {formatTime(slot.endUtc)}
                                        </strong>
                                        <span>{statusLabel[slot.status]}</span>
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
                        </>
                      );
                    }}
                  </AsyncSection>
                </section>
              </div>
            );
          }}
        </AsyncSection>
      )}
      {picked && pickedStart && pickedEnd && (
        <section className={styles.review}>
          <h2>{text("Lượt thuê đã chọn", "Your selected booking")}</h2>
          <dl className={styles.reviewFacts}>
            <div>
              <dt>{text("Sân", "Court")}</dt>
              <dd>
                {picked.sportName} · {picked.roomName}
              </dd>
            </div>
            <div>
              <dt>{text("Ngày", "Date")}</dt>
              <dd>{formatDate(picked.date)}</dd>
            </div>
            <div>
              <dt>{text("Giờ", "Time")}</dt>
              <dd>
                {formatTime(pickedStart)} – {formatTime(pickedEnd)} (
                {picked.slots.length} {text("giờ", "h")})
              </dd>
            </div>
          </dl>
          <ul
            className={styles.reviewSlots}
            aria-label={text("Chi tiết giá thuê", "Price breakdown")}
          >
            {picked.slots.map((s) => (
              <li key={s.startUtc}>
                <span>
                  {formatTime(s.startUtc)}–{formatTime(s.endUtc)}
                </span>
                <span>{formatMoney(s.totalPrice ?? 0)}</span>
              </li>
            ))}
            <li className={styles.reviewTotal}>
              <span>{text("Tổng cộng", "Total")}</span>
              <strong>{formatMoney(pickedTotal)}</strong>
            </li>
          </ul>
          <CheckoutPanel
            modal
            vnpayOnly
            key={`${picked.sportId}-${picked.roomId}-${pickedStart}-${pickedEnd}`}
            intent={{
              kind: "court-rental",
              body: {
                sportId: picked.sportId,
                roomId: picked.roomId,
                startUtc: pickedStart,
                endUtc: pickedEnd,
              },
            }}
            onPaid={onPaid}
            onChange={reload}
            review={{
              title: text("Thanh toán đặt sân", "Court booking payment"),
              submitLabel: text("Thanh toán", "Pay"),
              items: [
                {
                  label: text("Sân", "Court"),
                  value: `${picked.sportName} · ${picked.roomName}`,
                },
                {
                  label: text("Ngày", "Date"),
                  value: formatDate(picked.date),
                },
                {
                  label: text("Giờ", "Time"),
                  value: `${formatTime(pickedStart)}–${formatTime(pickedEnd)} (${picked.slots.length} ${text("giờ", "h")})`,
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
      )}
    </div>
  );
}
