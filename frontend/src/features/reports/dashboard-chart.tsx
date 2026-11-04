"use client";
import { useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import { periodDates, type Period } from "./report-periods";
import styles from "./reports-dashboard.module.css";
export interface ChartDay {
  date: string;
  value: number | null;
  detail?: string;
}
function calendarRows(data: ChartDay[], period?: Period): ChartDay[] {
  const dates = period ? periodDates(period) : [];
  if (!dates.length) return data;
  const byDate = new Map(data.map((day) => [day.date, day]));
  return dates.map((date) => byDate.get(date) ?? { date, value: null });
}
export function DashboardChart({
  rows: suppliedRows,
  comparison,
  label,
  unit,
  bars = false,
  integerValues = false,
  seriesLabel,
  secondary,
  legendUnit,
  period,
}: {
  rows: ChartDay[];
  comparison?: ChartDay[];
  label: string;
  unit: string;
  bars?: boolean;
  integerValues?: boolean;
  seriesLabel?: string;
  legendUnit?: string;
  period?: Period;
  secondary?: {
    label: string;
    unit: string;
    rows: ChartDay[];
    comparison?: ChartDay[];
  };
}) {
  const rows = calendarRows(suppliedRows, period);
  const [selected, setSelected] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(720);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setCanvasWidth(Math.max(160, node.clientWidth)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rows.length]);
  const plotWidth = canvasWidth - 80;
  const index = Math.min(selected, Math.max(0, rows.length - 1));
  const baseline =
    comparison?.length === suppliedRows.length ? comparison : undefined;
  const second =
    secondary?.rows.length === suppliedRows.length
      ? { ...secondary, rows: calendarRows(secondary.rows, period) }
      : undefined;
  const secondBaseline =
    second?.comparison?.length === suppliedRows.length
      ? second.comparison
      : undefined;
  const values = [
    ...rows,
    ...(baseline ?? []),
    ...(second?.rows ?? []),
    ...(secondBaseline ?? []),
  ]
    .map((r) => r.value)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  const low = Math.min(0, ...values),
    high = Math.max(1, ...values);
  const ticks = [
    low,
    integerValues ? Math.round((high + low) / 2) : (high + low) / 2,
    high,
  ].filter((value, index, all) => all.indexOf(value) === index);
  const x = (i: number) =>
    56 + ((i + 0.5) * plotWidth) / Math.max(1, rows.length);
  const y = (n: number) => 180 - ((n - low) / (high - low)) * 155;
  const path = (data: ChartDay[]) => {
    let connected = false;
    return data
      .map((r, i) => {
        if (r.value === null) {
          connected = false;
          return "";
        }
        const command = connected ? "L" : "M";
        connected = true;
        return `${command}${x(i)},${y(r.value)}`;
      })
      .join(" ");
  };
  const number = (n: number) =>
    new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  const exact = (n: number) =>
    n.toLocaleString("en", { maximumFractionDigits: 2 });
  const valueText = (value: number | null, units: string) =>
    value === null ? "No data yet" : `${exact(value)} ${units}`;
  const selectedValue = rows[index]?.value;
  const secondValue = second?.rows[index]?.value;
  const baselineDay = baseline?.[index];
  const secondBaselineDay = secondBaseline?.[index];
  if (!rows.length)
    return <p className={styles.empty}>No activity in this period.</p>;
  return (
    <div className={styles.chart} ref={container}>
      <div className={styles.legend}>
        <span>
          <i />
          {seriesLabel ?? "Selected period"}
        </span>
        {baseline && (
          <span>
            <i
              className={styles.dashed}
              style={seriesLabel ? { borderTopColor: "#126b5c" } : undefined}
            />
            {seriesLabel ? `${seriesLabel} · Comparison` : "Comparison"}
          </span>
        )}
        {second && (
          <span>
            <i className={styles.secondaryLegend} />
            {second.label}
          </span>
        )}
        {secondBaseline && (
          <span>
            <i className={styles.secondaryDashed} />
            {second?.label} · Comparison
          </span>
        )}
        <span>{legendUnit ?? (second ? "Count · people / passes" : unit)}</span>
      </div>
      <svg
        viewBox={`0 0 ${canvasWidth} 210`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line
              x1="56"
              x2={canvasWidth - 20}
              y1={y(v)}
              y2={y(v)}
              stroke="#e4ebe8"
            />
            <text
              x="48"
              y={y(v) + 4}
              textAnchor="end"
              fill="#53635e"
              fontSize="11"
            >
              {number(v)}
            </text>
          </g>
        ))}
        {bars ? (
          rows.map((r, i) =>
            r.value === null ? null : (
              <rect
                key={r.date}
                x={x(i) - (plotWidth * 0.35) / rows.length}
                y={Math.min(y(0), y(r.value))}
                width={(plotWidth * 0.7) / rows.length}
                height={Math.max(1, Math.abs(y(r.value) - y(0)))}
                fill="#227d70"
                opacity={index === i ? 1 : 0.65}
              />
            ),
          )
        ) : (
          <path d={path(rows)} fill="none" stroke="#126b5c" strokeWidth="2.5" />
        )}
        {baseline && (
          <path
            d={path(baseline)}
            fill="none"
            stroke={seriesLabel ? "#126b5c" : "#6e7988"}
            strokeWidth="2"
            strokeDasharray="6 5"
          />
        )}
        {second && (
          <path
            d={path(second.rows)}
            fill="none"
            stroke="#3563a5"
            strokeWidth="2.5"
          />
        )}
        {secondBaseline && (
          <path
            d={path(secondBaseline)}
            fill="none"
            stroke="#3563a5"
            strokeWidth="2"
            strokeDasharray="6 5"
          />
        )}
        <line
          x1={x(index)}
          x2={x(index)}
          y1="20"
          y2="184"
          stroke="#6b8880"
          strokeDasharray="3 3"
        />
        {selectedValue != null && (
          <circle cx={x(index)} cy={y(selectedValue)} r="4" fill="#126b5c" />
        )}
        {secondValue != null && (
          <circle cx={x(index)} cy={y(secondValue)} r="4" fill="#3563a5" />
        )}
        {[0, Math.floor((rows.length - 1) / 2), rows.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((i) => (
            <text
              key={i}
              x={x(i)}
              y="203"
              textAnchor={
                i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"
              }
              fill="#53635e"
              fontSize="11"
            >
              {formatDate(rows[i].date).slice(0, 5)}
            </text>
          ))}
        {rows.map((r, i) => (
          <rect
            key={r.date}
            x={56 + (i * plotWidth) / rows.length}
            y="10"
            width={plotWidth / rows.length}
            height="175"
            fill="transparent"
            onPointerEnter={() => setSelected(i)}
            onClick={() => setSelected(i)}
          />
        ))}
      </svg>
      <input
        className={styles.chartSlider}
        type="range"
        min="0"
        max={rows.length - 1}
        value={index}
        onChange={(e) => setSelected(Number(e.target.value))}
        aria-label={`${label}: select a day`}
        aria-valuetext={`${formatDate(rows[index].date)}: ${seriesLabel ?? ""} ${valueText(rows[index].value, unit)}${second ? `; ${second.label}: ${valueText(second.rows[index].value, second.unit)}` : ""}`}
      />
      <div className={styles.chartReadout} aria-live="polite">
        <span>
          <b>{formatDate(rows[index].date)}</b> ·{" "}
          {seriesLabel && `${seriesLabel}: `}
          {valueText(rows[index].value, unit)}
          {rows[index].detail && <small>{rows[index].detail}</small>}
        </span>
        {baselineDay && (
          <span>
            <b>{formatDate(baselineDay.date)}</b> ·{" "}
            {seriesLabel && `${seriesLabel}: `}{" "}
            {valueText(baselineDay.value, unit)}
            {baselineDay.detail && <small>{baselineDay.detail}</small>}
          </span>
        )}
        {second && (
          <span>
            <b>{formatDate(second.rows[index].date)}</b> · {second.label}:{" "}
            {valueText(second.rows[index].value, second.unit)}
          </span>
        )}
        {secondBaselineDay && (
          <span>
            <b>{formatDate(secondBaselineDay.date)}</b> · {second?.label}{" "}
            (comparison): {valueText(secondBaselineDay.value, second!.unit)}
          </span>
        )}
      </div>
      {rows.some((day) => day.value === null) && (
        <p className={styles.note}>
          Dates without reported data are left blank.
        </p>
      )}
      {comparison && !baseline && (
        <p className={styles.note}>
          Different period lengths. Compare totals above; daily series are not
          overlaid.
        </p>
      )}
    </div>
  );
}
