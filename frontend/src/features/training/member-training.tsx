"use client";

import Link from "next/link";
import { useState } from "react";
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
} from "@/features/coaching";
import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import type { CourseEnrollmentDto, SavedWorkoutSuggestionDto } from "@/lib/types";
import { TrainingProfile } from "./training-profile";
import styles from "./training.module.css";

const TABS = ["plans", "results", "profile"] as const;
type Tab = (typeof TABS)[number];
type ClassRecord = { enrollment: CourseEnrollmentDto; record: TeachingRecord };
const vietnamDate = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

/** The coaching feed is available only while a class enrollment is active. */
async function loadCoachingFeed(signal: AbortSignal): Promise<ClassRecord[]> {
  const enrollments = await memberEnrollments(signal);
  const active = enrollments.filter(
    (row) =>
      row.status === "CONFIRMED" &&
      !row.endedAt &&
      ["PUBLISHED", "IN_PROGRESS", "COMPLETED"].includes(
        row.classStatus.toUpperCase(),
      ),
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
  const aiState = useApi(
    (signal) => api.get<SavedWorkoutSuggestionDto[]>("/api/ai/workout-suggestions/me", { signal }),
    [],
  );
  const [source, setSource] = useState("");
  const [coach, setCoach] = useState("");
  const [activity, setActivity] = useState("");
  const [scope, setScope] = useState("");
  const [date, setDate] = useState("");
  const rows = (state.data ?? []).filter(({ record }) =>
    kind === "plans"
      ? record.kind === "PLAN" || record.kind === "HOMEWORK"
      : record.kind === "RESULT" || record.kind === "NOTICE",
  );
  const aiPlans = aiState.data ?? [];
  const coachOptions = [...new Map(rows.map(({ enrollment, record }) => [
    record.coachId,
    { id: record.coachId, name: enrollment.coachName || "Coach" },
  ])).values()];
  const activities = [...new Set([
    ...rows.map(({ enrollment }) => enrollment.sportName),
    ...(kind === "plans" ? aiPlans.map((plan) => plan.sport) : []),
  ].filter(Boolean))].sort();
  const visibleAi = kind === "plans" && source !== "coach" && !coach &&
    (scope === "" || scope === "personal")
    ? aiPlans.filter((plan) => (!activity || plan.sport === activity) &&
      (!date || vietnamDate(plan.generatedAt) === date))
    : [];
  const visibleRows = rows.filter(({ enrollment, record }) =>
    (kind !== "plans" || source !== "ai") &&
    (!coach || record.coachId === coach) &&
    (!activity || enrollment.sportName === activity) &&
    (!scope || (scope === "personal" ? Boolean(record.memberId) : !record.memberId)) &&
    (!date || vietnamDate(record.createdAtUtc) === date)
  );
  const totalVisible = visibleAi.length + visibleRows.length;

  return (
    <section className={styles.section}>
      {kind === "results" && <h2>{t.ptOps.tabResults}</h2>}
      <div className={styles.filters} data-kind={kind} aria-label={kind === "plans" ? "Plan filters" : "Result filters"}>
          {kind === "plans" && <label><span className={styles.visuallyHidden}>{vi ? "Nguồn" : "Source"}</span><select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{vi ? "Tất cả" : "All sources"}</option>
            <option value="ai">AI suggestion</option><option value="coach">Coach</option>
          </select></label>}
          <label>Coach<select value={coach} onChange={(e) => setCoach(e.target.value)}>
            <option value="">{vi ? "Tất cả Coach" : "All coaches"}</option>
            {coachOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>{vi ? "Môn tập / Gym" : "Sport / Gym"}<select value={activity} onChange={(e) => setActivity(e.target.value)}>
            <option value="">{vi ? "Tất cả" : "All activities"}</option>
            {activities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select></label>
          <label>{vi ? "Phạm vi" : "Scope"}<select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">{vi ? "Tất cả" : "All scopes"}</option>
            <option value="personal">{vi ? "Cá nhân" : "Personal"}</option>
            <option value="class">{vi ? "Cả lớp" : "Whole class"}</option>
          </select></label>
          <label>{vi ? "Ngày tạo" : "Created date"}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {kind === "plans" && (
        <div className={styles.aiPlans}>
          {aiState.loading && source !== "coach" ? <p role="status">{vi ? "Đang tải gợi ý AI…" : "Loading AI suggestions…"}</p>
            : aiState.error && source !== "coach" ? <p role="alert">
              {aiState.error instanceof ApiError && aiState.error.status === 404
                ? (vi ? "Backend chưa có API danh sách gợi ý AI. Hãy chạy phiên bản backend mới." : "The backend does not have the AI suggestions list API yet. Restart the updated backend.")
                : (vi ? "Không tải được gợi ý AI." : "AI suggestions could not be loaded.")}
              {aiState.error instanceof ApiError && aiState.error.status !== 404 &&
                ` (${aiState.error.code}, HTTP ${aiState.error.status})`}
              {" "}<button type="button" onClick={aiState.reload}>Retry</button>
            </p>
            : visibleAi.map((plan) => (
              <article className={styles.panel} key={plan.id}>
                <div className={styles.planHeading}>
                  <strong>{plan.sport} · {plan.goal}</strong>
                  <span className={styles.aiBadge}>{vi ? "AI tạo" : "Created by AI"}</span>
                </div>
                <small>{new Date(plan.generatedAt).toLocaleString(vi ? "vi-VN" : "en-US")}</small>
                <ol className={styles.aiExercises}>
                  {plan.items.map((item, index) => (
                    <li key={`${plan.id}-${index}`}>
                      <strong>{item.exercise}</strong> · {item.sets} × {item.reps}
                      {item.notes && <p>{item.notes}</p>}
                    </li>
                  ))}
                </ol>
                {plan.rationale && <p>{plan.rationale}</p>}
              </article>
            ))}
        </div>
      )}
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
      ) : visibleRows.length ? (
        <div className={styles.page}>
          {visibleRows.map(({ enrollment, record }) => (
            <article className={styles.panel} key={record.recordId}>
              {kind === "plans" && <span className={styles.coachBadge}>{vi ? "Coach tạo" : "Created by Coach"}</span>}
              <Link href={`/member/schedule?course=${enrollment.classId}`}>
                {enrollment.className}
              </Link>
              <TeachingRecords records={[record]} />
            </article>
          ))}
        </div>
      ) : kind === "plans" && (totalVisible > 0 || (source === "ai" && (aiState.loading || aiState.error))) ? null : (
        <p className={styles.muted}>
          {kind === "plans" ? (vi ? "Không có plan phù hợp với bộ lọc." : "No plans match these filters.")
            : coach || activity || scope || date
              ? (vi ? "Không có kết quả phù hợp với bộ lọc." : "No results match these filters.")
              : vi ? "Chưa có nội dung từ huấn luyện viên ở các lớp bạn đang học."
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
