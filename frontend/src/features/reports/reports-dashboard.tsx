"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, SlidersHorizontal } from "lucide-react";
import { Tabs } from "@/components/primitives";
import { Field } from "@/components/ui";
import { MemberPicker } from "@/components/MemberPicker";
import { api, downloadFile } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { vietnamLocal } from "@/lib/vietnam-time";
import type { SportDto, UserAdminDto, ReportExportDto } from "@/lib/types";
import type { ReportFilters } from "./api";
import {
  monthPeriod,
  reportPeriods,
  validPeriod,
  type PeriodSelection,
} from "./report-periods";
import {
  ClassesView,
  CourtsView,
  MembersView,
  RevenueView,
  ReportState,
  rangeText,
  type DashboardTab,
} from "./report-dashboard-views";
import s from "./reports-dashboard.module.css";

const tabs = ["revenue", "rentals", "classes", "members"] as const;
const labels = {
  revenue: "Revenue",
  rentals: "Courts",
  classes: "Classes",
  members: "Members",
};
interface Dimensions {
  sportId: string;
  source: string;
  memberId: string;
  member: UserAdminDto | null;
}
const blank: Dimensions = {
  sportId: "",
  source: "",
  memberId: "",
  member: null,
};
const initialDimensions = () =>
  Object.fromEntries(tabs.map((t) => [t, { ...blank }])) as Record<
    DashboardTab,
    Dimensions
  >;
