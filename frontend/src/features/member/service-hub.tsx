"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, MapPin, ChevronRight } from "lucide-react";
import { Tabs } from "@/components/primitives";
import { AsyncSection, Loading } from "@/components/ui";
import {
  CourseCatalog,
  CourseDetail,
  ThresholdPanel,
  CourseSticker,
} from "@/features/courses";
import {
  MembershipCatalog,
  isRetiredActivityPackage,
} from "@/features/membership";
import { CourtBookingCalendar } from "@/features/rentals";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDate } from "@/lib/format";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import type { MemberPackageDto } from "@/lib/types";
import { MemberCourses } from "./courses";
import { MemberServices } from "./services";
import { GymStatusSticker } from "./gym-status-sticker";
import styles from "./service-hub.module.css";

const SECTIONS = ["courses", "gym", "pt", "courts"] as const;

export function MemberServiceHub() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const raw = useUrlQuery({ tab: "", section: "", view: "" }).values;
  const legacy = raw.tab;
  const legacySection =
    legacy === "pt"
      ? "pt"
      : legacy === "gym" || legacy === "visits"
        ? "gym"
        : "courses";
  const { values, setValues } = useUrlQuery(
    {
      section: "courses",
      view: "explore",
      tab: "",
      page: "1",
      rental: "",
      course: "",
      responseId: "",
    },
    {
      section: choiceQuery(SECTIONS, "courses"),
      view: choiceQuery(["explore", "owned"], "explore"),
    },
  );
  const packages = useApi(
    async (signal) =>
      (
        await api.get<MemberPackageDto[]>("/api/members/me/packages", {
          signal,
        })
      ).filter((row) => !isRetiredActivityPackage(row.packageName)),
    [],
  );
  const section = raw.section ? values.section : legacySection;
  const view = raw.view
    ? values.view
    : ["gym", "pt", "visits"].includes(legacy)
      ? "owned"
      : "explore";
  const registeredCourse =
    section === "courses" &&
    view === "owned" &&
    /^[1-9]\d*$/.test(values.course);
  const rentalDetail = section === "courts" && !!values.rental;
  const detailDestination = registeredCourse
    ? `/member/schedule?course=${encodeURIComponent(values.course)}`
    : rentalDetail
      ? `/member/schedule?rental=${encodeURIComponent(values.rental)}`
      : null;
  useEffect(() => {
    if (detailDestination) router.replace(detailDestination);
  }, [detailDestination, router]);
  const owned = view === "owned" && legacy === "visits";
  if (detailDestination) return <Loading />;
  return (
    <div className={styles.hub}>
      <header className={styles.intro}>
        <div>
          <h1>{t.memberPages.services}</h1>
          <p>
            {section === "courts"
              ? vi
                ? "Chọn môn, ngày và giờ để tìm sân trống."
                : "Choose a sport, date and time to find a court."
              : vi
                ? "Đăng ký lớp học, chọn Membership Gym hoặc đặt sân theo lịch của bạn."
                : "Register for classes, choose a Gym membership or book a court on your schedule."}
          </p>
        </div>
        <div className={styles.sticker} aria-hidden="true">
          <CourseSticker
            sport={
              section === "courses"
                ? "Cầu lông"
                : section === "courts"
                  ? "Bóng rổ"
                  : "Gym"
            }
            compact
          />
        </div>
      </header>
      <Tabs
        ariaLabel={t.memberPages.services}
        value={section === "courts" ? "courts" : "training"}
        tabs={[
          {
            id: "training",
            label: (
              <span className={styles.categoryLabel}>
                <span className={styles.categoryIcon}>
                  <BookOpen size={24} aria-hidden="true" />
                </span>
                <span className={styles.categoryCopy}>
                  <strong>
                    {vi ? "Khóa học & gói tập" : "Classes & packages"}
                  </strong>
                  <span>
                    {vi
                      ? "Lớp học và Membership Gym"
                      : "Classes and Gym membership"}
                  </span>
                </span>
                <ChevronRight
                  className={styles.categoryArrow}
                  size={20}
                  aria-hidden="true"
                />
              </span>
            ),
          },
          {
            id: "courts",
            label: (
              <span className={styles.categoryLabel}>
                <span className={styles.categoryIcon}>
                  <MapPin size={24} aria-hidden="true" />
                </span>
                <span className={styles.categoryCopy}>
                  <strong>{vi ? "Đặt sân" : "Courts"}</strong>
                  <span>
                    {vi
                      ? "Chọn sân và khung giờ trống"
                      : "Find a court and available time"}
                  </span>
                </span>
                <ChevronRight
                  className={styles.categoryArrow}
                  size={20}
                  aria-hidden="true"
                />
              </span>
            ),
          },
        ]}
        onChange={(section) =>
          setValues({
            section: section === "training" ? "courses" : section,
            view: "explore",
            tab: "",
            page: "1",
            rental: "",
            course: "",
            responseId: "",
          })
        }
      >
        <Suspense fallback={<Loading />}>
          {section === "courses" && values.responseId ? (
            <div className="stack">
              <button
                className="btn btn--quiet"
                onClick={() => setValues({ responseId: "" })}
              >
                {vi ? "Trở về lớp của tôi" : "Back to my classes"}
              </button>
              <ThresholdPanel
                key={values.responseId}
                responseId={values.responseId}
              />
            </div>
          ) : section === "courses" && /^[1-9]\d*$/.test(values.course) ? (
            <div className="stack">
              <button
                className="btn btn--quiet"
                onClick={() => setValues({ course: "" })}
              >
                {vi ? "Trở về danh sách lớp" : "Back to classes"}
              </button>
              <CourseDetail
                key={values.course}
                classId={Number(values.course)}
              />
            </div>
          ) : section === "courts" ? (
            <CourtBookingCalendar />
          ) : (
            <div className={styles.board}>
              <section
                className={styles.coursePanel}
                aria-labelledby="services-classes"
              >
                <h2 id="services-classes">{vi ? "Lớp học" : "Classes"}</h2>
                {owned ? (
                  <MemberCourses />
                ) : (
                  <CourseCatalog
                    detailBasePath="/member/services"
                    compact
                    pageSize={2}
                    registrationOnly
                  />
                )}
              </section>
              <div className={styles.packagePanels}>
                <section
                  className={styles.gymPanel}
                  aria-labelledby="services-gym"
                >
                  <h2 id="services-gym">Membership</h2>
                  {packages.data && (
                    <GymStatusSticker
                      state={
                        packages.data.some(
                          (row) =>
                            row.status.toUpperCase() === "ACTIVE" &&
                            row.isUsable,
                        )
                          ? "active"
                          : packages.data.some(
                                (row) => row.status.toUpperCase() === "ACTIVE",
                              )
                            ? "purchased"
                            : packages.data.some(
                                  (row) =>
                                    row.status.toUpperCase() ===
                                    "PENDING_PAYMENT",
                                )
                              ? "pending"
                              : "available"
                      }
                    />
                  )}
                  {owned ? (
                    <MemberServices
                      compact
                      section="gym"
                      showVisits={legacy === "visits"}
                    />
                  ) : (
                    <AsyncSection state={packages}>
                      {(rows) => {
                        const current = rows.filter(
                          (row) =>
                            row.status.toUpperCase() === "PENDING_PAYMENT" ||
                            row.status.toUpperCase() === "ACTIVE",
                        );
                        return current.length ? (
                          <div className={styles.ownedPackages}>
                            {current.map((row) => (
                              <article
                                key={row.memberPackageId}
                                className={styles.ownedPackage}
                              >
                                <span className={styles.ownership}>
                                  {row.status.toUpperCase() ===
                                  "PENDING_PAYMENT"
                                    ? vi
                                      ? "Chờ thanh toán"
                                      : "Awaiting payment"
                                    : row.isUsable
                                      ? vi
                                        ? "Đang sử dụng"
                                        : "Active membership"
                                      : vi
                                        ? "Đã đăng ký"
                                        : "Purchased"}
                                </span>
                                <h3>{row.packageName}</h3>
                                <p>
                                  {formatDate(row.startDate)} –{" "}
                                  {formatDate(row.endDate)}
                                </p>
                                {row.isUsable && (
                                  <p>
                                    {vi
                                      ? "Quyền truy cập khu tập Gym đang có hiệu lực."
                                      : "Your Gym access is active."}
                                  </p>
                                )}
                              </article>
                            ))}
                          </div>
                        ) : (
                          <MembershipCatalog
                            purchase
                            owned={rows}
                            compact
                            dense
                            paymentModal
                          />
                        );
                      }}
                    </AsyncSection>
                  )}
                </section>
                <section
                  className={styles.ptPanel}
                  aria-labelledby="services-pt"
                >
                  <h2 id="services-pt">
                    {vi ? "Huấn luyện cá nhân" : "Personal training"}
                  </h2>
                  <p className="muted">
                    {vi
                      ? "Chọn coach, đặt lịch và thanh toán từng buổi 90 phút tại Training."
                      : "Choose a coach, book and pay per 90-minute session in Training."}
                  </p>
                  <Link
                    className="btn btn--secondary"
                    href="/member/training?tab=book"
                  >
                    {vi ? "Đặt lịch & thanh toán PT" : "Book & pay for PT"}
                  </Link>
                </section>
              </div>
            </div>
          )}
        </Suspense>
      </Tabs>
    </div>
  );
}
