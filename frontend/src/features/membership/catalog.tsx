"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { Button } from "@/components/primitives/Button";
import type { CourseDto, MemberPackageDto, Paged, SportDto } from "@/lib/types";
import { CheckoutPanel } from "@/features/payments";
import {
  catalogContentLanguage,
  parseMembershipCatalog,
} from "./catalog-content";
import styles from "./catalog.module.css";

export function MembershipCatalog({
  purchase = false,
}: {
  purchase?: boolean;
}) {
  const { t, language } = useLanguage();
  const text = (vi: string, en: string) => (language === "vi" ? vi : en);
  const [selected, setSelected] = useState<number | null>(null);
  const state = useApi(
    async (signal) =>
      purchase
        ? parseMembershipCatalog(
            await api.get<unknown>("/api/membership-packages", { signal }),
          )
        : [],
    [purchase],
  );
  const activePackages =
    state.data?.filter((packageItem) => packageItem.isActive) ?? [];
  const programs = useApi(
    async (signal) => {
      if (purchase)
        return { sports: [] as SportDto[], courses: [] as CourseDto[] };
      const [sports, coursePage] = await Promise.all([
        api.get<SportDto[]>("/api/sports", { anonymous: true, signal }),
        api.get<Paged<CourseDto>>("/api/classes", {
          query: { page: 1, pageSize: 100 },
          anonymous: true,
          signal,
        }),
      ]);
      return { sports, courses: coursePage.items };
    },
    [purchase],
  );
  const activeSports = (programs.data?.sports ?? []).filter(
    (sport) => sport.isActive,
  );
  const coursesBySport = (sportId: number) =>
    (programs.data?.courses ?? []).filter(
      (course) =>
        course.sportId === sportId &&
        course.status === "PUBLISHED" &&
        course.availableSeats > 0,
    );
  const sportLabel = (sport: SportDto) => {
    if (/badminton|cầu\s*lông/i.test(sport.name))
      return text("Cầu lông", "Badminton");
    if (/basketball|bóng\s*rổ/i.test(sport.name))
      return text("Bóng rổ", "Basketball");
    if (/pt|personal training/i.test(sport.name))
      return text("Huấn luyện cá nhân", "Personal training");
    if (/gym|fitness|conditioning|thể lực/i.test(sport.name))
      return text("Gym & thể lực", "Gym & conditioning");
    return sport.name;
  };
  return (
    <section
      id="programs"
      className={`${styles.catalog} ${!purchase ? styles.publicCatalog : ""}`}
      aria-busy={purchase ? state.loading : programs.loading}
    >
      {purchase && (
        <h2>{text("Gói Gym đang mở bán", "Gym membership packages")}</h2>
      )}
      {purchase && state.loading ? (
        <p role="status">
          {text("Đang tải danh mục gói…", "Loading available packages…")}
        </p>
      ) : purchase && state.error ? (
        <div role="alert">
          <p>
            {state.error.status === 429
              ? text(
                  "Bạn tải danh mục quá nhiều lần. Vui lòng đợi một chút rồi thử lại.",
                  "Too many requests. Please wait a moment before reloading the packages.",
                )
              : state.error.status === 401 || state.error.status === 403
                ? text(
                    "Hiện bạn chưa thể truy cập danh mục này. Bạn có thể xem khóa học hoặc thử lại sau.",
                    "You cannot access this catalog right now. You can explore programs or try again later.",
                  )
                : text(
                    "Chưa tải được danh mục gói. Thử lại để xem giá và điều kiện mua.",
                    "We could not load the packages. Try again to see prices and purchase conditions.",
                  )}
          </p>
          <Button variant="secondary" onClick={state.reload}>
            {text("Tải lại danh mục", "Reload packages")}
          </Button>
          {purchase && state.error.status === 401 && (
            <p>
              <Link href="/login?next=%2Fmember%2Fmy-plans">
                {text(
                  "Đăng nhập lại để chọn gói",
                  "Sign in again to choose a package",
                )}
              </Link>
            </p>
          )}
          <p>
            <Link href="/#activities">
              {text("Xem các môn tập", "Explore programs")}
            </Link>
          </p>
        </div>
      ) : purchase && !activePackages.length ? (
        <p role="status">
          {text(
            "Hiện chưa có gói đang mở bán. Bạn có thể xem các môn tập đang hoạt động.",
            "No packages are available right now. You can explore active programs.",
          )}{" "}
          <Link href="/#activities">
            {text("Xem các môn tập", "Explore programs")}
          </Link>
        </p>
      ) : (
        <>
          {purchase ? (
            <div className="refactor-grid">
              {activePackages.map((p) => (
                <Card
                  key={p.packageId}
                  title={
                    <h3
                      lang={catalogContentLanguage(p.name, p.nameLanguage)}
                      dir="auto"
                    >
                      {p.name}
                    </h3>
                  }
                >
                  <p>
                    {formatMoney(p.price)} · {p.durationDays} {t.refactor.days}
                  </p>
                  {p.description?.trim() ? (
                    <p
                      lang={catalogContentLanguage(
                        p.description,
                        p.descriptionLanguage,
                      )}
                      dir="auto"
                    >
                      {p.description}
                    </p>
                  ) : (
                    <p>
                      {text(
                        "Trung tâm chưa cung cấp mô tả. Kiểm tra quyền lợi trước khi mua.",
                        "The center has not provided a description. Check the benefits before buying.",
                      )}
                    </p>
                  )}
                  <button onClick={() => setSelected(p.packageId)}>
                    {text("Kiểm tra & thanh toán", "Review & checkout")}
                  </button>
                </Card>
              ))}
            </div>
          ) : null}
        </>
      )}
      {!purchase && (
        <>
          {programs.loading ? (
            <p role="status">
              {text("Đang tải lớp đang mở…", "Loading available classes…")}
            </p>
          ) : programs.error ? (
            <p role="status">
              {text(
                "Chưa tải được danh sách khóa học. Bạn vẫn có thể xem các môn tập.",
                "Course prices could not be loaded. You can still explore the sports.",
              )}{" "}
              <Link href="/#activities">
                {text("Xem môn tập", "Explore sports")}
              </Link>
            </p>
          ) : (
            <div className={styles.publicSportGrid}>
              {activeSports.map((sport, index) => {
                const sportCourses = coursesBySport(sport.sportId);
                return (
                  <article
                    className={styles.publicSportCard}
                    key={sport.sportId}
                  >
                    <span className={styles.publicPlanIndex}>
                      {String(index + 1).padStart(2, "0")}
                      <span aria-hidden="true"> / </span>
                      {sport.operationType === "GROUP_COURSE"
                        ? text("KHÓA HỌC", "COURSES")
                        : sport.operationType === "ONE_ON_ONE"
                          ? text("HUẤN LUYỆN CÁ NHÂN", "PERSONAL TRAINING")
                          : text("THỂ LỰC", "CONDITIONING")}
                    </span>
                    <h3>{sportLabel(sport)}</h3>
                    {sport.operationType === "GROUP_COURSE" &&
                    sportCourses.length ? (
                      <ul className={styles.sportCourseList}>
                        {sportCourses.slice(0, 3).map((course) => (
                          <li key={course.classId}>
                            <div className={styles.sportCourseTitle}>
                              <strong>{course.name}</strong>
                              <span>{formatMoney(course.price)}</span>
                            </div>
                            <p>
                              {course.numSessions} {text("buổi", "sessions")}
                              {course.scheduleRules.length > 0 &&
                                ` · ${course.scheduleRules
                                  .map(
                                    (rule) =>
                                      `${text(["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"][rule.dayOfWeek] ?? "", ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][rule.dayOfWeek] ?? "")} ${rule.startTimeLocal}`,
                                  )
                                  .join(" / ")}`}
                              {` · ${course.availableSeats} ${text("chỗ", "spots")}`}
                            </p>
                            <Link href={`/courses/${course.classId}`}>
                              {text("Xem khóa học", "View course")}{" "}
                              <span aria-hidden="true">↗</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : sport.operationType === "GROUP_COURSE" ? (
                      <p className={styles.noCourseCopy}>
                        {text(
                          "Chưa có khóa học mở đăng ký. Xem lịch lớp mới nhất tại trang môn tập.",
                          "No open courses at the moment. Check the sport page for the latest schedule.",
                        )}
                      </p>
                    ) : (
                      <p className={styles.noCourseCopy}>
                        {sport.operationType === "ONE_ON_ONE"
                          ? text(
                              "Huấn luyện cá nhân 1 kèm 1 theo lịch hẹn riêng, tập trung vào mục tiêu và tiến độ của bạn.",
                              "One-to-one coaching by appointment, tailored to your goals and progress.",
                            )
                          : text(
                              "Khu tập Gym tự do để rèn sức mạnh, sức bền và thể lực tổng quát.",
                              "Open Gym training for strength, endurance, and overall conditioning.",
                            )}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      {selected && (
        <CheckoutPanel
          key={selected}
          intent={{
            kind: "membership",
            body: { packageId: selected, allowStacking: false },
          }}
        />
      )}
      {purchase && <p>{t.refactor.ptSeparate}</p>}
    </section>
  );
}
interface PtQuote {
  memberPackageId: string;
  coachId: string;
  frequencyPerWeek: number;
  totalQuota: number;
  pricePerSession: number;
  totalPrice: number;
  priceVersion: string;
  validityEndDate: string;
}
export function PtPurchase({
  packages,
  memberId,
}: {
  packages: MemberPackageDto[];
  memberId?: string;
}) {
  const { t } = useLanguage();
  const [packageId, setPackage] = useState("");
  const [coachId, setCoach] = useState("");
  const [frequency, setFrequency] = useState(1);
  const [quote, setQuote] = useState<PtQuote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { anonymous: true, signal }),
    [],
  );
  const ptSport = sports.data?.find((s) => s.operationType === "ONE_ON_ONE");
  const coaches = useApi(
    (signal) =>
      ptSport
        ? api.get<{ userId: string; fullName: string }[]>("/api/coaches", {
            signal,
            query: { sportId: ptSport.sportId },
          })
        : Promise.resolve([]),
    [ptSport?.sportId],
  );
  return (
    <Card title={t.refactor.pt}>
      <p>{t.refactor.ptSeparate}</p>
      <label>
        {t.refactor.gym}
        <select
          value={packageId}
          onChange={(e) => {
            setPackage(e.target.value);
            setQuote(null);
          }}
        >
          <option value="">—</option>
          {packages
            .filter((p) => p.isUsable && p.status === "ACTIVE")
            .map((p) => (
              <option key={p.memberPackageId} value={p.memberPackageId}>
                {p.packageName} · {formatDate(p.endDate)}
              </option>
            ))}
        </select>
      </label>
      <label>
        {t.refactor.coach}
        <select
          value={coachId}
          onChange={(e) => {
            setCoach(e.target.value);
            setQuote(null);
          }}
        >
          <option value="">—</option>
          {coaches.data?.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.fullName}
            </option>
          ))}
        </select>
      </label>
      {coaches.error && <p role="alert">{coaches.error.message}</p>}
      <label>
        {t.refactor.frequency}
        <select
          value={frequency}
          onChange={(e) => {
            setFrequency(Number(e.target.value));
            setQuote(null);
          }}
        >
          {[1, 2, 3].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn btn--secondary"
        disabled={busy || !packageId || !coachId}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setQuote(
              await api.post<PtQuote>("/api/checkouts/pt/quote", {
                memberPackageId: packageId,
                coachId,
                frequencyPerWeek: frequency,
                targetMemberId: memberId,
              }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t.refactor.quote}
      </button>
      {error && <p role="alert">{error}</p>}
      {quote && (
        <>
          <p>
            {quote.totalQuota} {t.refactor.quota} ×{" "}
            {formatMoney(quote.pricePerSession)} ={" "}
            {formatMoney(quote.totalPrice)} ·{" "}
            {formatDate(quote.validityEndDate)}
          </p>
          <CheckoutPanel
            key={`${packageId}-${coachId}-${frequency}-${quote.priceVersion}`}
            memberId={memberId}
            intent={{
              kind: "pt",
              body: {
                memberPackageId: packageId,
                coachId,
                frequencyPerWeek: frequency,
                priceVersion: quote.priceVersion,
                targetMemberId: memberId,
              },
            }}
          />
        </>
      )}
    </Card>
  );
}
