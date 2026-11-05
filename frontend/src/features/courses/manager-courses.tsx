"use client";
import styles from "./manager-courses.module.css";
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
import { Card } from "@/components/ui";
import type { ManagerCourseDto, Paged } from "@/lib/types";
export { ManagerCourseDetail } from "./course-detail";
const statuses = [
  "DRAFT",
  "PUBLISHED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];
const thresholds = ["NOT_EVALUATED", "MET", "WAIVED_BY_MANAGER", "AT_RISK"];
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
  const copy = t.classWorkspace;
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
          <Link
            className={styles.className}
            href={`/manager/classes/${c.classId}`}
          >
            {c.name}
          </Link>
          <span className={styles.classCode}>{c.code}</span>
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
      header: copy.enrolled,
      numeric: true,
      cell: (c) => (
        <span className={styles.count}>
          {c.confirmedCount}/{c.capacity}
        </span>
      ),
    },
    {
      id: "threshold",
      header: copy.opening,
      cell: (c) => <StatusChip value={c.thresholdStatus} />,
    },
    {
      id: "price",
      header: copy.price,
      numeric: true,
      cell: (c) => formatMoney(c.price),
    },
  ];
  return (
    <div className={styles.page}>
      <Card>
        <div className={styles.toolbar}>
          <FilterBar
            inline
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
                  { value: "", label: l.allSports },
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
                  { value: "", label: l.allStatuses },
                  ...statuses.map((s) => ({ value: s, label: statusLabel(s) })),
                ],
              },
              {
                id: "thresholdStatus",
                label: l.thresholdFilter,
                kind: "select",
                options: [
                  { value: "", label: l.allOpeningConditions },
                  ...thresholds.map((status) => ({
                    value: status,
                    label: statusLabel(status),
                  })),
                ],
              },
            ]}
          />
          <div className={styles.primaryActions}>
            <Link className="btn" href="/manager/classes/new">
              {copy.create}
            </Link>
          </div>
        </div>
        {sports.error && <p role="alert">{sports.error.message}</p>}
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
      </Card>
    </div>
  );
}
