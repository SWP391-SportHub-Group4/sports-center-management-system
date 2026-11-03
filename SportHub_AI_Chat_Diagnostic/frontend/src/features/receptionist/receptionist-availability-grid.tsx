"use client";

import { formatMoney } from "@/lib/format";
import { vietnamLocal } from "@/lib/vietnam-time";
import styles from "./receptionist-availability-grid.module.css";

type Slot = {
  startUtc: string;
  endUtc: string;
  status: string;
  totalPrice: number | null;
};
type DailyCalendar = {
  rooms: { roomId: number; name: string; slots: Slot[] }[];
};
type DayEntry = { date: string; calendar: DailyCalendar | null };

const HOURS = Array.from({ length: 16 }, (_, index) => index + 6);
const hh = (value: number) => `${String(value).padStart(2, "0")}:00`;

export function ReceptionistAvailabilityGrid({
  days,
  now,
  selectedSport,
}: {
  days: DayEntry[];
  now: number;
  selectedSport?: string;
}) {
  return (
    <div className={styles.root}>
      <div className={styles.legend}>
        <span><i className={styles.available} /> Available</span>
        <span><i className={styles.reserved} /> Booked / on hold</span>
        <span><i className={styles.unavailable} /> Blocked / unavailable / elapsed</span>
      </div>
      {days.map(({ date, calendar }, index) => {
        const label = index === 0 ? "Operating day 1" : index === 1 ? "Operating day 2" : "Operating day 3";
        const availableCount = calendar?.rooms.reduce((sum, room) => sum + room.slots.filter((slot) =>
          slot.status === "AVAILABLE" &&
          Date.parse(slot.startUtc) > now &&
          vietnamLocal(slot.startUtc).slice(11, 16) >= "06:00" &&
          vietnamLocal(slot.endUtc).slice(11, 16) <= "22:00"
        ).length, 0) ?? 0;
        return (
          <section className={styles.day} key={date}>
            <div className={styles.heading}>
              <div><strong>{label} · {date}</strong>{selectedSport && <span> · {selectedSport}</span>}</div>
              <small>{availableCount} available slots</small>
            </div>
            {!calendar ? (
              <p className={styles.empty}>This operating day has ended. No bookable slots remain.</p>
            ) : calendar.rooms.length === 0 ? (
              <p className={styles.empty}>No courts are configured for this sport.</p>
            ) : (
              <div className={styles.scroll} role="region" aria-label={`Court availability for ${date}`} tabIndex={0}>
                <table className={styles.table}>
                  <thead><tr><th scope="col">Court</th>{HOURS.map(hour => <th scope="col" key={hour}>{hh(hour)}–{hh(hour+1)}</th>)}</tr></thead>
                  <tbody>{calendar.rooms.map(room => (
                    <tr key={room.roomId}>
                      <th scope="row">{room.name}</th>
                      {HOURS.map(hour => {
                        const slot = room.slots.find(item => vietnamLocal(item.startUtc).slice(11,16) === hh(hour));
                        const state = !slot ? "UNAVAILABLE" : Date.parse(slot.startUtc) <= now ? "ELAPSED" : slot.status;
                        const canBook = state === "AVAILABLE";
                        const occupied = ["BOOKED", "HELD", "SCHEDULED"].includes(state);
                        return <td key={hour}>
                          <div className={`${styles.cell} ${canBook ? styles.free : occupied ? styles.occupied : styles.dim}`} title={`${room.name} · ${hh(hour)}–${hh(hour+1)} · ${state}`}>
                            <strong>{canBook ? "Available" : occupied ? state === "HELD" ? "On hold" : "Booked" : state === "ELAPSED" ? "Elapsed" : state === "BLOCKED" ? "Blocked" : "Unavailable"}</strong>
                            {canBook && slot?.totalPrice != null && <small>{formatMoney(slot.totalPrice)}</small>}
                          </div>
                        </td>;
                      })}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
