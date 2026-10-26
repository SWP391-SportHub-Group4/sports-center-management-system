"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
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
import { ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import type { CourseEnrollmentDto, WorkoutSuggestionDto } from "@/lib/types";
import { TrainingProfile } from "./training-profile";
import styles from "./training.module.css";

const AI_PLANS_KEY = "sporthub:member:ai-workout-plans:v1";
const AI_PLANS_EVENT = "sporthub:ai-plans-changed";
type AiDraft = { suggestion: WorkoutSuggestionDto; savedAt: string };
type SavedAiPlan = AiDraft & { id: string };

function subscribeToPlans(onChange: () => void) {
  window.addEventListener(AI_PLANS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(AI_PLANS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readPlansSnapshot() {
  try {
    // Old single-plan data is migrated by the save action; show it until then.
    return localStorage.getItem(AI_PLANS_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function AiWorkoutDraft() {
  const raw = useSyncExternalStore(subscribeToPlans, readPlansSnapshot, () => "[]");
  let saved: SavedAiPlan[] = [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      saved = parsed.filter((p): p is SavedAiPlan =>
        p !== null && typeof p === "object" &&
        typeof p.id === "string" &&
        p.suggestion !== null && typeof p.suggestion === "object" &&
        Array.isArray(p.suggestion.items));
    }
  } catch { /* Treat corrupt storage as empty. */ }

  function removePlan(id: string) {
    if (!window.confirm("Delete this AI workout plan?")) return;
    try {
      const current: unknown = JSON.parse(localStorage.getItem(AI_PLANS_KEY) ?? "[]");
      if (!Array.isArray(current)) return;
      localStorage.setItem(AI_PLANS_KEY, JSON.stringify(current.filter((p) => p?.id !== id)));
      window.dispatchEvent(new Event(AI_PLANS_EVENT));
    } catch { /* Local storage may be unavailable. */ }
  }

  if (!saved.length) return null;
  return (
    <section className={styles.aiPlanSection} aria-label="Saved AI workout plans">
      <h2 className={styles.aiPlanHeading}>AI workout suggestions</h2>
      {saved.map(({ id, suggestion: plan, savedAt }) => (
        <article className={styles.aiPlanCard} key={id}>
          <div className={styles.aiPlanAccent}>
            <span className={styles.aiPlanKind}>
              <ClipboardList size={15} aria-hidden="true" /> Lesson plan
              <span className={styles.aiPlanDraftTag}>AI suggestion</span>
            </span>
            <h3 className={styles.aiPlanTitle}>{plan.sport} workout - {plan.goal}</h3>
            <p className={styles.aiPlanMeta}>
              Individual {" \u00b7 "} {plan.level} {" \u00b7 "} Saved {new Date(savedAt).toLocaleDateString("en-GB")} {" \u00b7 "} Not coach-approved
            </p>
            <div className={styles.aiPlanContent}>
              <p><strong>Goal</strong> {" \u00b7 "} {plan.goal}</p>
              {(plan.items ?? []).map((item, index) => (
                <p key={`${index}-${item.exercise}`}>
                  <strong>{index + 1}. {item.exercise}</strong> {" \u00b7 "} {item.sets} {item.sets === 1 ? "set" : "sets"} {" \u00d7 "} {item.reps} {item.reps === 1 ? "rep" : "reps"}
                  {item.notes ? ` ${String.fromCharCode(183)} ${item.notes}` : ""}
                </p>
              ))}
              {plan.rationale && <p className={styles.aiPlanRationale}><strong>Why this workout?</strong> {" \u00b7 "} {plan.rationale}</p>}
            </div>
          </div>
          <button className={styles.aiPlanRemove} type="button" onClick={() => removePlan(id)}>Delete plan</button>
        </article>
      ))}
    </section>
  );
}

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
          {tab === "plans" && <><AiWorkoutDraft /><CoachingTab kind="plans" /></>}
          {tab === "results" && <CoachingTab kind="results" />}
          {tab === "profile" && <TrainingProfile />}
        </div>
      </Tabs>
    </div>
  );
}

