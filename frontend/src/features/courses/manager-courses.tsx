"use client";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useUrlQuery, pageQuery, choiceQuery } from "@/lib/useUrlQuery";
import { hasService } from "@/lib/sports";
import { formatMoney } from "@/lib/format";
import {
  ApiTable,
  FilterBar,
  StatusChip,
  type TableColumn,
} from "@/components/data";
import { catalogApi } from "@/features/catalog";
import { ApiGap } from "@/features/manager";
import type { ManagerCourseDto, Paged } from "@/lib/types";
export { ManagerCourseDetail } from "./course-detail";
const statuses = [
  "DRAFT",
  "PUBLISHED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];
const thresholds = ["NOT_EVALUATED", "MET", "AT_RISK", "WAIVED_BY_MANAGER"];
const defaults = {
  sportId: "",
  status: "",
  thresholdStatus: "",
  keyword: "",
  page: "1",
};
const validators = {
  page: pageQuery,
  status: choiceQuery(["", ...statuses], ""),
  thresholdStatus: choiceQuery(["", ...thresholds], ""),
};
export function ManagerCourses() {
  const { t } = useLanguage();
  const l = t.operations;
  const m = t.managerOperations;
  const { values, setValues } = useUrlQuery(defaults, validators);
  const page = Number(values.page);
  const sports = useApi((signal) => catalogApi.sports(signal, true), []);
  const courses = useApi(
    (signal) =>
      api.get<Paged<ManagerCourseDto>>("/api/manager/classes", {
        signal,
        query: { ...values, page, pageSize: 20 },
      }),
    [
      values.sportId,
      values.status,
      values.thresholdStatus,
      values.keyword,
      page,
    ],
  );
  const statusLabel = (s: string) =>
    t.wireStatus[s as keyof typeof t.wireStatus] ?? s;
  const columns: TableColumn<ManagerCourseDto>[] = [
    {
      id: "name",
      header: l.name,
      rowHeader: true,
      cell: (c) => (
        <>
          <strong>{c.name}</strong>
          <div className="small muted">{c.code}</div>
        </>
      ),
    },
    { id: "sportName", header: l.sport },
    {
      id: "status",
      header: l.status,
      cell: (c) => <StatusChip value={c.status} />,
    },
    {
      id: "confirmedCount",
      header: l.confirmed,
      numeric: true,
      cell: (c) => `${c.confirmedCount}/${c.capacity}`,
    },
    { id: "activeHoldCount", header: l.held, numeric: true },
    {
      id: "threshold",
      header: l.threshold,
      cell: (c) => (
        <>
          <StatusChip value={c.thresholdStatus} /> ·{" "}
          {c.breakEvenThreshold ?? "—"}
        </>
      ),
    },
    {
      id: "price",
      header: l.price,
      numeric: true,
      cell: (c) => formatMoney(c.price),
    },
  ];
  return (
    <>
      <div className="btn-row" role="group" aria-label={m.savedFilters}>
        {[
          [m.all, "", ""],
          [statusLabel("DRAFT"), "DRAFT", ""],
          [m.recruiting, "PUBLISHED", ""],
          [statusLabel("AT_RISK"), "PUBLISHED", "AT_RISK"],
          [statusLabel("IN_PROGRESS"), "IN_PROGRESS", ""],
          [m.history, "COMPLETED", ""],
        ].map(([label, status, thresholdStatus]) => (
          <button
            key={label}
            type="button"
            className="btn btn--secondary"
            aria-pressed={
              values.status === status &&
              values.thresholdStatus === thresholdStatus
            }
            onClick={() => setValues({ status, thresholdStatus, page: "1" })}
          >
            {label}
          </button>
        ))}
      </div>
      <FilterBar
        values={values}
        onChange={(next) => setValues({ ...next, page: "1" })}
        onReset={() => setValues(defaults)}
        fields={[
          { id: "keyword", label: l.search, kind: "search" },
          {
            id: "sportId",
            label: l.sport,
            kind: "select",
            options: [
              { value: "", label: l.all },
              ...(sports.data ?? [])
                .filter((s) => hasService(s, "GROUP_COURSE"))
                .map((s) => ({ value: String(s.sportId), label: s.name })),
            ],
          },
          {
            id: "status",
            label: l.status,
            kind: "select",
            options: [
              { value: "", label: l.all },
              ...statuses.map((s) => ({ value: s, label: statusLabel(s) })),
            ],
          },
          {
            id: "thresholdStatus",
            label: l.thresholdFilter,
            kind: "select",
            options: [
              { value: "", label: l.all },
              ...thresholds.map((s) => ({ value: s, label: statusLabel(s) })),
            ],
          },
        ]}
        actions={
          <Link className="btn" href="/manager/classes/new">
            {l.create}
          </Link>
        }
      />
      {sports.error && <p role="alert">{sports.error.message}</p>}
      <p>{m.holdHint}</p>
      <ApiTable
        caption={l.courses}
        state={courses}
        page={page}
        pageSize={20}
        onPageChange={(page) => setValues({ page: String(page) })}
        columns={columns}
        getRowId={(c) => String(c.classId)}
        empty={{
          title: m.noResults,
          hint: m.draftHint,
          action: (
            <Link className="btn btn--secondary" href="/manager/classes/new">
              {l.create}
            </Link>
          ),
        }}
        rowActions={(c) => (
          <Link
            className="btn btn--secondary"
            href={`/manager/classes/${c.classId}`}
          >
            {l.details}
          </Link>
        )}
      />
      <ApiGap code="G13" message={m.closeGap} />
    </>
  );
}
