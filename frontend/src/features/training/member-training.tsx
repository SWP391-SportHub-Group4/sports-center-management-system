"use client";

import Link from "next/link";
import { useState } from "react";
import { AsyncSection, Card, StatusChip, Feedback } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { api } from "@/lib/apiClient";
import { useApi, useAction } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { ListPager } from "@/features/pt";
import type {
  HomeworkDto,
  Paged,
  ProgressItemDto,
  PtChangeRequestDto,
  PtEntitlementDto,
  PtSessionDto,
  WorkoutPlanDto,
  WorkoutResultDto,
} from "@/lib/types";
import { TrainingProfile } from "./training-profile";
import { isPending } from "./request-list";
import styles from "./training.module.css";

const TABS = [
  "sessions",
  "plans",
  "results",
  "progress",
  "homework",
  "profile",
] as const;
type Tab = (typeof TABS)[number];
const PAGE = 20;

const upcoming = (s: PtSessionDto, now: number) =>
  s.status.toUpperCase() === "SCHEDULED" &&
  new Date(s.endAtUtc).getTime() > now;

/** Tóm tắt PT: HLV, quota còn lại, buổi tiếp theo và số yêu cầu đang chờ. */
function PtSummary() {
  const { t } = useLanguage();
  const l = t.ptOps;
  const entitlements = useApi(
    (signal) =>
      api.get<PtEntitlementDto[]>("/api/members/me/pt-entitlements", {
        signal,
      }),
    [],
  );
  const sessions = useApi(
    (signal) =>
      api.get<PtSessionDto[]>("/api/members/me/pt-sessions", {
        signal,
        query: { page: 1, pageSize: 50 },
      }),
    [],
  );
  const sessionRequests = useApi(
    (signal) =>
      api.get<PtChangeRequestDto[]>(
        "/api/members/me/pt-session-change-requests",
        { signal },
      ),
    [],
  );
  const coachRequests = useApi(
    (signal) =>
      api.get<PtChangeRequestDto[]>(
        "/api/members/me/pt-coach-change-requests",
        { signal },
      ),
    [],
  );
  const [now] = useState(() => Date.now());
  const active = entitlements.data?.find(
    (e) => e.status.toUpperCase() === "ACTIVE",
  );
  const next = pagedItems(sessions.data)
    .filter((s) => upcoming(s, now))
    .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc))[0];
  const pending = [
    ...(sessionRequests.data ?? []),
    ...(coachRequests.data ?? []),
  ].filter((q) => isPending(q.status)).length;

  return (
    <AsyncSection state={entitlements}>
      {() =>
        !active ? (
          <div className={styles.summary}>
            <div className={styles.next}>
              <p className={styles.muted}>{l.noPackage}</p>
              <Link className="btn" href="/member/services?tab=pt">
                {l.viewPackages}
              </Link>
            </div>
          </div>
        ) : (
          <section className={styles.summary} aria-label={l.yourCoach}>
            <div>
              <p className={styles.summaryLabel}>{l.yourCoach}</p>
              <p className={styles.coachName}>{active.coachName}</p>
              <p className={styles.quotaLine}>
                <strong>{active.remainingQuota}</strong>
                <span>
                  {l.sessionsLeft} ·{" "}
                  {l.ofTotal.replace("{total}", String(active.totalQuota))}
                </span>
              </p>
            </div>
            <div className={styles.next}>
              <p className={styles.summaryLabel}>{l.nextSession}</p>
              {next ? (
                <>
                  <p className={styles.nextWhen}>
                    {formatDateTime(next.startAtUtc)}
                  </p>
                  <p className={styles.muted}>{next.roomName || l.roomTbc}</p>
                  <Link
                    className="btn btn--secondary"
                    href={`/member/pt/sessions/${next.sessionId}`}
                  >
                    {l.details}
                  </Link>
                </>
              ) : (
                <p className={styles.muted}>{l.noNextSession}</p>
              )}
              {active.remainingQuota > 0 && (
                <Link className="btn" href="/member/pt/book">
                  {t.ptBook.bookCta}
                </Link>
              )}
              {pending > 0 && (
                <p className={styles.alertNote} role="status">
                  {l.pendingRequests.replace("{n}", String(pending))}
                </p>
              )}
            </div>
          </section>
        )
      }
    </AsyncSection>
  );
}

function SessionRow({ s }: { s: PtSessionDto }) {
  const { t } = useLanguage();
  const l = t.ptOps;
  return (
    <li>
      <div>
        <strong>{formatDateTime(s.startAtUtc)}</strong>
        <span>
          {s.coachName} · {s.roomName || l.roomTbc} · {formatTime(s.startAtUtc)}{" "}
          – {formatTime(s.endAtUtc)}
        </span>
      </div>
      <div className="btn-row">
        {s.status.toUpperCase() !== "SCHEDULED" && (
          <StatusChip value={s.status} />
        )}
        <Link
          className="btn btn--secondary btn--sm"
          href={`/member/pt/sessions/${s.sessionId}`}
        >
          {l.details}
        </Link>
      </div>
    </li>
  );
}

