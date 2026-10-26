"use client";

import { useId, useState, type CSSProperties } from "react";
import {
  addDaysIso,
  formatDate,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import type { ClassEnrollmentReportDto, RevenueReportDto } from "@/lib/types";
import styles from "./monthly-analysis.module.css";
import overview from "./manager-overview.module.css";
import {
  collectionSources,
  compactAmount,
  occupancyBySport,
} from "./monthly-analysis-data";

export function ExactMoney({ amount }: { amount: number }) {
  const id = useId();
  return (
    <span
      className={overview.money}
      tabIndex={0}
      aria-label={formatMoney(amount)}
      aria-describedby={id}
    >
      {compactAmount(amount)}
      <span className={overview.exactValue} role="tooltip" id={id}>
        {formatMoney(amount)}
      </span>
    </span>
  );
}

export function CashTrend({
  report,
  today,
  selectedDate,
  onSelectDate,
}: {
  report: RevenueReportDto;
  today?: string;
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
}) {
  const [inspected, setInspected] = useState<number | null>(null);
  const start = today ? `${today.slice(0, 8)}01` : report.fromDate;
  const end = today ?? report.toDate;
  const elapsed = Math.max(
    1,
    Math.min(
      367,
      Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1,
    ),
  );
  const daily = new Map(
    (report.daily ?? []).map((row) => [row.date.slice(0, 10), row]),
  );
  const rows = Array.from({ length: elapsed }, (_, i) => {
    const date = addDaysIso(start, i);
    const value = daily.get(date);
    return {
      date,
      collected: value?.collected ?? 0,
      refunded: value?.refunded ?? 0,
      net: value?.net ?? 0,
    };
  });
  const controlledIndex = selectedDate
    ? rows.findIndex((row) => row.date === selectedDate)
    : -1;
  const selected =
    controlledIndex >= 0
      ? controlledIndex
      : Math.max(0, Math.min(inspected ?? elapsed - 1, elapsed - 1));
  const inspectIndex = (index: number) => {
    setInspected(index);
    onSelectDate?.(rows[index].date);
  };
  const point = rows[selected];
  const values = rows.flatMap((row) => [row.collected, row.net]);
  const rawHigh = Math.max(0, ...values);
  const rawLow = Math.min(0, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rawHigh - rawLow, 1)));
  const step = Math.max(
    1,
    Math.ceil((rawHigh - rawLow || 4) / 4 / magnitude) * magnitude,
  );
  const high = Math.ceil(rawHigh / step) * step || step * 4;
  const low = Math.floor(rawLow / step) * step;
  const y = (value: number) => 164 - ((value - low) / (high - low)) * 152;
  const x = (i: number) =>
    elapsed === 1 ? 500 : 12 + (i / (elapsed - 1)) * 976;
  const line = (field: "collected" | "net") =>
    rows
      .map(
        (row, i) =>
          `${i ? "L" : "M"}${x(i).toFixed(2)},${y(row[field]).toFixed(2)}`,
      )
      .join(" ");
  const ticks = Array.from(
    { length: 4 },
    (_, i) => high - ((high - low) * i) / 3,
  );
  const selectionText = `${formatDate(point.date)}: ${formatMoney(point.collected)} money received, ${formatMoney(point.refunded)} cash refunded, ${formatMoney(point.net)} after refunds`;
  const inspectAt = (element: HTMLElement, clientX: number) => {
    const bounds = element.getBoundingClientRect();
    inspectIndex(
      Math.max(
        0,
        Math.min(
          elapsed - 1,
          Math.round(
            ((((clientX - bounds.left) / bounds.width) * 1000 - 12) / 976) *
              (elapsed - 1),
          ),
        ),
      ),
    );
  };
  return (
    <div className={overview.trend}>
      <div className={overview.legend}>
        <span>
          <i className={overview.collectedKey} />
          Money received
        </span>
        <span>
          <i className={overview.netKey} />
          After refunds
        </span>
      </div>
      <div className={overview.plot}>
        <div className={overview.yAxis} aria-hidden="true">
          {ticks.map((value, i) => (
            <span key={i}>{compactAmount(value)}</span>
          ))}
        </div>
        <div
          className={overview.plotBody}
          role="slider"
          tabIndex={0}
          aria-label="Inspect daily collections. Use Left and Right arrow keys to change day."
          aria-valuemin={1}
          aria-valuemax={elapsed}
          aria-valuenow={selected + 1}
          aria-valuetext={selectionText}
          onPointerMove={(event) => {
            if (event.pointerType !== "touch" || event.buttons)
              inspectAt(event.currentTarget, event.clientX);
          }}
          onPointerDown={(event) =>
            inspectAt(event.currentTarget, event.clientX)
          }
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowRight" || event.key === "ArrowUp"
                ? selected + 1
                : event.key === "ArrowLeft" || event.key === "ArrowDown"
                  ? selected - 1
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? elapsed - 1
                      : null;
            if (next !== null) {
              event.preventDefault();
              inspectIndex(Math.max(0, Math.min(elapsed - 1, next)));
            }
          }}
        >
          <svg
            viewBox="0 0 1000 180"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {ticks.map((value, i) => (
              <line
                key={i}
                x1="0"
                x2="1000"
                y1={y(value)}
                y2={y(value)}
                className={overview.gridLine}
              />
            ))}
            {low < 0 && (
              <line
                x1="0"
                x2="1000"
                y1={y(0)}
                y2={y(0)}
                className={overview.zeroLine}
              />
            )}
            <path
              d={line("collected")}
              className={overview.collectedLine}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={line("net")}
              className={overview.netLine}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={x(selected)}
              x2={x(selected)}
              y1="0"
              y2="180"
              className={overview.cursor}
            />
            <circle
              cx={x(selected)}
              cy={y(point.collected)}
              r="4"
              className={overview.collectedDot}
            />
            <circle
              cx={x(selected)}
              cy={y(point.net)}
              r="3"
              className={overview.netDot}
            />
          </svg>
          <div className={overview.xAxis} aria-hidden="true">
            {Array.from(
              new Set(
                Array.from({ length: 5 }, (_, i) =>
                  Math.round((i * (elapsed - 1)) / 4),
                ),
              ),
            ).map((i) => (
              <span key={i} style={{ left: `${x(i) / 10}%` }}>
                {today
                  ? String(i + 1).padStart(2, "0")
                  : formatDate(rows[i].date).slice(0, 5)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className={overview.inspection}>
        <span>{point.date === today ? "Today" : formatDate(point.date)}</span>
        <span>
          <small>Money received</small>
          <ExactMoney amount={point.collected} />
        </span>
        <span>
          <small>Cash refunded</small>
          <ExactMoney amount={point.refunded} />
        </span>
        <span>
          <small>After refunds</small>
          <ExactMoney amount={point.net} />
        </span>
      </div>
      {!rows.some((row) => row.collected || row.refunded || row.net) && (
        <p className={overview.note}>No cash activity recorded this month.</p>
      )}
    </div>
  );
}

export function RevenueMix({
  report,
}: {
  report: Pick<
    RevenueReportDto,
    "bySource" | "reconciliationCashCollected" | "totalCollected"
  >;
}) {
  const { sources, mismatch } = collectionSources(report);
  if (mismatch)
    return (
      <p role="alert" className={overview.note}>
        Source totals do not match collections. Check the revenue report before
        interpreting shares.
      </p>
    );
  if (!sources.length)
    return (
      <p className={overview.empty}>
        No collections yet. Sources appear after successful payments.
      </p>
    );
  const leader = sources[0];
  return (
    <div className={overview.sources}>
      <ul className={overview.sourceList}>
        {sources.map((row) => (
          <li key={row.label}>
            <div className={overview.sourceHeading}>
              <span>{row.label}</span>
              <span>
                <ExactMoney amount={row.amount} />
                <small>{(row.share * 100).toFixed(1)}%</small>
              </span>
            </div>
            <div
              className={overview.sourceTrack}
              role="img"
              aria-label={`${row.label}: ${formatMoney(row.amount)}, ${(row.share * 100).toFixed(1)}% of collections`}
            >
              <span
                style={{
                  width: `${Math.max(0, Math.min(100, row.share * 100))}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className={overview.insight}>
        <strong>{leader.label}</strong> accounts for{" "}
        {(leader.share * 100).toFixed(1)}% of collections.
      </p>
    </div>
  );
}

export function CompactEnrollmentBars({
  rows,
}: {
  rows: ClassEnrollmentReportDto["classes"];
}) {
  const groups = occupancyBySport(rows);
  if (!groups.length)
    return <p className={overview.empty}>No classes starting this month.</p>;
  const comparable = groups.filter((row) => row.ratio !== null);
  const high = comparable[0];
  const low = comparable.at(-1);
  const gap = high && low ? (high.ratio! - low.ratio!) * 100 : 0;
  return (
    <div className={overview.occupancy}>
      <ul className={overview.sportList}>
        {groups.map((row) => (
          <li key={row.id}>
            <div className={overview.sportHeading}>
              <span>
                {row.name}
                <small>
                  {row.classes} {row.classes === 1 ? "class" : "classes"}
                </small>
              </span>
              <span>
                <strong>
                  {row.ratio === null ? "—" : `${Math.round(row.ratio * 100)}%`}
                </strong>
                <small>
                  {formatNumber(row.confirmed)} / {formatNumber(row.capacity)}{" "}
                  seats
                </small>
              </span>
            </div>
            <div
              className={overview.capacityTrack}
              role="img"
              aria-label={`${row.name}: ${row.confirmed} confirmed of ${row.capacity} seats`}
            >
              <span
                style={{
                  width: `${Math.min(100, Math.max(0, (row.ratio ?? 0) * 100))}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      {comparable.length >= 2 && (
        <p className={overview.note}>
          {gap < 0.05
            ? "Sports have the same occupancy rate."
            : `${high.name} occupancy is ${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(gap)} percentage points above ${low!.name}.`}
        </p>
      )}
    </div>
  );
}

export function EnrollmentBars({
  rows,
  emptyMessage = "No published courses start this month. Publish a course to see its enrollment here.",
}: {
  rows: ClassEnrollmentReportDto["classes"];
  emptyMessage?: string;
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
  if (!groups.size) return <p className={styles.emptyNote}>{emptyMessage}</p>;
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
  asOfDate,
}: {
  report: {
    newMembers: number;
    activeMembersAtPeriodEnd: number;
    membersPurchasingMembershipInPeriod: number;
    dayPassesSold?: number;
  };
  asOfDate?: string;
}) {
  const items = [
    {
      label: asOfDate
        ? `Active Gym members as of ${formatDate(asOfDate)}`
        : "Active Gym members today",
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
