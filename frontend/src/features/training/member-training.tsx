"use client";

import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { Tabs } from "@/components/primitives";
import { memberEnrollments } from "@/features/member";
import {
  TeachingRecords,
  teachingApi,
  type TeachingRecord,
} from "@/features/pt";
import { ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import type { CourseEnrollmentDto } from "@/lib/types";
import { TrainingProfile } from "./training-profile";
import styles from "./training.module.css";

const TABS = ["plans", "results", "profile"] as const;
type Tab = (typeof TABS)[number];
type ClassRecord = { enrollment: CourseEnrollmentDto; record: TeachingRecord };

/** The coaching feed is available only while a class enrollment is active. */
async function loadCoachingFeed(signal: AbortSignal): Promise<ClassRecord[]> {
  const enrollments = await memberEnrollments(signal);
  const active = enrollments.filter(
    (row) =>
      row.status === "CONFIRMED" &&
      !row.endedAt &&
      ["PUBLISHED", "IN_PROGRESS"].includes(row.classStatus.toUpperCase()),
  );
  const results = await Promise.all(
    active.map(async (enrollment) => {
      try {
        const records = await teachingApi.records(
          enrollment.classId,
          signal,
          true,
        );
        return records.map((record) => ({ enrollment, record }));
      } catch (error) {
        // An enrollment can end between the list and record requests.
        if (error instanceof ApiError && error.isForbidden) return [];
        throw error;
      }
    }),
  );
  return results
    .flat()
    .sort((a, b) => b.record.createdAtUtc.localeCompare(a.record.createdAtUtc));
}

function CoachingTab({ kind }: { kind: "plans" | "results" }) {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const state = useApi(loadCoachingFeed, []);
  const rows = (state.data ?? []).filter(({ record }) =>
    kind === "plans"
      ? record.kind === "PLAN" || record.kind === "HOMEWORK"
      : record.kind === "RESULT" || record.kind === "NOTICE",
  );

  return (
    <section className={styles.section}>
      <h2>{kind === "plans" ? t.ptOps.tabPlans : t.ptOps.tabResults}</h2>
      {state.loading ? (
        <p role="status">
          {vi ? "Đang tải nội dung tập luyện…" : "Loading training content…"}
        </p>
      ) : state.error ? (
        <div role="alert" className={styles.panel}>
          <p>{state.error.message}</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={state.reload}
          >
            {vi ? "Thử lại" : "Try again"}
          </button>
        </div>
      ) : rows.length ? (
        <div className={styles.page}>
          {rows.map(({ enrollment, record }) => (
            <article className={styles.panel} key={record.recordId}>
              <Link href={`/member/schedule?course=${enrollment.classId}`}>
                {enrollment.className}
              </Link>
              <TeachingRecords records={[record]} />
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>
          {vi
            ? "Chưa có nội dung từ huấn luyện viên ở các lớp bạn đang học."
            : "No coach content is available in your current classes yet."}
        </p>
      )}
    </section>
  );
}

/** Restore the original Training workspace using the current class teaching API. */
export function MemberTraining() {
  const { language, t } = useLanguage();
  const { values, setValues } = useUrlQuery(
    { tab: "plans" },
    {
      // Legacy links: the weekly calendar now lives only in My schedule.
      tab: (value) =>
        choiceQuery(
          TABS,
          "plans",
        )(value === "progress" ? "results" : value === "sessions" ? "plans" : value),
    },
  );
  const tab = values.tab as Tab;
  const labels = {
    plans: t.ptOps.tabPlans,
    results: language === "vi" ? "Kết quả & tiến độ" : "Results & progress",
    profile: t.ptOps.tabProfile,
  };
  const icons = {
    plans: ClipboardList,
    results: TrendingUp,
    profile: UserRound,
  };

  return (
    <div className={styles.page}>
      <p className={styles.scheduleLink}>
        <CalendarDays size={16} aria-hidden="true" />
        <Link href="/member/schedule">
          {language === "vi"
            ? "Xem lịch lớp và sân của tôi →"
            : "View my class and court schedule →"}
        </Link>
      </p>
      <Tabs
        tabs={TABS.map((id) => {
          const Icon = icons[id];
          return {
            id,
            label: (
              <span className={styles.tabLabel}>
                <Icon size={18} aria-hidden="true" />
                {labels[id]}
              </span>
            ),
          };
        })}
        value={tab}
        ariaLabel={t.ptOps.tabsLabel}
        onChange={(id) => setValues({ tab: id })}
      >
        <div className={styles.tabBody}>
          {tab === "plans" && <CoachingTab kind="plans" />}
          {tab === "results" && <CoachingTab kind="results" />}
          {tab === "profile" && <TrainingProfile />}
        </div>
      </Tabs>
    </div>
  );
}
