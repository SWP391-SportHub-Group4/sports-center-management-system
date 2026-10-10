"use client";

import { useEffect, useRef } from "react";
import {
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  TrendingUp,
  UserRound,
  Dumbbell,
} from "lucide-react";
import { CourseSticker } from "@/features/courses";
import { AsyncSection, Card, StatusChip } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDate, formatDateTime } from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import type {
  Paged,
  ProgressItemDto,
  WorkoutPlanDto,
  WorkoutResultDto,
} from "@/lib/types";
import { TrainingProfile } from "./training-profile";
import { PtBooking } from "./pt-booking";
import { PtSessionDetail } from "./pt-session-detail";
import { MemberSchedule } from "@/features/member";
import styles from "./training.module.css";

const TABS = ["sessions", "plans", "results", "profile"] as const;
type Tab = (typeof TABS)[number];
const PAGE = 20;

function SessionsTab({
  booking,
  onBook,
  onClose,
}: {
  booking: boolean;
  onBook: () => void;
  onClose: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const bookingHeading = useRef<HTMLHeadingElement>(null);
  const bookButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!booking) return;
    bookingHeading.current?.focus({ preventScroll: true });
    bookingHeading.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [booking]);
  return (
    <section className={styles.section}>
      <header className={styles.calendarHeader}>
        <div>
          <h2>{vi ? "Lịch tập trong tuần" : "Your weekly schedule"}</h2>
          <p className={styles.muted}>
            {vi
              ? "Lịch PT, lớp đã đăng ký và sân đã đặt trong cùng một lịch."
              : "PT sessions, registered classes and booked courts in one calendar."}
          </p>
        </div>
        <button
          ref={bookButton}
          type="button"
          onClick={onBook}
          className="btn"
          aria-expanded={booking}
          aria-controls={booking ? "training-inline-booking" : undefined}
        >
          <CalendarPlus size={18} aria-hidden="true" />
          {vi ? "Đặt PT" : "Book PT"}
        </button>
      </header>
      <MemberSchedule compact />
      {booking && (
        <section
          id="training-inline-booking"
          className={styles.inlineBooking}
          aria-labelledby="training-booking-title"
        >
          <header className={styles.calendarHeader}>
            <h2 id="training-booking-title" ref={bookingHeading} tabIndex={-1}>
              {vi ? "Đặt lịch PT" : "Book a PT session"}
            </h2>
            <button
              type="button"
              className="btn btn--quiet btn--sm"
              onClick={() => {
                onClose();
                bookButton.current?.focus();
              }}
            >
              {vi ? "Đóng phần đặt PT" : "Close PT booking"}
            </button>
          </header>
          <PtBooking showBackLink={false} />
        </section>
      )}
    </section>
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
                    <div>
                      <strong>{i.exercise}</strong>
                      {i.notes && <p>{i.notes}</p>}
                    </div>
                    <span>
                      {i.sets} × {i.reps}
                    </span>
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
  const { t, language } = useLanguage();
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
              <dl className={styles.resultNotes}>
                {r.progressNote && (
                  <div>
                    <dt>
                      {language === "vi"
                        ? "Tiến độ buổi tập"
                        : "Session progress"}
                    </dt>
                    <dd>{r.progressNote}</dd>
                  </div>
                )}
                {r.coachComment && (
                  <div>
                    <dt>
                      {language === "vi"
                        ? "Nhận xét của coach"
                        : "Coach feedback"}
                    </dt>
                    <dd>{r.coachComment}</dd>
                  </div>
                )}
              </dl>
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

export function MemberTraining() {
  const { t, language } = useLanguage();
  const l = t.ptOps;
  const { values, setValues } = useUrlQuery(
    { tab: "sessions", session: "", booked: "" },
    {
      tab: (value) =>
        value === "progress"
          ? "results"
          : choiceQuery([...TABS, "book"], "sessions")(value),
    },
  );
  const booking = values.tab === "book";
  const tab: Tab = booking ? "sessions" : (values.tab as Tab);
  const vi = language === "vi";
  const tabIcons = {
    sessions: CalendarDays,
    plans: ClipboardList,
    results: TrendingUp,
    profile: UserRound,
  };
  const labels: Record<Tab, string> = {
    sessions: l.tabSessions,
    plans: l.tabPlans,
    results: language === "vi" ? "Kết quả & tiến độ" : "Results & progress",
    profile: l.tabProfile,
  };
  return (
    <div className={styles.page}>
      <Tabs
        tabs={TABS.map((id) => {
          const Icon = tabIcons[id];
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
        ariaLabel={l.tabsLabel}
        onChange={(id) => setValues({ tab: id, session: "", booked: "" })}
      >
        <div className={styles.tabBody}>
          {!values.session && (tab === "plans" || tab === "results") && (
            <header className={styles.trainingIntro}>
              <div>
                <h2>{vi ? "Tập luyện cùng coach" : "Train with your coach"}</h2>
                <p>
                  {vi
                    ? "Quản lý lịch PT, kế hoạch tập và theo dõi tiến độ của bạn."
                    : "Manage PT sessions, workout plans and your training progress."}
                </p>
                <span className={styles.trainingMeta}>
                  <Dumbbell size={16} aria-hidden="true" />
                  {vi ? "Gym · Huấn luyện cá nhân" : "Gym · Personal training"}
                </span>
              </div>
              <div className={styles.introSticker} aria-hidden="true">
                <CourseSticker sport="Gym" compact />
              </div>
            </header>
          )}
          {tab === "sessions" &&
            (values.session && !booking ? (
              <PtSessionDetail
                key={values.session}
                sessionId={values.session}
              />
            ) : (
              <SessionsTab
                booking={booking}
                onClose={() =>
                  setValues({ tab: "sessions", session: "", booked: "" })
                }
                onBook={() =>
                  setValues({ tab: "book", session: "", booked: "" })
                }
              />
            ))}
          {tab === "plans" && <PlansTab />}
          {tab === "results" && (
            <div className="stack">
              <section>
                <h2>{l.tabResults}</h2>
                <ResultsTab />
              </section>
              <section>
                <h2>{l.tabProgress}</h2>
                <ProgressTab />
              </section>
            </div>
          )}
          {tab === "profile" && <TrainingProfile />}
        </div>
      </Tabs>
    </div>
  );
}