function SessionsTab() {
  const { t } = useLanguage();
  const l = t.ptOps;
  const [page, setPage] = useState(1);
  const [now] = useState(() => Date.now());
  const state = useApi(
    (signal) =>
      api.get<PtSessionDto[]>("/api/members/me/pt-sessions", {
        signal,
        query: { page, pageSize: PAGE },
      }),
    [page],
  );
  return (
    <AsyncSection
      state={state}
      isEmpty={(d) => !pagedItems(d).length}
      emptyMessage={l.emptySessions}
    >
      {(data) => {
        const rows = pagedItems(data);
        const next = rows
          .filter((s) => upcoming(s, now))
          .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
        const past = rows
          .filter((s) => !upcoming(s, now))
          .sort((a, b) => b.startAtUtc.localeCompare(a.startAtUtc));
        return (
          <>
            <div className={styles.section}>
              <h2>{l.upcoming}</h2>
              {next.length ? (
                <ul className={styles.list}>
                  {next.map((s) => (
                    <SessionRow key={s.sessionId} s={s} />
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>{l.noUpcoming}</p>
              )}
            </div>
            <div className={styles.section}>
              <h2>{l.history}</h2>
              {past.length ? (
                <ul className={styles.list}>
                  {past.map((s) => (
                    <SessionRow key={s.sessionId} s={s} />
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>{l.noHistory}</p>
              )}
            </div>
            <ListPager page={page} count={rows.length} onChange={setPage} />
          </>
        );
      }}
    </AsyncSection>
  );
}

function PlansTab() {
  const { t } = useLanguage();
  const l = t.ptOps;
  const state = useApi(
    (signal) =>
      api.get<WorkoutPlanDto[]>("/api/members/me/workout-plans", {
        signal,
        query: { page: 1, pageSize: PAGE },
      }),
    [],
  );
  return (
    <AsyncSection
      state={state}
      isEmpty={(d) => !pagedItems(d).length}
      emptyMessage={l.emptyPlans}
    >
      {(data) => (
        <div className="stack">
          {pagedItems(data).map((p) => (
            <Card key={p.planId} title={p.goal}>
              <p className={styles.muted}>
                {p.coachName} · {p.level} · <StatusChip value={p.status} />
              </p>
              <ul className={styles.exerciseList}>
                {p.items.map((i) => (
                  <li key={i.itemId}>
                    {i.exercise} · {i.sets} × {i.reps}
                    {i.notes ? ` · ${i.notes}` : ""}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </AsyncSection>
  );
}

function ResultsTab() {
  const { t } = useLanguage();
  const l = t.ptOps;
  const state = useApi(
    (signal) =>
      api.get<WorkoutResultDto[]>("/api/members/me/workout-results", {
        signal,
        query: { page: 1, pageSize: PAGE },
      }),
    [],
  );
  return (
    <AsyncSection
      state={state}
      isEmpty={(d) => !pagedItems(d).length}
      emptyMessage={l.emptyResults}
    >
      {(data) => (
        <div className="stack">
          {pagedItems(data).map((r) => (
            <Card key={r.resultId} title={formatDateTime(r.sessionStartAtUtc)}>
              <p className={styles.muted}>{r.coachName}</p>
              {r.progressNote && <p>{r.progressNote}</p>}
              {r.coachComment && <p>{r.coachComment}</p>}
            </Card>
          ))}
        </div>
      )}
    </AsyncSection>
  );
}

function ProgressTab() {
  const { t } = useLanguage();
  const l = t.ptOps;
  const state = useApi(
    (signal) =>
      api.get<Paged<ProgressItemDto> | ProgressItemDto[]>(
        "/api/members/me/progress",
        {
          signal,
          query: { page: 1, pageSize: PAGE },
        },
      ),
    [],
  );
  return (
    <AsyncSection
      state={state}
      isEmpty={(d) => !pagedItems(d).length}
      emptyMessage={l.emptyProgress}
    >
      {(data) => (
        <ul className={styles.list}>
          {pagedItems(data).map((p) => (
            <li key={p.ptSessionId}>
              <div>
                <strong>{formatDate(p.startAtUtc)}</strong>
                <span>
                  {p.coachName}
                  {p.progressNote ? ` · ${p.progressNote}` : ""}
                </span>
                {p.coachComment && <span> {p.coachComment}</span>}
              </div>
              <StatusChip value={p.sessionStatus} />
            </li>
          ))}
        </ul>
      )}
    </AsyncSection>
  );
}

function HomeworkProgress({
  homework: h,
  onSaved,
}: {
  homework: HomeworkDto;
  onSaved: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [feedback, setFeedback] = useState(h.memberFeedback ?? "");
  const action = useAction();
  const editable = ["ASSIGNED", "IN_PROGRESS"].includes(h.status);
  if (!editable) return null;
  async function save(status: string) {
    const saved = await action.run(() =>
      api.patch(
        `/api/members/me/homework/${encodeURIComponent(h.assignmentId)}`,
        {
          status,
          memberFeedback: feedback.trim() || null,
          version: h.version,
        },
      ),
    );
    if (saved !== null) onSaved();
  }
  return (
    <div className="stack">
      <label>
        {vi ? "Phản hồi cho huấn luyện viên" : "Feedback for your coach"}
        <textarea
          value={feedback}
          maxLength={2000}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={action.busy}
        />
      </label>
      <Feedback error={action.error} />
      <div className="btn-row">
        {h.status === "ASSIGNED" && (
          <button
            className="btn btn--secondary"
            disabled={action.busy}
            onClick={() => void save("IN_PROGRESS")}
          >
            {vi ? "Bắt đầu tập" : "Start assignment"}
          </button>
        )}
        <button
          className="btn btn--primary"
          disabled={action.busy}
          onClick={() => void save("COMPLETED")}
        >
          {vi ? "Hoàn thành bài tập" : "Complete assignment"}
        </button>
      </div>
    </div>
  );
}

function HomeworkTab({ assignment }: { assignment: string }) {
  const { t } = useLanguage();
  const l = t.ptOps;
  const state = useApi(
    async (signal) => {
      const rows: HomeworkDto[] = [];
      for (let page = 1; ; page++) {
        const batch = pagedItems(
          await api.get<HomeworkDto[]>("/api/members/me/homework", {
            signal,
            query: { page, pageSize: PAGE },
          }),
        );
        rows.push(...batch);
        if (!assignment) return rows;
        const selected = rows.find((h) => h.assignmentId === assignment);
        if (selected) return [selected];
        if (batch.length < PAGE) return [];
      }
    },
    [assignment],
  );
  return (
    <>
      <AsyncSection
        state={state}
        isEmpty={(d) => !pagedItems(d).length}
        emptyMessage={l.emptyHomework}
      >
        {(data) => (
          <div className="stack">
            {pagedItems(data).map((h) => (
              <Card key={h.assignmentId} title={h.title}>
                <p className={styles.muted}>
                  {l.assignedBy.replace("{coach}", h.coachName)} ·{" "}
                  {l.due.replace("{date}", formatDate(h.dueAt))} ·{" "}
                  <StatusChip value={h.status} />
                </p>
                {h.coachNote && <p>{h.coachNote}</p>}
                <ul className={styles.exerciseList}>
                  {h.items.map((i) => (
                    <li key={i.itemId}>
                      {i.exercise} · {i.sets} × {i.reps}
                      {i.notes ? ` · ${i.notes}` : ""}
                    </li>
                  ))}
                </ul>
                {h.memberFeedback && (
                  <p>
                    {l.yourNote}: {h.memberFeedback}
                  </p>
                )}
                <HomeworkProgress
                  key={`${h.assignmentId}-${h.version}`}
                  homework={h}
                  onSaved={state.reload}
                />
              </Card>
            ))}
          </div>
        )}
      </AsyncSection>
    </>
  );
}

export function MemberTraining() {
  const { t } = useLanguage();
  const l = t.ptOps;
  const { values, setValues } = useUrlQuery(
    { tab: "sessions", assignment: "" },
    { tab: choiceQuery([...TABS], "sessions") },
  );
  const tab = values.tab as Tab;
  const labels: Record<Tab, string> = {
    sessions: l.tabSessions,
    plans: l.tabPlans,
    results: l.tabResults,
    progress: l.tabProgress,
    homework: l.tabHomework,
    profile: l.tabProfile,
  };
  return (
    <div className={styles.page}>
      <PtSummary />
      <Tabs
        tabs={TABS.map((id) => ({ id, label: labels[id] }))}
        value={tab}
        ariaLabel={l.tabsLabel}
        onChange={(id) => setValues({ tab: id })}
      >
        <div className={styles.tabBody}>
          {tab === "sessions" && <SessionsTab />}
          {tab === "plans" && <PlansTab />}
          {tab === "results" && <ResultsTab />}
          {tab === "progress" && <ProgressTab />}
          {tab === "homework" && <HomeworkTab assignment={values.assignment} />}
          {tab === "profile" && <TrainingProfile />}
        </div>
      </Tabs>
    </div>
  );
}
