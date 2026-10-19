"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { MemberPicker } from "@/components/MemberPicker";
import { Tabs } from "@/components/primitives";
import { useDeskMember } from "./desk-context";
import { CoursePurchase, PlanSales } from "./front-desk";
import { CourtBookingCalendar } from "@/features/rentals";
import { RegistrationHint } from "./dashboard";
import styles from "./desk.module.css";

/** Bán dịch vụ cho hội viên đang chọn tại quầy. */
export function SalesDesk() {
  const { t, language } = useLanguage();
  const l = t.frontDesk;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { member, setMember } = useDeskMember();
  const requestedTab = params.get("tab");
  const tab =
    requestedTab === "courses" || requestedTab === "courts"
      ? requestedTab
      : "membership";
  const planParam = Number(params.get("plan"));
  const initialPlan =
    Number.isInteger(planParam) && planParam > 0 ? planParam : null;

  return (
    <div className={styles.work}>
      <MemberPicker
        value={member}
        onChange={setMember}
        emptyHint={<RegistrationHint />}
      />
      {member ? (
        <>
          <Tabs
            tabs={[
              { id: "membership", label: l.membership },
              { id: "courses", label: l.tabCourses },
              {
                id: "courts",
                label: language === "vi" ? "Thuê sân" : "Court rental",
              },
            ]}
            value={tab}
            ariaLabel={l.salesTabsLabel}
            onChange={(id) => router.replace(`${pathname}?tab=${id}`)}
          >
            <div className={styles.tabsBody}>
              {tab === "courts" ? (
                <CourtBookingCalendar
                  key={member.userId}
                  memberId={member.userId}
                  memberName={member.fullName || member.email}
                />
              ) : tab === "courses" ? (
                <CoursePurchase key={member.userId} memberId={member.userId} />
              ) : (
                <PlanSales
                  key={`${member.userId}-${initialPlan ?? ""}`}
                  member={member}
                  initialPlan={initialPlan}
                />
              )}
            </div>
          </Tabs>
        </>
      ) : (
        <p className={styles.hint}>{l.salesSelect}</p>
      )}
    </div>
  );
}
