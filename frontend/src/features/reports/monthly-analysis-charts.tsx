"use client";

import { useState, type CSSProperties } from "react";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { ClassEnrollmentReportDto, RevenueReportDto } from "@/lib/types";
import styles from "./monthly-analysis.module.css";

const colors = [
  "var(--court-700)",
  "var(--wood-500)",
  "var(--info-solid)",
  "var(--volt-700)",
  "var(--chalk-600)",
];
const compact = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

export function CashTrend({
  report,
  today,
  days,
}: {
  report: RevenueReportDto;
  today: string;
  days: number;
}) {
  const [inspected, setInspected] = useState<number | null>(null);
  const elapsed = Number(today.slice(-2));
  const selected = Math.min(inspected ?? elapsed, elapsed);
  const daily = new Map(
    (report.daily ?? []).map((row) => [row.date.slice(0, 10), row]),
  );
  const rows = Array.from({ length: elapsed }, (_, i) => {
    const date = `${today.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
    const value = daily.get(date);
    return { date, collected: value?.collected ?? 0, net: value?.net ?? 0 };
  });
  const values = rows.flatMap((r) => [r.collected, r.net]);
  const rawHigh = Math.max(0, ...values);
  const rawLow = Math.min(0, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rawHigh - rawLow, 1)));
  const step = Math.max(
    1,
    Math.ceil((rawHigh - rawLow || 4) / 4 / magnitude) * magnitude,
  );
  const high = Math.ceil(rawHigh / step) * step || step * 4;
  const low = Math.floor(rawLow / step) * step;
  const y = (value: number) => 224 - ((value - low) / (high - low)) * 208;
  const x = (i: number) => 12 + (i / Math.max(days - 1, 1)) * 976;
  const line = (field: "collected" | "net") =>
    rows
      .map(
        (r, i) =>
          `${i ? "L" : "M"}${x(i).toFixed(2)},${y(r[field]).toFixed(2)}`,
      )
      .join(" ");
  const point = rows[selected - 1];
  const ticks = Array.from(
    { length: 5 },
    (_, i) => high - ((high - low) * i) / 4,
  );
  const cashLine = line("collected");
  const hasActivity = rows.some((r) => r.collected !== 0 || r.net !== 0);
  return (
    <div className={styles.trend}>
      <div className={styles.chartLegend}>
        <span>
          <i className={styles.cashKey} />
          Cash collected
        </span>
        <span>
          <i className={styles.netKey} />
          Net revenue
        </span>
        <span className={styles.unit}>VND</span>
      </div>
      <div className={styles.plot}>
        <div className={styles.yAxis} aria-hidden="true">
          {ticks.map((value, i) => (
            <span key={i}>{compact(value)}</span>
          ))}
        </div>
        <div
          className={styles.plotBody}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setInspected(
              Math.max(
                1,
                Math.min(
                  elapsed,
                  Math.round(
                    ((((event.clientX - bounds.left) / bounds.width) * 1000 -
                      12) /
                      976) *
                      (days - 1),
                  ) + 1,
                ),
              ),
            );
          }}
        >
          <svg
            viewBox="0 0 1000 240"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Daily cash flow from ${formatDate(report.fromDate)} to ${formatDate(today)}. Cash collected: ${formatMoney(report.totalCollected)}. Net revenue: ${formatMoney(report.netRevenue)}. Use the day selector for daily values.`}
          >
            {elapsed < days && (
              <rect
                x={x(elapsed - 1)}
                y="0"
                width={1000 - x(elapsed - 1)}
                height="240"
                className={styles.future}
              />
            )}
            {ticks.map((v, i) => (
              <line
                key={i}
                x1="0"
                x2="1000"
                y1={y(v)}
                y2={y(v)}
                className={styles.gridLine}
              />
            ))}
            {low < 0 && (
              <line
                x1="0"
                x2="1000"
                y1={y(0)}
                y2={y(0)}
                className={styles.zeroLine}
              />
            )}
            <path
              d={`${cashLine} L${x(elapsed - 1)},${y(0)} L${x(0)},${y(0)} Z`}
              className={styles.area}
            />
            <path
              d={cashLine}
              className={styles.cashLine}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={line("net")}
              className={styles.netLine}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={x(selected - 1)}
              x2={x(selected - 1)}
              y1="0"
              y2="240"
              className={styles.cursor}
            />
            <circle
              cx={x(selected - 1)}
              cy={y(point.collected)}
              r="5"
              className={styles.dot}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className={styles.xAxis} aria-hidden="true">
            {[1, 8, 15, 22, days]
              .filter((day, i, a) => a.indexOf(day) === i)
              .map((day) => (
                <span key={day} style={{ left: `${x(day - 1) / 10}%` }}>
                  {String(day).padStart(2, "0")}
                </span>
              ))}
          </div>
        </div>
      </div>
      {!hasActivity && (
        <p className={styles.emptyNote}>
          No cash activity recorded this month yet.
        </p>
      )}
      <div className={styles.inspection}>
        <span>
          {selected === elapsed ? "Today" : `Day ${selected}`} ·{" "}
          {formatDate(point.date)}
        </span>
        <strong>
          {formatMoney(point.collected)}
          <small>collected</small>
        </strong>
        <strong>
          {formatMoney(point.net)}
          <small>net revenue</small>
        </strong>
      </div>
      <label className={styles.daySelector}>
        Inspect day{" "}
        <span>
          {selected} / {elapsed}
        </span>
        <input
          type="range"
          min="1"
          max={elapsed}
          value={selected}
          onChange={(event) => setInspected(Number(event.target.value))}
          aria-label="Inspect daily cash flow"
          aria-valuetext={`${formatDate(point.date)}: ${formatMoney(point.collected)} collected, ${formatMoney(point.net)} net revenue`}
        />
      </label>
    </div>
  );
}

