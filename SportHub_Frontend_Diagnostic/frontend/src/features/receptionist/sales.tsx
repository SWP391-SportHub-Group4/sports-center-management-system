"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { MemberPicker } from "@/components/MemberPicker";
import {
  ExplorePackages,
  MyServices,
  SubNav,
  type FilterValue,
  type HubView,
} from "@/features/member";
import { CourtBookingCalendar } from "@/features/rentals";
import { useDeskMember } from "./desk-context";
import { RegistrationHint } from "./dashboard";
import styles from "./desk.module.css";

/** Bán dịch vụ cho hội viên đang chọn tại quầy: cùng giao diện "Explore packages" của Member, kèm các gói Member đã có. */
export function SalesDesk() {
  const { t, language } = useLanguage();
  const l = t.frontDesk;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { member, setMember } = useDeskMember();
  const requestedTab = params.get("tab");
  const planParam = Number(params.get("plan"));
  const initialPlan =
    Number.isInteger(planParam) && planParam > 0 ? planParam : null;
  const [view, setView] = useState<HubView>("explore");
  const [filter, setFilter] = useState<FilterValue>(
    requestedTab === "courses"
      ? "class"
      : requestedTab === "membership"
        ? "gym"
        : "all",
  );

  return (
    <div className={styles.salesWork}>
      <MemberPicker
        value={member}
        onChange={setMember}
        emptyHint={<RegistrationHint />}
        hideLabel
      />
      {member && requestedTab !== "courts" && (
        <div className={styles.salesNav}>
          <SubNav
            view={view}
            onChange={setView}
            vi={language === "vi"}
            label={language === "vi" ? "Trang dịch vụ" : "Services pages"}
            labels={{
              owned:
                language === "vi"
                  ? "Dịch vụ của hội viên"
                  : "Member's services",
              explore: language === "vi" ? "Gói dịch vụ" : "Packages",
            }}
          />
        </div>
      )}
      {member ? (
        requestedTab === "courts" ? (
          <CourtBookingCalendar
            key={member.userId}
            memberId={member.userId}
            memberName={member.fullName || member.email}
          />
        ) : view === "owned" ? (
          <MyServices
            key={member.userId}
            filter={filter}
            onFilter={setFilter}
            staffMember={member}
          />
        ) : (
          <ExplorePackages
            key={`${member.userId}-${initialPlan ?? ""}`}
            filter={filter}
            onFilter={setFilter}
            sportId={null}
            staffMember={member}
            initialPlanId={initialPlan}
            onBookCourt={() => router.replace(`${pathname}?tab=courts`)}
          />
        )
      ) : (
        <p className={styles.hint}>{l.salesSelect}</p>
      )}
    </div>
  );
}