const exportChoices = {
  revenue: [
    {
      type: "REVENUE_SUMMARY",
      label: "Summary",
      columns: ["collectedAmount", "refundedAmount", "netCollected"],
    },
    {
      type: "REVENUE_DAILY",
      label: "Daily collections",
      columns: ["date", "collectedAmount", "refundedAmount", "netCollected"],
    },
    {
      type: "REVENUE_DIMENSIONS",
      label: "Collection details",
      columns: [
        "source",
        "sportName",
        "memberName",
        "collectedAmount",
        "pointsRedeemed",
      ],
    },
  ],
  rentals: [
    {
      type: "COURT_BOOKINGS",
      label: "Bookings by sport",
      columns: ["sportName", "bookings", "bookedHours"],
    },
    {
      type: "COURT_RENTAL_REVENUE",
      label: "Collection details",
      columns: [
        "source",
        "sportName",
        "memberName",
        "collectedAmount",
        "pointsRedeemed",
      ],
    },
  ],
  classes: [
    {
      type: "CLASS_STATUS",
      label: "Classes",
      columns: [
        "name",
        "sportName",
        "startDate",
        "status",
        "confirmedCount",
        "capacity",
        "thresholdStatus",
      ],
    },
  ],
  members: [
    {
      type: "MEMBERSHIP_PERIOD",
      label: "Membership purchases",
      columns: ["membersPurchasingMembershipInPeriod", "dayPassesSold"],
    },
  ],
};
function ExportPanel({
  tab,
  selection,
  filters,
  today,
}: {
  tab: DashboardTab;
  selection: PeriodSelection;
  filters: ReportFilters;
  today: string;
}) {
  const [period, setPeriod] = useState("primary"),
    [dataset, setDataset] = useState(0),
    [format, setFormat] = useState("Csv");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const choice = exportChoices[tab][dataset] ?? exportChoices[tab][0];
  const periods = reportPeriods(
    selection,
    today,
    !["COURT_BOOKINGS", "CLASS_STATUS"].includes(choice.type),
  );
  const selected =
    period === "comparison" ? periods.comparison : periods.primary;
  return (
    <div className={s.exportPanel}>
      <div className={s.filterRow}>
        <Field label="Export period">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="primary">Selected period</option>
            {selection.compare !== "off" && (
              <option value="comparison">Comparison period</option>
            )}
          </select>
        </Field>
        <Field label="Content">
          <select
            value={dataset}
            onChange={(e) => setDataset(Number(e.target.value))}
          >
            {exportChoices[tab].map((v, i) => (
              <option key={v.type} value={i}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Format">
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="Csv">CSV</option>
            <option value="Pdf">PDF</option>
          </select>
        </Field>
        <button
          className="btn"
          disabled={busy || !selected}
          onClick={async () => {
            if (!selected) return;
            setBusy(true);
            setMessage("");
            try {
              const result = await api.post<ReportExportDto>(
                "/api/reports/exports",
                {
                  reportType: choice.type,
                  ...selected,
                  columns: choice.columns,
                  format,
                  sportId: filters.sportId ? Number(filters.sportId) : null,
                  source: tab === "rentals" ? "RENTAL" : filters.source || null,
                  memberId: filters.memberId || null,
                },
              );
              if (result.status.toUpperCase() !== "COMPLETED")
                throw new Error(
                  result.failureReason ||
                    "Export could not be completed. Please try again.",
                );
              await downloadFile(
                `/api/reports/exports/${result.reportExportId}/download`,
                `${choice.type.toLowerCase()}-${selected.fromDate}-${selected.toDate}.${format.toLowerCase()}`,
              );
              setMessage("Export downloaded.");
            } catch (e) {
              setMessage(
                e instanceof Error
                  ? e.message
                  : "Export unavailable. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Preparing…" : "Download"}
        </button>
      </div>
      <p className={s.note}>
        {rangeText(selected)} · Uses applied filters. Each period is a separate
        file.
      </p>
      {message && <p role="status">{message}</p>}
      <Link href="/manager/reports/exports">Export history</Link>
    </div>
  );
}
export function ReportsDashboard() {
  const now = useNow(),
    today = vietnamLocal(new Date(now).toISOString()).slice(0, 10);
  const { values, setValues } = useUrlQuery(
    { tab: "revenue" },
    { tab: choiceQuery([...tabs], "revenue") },
  );
  const tab = values.tab as DashboardTab;
  const initial = (): PeriodSelection => ({
    ...monthPeriod(today),
    compare: "off",
    compareFrom: monthPeriod(today, -1).fromDate,
    compareTo: monthPeriod(today, -1).toDate,
  });
  const [draft, setDraft] = useState(initial),
    [applied, setApplied] = useState(initial);
  const [dimensions, setDimensions] = useState(initialDimensions),
    [appliedDimensions, setAppliedDimensions] = useState(initialDimensions);
  const [error, setError] = useState(""),
    [exportOpen, setExportOpen] = useState(false);
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/manager/sports", { signal }),
    [],
  );
  const changed =
    JSON.stringify(draft) !== JSON.stringify(applied) ||
    JSON.stringify(dimensions[tab]) !== JSON.stringify(appliedDimensions[tab]);
  const dim = dimensions[tab],
    update = (patch: Partial<Dimensions>) =>
      setDimensions({ ...dimensions, [tab]: { ...dim, ...patch } });
  const filters: ReportFilters = useMemo(
    () => ({
      fromDate: applied.fromDate,
      toDate: applied.toDate,
      sportId: appliedDimensions[tab].sportId,
      source: appliedDimensions[tab].source,
      memberId: appliedDimensions[tab].memberId,
    }),
    [applied, appliedDimensions, tab],
  );
  const thisMonth = monthPeriod(today),
    lastMonth = monthPeriod(today, -1);
  const preset =
    draft.fromDate === thisMonth.fromDate && draft.toDate === thisMonth.toDate
      ? "current"
      : draft.fromDate === lastMonth.fromDate &&
          draft.toDate === lastMonth.toDate
        ? "previous"
        : "custom";
  const activeFilterCount = [
    appliedDimensions[tab].sportId,
    appliedDimensions[tab].source,
    appliedDimensions[tab].memberId,
  ].filter(Boolean).length;
  const View = {
    revenue: RevenueView,
    rentals: CourtsView,
    classes: ClassesView,
    members: MembersView,
  }[tab];
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <h2>Performance at a glance</h2>
          <p>Collections, bookings, classes and membership.</p>
        </div>
        <button
          className="btn btn--ghost"
          aria-expanded={exportOpen}
          aria-controls="report-export"
          onClick={() => setExportOpen(!exportOpen)}
        >
          <Download size={16} />
          Export
        </button>
      </header>
      <form
        className={s.filters}
        onSubmit={(e) => {
          e.preventDefault();
          if (
            !validPeriod(draft) ||
            (draft.compare === "custom" &&
              !validPeriod({
                fromDate: draft.compareFrom,
                toDate: draft.compareTo,
              }))
          ) {
            setError("Choose a valid period of 1–366 days.");
            return;
          }
          setError("");
          setApplied({ ...draft });
          setAppliedDimensions({ ...appliedDimensions, [tab]: { ...dim } });
        }}
      >
        <div className={s.filterRow}>
          <Field label="Report period">
            <select
              value={preset}
              onChange={(e) => {
                if (e.target.value !== "custom")
                  setDraft({
                    ...draft,
                    ...monthPeriod(
                      today,
                      e.target.value === "previous" ? -1 : 0,
                    ),
                  });
                else setDraft({ ...draft, fromDate: "", toDate: "" });
              }}
            >
              <option value="current">This month</option>
              <option value="previous">Previous month</option>
              <option value="custom">Custom period</option>
            </select>
          </Field>
          <Field label="From">
            <input
              type="date"
              required
              value={draft.fromDate}
              onChange={(e) => setDraft({ ...draft, fromDate: e.target.value })}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              required
              value={draft.toDate}
              onChange={(e) => setDraft({ ...draft, toDate: e.target.value })}
            />
          </Field>
          <Field label="Compare with">
            <select
              value={draft.compare}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  compare: e.target.value as PeriodSelection["compare"],
                })
              }
            >
              <option value="off">Off</option>
              <option value="previous">Previous month</option>
              <option value="custom">Custom period</option>
            </select>
          </Field>
          <button className="btn" type="submit">
            Apply
          </button>
        </div>
        {draft.compare === "custom" && (
          <div className={s.filterRow}>
            <Field label="Comparison from">
              <input
                type="date"
                required
                value={draft.compareFrom}
                onChange={(e) =>
                  setDraft({ ...draft, compareFrom: e.target.value })
                }
              />
            </Field>
            <Field label="Comparison to">
              <input
                type="date"
                required
                value={draft.compareTo}
                onChange={(e) =>
                  setDraft({ ...draft, compareTo: e.target.value })
                }
              />
            </Field>
          </div>
        )}
        <div className={s.filterFooter}>
          {tab !== "members" && (
            <details className={s.more} key={tab}>
              <summary>
                <SlidersHorizontal size={14} />
                More filters
                {activeFilterCount > 0 && ` (${activeFilterCount} applied)`}
              </summary>
              <div className={s.filterRow}>
                <ReportState state={sports} name="Sports">
                  {(rows) => (
                    <Field label="Sport">
                      <select
                        value={dim.sportId}
                        onChange={(e) => update({ sportId: e.target.value })}
                      >
                        <option value="">All sports</option>
                        {rows.map((r) => (
                          <option key={r.sportId} value={r.sportId}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </ReportState>
                {tab === "revenue" && (
                  <Field label="Source">
                    <select
                      value={dim.source}
                      onChange={(e) => update({ source: e.target.value })}
                    >
                      {[
                        ["", "All sources"],
                        ["MEMBERSHIP", "Gym"],
                        ["CLASS_PACKAGE", "Classes"],
                        ["RENTAL", "Court rental"],
                        ["WALLET_TOP_UP", "Wallet top-ups"],
                        ["DAY_PASS", "Day passes"],
                        ["RECONCILIATION", "Reconciliation"],
                        ["LEGACY_UNCLASSIFIED", "Unclassified (legacy)"],
                        ["UNCLASSIFIED", "Unclassified"],
                      ].map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {["revenue", "rentals"].includes(tab) && (
                  <MemberPicker
                    scanner={false}
                    label="Member"
                    placeholder="Find a member"
                    value={dim.member}
                    onChange={(member) =>
                      update({ member, memberId: member?.userId ?? "" })
                    }
                  />
                )}
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() =>
                    setDimensions({ ...dimensions, [tab]: { ...blank } })
                  }
                >
                  Clear filters
                </button>
              </div>
            </details>
          )}
          <span className={changed ? s.pending : s.note} role="status">
            {changed ? "Changes not applied" : "Applied · Vietnam time (UTC+7)"}
          </span>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
      {exportOpen && (
        <div id="report-export">
          <ExportPanel
            key={tab}
            tab={tab}
            selection={applied}
            filters={filters}
            today={today}
          />
        </div>
      )}
      <Tabs
        animatedIndicator
        value={tab}
        ariaLabel="Report dashboards"
        tabs={tabs.map((id) => ({ id, label: labels[id] }))}
        onChange={(id) => setValues({ tab: id })}
      >
        <div
          key={`${tab}-${JSON.stringify(applied)}-${JSON.stringify(appliedDimensions[tab])}`}
          className={s.view}
        >
          <View selection={applied} filters={filters} today={today} />
        </div>
      </Tabs>
    </div>
  );
}
