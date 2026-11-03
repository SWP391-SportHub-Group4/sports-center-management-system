"use client";

import Link from "next/link";
import { api } from "@/lib/apiClient";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import type {
  CourseDto,
  GymCheckInDto,
  MemberTrainingProfileDto,
  Paged,
} from "@/lib/types";
import { pagedItems } from "@/lib/paged";
import { isCourseOpenForRegistration } from "@/features/courses";
import { rentalApi } from "@/features/rentals";
import { GOAL_TYPES } from "@/features/training";
import { memberSchedule } from "./api";
import styles from "./overview-widgets.module.css";

function useTx() {
  const { language } = useLanguage();
  const vi = language === "vi";
  return { vi, tx: (v: string, e: string) => (vi ? v : e) };
}

function monthBounds() {
  const today = todayIso();
  const start = `${today.slice(0, 7)}-01`;
  const days =
    Math.round(
      (Date.parse(`${today}T00:00:00+07:00`) -
        Date.parse(`${start}T00:00:00+07:00`)) /
        86_400_000,
    ) + 1;
  return { today, start, days };
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      className={styles.bar}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-label={label}
    >
      <span
        style={{
          transform: `scaleX(${Math.min(100, Math.max(0, value)) / 100})`,
        }}
      />
    </div>
  );
}

/** Mini-dashboard for this month: classes attended, court rentals played, progress against the weekly goal. */
export function TrainingSummaryCard() {
  const { tx } = useTx();
  const { start, days } = monthBounds();
  const classes = useApi(
    (signal) => memberSchedule(start, days, signal),
    [start, days],
  );
  const rentals = useApi(
    (signal) =>
      rentalApi.mine(
        new Date(`${start}T00:00:00+07:00`).toISOString(),
        new Date().toISOString(),
        signal,
      ),
    [start],
  );
  const profile = useApi(
    (signal) =>
      api
        .get<MemberTrainingProfileDto | null>(
          "/api/members/me/training-profile",
          { signal },
        )
        .catch(() => null),
    [],
  );
  const gym = useApi(
    (signal) =>
      api
        .get<Paged<GymCheckInDto>>("/api/members/me/gym-checkins", {
          signal,
          query: { page: 1, pageSize: 1 },
        })
        .catch(() => null),
    [],
  );

  const attended = (classes.data ?? []).filter(
    (s) =>
      s.type === "CLASS_SESSION" &&
      s.attendanceStatus?.toUpperCase() === "PRESENT",
  );
  const played = (rentals.data ?? []).filter((r) => r.status === "COMPLETED");
  const done = attended.length + played.length;
  const perWeek = profile.data?.trainingDaysPerWeek ?? null;
  const target = perWeek ? perWeek * 4 : null;
  const percent = target ? Math.min(100, Math.round((done / target) * 100)) : 0;

  const last = [
    ...attended.map((s) => s.startAtUtc),
    ...played.map((r) => r.startAtUtc),
    ...pagedItems(gym.data).map((g) => g.checkInTime),
  ].sort((a, b) => b.localeCompare(a))[0];

  const loading = classes.loading || rentals.loading;
  const failed = !!classes.error || !!rentals.error;

  return (
    <section className={styles.card} aria-labelledby="ov-training">
      <div className={styles.head}>
        <h2 id="ov-training">
          {tx("Tổng quan luyện tập", "Training summary")}
        </h2>
        <Link href="/member/schedule">{tx("Lịch của tôi", "My schedule")}</Link>
      </div>
      {failed ? (
        <p className={styles.muted} role="status">
          {tx(
            "Chưa tải được dữ liệu luyện tập.",
            "Training data is unavailable.",
          )}
        </p>
      ) : (
        <>
          <div className={styles.split}>
            <div className={styles.metric}>
              <strong>{loading ? "…" : attended.length}</strong>
              <span>{tx("Lớp học", "Classes")}</span>
            </div>
            <div className={styles.metric}>
              <strong>{loading ? "…" : played.length}</strong>
              <span>{tx("Thuê sân", "Court rentals")}</span>
            </div>
          </div>
          {target ? (
            <div className={styles.goal}>
              <div className={styles.goalRow}>
                <span>
                  {tx(
                    "Lớp và lượt thuê sân đã hoàn thành",
                    "Completed classes and court rentals",
                  )}
                </span>
                <strong>
                  {done} / {target} {tx("buổi", "sessions")} · {percent}%
                </strong>
              </div>
              <ProgressBar
                value={percent}
                label={tx("Tiến độ mục tiêu tháng", "Monthly goal progress")}
              />
              <p className={styles.goalHint}>
                {tx(
                  `Mục tiêu ${target} buổi/tháng = ${perWeek} ngày tập/tuần trong hồ sơ thể chất × 4 tuần.`,
                  `${target}-session monthly target = ${perWeek} training days/week in your fitness profile × 4 weeks.`,
                )}
              </p>
            </div>
          ) : (
            <p className={styles.muted}>
              {tx(
                "Đặt số ngày tập mỗi tuần trong hồ sơ thể chất để theo dõi mục tiêu tháng.",
                "Set your training days per week in your fitness profile to track a monthly goal.",
              )}
            </p>
          )}
          <p className={styles.note}>
            {last
              ? `${tx("Lần tập gần nhất", "Last activity")}: ${formatDate(last)}`
              : tx(
                  "Chưa có buổi tập nào ghi nhận.",
                  "No activity recorded yet.",
                )}
          </p>
        </>
      )}
    </section>
  );
}

