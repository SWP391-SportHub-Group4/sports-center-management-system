"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { MemberName } from "@/components/RecordName";
import { useApi, type AsyncState } from "@/lib/useApi";
import { formatDate, formatMoney, formatPoints } from "@/lib/format";
import { reportsApi, type ReportFilters, type ClassStatusReport } from "./api";
import type { RevenueReportDto } from "@/lib/types";
import { DashboardChart } from "./dashboard-chart";
import {
  changeLabel,
  periodDays,
  reportPeriods,
  type Period,
  type PeriodSelection,
} from "./report-periods";
import s from "./reports-dashboard.module.css";

export type DashboardTab = "revenue" | "rentals" | "classes" | "members";
export interface ViewProps {
  selection: PeriodSelection;
  filters: ReportFilters;
  today: string;
}
const number = (n: number) =>
  n.toLocaleString("en", { maximumFractionDigits: 2 });
const compact = (n: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
export const sourceName = (name: string) =>
  ({
    MEMBERSHIP: "Gym",
    CLASS_PACKAGE: "Classes",
    RENTAL: "Court rental",
    WALLET_TOP_UP: "Wallet top-ups",
    WALLET_TOPUP: "Wallet top-ups",
    DAY_PASS: "Day passes",
    RECONCILIATION: "Reconciliation",
    LEGACY_UNCLASSIFIED: "Unclassified (legacy)",
    UNCLASSIFIED: "Unclassified",
  })[name] ?? name.replaceAll("_", " ");
export function rangeText(p: Period | null) {
  return p
    ? `${formatDate(p.fromDate)} – ${formatDate(p.toDate)}`
    : "No elapsed dates in this period";
}
export function ReportState<T>({
  state,
  children,
  name = "Report",
}: {
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
  name?: string;
}) {
  if (state.loading)
    return (
      <p className={s.empty} role="status">
        Loading {name.toLowerCase()}…
      </p>
    );
  if (state.error)
    return (
      <div className={s.error} role="alert">
        <strong>{name}: Unavailable</strong>
        <button type="button" className="btn btn--ghost" onClick={state.reload}>
          Retry
        </button>
      </div>
    );
  return state.data === null ? (
    <p className={s.empty}>No elapsed dates in this period.</p>
  ) : (
    children(state.data)
  );
}
function ComparisonNotice<T>({
  state,
  enabled,
}: {
  state: AsyncState<T>;
  enabled: boolean;
}) {
  if (!enabled) return null;
  if (state.error)
    return (
      <div className={s.error} role="alert">
        Comparison: Unavailable{" "}
        <button className="btn btn--ghost" onClick={state.reload}>
          Retry comparison
        </button>
      </div>
    );
  return state.loading ? (
    <p className={s.note} role="status">
      Loading comparison…
    </p>
  ) : null;
}
function Metric({
  label,
  value,
  money,
  hint,
  previous,
  equal = false,
  emphasis = false,
}: {
  label: string;
  value?: number;
  money?: boolean;
  hint?: ReactNode;
  previous?: number;
  equal?: boolean;
  emphasis?: boolean;
}) {
  const format = money ? formatMoney : number;
  return (
    <div className={`${s.metric} ${emphasis ? s.emphasis : ""}`}>
      <h3>{label}</h3>
      <strong
        tabIndex={0}
        title={value === undefined ? "Unavailable" : format(value)}
      >
        {value === undefined
          ? "Unavailable"
          : money
            ? compact(value)
            : number(value)}
        {money && value !== undefined && <small> VND</small>}
        {value !== undefined && (
          <span className={s.exact} aria-hidden="true">
            {format(value)}
          </span>
        )}
      </strong>
      {hint && <p>{hint}</p>}
      {previous !== undefined && value !== undefined && (
        <p className={s.delta}>
          vs {format(previous)}
          <br />
          {changeLabel(value, previous, equal, format)}
        </p>
      )}
    </div>
  );
}
function PeriodNote({
  primary,
  comparison,
  label,
}: {
  primary: Period | null;
  comparison: Period | null;
  label: string;
}) {
  return (
    <p className={s.periodNote}>
      <b>{label}</b> {rangeText(primary)}
      {comparison && (
        <>
          {" "}
          <span>vs {rangeText(comparison)}</span>
        </>
      )}{" "}
      · Vietnam time
    </p>
  );
}
function Details({
  children,
  title = "View details",
}: {
  children: ReactNode;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={s.details}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{title}</summary>
      {open && <div className={s.detailBody}>{children}</div>}
    </details>
  );
}
function CollectionRows({ report }: { report: RevenueReportDto }) {
  const [page, setPage] = useState(0),
    rows = report.bySportAndSource;
  return (
    <>
      <div className={s.tableScroll}>
        <table>
          <thead>
            <tr>
              {[
                "Source",
                "Sport",
                "Member",
                "Money received (VND)",
                "Points used",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 20, page * 20 + 20).map((r, i) => (
              <tr key={i}>
                <td>{sourceName(r.source)}</td>
                <td>{r.sportName ?? "Unclassified"}</td>
                <td>
                  {r.memberId ? <MemberName id={r.memberId} /> : "Unclassified"}
                </td>
                <td>{number(r.cashCollected)}</td>
                <td>{formatPoints(r.pointsRedeemed)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={3}>Total</th>
              <td>{number(rows.reduce((a, r) => a + r.cashCollected, 0))}</td>
              <td>
                {formatPoints(rows.reduce((a, r) => a + r.pointsRedeemed, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {rows.length > 20 && (
        <div className={s.pager}>
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            {page + 1} / {Math.ceil(rows.length / 20)}
          </span>
          <button
            disabled={(page + 1) * 20 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
      {!rows.length && <p>No collections in this period.</p>}
    </>
  );
}
function SourceBars({ report }: { report: RevenueReportDto }) {
  const rows = report.bySource
    .filter((r) => r.cashCollected !== 0)
    .sort((a, b) => b.cashCollected - a.cashCollected);
  const max = Math.max(1, ...rows.map((r) => r.cashCollected));
  return (
    <section className={s.panel}>
      <h2>Money received by source</h2>
      <p className={s.note}>Share of total money received</p>
      <div className={s.bars}>
        {rows.map((r) => (
          <div key={r.source}>
            <div className={s.barLabel}>
              <b>{sourceName(r.source)}</b>
              <span>
                {formatMoney(r.cashCollected)} ·{" "}
                {report.totalCollected
                  ? ((r.cashCollected / report.totalCollected) * 100).toFixed(1)
                  : "0"}
                %
              </span>
            </div>
            <div className={s.track}>
              <i
                style={{
                  width: `${Math.max(0, (r.cashCollected / max) * 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      {rows[0] ? (
        <p className={s.insight}>
          {sourceName(rows[0].source)} accounts for{" "}
          {((rows[0].cashCollected / report.totalCollected) * 100).toFixed(1)}%
          of collections.
        </p>
      ) : (
        <p className={s.empty}>No money received in this period.</p>
      )}
    </section>
  );
}
export function RevenueView({ selection, filters, today }: ViewProps) {
  const { primary, comparison } = reportPeriods(selection, today, true);
  const state = useApi(
    (signal) =>
      primary
        ? reportsApi.summary({ ...filters, ...primary }, signal)
        : Promise.resolve(null),
    [filters, selection, today],
  );
  const previous = useApi(
    (signal) =>
      comparison
        ? reportsApi.summary({ ...filters, ...comparison }, signal)
        : Promise.resolve(null),
    [filters, selection, today],
  );
  const equal =
    !!primary && !!comparison && periodDays(primary) === periodDays(comparison);
  const chartRows = (r: RevenueReportDto) =>
    r.daily.map((d) => ({
      date: d.date,
      value: d.net,
      detail: `Money received ${formatMoney(d.collected)} · Cash refunded ${formatMoney(d.refunded)}`,
    }));
  return (
    <>
      <PeriodNote
        primary={primary}
        comparison={comparison}
        label="Payments & completed cash refunds"
      />
      <ComparisonNotice state={previous} enabled={!!comparison} />
      <ReportState state={state} name="Revenue">
        {(r) =>
          r && (
            <>
              <div className={s.metrics}>
                <Metric
                  label="Money received"
                  value={r.totalCollected}
                  money
                  previous={previous.data?.totalCollected}
                  equal={equal}
                  hint="Successful collections"
                />
                <Metric
                  label="Cash refunded"
                  value={r.totalRefunded}
                  money
                  previous={previous.data?.totalRefunded}
                  equal={equal}
                  hint="Completed cash payouts"
                />
                <Metric
                  label="After refunds"
                  value={r.netRevenue}
                  money
                  previous={previous.data?.netRevenue}
                  equal={equal}
                  emphasis
                  hint="Money received − cash refunded"
                />
              </div>
              <p>
                Recorded bank payouts: {formatMoney(r.bankRefundPaid ?? 0)} VND
                ({r.bankRefundCount ?? 0} payout(s)). This amount is shown separately
                from cash refunds and does not reduce money received.
              </p>
              <div className={s.charts}>
                <section className={s.panel}>
                  <h2>After refunds by day</h2>
                  <DashboardChart
                    rows={chartRows(r)}
                    comparison={
                      previous.data ? chartRows(previous.data) : undefined
                    }
                    label="After refunds by day"
                    unit="VND"
                  />
                </section>
                <SourceBars report={r} />
              </div>
              <Details>
                <CollectionRows report={r} />
                {previous.data && (
                  <Details title="Comparison details">
                    <CollectionRows report={previous.data} />
                  </Details>
                )}
              </Details>
              <Details title="Points activity">
                <dl className={s.points}>
                  <div>
                    <dt>Points used</dt>
                    <dd>{formatPoints(r.pointsRedeemed)}</dd>
                  </div>
                  <div>
                    <dt>Points refunded</dt>
                    <dd>{formatPoints(r.pointsRefunded)}</dd>
                  </div>
                  <div>
                    <dt>Current balance</dt>
                    <dd>{formatPoints(r.outstandingPoints)}</dd>
                  </div>
                </dl>
                <p className={s.note}>
                  Current balance includes available and held points{" "}
                  {filters.memberId
                    ? "for the selected member"
                    : "across all wallets"}
                  ; it is not limited by period, sport or source.
                </p>
              </Details>
              <p className={s.note}>
                Refunds in points do not reduce After refunds. Operating costs
                are not deducted.
              </p>
            </>
          )
        }
      </ReportState>
    </>
  );
}
export function CourtsView({ selection, filters, today }: ViewProps) {
  const planned = reportPeriods(selection, today, false),
    paid = reportPeriods(selection, today, true);
  const current = useApi(
    (signal) => reportsApi.courtBookings(filters, signal),
    [filters],
  );
  const previous = useApi(
    (signal) =>
      planned.comparison
        ? reportsApi.courtBookings(
            { ...filters, ...planned.comparison },
            signal,
          )
        : Promise.resolve(null),
    [filters, selection],
  );
  const money = useApi(
    (signal) =>
      paid.primary
        ? reportsApi.summary(
            { ...filters, ...paid.primary, source: "RENTAL" },
            signal,
          )
        : Promise.resolve(null),
    [filters, selection, today],
  );
  const oldMoney = useApi(
    (signal) =>
      paid.comparison
        ? reportsApi.summary(
            { ...filters, ...paid.comparison, source: "RENTAL" },
            signal,
          )
        : Promise.resolve(null),
    [filters, selection, today],
  );
  const equal =
    !!planned.comparison &&
    periodDays(filters) === periodDays(planned.comparison);
  return (
    <>
      <PeriodNote {...planned} label="Rental dates" />
      <PeriodNote {...paid} label="Payment dates" />
      <ComparisonNotice state={previous} enabled={!!planned.comparison} />
      <ComparisonNotice state={oldMoney} enabled={!!paid.comparison} />
      <div className={s.metrics}>
        <ReportState state={current} name="Bookings">
          {(r) => (
            <>
              <Metric
                label="Confirmed bookings"
                value={r.totalBookings}
                previous={previous.data?.totalBookings}
                equal={equal}
                hint="Confirmed and completed rentals"
              />
              <Metric
                label="Booked hours"
                value={r.totalBookedHours}
                previous={previous.data?.totalBookedHours}
                equal={equal}
                hint="Scheduled rental time"
              />
            </>
          )}
        </ReportState>
        <ReportState state={money} name="Money received">
          {(r) => (
            <Metric
              label="Money received"
              value={r?.totalCollected}
              money
              previous={oldMoney.data?.totalCollected}
              equal={
                !!paid.primary &&
                !!paid.comparison &&
                periodDays(paid.primary) === periodDays(paid.comparison)
              }
              emphasis
              hint="By payment date"
            />
          )}
        </ReportState>
      </div>
      <ReportState state={current} name="Court bookings">
        {(r) => (
          <div className={s.charts}>
            <section className={s.panel}>
              <h2>Booked hours by day</h2>
              {r.daily ? (
                <DashboardChart
                  rows={r.daily.map((d) => ({
                    date: d.date,
                    value: d.bookedHours,
                    detail: `${d.bookings} bookings`,
                  }))}
                  comparison={previous.data?.daily?.map((d) => ({
                    date: d.date,
                    value: d.bookedHours,
                    detail: `${d.bookings} bookings`,
                  }))}
                  label="Booked hours by day"
                  unit="hours"
                  bars
                />
              ) : (
                <p>Daily hours: Unavailable</p>
              )}
              <p className={s.note}>
                Booked hours represent reservations, not measured court use.
              </p>
            </section>
            <section className={s.panel}>
              <h2>Bookings by sport</h2>
              <div className={s.tableScroll}>
                <table>
                  <thead>
                    <tr>
                      <th>Sport</th>
                      <th>Bookings</th>
                      <th>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.bySport.map((row) => (
                      <tr key={row.sportId}>
                        <td>{row.sportName}</td>
                        <td>{number(row.bookings)}</td>
                        <td>{number(row.bookedHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      <td>{number(r.totalBookings)}</td>
                      <td>{number(r.totalBookedHours)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {previous.data && (
                <p className={s.note}>
                  Comparison: {number(previous.data.totalBookings)} bookings ·{" "}
                  {number(previous.data.totalBookedHours)} hours
                </p>
              )}
            </section>
          </div>
        )}
      </ReportState>
      <Details>
        <ReportState state={money} name="Court collections">
          {(r) => r && <CollectionRows report={r} />}
        </ReportState>
        {oldMoney.data && (
          <Details title="Comparison collections">
            <CollectionRows report={oldMoney.data} />
          </Details>
        )}
      </Details>
    </>
  );
}
function enrollment(report?: ClassStatusReport | null) {
  const groups = new Map<
    number,
    { name: string; seats: number; capacity: number }
  >();
  for (const r of report?.classes ?? []) {
    if (["DRAFT", "CANCELLED"].includes(r.status.toUpperCase())) continue;
    const g = groups.get(r.sportId) ?? {
      name: r.sportName,
      seats: 0,
      capacity: 0,
    };
    g.seats += r.confirmedCount;
    g.capacity += r.capacity;
    groups.set(r.sportId, g);
  }
  return groups;
}
function ClassRows({ report }: { report: ClassStatusReport }) {
  return (
    <div className={s.tableScroll}>
      <table>
        <thead>
          <tr>
            {[
              "Class",
              "Sport",
              "Status",
              "Enrolled / seats",
              "Opening threshold",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.classes?.map((r) => (
            <tr key={r.classId}>
              <td>
                <Link href={`/manager/classes/${r.classId}`}>{r.name}</Link>
              </td>
              <td>{r.sportName}</td>
              <td>{r.status.replaceAll("_", " ")}</td>
              <td>
                {r.confirmedCount} / {r.capacity}
              </td>
              <td>{r.thresholdStatus.replaceAll("_", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ClassesView({ selection, filters, today }: ViewProps) {
  const { primary, comparison } = reportPeriods(selection, today, false);
  const current = useApi(
    (signal) => reportsApi.classStatus(signal, filters),
    [filters],
  );
  const previous = useApi(
    (signal) =>
      comparison
        ? reportsApi.classStatus(signal, { ...filters, ...comparison })
        : Promise.resolve(null),
    [filters, selection],
  );
  const equal = !!comparison && periodDays(filters) === periodDays(comparison);
  const old = enrollment(previous.data);
  return (
    <>
      <PeriodNote
        primary={primary}
        comparison={comparison}
        label="Classes starting"
      />
      <ComparisonNotice state={previous} enabled={!!comparison} />
      <ReportState state={current} name="Classes">
        {(r) => (
          <>
            <div className={s.metrics}>
              <Metric
                label="Open"
                value={r.open}
                previous={previous.data?.open}
                equal={equal}
                emphasis
                hint="Published or in progress"
              />
              <Metric
                label="Completed"
                value={r.completed}
                previous={previous.data?.completed}
                equal={equal}
                hint="Finished classes"
              />
              <Metric
                label="Unpublished"
                value={r.unpublished}
                previous={previous.data?.unpublished}
                equal={equal}
                hint="Drafts, not open for registration"
              />
            </div>
            <section className={s.panel}>
              <h2>Enrollment by sport</h2>
              <p className={s.note}>
                Confirmed seats / capacity · Published classes, excluding
                cancelled classes and unpaid holds
              </p>
              <div className={s.enrollment}>
                {[...enrollment(r)].map(([id, g]) => {
                  const ratio = g.capacity ? (g.seats / g.capacity) * 100 : 0,
                    before = old.get(id);
                  return (
                    <div key={id}>
                      <div className={s.barLabel}>
                        <b>{g.name}</b>
                        <span>
                          {g.seats} / {g.capacity} seats · {ratio.toFixed(1)}%
                        </span>
                      </div>
                      <div className={s.track}>
                        <i style={{ width: `${Math.min(100, ratio)}%` }} />
                      </div>
                      {before && (
                        <p className={s.note}>
                          Comparison {before.seats} / {before.capacity} seats ·{" "}
                          {(
                            ratio -
                            (before.capacity
                              ? (before.seats / before.capacity) * 100
                              : 0)
                          ).toFixed(1)}{" "}
                          percentage points
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {!r.classes ? (
                <p>Enrollment: Unavailable</p>
              ) : (
                !enrollment(r).size && (
                  <p className={s.empty}>No classes in this period</p>
                )
              )}
            </section>
            <Details>
              <ClassRows report={r} />
              {previous.data && (
                <Details title="Comparison classes">
                  <ClassRows report={previous.data} />
                </Details>
              )}
            </Details>
            <p className={s.note}>
              Each period groups classes by start date and uses their current
              status and enrollment. This is not a historical end-of-period
              snapshot.
            </p>
          </>
        )}
      </ReportState>
    </>
  );
}
export function MembersView({ selection, filters, today }: ViewProps) {
  const { primary, comparison } = reportPeriods(selection, today, true);
  const active = useApi(
    (signal) => reportsApi.membershipSummary(today, signal),
    [today],
  );
  const current = useApi(
    (signal) =>
      primary
        ? reportsApi.membership({ ...filters, ...primary }, signal)
        : Promise.resolve(null),
    [filters, selection, today],
  );
  const previous = useApi(
    (signal) =>
      comparison
        ? reportsApi.membership({ ...filters, ...comparison }, signal)
        : Promise.resolve(null),
    [filters, selection, today],
  );
  const equal =
    !!primary && !!comparison && periodDays(primary) === periodDays(comparison);
  return (
    <>
      <PeriodNote
        primary={primary}
        comparison={comparison}
        label="Successful purchases"
      />
      <ComparisonNotice state={previous} enabled={!!comparison} />
      <div className={s.metrics}>
        <ReportState state={active} name="Active Gym members">
          {(r) => (
            <Metric
              label="Active Gym members"
              value={r.membersWithActiveMembership}
              emphasis
              hint={
                <>
                  Valid today · {formatDate(today)}
                  <br />
                  Unique members, excluding day passes
                </>
              }
            />
          )}
        </ReportState>
        <ReportState state={current} name="Membership purchases">
          {(r) =>
            r && (
              <>
                <Metric
                  label="Membership buyers"
                  value={r.membersPurchasingMembershipInPeriod}
                  previous={previous.data?.membersPurchasingMembershipInPeriod}
                  equal={equal}
                  hint="Unique people buying or renewing"
                />
                <Metric
                  label="Day passes sold"
                  value={r.dayPassesSold}
                  previous={previous.data?.dayPassesSold}
                  equal={equal}
                  hint="Paid, valid day passes"
                />
              </>
            )
          }
        </ReportState>
      </div>
      <ReportState state={current} name="Daily buyers">
        {(r) =>
          r && (
            <section className={s.panel}>
              <h2>Gym purchases by day</h2>
              {r.daily ? (
                <DashboardChart
                  rows={r.daily.map((d) => ({ date: d.date, value: d.buyers }))}
                  comparison={previous.data?.daily?.map((d) => ({
                    date: d.date,
                    value: d.buyers,
                  }))}
                  label="Gym purchases by day"
                  seriesLabel="Membership buyers"
                  unit="people"
                  secondary={
                    r.daily.every(
                      (day) => typeof day.dayPassesSold === "number",
                    )
                      ? {
                          label: "Day passes sold",
                          unit: "passes",
                          rows: r.daily.map((day) => ({
                            date: day.date,
                            value: day.dayPassesSold!,
                          })),
                          comparison: previous.data?.daily?.every(
                            (day) => typeof day.dayPassesSold === "number",
                          )
                            ? previous.data.daily.map((day) => ({
                                date: day.date,
                                value: day.dayPassesSold!,
                              }))
                            : undefined,
                        }
                      : undefined
                  }
                  integerValues
                />
              ) : (
                <p>Daily buyers: Unavailable</p>
              )}
              {r.daily &&
                r.daily.length > 0 &&
                r.daily.every(
                  (day) => day.buyers === 0 && day.dayPassesSold === 0,
                ) && <p className={s.note}>No Gym purchases in this period.</p>}
              {r.daily?.some(
                (day) => typeof day.dayPassesSold !== "number",
              ) && (
                <p className={s.note}>Day-pass sales by day: Unavailable.</p>
              )}
              <p className={s.note}>
                Membership buyers counts people; day passes sold counts passes.
                Purchases do not indicate attendance. A person buying on
                multiple days appears on each of those days. The period total
                counts each person once.
              </p>
            </section>
          )
        }
      </ReportState>
    </>
  );
}
