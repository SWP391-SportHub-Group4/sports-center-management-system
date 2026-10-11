"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "@/components/ui";
import { CourseDetail, ThresholdPanel } from "@/features/courses";
import { CourtBookingCalendar } from "@/features/rentals";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { ExplorePackages } from "./explore-packages";
import { MyServices } from "./my-services";
import { SERVICE_KINDS } from "./service-kinds";
import { SubNav, type FilterValue, type HubView } from "./service-ui";
import styles from "./service-hub.module.css";

const TYPES = ["", "all", ...SERVICE_KINDS] as const;
const LEGACY_TYPE: Record<string, FilterValue> = {
  courses: "class",
  gym: "gym",
  pt: "pt",
};
const RESET = {
  type: "",
  sport: "",
  tab: "",
  page: "1",
  rental: "",
  course: "",
  responseId: "",
  section: "",
};

export function MemberServiceHub() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const raw = useUrlQuery({ tab: "", section: "", view: "", type: "" }).values;
  const legacy = raw.tab;
  const { values, setValues } = useUrlQuery(
    {
      section: "",
      view: "explore",
      tab: "",
      page: "1",
      rental: "",
      course: "",
      responseId: "",
      type: "",
      sport: "",
    },
    {
      view: choiceQuery(["explore", "owned"], "explore"),
      type: choiceQuery(TYPES, ""),
    },
  );
  const view: HubView = raw.view
    ? (values.view as HubView)
    : ["gym", "pt", "visits"].includes(legacy)
      ? "owned"
      : "explore";
  const filter: FilterValue =
    (values.type as FilterValue) ||
    LEGACY_TYPE[raw.section] ||
    (legacy === "pt"
      ? "pt"
      : legacy === "gym" || legacy === "visits"
        ? "gym"
        : "all");
  const sportId = /^[1-9]\d{0,5}$/.test(values.sport)
    ? Number(values.sport)
    : null;
  const registeredCourse = view === "owned" && /^[1-9]\d*$/.test(values.course);
  const rentalDetail = values.section === "courts" && !!values.rental;
  const detailDestination = registeredCourse
    ? `/member/schedule?course=${encodeURIComponent(values.course)}`
    : rentalDetail
      ? `/member/schedule?rental=${encodeURIComponent(values.rental)}`
      : null;
  useEffect(() => {
    if (detailDestination) router.replace(detailDestination);
  }, [detailDestination, router]);
  if (detailDestination) return <Loading />;

  const booking = values.section === "courts";
  const exploreCourse = view === "explore" && /^[1-9]\d*$/.test(values.course);

  const goView = (next: HubView) => setValues({ ...RESET, view: next });
  const setFilter = (next: FilterValue) =>
    setValues({
      type: next === "all" ? "" : next,
      section: "",
      sport: next === "class" || next === "all" ? values.sport : "",
      course: "",
      responseId: "",
      tab: "",
    });

  return (
    <div className={styles.hub}>
      <header className={styles.intro}>
        <div>
          <h1>{t.memberPages.services}</h1>
          <p>
            {booking
              ? tx(
                  "Chọn môn, ngày và giờ để tìm sân trống.",
                  "Choose a sport, date and time to find a court.",
                )
              : view === "owned"
                ? tx(
                    "Các gói bạn đang sở hữu, hạn dùng và lịch sử sử dụng.",
                    "What you own, when it expires and how you used it.",
                  )
                : tx(
                    "Chọn gói phù hợp, thanh toán xong dùng ngay.",
                    "Pick a package, pay and start right away.",
                  )}
          </p>
        </div>
        <SubNav
          view={view}
          onChange={goView}
          vi={vi}
          label={tx("Trang dịch vụ", "Services pages")}
        />
      </header>
      <Suspense fallback={<Loading />}>
        {booking ? (
          <div className={styles.stack}>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => setValues({ ...RESET, type: "court" })}
            >
              {tx("← Về khám phá gói", "← Back to packages")}
            </button>
            <CourtBookingCalendar />
          </div>
        ) : values.responseId ? (
          <div className={styles.stack}>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => setValues({ responseId: "" })}
            >
              {tx("← Về lớp của tôi", "← Back to my classes")}
            </button>
            <ThresholdPanel
              key={values.responseId}
              responseId={values.responseId}
            />
          </div>
        ) : exploreCourse ? (
          <div className={styles.stack}>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => setValues({ course: "" })}
            >
              {tx("← Về danh sách lớp", "← Back to classes")}
            </button>
            <CourseDetail key={values.course} classId={Number(values.course)} />
          </div>
        ) : view === "owned" ? (
          <MyServices
            filter={filter}
            onFilter={setFilter}
            tab={values.tab === "interests" ? "interests" : ""}
            onTab={(next) => setValues({ tab: next })}
          />
        ) : (
          <ExplorePackages
            filter={filter}
            onFilter={setFilter}
            sportId={sportId}
          />
        )}
      </Suspense>
    </div>
  );
}
