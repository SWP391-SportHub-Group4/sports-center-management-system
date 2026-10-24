"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { vietnamLocal } from "@/lib/vietnam-time";
import type { CourtScheduleEntryDto } from "@/lib/types";
import styles from "./ReceptionAttendanceCalendar.module.css";

type Category = "ALL" | "CLASS_SESSION" | "COURT_RENTAL" | "ROOM_BLOCK";
type State = "ALL" | "OPEN" | "UPCOMING" | "CLOSED" | "LOCKED";

function dayOf(entry: CourtScheduleEntryDto): string {
  return vietnamLocal(entry.startAtUtc).slice(0, 10);
}
function stateOf(entry: CourtScheduleEntryDto, now: number): Exclude<State, "ALL"> {
  if (/LOCK|BLOCK|CANCEL|CLOS|SUSPEND|INCIDENT/i.test(entry.status) || entry.sourceType === "ROOM_BLOCK")
    return "LOCKED";
  if (new Date(entry.endAtUtc).getTime() <= now) return "CLOSED";
  if (new Date(entry.startAtUtc).getTime() > now) return "UPCOMING";
  return "OPEN";
}
function timeOf(utc: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(utc));
}
function monthStart(date: string): string { return `${date.slice(0, 7)}-01`; }
function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, m - 1 + by, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function monthEnd(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0));
  return `${year}-${String(m).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`;
}
function matchesMember(item: CourtScheduleEntryDto, search: string): boolean {
  if (!search.trim()) return true;
  const name = search.trim().toLocaleLowerCase();
  // Search the member data returned by the authorized schedule API; never infer membership.
  return [item.memberName, item.memberId, ...item.participants.flatMap((p) => [p.memberName, p.memberId])]
    .some((candidate) => candidate?.toLocaleLowerCase().includes(name));
}

export function ReceptionAttendanceCalendar({ date, onChooseDate, onChooseSession, disabled = false }: {
  date: string;
  onChooseDate: (date: string) => void;
  onChooseSession: (date: string, sessionId: string) => void;
  disabled?: boolean;
}) {
  const [month, setMonth] = useState(() => monthStart(date));
  const [category, setCategory] = useState<Category>("ALL");
  const [status, setStatus] = useState<State>("ALL");
  const [member, setMember] = useState("");
  const now = useNow();
  const start = month;
  const end = monthEnd(month);
  const schedule = useApi((signal) => api.get<CourtScheduleEntryDto[]>(
    "/api/manager/court-schedule", { signal, query: { fromDate: start, toDate: end } }
  ), [start, end]);
  const items = (schedule.data ?? []).filter((item) =>
    (category === "ALL" || item.sourceType === category) &&
    (status === "ALL" || stateOf(item, now) === status) &&
    matchesMember(item, member)
  );
  const byDay = new Map<string, CourtScheduleEntryDto[]>();
  for (const item of items) {
    const key = dayOf(item);
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }
  const first = new Date(`${start}T00:00:00Z`).getUTCDay();
  const offset = (first + 6) % 7;
  const days = Number(end.slice(8));
  const monthTitle = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${start}T00:00:00Z`));
  const selected = (byDay.get(date) ?? []).sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));

  return (
    <section className={styles.root} aria-label="Monthly class and court schedule">
      <div className={styles.header}>
        <div>
          <h2>Monthly schedule</h2>
          <p>See class sessions, court rentals and room blocks before selecting an attendance session.</p>
        </div>
        <div className={styles.monthNav}>
          <button type="button" disabled={disabled} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <strong>{monthTitle}</strong>
          <button type="button" disabled={disabled} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
          <button type="button" disabled={disabled} onClick={() => { setMonth(monthStart(date)); }} >Selected month</button>
        </div>
      </div>
      <div className={styles.filters}>
        <label>Schedule type
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            <option value="ALL">All types</option>
            <option value="CLASS_SESSION">Classes</option>
            <option value="COURT_RENTAL">Court rentals</option>
            <option value="ROOM_BLOCK">Room blocks</option>
          </select>
        </label>
        <label>Schedule state
          <select value={status} onChange={(e) => setStatus(e.target.value as State)}>
            <option value="ALL">All states</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="OPEN">Open now</option>
            <option value="CLOSED">Ended</option>
            <option value="LOCKED">Locked / cancelled</option>
          </select>
        </label>
        <label>Member name or ID
          <input type="search" value={member} onChange={(e) => setMember(e.target.value)} placeholder="Filter schedules by member" />
        </label>
      </div>
      {schedule.error && <p role="alert">{schedule.error.message}</p>}
      {schedule.loading && <p role="status">Loading month…</p>}
      <div className={styles.calendar} aria-label={monthTitle}>
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => <strong className={styles.weekday} key={d}>{d}</strong>)}
        {Array.from({length:offset},(_,i)=><span className={styles.blank} key={`blank-${i}`}/>)}
        {Array.from({length:days},(_,i)=>{
          const key = `${month.slice(0,7)}-${String(i+1).padStart(2,'0')}`;
          const list = byDay.get(key) ?? [];
          const blocked = list.filter(x => stateOf(x,now)==='LOCKED').length;
          return <button type="button" className={styles.day} key={key} data-selected={key===date || undefined}
            disabled={disabled} onClick={()=>onChooseDate(key)} aria-label={`${key}: ${list.length} scheduled items`}>
            <strong>{i+1}</strong>
            {list.length>0 && <small>{list.filter(x=>x.sourceType==='CLASS_SESSION').length} classes · {list.filter(x=>x.sourceType==='COURT_RENTAL').length} courts{blocked>0?` · ${blocked} locked`:''}</small>}
          </button>
        })}
      </div>
      <div className={styles.details}>
        <h3>{date} · {selected.length} matching events</h3>
        {selected.length === 0 && <p>No matching events for this date. Change the month or filters to explore other days.</p>}
        {selected.map((item) => <div className={styles.event} key={`${item.sourceType}-${item.sourceId}`}>
          <div>
            <strong>{timeOf(item.startAtUtc)}–{timeOf(item.endAtUtc)} · {item.title}</strong>
            <small>{item.sourceType === 'CLASS_SESSION' ? 'Class' : item.sourceType === 'COURT_RENTAL' ? 'Court rental' : 'Room block'} · {stateOf(item,now)} · {item.status}{item.memberName ? ` · ${item.memberName}` : ''}</small>
          </div>
          {item.sourceType === "CLASS_SESSION" && stateOf(item,now)!=='LOCKED' &&
            <button type="button" disabled={disabled} onClick={()=>onChooseSession(date,item.sourceId)}>View attendance</button>}
        </div>)}
      </div>
      <p className={styles.note}>“Open now” means the scheduled time is in progress, not that attendance marking is permitted. Actual attendance permissions and windows are checked on the attendance board. Court rentals and room blocks are view-only here.</p>
    </section>
  );
}