function sourceLabel(source: string) {
  const normalized = source.replaceAll("_", "").toUpperCase();
  if (normalized.includes("MEMBERSHIP")) return "Gym plans & passes";
  if (normalized.includes("CLASS")) return "Group classes";
  if (normalized.includes("RENTAL")) return "Court rentals";
  if (normalized.includes("RECONCILIATION")) return "Reconciliation";
  return "Other collections";
}

export function RevenueMix({ report }: { report: RevenueReportDto }) {
  const [active, setActive] = useState<string | null>(null);
  const groups = new Map<string, number>();
  for (const row of report.bySource ?? []) {
    const label = sourceLabel(row.source);
    groups.set(label, (groups.get(label) ?? 0) + row.cashCollected);
  }
  if (report.reconciliationCashCollected > 0)
    groups.set(
      "Reconciliation",
      (groups.get("Reconciliation") ?? 0) + report.reconciliationCashCollected,
    );
  const allocated = Array.from(groups.values()).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (report.totalCollected - allocated > 0.01)
    groups.set(
      "Other collections",
      (groups.get("Other collections") ?? 0) +
        report.totalCollected -
        allocated,
    );
  const sources = Array.from(groups, ([label, value]) => ({ label, value }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = sources.reduce((sum, r) => sum + r.value, 0);
  const selected = sources.find((r) => r.label === active);
  let offset = 0;
  const segments = sources.map((r, i) => {
    const start = offset;
    offset += (r.value / total) * 100;
    return `${colors[i % colors.length]} ${start}% ${offset}%`;
  });
  return (
    <div className={styles.mix}>
      <div
        className={styles.donut}
        style={{
          background: total
            ? `conic-gradient(${segments.join(",")})`
            : "var(--bg-surface-sunken)",
        }}
        role="img"
        aria-label={
          total
            ? sources
                .map(
                  (r) =>
                    `${r.label}: ${formatMoney(r.value)}, ${((r.value / total) * 100).toFixed(1)}%`,
                )
                .join(". ")
            : "No cash collections recorded"
        }
      >
        <div className={styles.donutHole}>
          <strong>
            {selected
              ? `${((selected.value / total) * 100).toFixed(1)}%`
              : formatNumber(sources.length)}
          </strong>
          <span>{selected ? selected.label : "revenue sources"}</span>
        </div>
      </div>
      {!sources.length ? (
        <p className={styles.emptyNote}>
          Collections will appear here after successful payments.
        </p>
      ) : (
        <ul className={styles.sourceList}>
          {sources.map((r, i) => (
            <li key={r.label}>
              <button
                type="button"
                aria-pressed={active === r.label}
                onClick={() => setActive(active === r.label ? null : r.label)}
              >
                <i
                  style={{ background: colors[i % colors.length] }}
                  aria-hidden="true"
                />
                <span>
                  {r.label}
                  <small>{formatMoney(r.value)}</small>
                </span>
                <strong>{((r.value / total) * 100).toFixed(1)}%</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EnrollmentBars({
  rows,
}: {
  rows: ClassEnrollmentReportDto["classes"];
}) {
  const groups = new Map<
    number,
    {
      name: string;
      capacity: number;
      confirmed: number;
      holds: number;
      available: number;
      count: number;
    }
  >();
  for (const row of rows) {
    const group = groups.get(row.sportId) ?? {
      name: row.sportName,
      capacity: 0,
      confirmed: 0,
      holds: 0,
      available: 0,
      count: 0,
    };
    group.capacity += row.capacity;
    group.confirmed += row.confirmedCount;
    group.holds += row.activeHoldCount;
    group.available += row.availableSeats;
    group.count++;
    groups.set(row.sportId, group);
  }
  if (!groups.size)
    return (
      <p className={styles.emptyNote}>
        No published courses start this month. Publish a course to see its
        enrollment here.
      </p>
    );
  return (
    <div className={styles.enrollment}>
      <div className={styles.chartLegend}>
        <span>
          <i className={styles.cashKey} />
          Confirmed
        </span>
        <span>
          <i className={styles.holdKey} />
          Held
        </span>
        <span>
          <i className={styles.availableKey} />
          Available
        </span>
      </div>
      <ul className={styles.occupancyList}>
        {Array.from(groups, ([id, g]) => (
          <li key={id}>
            <div className={styles.barHeading}>
              <span>
                {g.name}
                <small>
                  {g.count} {g.count === 1 ? "course" : "courses"}
                </small>
              </span>
              <strong>
                {g.capacity ? ((g.confirmed / g.capacity) * 100).toFixed(0) : 0}
                %
                <small>
                  {g.confirmed} / {g.capacity} seats
                </small>
              </strong>
            </div>
            <div
              className={styles.stackedBar}
              role="img"
              aria-label={`${g.name}: ${g.confirmed} confirmed, ${g.holds} held, ${g.available} available of ${g.capacity} seats`}
            >
              <span
                className={styles.confirmedSegment}
                style={{
                  width: `${g.capacity ? Math.min(100, (g.confirmed / g.capacity) * 100) : 0}%`,
                }}
              />
              <span
                className={styles.heldSegment}
                style={{
                  width: `${g.capacity ? Math.min(100, (g.holds / g.capacity) * 100) : 0}%`,
                }}
              />
            </div>
            <p className={styles.barCaption}>
              {g.confirmed} confirmed · {g.holds} held · {g.available} available
            </p>
          </li>
        ))}
      </ul>
      <p className={styles.chartFootnote}>
        Confirmed seats determine occupancy. Unpaid holds are shown separately.
      </p>
    </div>
  );
}

export function MembershipBars({
  report,
}: {
  report: {
    newMembers: number;
    activeMembersAtPeriodEnd: number;
    membersPurchasingMembershipInPeriod: number;
    dayPassesSold?: number;
  };
}) {
  const items = [
    {
      label: "Active Gym members today",
      value: report.activeMembersAtPeriodEnd,
      color: "var(--court-700)",
    },
    {
      label: "New member accounts",
      value: report.newMembers,
      color: "var(--info-solid)",
    },
    {
      label: "Members buying Gym plans",
      value: report.membersPurchasingMembershipInPeriod,
      color: "var(--volt-700)",
    },
    {
      label: "Day passes sold",
      value: report.dayPassesSold ?? 0,
      color: "var(--wood-500)",
    },
  ];
  const max = Math.max(1, ...items.map((r) => r.value));
  return (
    <div className={styles.membership}>
      <ul className={styles.memberBars}>
        {items.map((r) => (
          <li key={r.label}>
            <div className={styles.memberHeading}>
              <span>{r.label}</span>
              <strong>{formatNumber(r.value)}</strong>
            </div>
            <div className={styles.memberTrack} aria-hidden="true">
              <span
                style={
                  {
                    "--bar-width": `${(r.value / max) * 100}%`,
                    background: r.color,
                  } as CSSProperties
                }
              />
            </div>
          </li>
        ))}
      </ul>
      <p className={styles.chartFootnote}>
        Member groups may overlap. Day passes count tickets, not unique members.
      </p>
    </div>
  );
}