const BMI_TONE: Record<string, string> = {
  UNDERWEIGHT: "warn",
  NORMAL: "ok",
  OVERWEIGHT: "warn",
  OBESE: "danger",
};

/** Quick view of the fitness profile set on the Training page. */
export function FitnessQuickCard() {
  const { vi, tx } = useTx();
  const profile = useApi(
    (signal) =>
      api
        .get<MemberTrainingProfileDto | null>(
          "/api/members/me/training-profile",
          { signal },
        )
        .catch(() => null),
    [],
  );
  const data = profile.data;
  const goal = GOAL_TYPES.find((g) => g.value === data?.goalType);
  const category = (data?.bmiCategory ?? "").toUpperCase();
  const categoryText: Record<string, [string, string]> = {
    UNDERWEIGHT: ["Thiếu cân", "Underweight"],
    NORMAL: ["Bình thường", "Normal"],
    OVERWEIGHT: ["Thừa cân", "Overweight"],
    OBESE: ["Béo phì", "Obese"],
  };
  const pair = categoryText[category];

  return (
    <section className={styles.card} aria-labelledby="ov-fitness">
      <div className={styles.head}>
        <h2 id="ov-fitness">{tx("Hồ sơ thể chất", "Fitness profile")}</h2>
      </div>
      {profile.loading ? (
        <p className={styles.muted}>…</p>
      ) : data && (data.bmi || goal) ? (
        <div className={styles.badges}>
          {data.bmi !== null && (
            <span
              className={styles.badge}
              data-tone={BMI_TONE[category] ?? "ok"}
            >
              BMI {data.bmi.toFixed(1)} kg/m²
              {pair ? ` · ${vi ? pair[0] : pair[1]}` : ""}
            </span>
          )}
          {goal && (
            <span className={styles.badge} data-tone="goal">
              {tx("Mục tiêu", "Goal")}: {vi ? goal.vi : goal.en}
            </span>
          )}
        </div>
      ) : (
        <p className={styles.muted}>
          {tx(
            "Bạn chưa thiết lập hồ sơ thể chất.",
            "You have not set up your fitness profile yet.",
          )}
        </p>
      )}
      <Link className={styles.link} href="/member/training?tab=profile">
        {data
          ? tx("Cập nhật chỉ số →", "Update your measurements →")
          : tx("Thiết lập hồ sơ →", "Set up profile →")}
      </Link>
    </section>
  );
}

/** One or two open classes, preferring the sports the member already trains. */
export function RecommendedSection({
  favoriteSports,
}: {
  favoriteSports: string[];
}) {
  const { tx } = useTx();
  const courses = useApi(
    async (signal) =>
      (
        await api.get<Paged<CourseDto>>("/api/classes", {
          query: { page: 1, pageSize: 100 },
          anonymous: true,
          signal,
        })
      ).items.filter(
        (c) =>
          isCourseOpenForRegistration(c, Date.now()) && c.availableSeats > 0,
      ),
    [],
  );
  const favorites = favoriteSports.map((s) => s.toLowerCase());
  const picks = [...(courses.data ?? [])]
    .sort((a, b) => {
      const fa = favorites.includes(a.sportName.toLowerCase()) ? 0 : 1;
      const fb = favorites.includes(b.sportName.toLowerCase()) ? 0 : 1;
      return (
        fa - fb ||
        (a.firstSessionStartUtc ?? a.startDate).localeCompare(
          b.firstSessionStartUtc ?? b.startDate,
        )
      );
    })
    .slice(0, 2);

  if (courses.loading || courses.error || picks.length === 0) return null;
  return (
    <section className={styles.recommended} aria-labelledby="ov-recommended">
      <div className={styles.head}>
        <h2 id="ov-recommended">
          {tx("Gợi ý cho bạn", "Recommended for you")}
        </h2>
        <Link href="/member/services?section=courses&view=explore">
          {tx("Xem tất cả", "See all")}
        </Link>
      </div>
      <ul className={styles.recoList}>
        {picks.map((c) => (
          <li key={c.classId} className={styles.reco}>
            <span className={styles.sportTag}>{c.sportName}</span>
            <h3>{c.name}</h3>
            <p className={styles.muted}>
              {tx("Khai giảng", "Starts")}{" "}
              {formatDate(c.firstSessionStartUtc ?? c.startDate)} ·{" "}
              {c.numSessions} {tx("buổi", "sessions")}
              {c.coachName ? ` · ${c.coachName}` : ""}
            </p>
            <p className={styles.muted}>
              {tx("Còn", "")} {c.availableSeats} {tx("chỗ", "seats left")}
            </p>
            <div className={styles.recoFoot}>
              <strong>{formatMoney(c.price)}</strong>
              <Link
                className={styles.cta}
                href="/member/services?section=courses&view=explore"
              >
                {tx("Đăng ký ngay", "Register now")}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
