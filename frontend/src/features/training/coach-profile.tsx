"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, Clock, Dumbbell, Users } from "lucide-react";
import { AsyncSection } from "@/components/ui";
import { AvatarImage } from "@/components/AvatarImage";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { addDaysIso, formatMoney, formatTime, todayIso } from "@/lib/format";
import type {
  MemberPackageDto,
  PtAvailabilityDto,
  SportDto,
} from "@/lib/types";
import { isRetiredActivityPackage } from "@/features/membership";
import styles from "./coach-profile.module.css";

type CoachDto = {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  bio?: string | null;
  sportIds?: number[];
  /** Optional until the catalog API exposes them; hidden when absent. */
  title?: string | null;
  yearsExperience?: number | null;
  studentCount?: number | null;
  philosophy?: string | null;
};

const WEEK_DAYS = 7;

export function CoachProfile({
  coachId,
  publicView = false,
}: {
  coachId: string;
  publicView?: boolean;
}) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const vi = language === "vi";
  const text = (viText: string, enText: string) => (vi ? viText : enText);
  const from = addDaysIso(todayIso(), 1);
  const to = addDaysIso(from, WEEK_DAYS - 1);

  const coaches = useApi(
    (signal) =>
      api.get<CoachDto[]>("/api/coaches", { signal, anonymous: true }),
    [],
  );
  const ptCoaches = useApi(
    (signal) =>
      api.get<CoachDto[]>("/api/coaches", {
        signal,
        anonymous: true,
        query: { service: "PERSONAL_TRAINING" },
      }),
    [],
  );
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { signal, anonymous: true }),
    [],
  );
  const price = useApi(
    (signal) =>
      api.get<{ pricePerSessionVnd: number }>("/api/pt-pricing", {
        signal,
        anonymous: true,
      }),
    [],
  );
  const packages = useApi(
    (signal) =>
      user?.role === "Member"
        ? api.get<MemberPackageDto[]>("/api/members/me/packages", { signal })
        : Promise.resolve([]),
    [user?.role],
  );
  const packageId = (packages.data ?? []).find(
    (p) =>
      p.isUsable &&
      p.status.toUpperCase() === "ACTIVE" &&
      !isRetiredActivityPackage(p.packageName),
  )?.memberPackageId;
  const week = useApi(
    (signal) =>
      packageId && ptCoaches.data?.some((c) => c.userId === coachId)
        ? api.get<PtAvailabilityDto>(
            "/api/members/me/pt-session-availability",
            {
              signal,
              query: {
                memberPackageId: packageId,
                coachId,
                fromDate: from,
                toDate: to,
              },
            },
          )
        : Promise.resolve(null),
    [packageId, coachId, from, to, ptCoaches.data],
  );

  const days = useMemo(() => {
    const list = Array.from({ length: WEEK_DAYS }, (_, i) =>
      addDaysIso(from, i),
    );
    const byDay = new Map<string, string[]>(list.map((d) => [d, []]));
    for (const slot of week.data?.slots ?? []) {
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(new Date(slot.startAtUtc));
      byDay.get(key)?.push(slot.startAtUtc);
    }
    return list.map((date) => ({ date, slots: byDay.get(date) ?? [] }));
  }, [week.data, from]);

  const bookHref = `/member/training?tab=book&coach=${encodeURIComponent(coachId)}`;
  const bookingHref =
    user?.role === "Member"
      ? bookHref
      : `/login?next=${encodeURIComponent(bookHref)}`;
  const weekday = (iso: string) =>
    new Intl.DateTimeFormat(vi ? "vi-VN" : "en-US", {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`));

  return (
    <div className={styles.page}>
      <Link
        className={styles.back}
        href={publicView ? "/coaches" : "/member/training?tab=book"}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {publicView
          ? text("Quay lại danh sách huấn luyện viên", "Back to coaches")
          : text("Quay lại đặt lịch PT", "Back to PT booking")}
      </Link>
      <AsyncSection state={coaches}>
        {(list) => {
          const coach = list?.find((c) => c.userId === coachId);
          if (!coach)
            return (
              <p role="status" className={styles.empty}>
                {text(
                  "Không tìm thấy huấn luyện viên này.",
                  "This coach could not be found.",
                )}
              </p>
            );
          const isPtCoach = ptCoaches.data?.some((c) => c.userId === coachId);
          const specialties = (sports.data ?? []).filter((s) =>
            coach.sportIds?.includes(s.sportId),
          );
          const facts = [
            coach.yearsExperience != null && {
              icon: CalendarCheck,
              value: `${coach.yearsExperience}+`,
              label: text("năm kinh nghiệm", "years of experience"),
            },
            coach.studentCount != null && {
              icon: Users,
              value: `${coach.studentCount}+`,
              label: text("học viên", "students trained"),
            },
            isPtCoach && {
              icon: Clock,
              value: "90",
              label: text("phút mỗi buổi", "minutes per session"),
            },
          ].filter(Boolean) as {
            icon: typeof Clock;
            value: string;
            label: string;
          }[];
          return (
            <div className={isPtCoach ? styles.layout : styles.layoutSingle}>
              <div className={styles.main}>
                <header className={styles.hero}>
                  <AvatarImage
                    name={coach.fullName}
                    avatarUrl={coach.avatarUrl}
                    size={144}
                    className={styles.avatar}
                  />
                  <div className={styles.heroText}>
                    <p className={styles.eyebrow}>
                      {coach.title ??
                        (isPtCoach
                          ? text("Huấn luyện viên PT", "Personal trainer")
                          : text("Huấn luyện viên", "Coach"))}
                    </p>
                    <h1>{coach.fullName}</h1>
                    {specialties.length > 0 && (
                      <ul
                        className={styles.badges}
                        aria-label={text("Bộ môn", "Specialties")}
                      >
                        {specialties.map((s) => (
                          <li key={s.sportId}>
                            <Dumbbell size={13} aria-hidden="true" />
                            {s.name}
                          </li>
                        ))}
                      </ul>
                    )}
                    <dl className={styles.facts}>
                      {facts.map(({ icon: Icon, value, label }) => (
                        <div key={label}>
                          <Icon size={18} aria-hidden="true" />
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </header>

                <section className={styles.card} aria-labelledby="coach-about">
                  <h3 id="coach-about">
                    {text(
                      "Giới thiệu & triết lý huấn luyện",
                      "About & coaching philosophy",
                    )}
                  </h3>
                  {coach.bio || coach.philosophy ? (
                    <>
                      {coach.bio && <p>{coach.bio}</p>}
                      {coach.philosophy && <p>{coach.philosophy}</p>}
                    </>
                  ) : (
                    <p className={styles.muted}>
                      {text(
                        "Huấn luyện viên chưa cập nhật phần giới thiệu.",
                        "This coach has not added an introduction yet.",
                      )}
                    </p>
                  )}
                </section>

                {isPtCoach && (
                  <section className={styles.card} aria-labelledby="coach-week">
                    <h3 id="coach-week">
                      {text("Lịch trống trong tuần", "Availability this week")}
                    </h3>
                    {!packageId && !packages.loading ? (
                      <p className={styles.muted}>
                        {user?.role === "Member" ? (
                          <>
                            {text(
                              "Cần Membership Gym còn hiệu lực để xem giờ trống.",
                              "An active Gym membership is needed to see open times.",
                            )}{" "}
                            <Link href="/member/services">
                              {text("Chọn Membership", "Choose a membership")}
                            </Link>
                          </>
                        ) : (
                          text(
                            "Đăng nhập tài khoản member để xem giờ trống.",
                            "Sign in as a member to see open times.",
                          )
                        )}
                      </p>
                    ) : week.data?.bookableReason ? (
                      <p className={styles.muted}>
                        {text(
                          "Chưa có lịch PT khả dụng trong tuần này.",
                          "No PT times are available this week.",
                        )}
                      </p>
                    ) : (
                      <AsyncSection state={week}>
                        {() => (
                          <ol className={styles.week}>
                            {days.map((d) => (
                              <li key={d.date} className={styles.day}>
                                <span className={styles.dayHead}>
                                  <strong>{weekday(d.date)}</strong>
                                  <small>
                                    {d.date.slice(8)}/{d.date.slice(5, 7)}
                                  </small>
                                </span>
                                {d.slots.length ? (
                                  <span className={styles.slots}>
                                    {d.slots.slice(0, 4).map((s) => (
                                      <span key={s}>{formatTime(s)}</span>
                                    ))}
                                    {d.slots.length > 4 && (
                                      <em>
                                        +{d.slots.length - 4}{" "}
                                        {text("giờ khác", "more")}
                                      </em>
                                    )}
                                  </span>
                                ) : (
                                  <span className={styles.full}>
                                    {text("Kín lịch", "Fully booked")}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}
                      </AsyncSection>
                    )}
                  </section>
                )}
              </div>

              {isPtCoach && (
                <aside
                  className={styles.bookBar}
                  aria-label={text("Đặt lịch", "Booking")}
                >
                  <div className={styles.priceBlock}>
                    <small>
                      {text("Giá mỗi buổi 90 phút", "Per 90-minute session")}
                    </small>
                    <strong>
                      {price.data
                        ? formatMoney(price.data.pricePerSessionVnd)
                        : "—"}
                    </strong>
                  </div>
                  <Link
                    className={`btn ${styles.bookButton}`}
                    href={bookingHref}
                  >
                    {text("Đặt lịch PT 1-1", "Book 1-on-1 PT")}
                  </Link>
                </aside>
              )}
            </div>
          );
        }}
      </AsyncSection>
    </div>
  );
}
