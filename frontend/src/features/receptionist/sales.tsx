"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { MemberPicker } from "@/components/MemberPicker";
import { ExplorePackages, type FilterValue } from "@/features/member";
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
  const [filter, setFilter] = useState<FilterValue>(
    requestedTab === "courses"
      ? "class"
      : requestedTab === "membership"
        ? "gym"
        : "all",
  );

  return (
    <div className={styles.work}>
      <MemberPicker
        value={member}
        onChange={setMember}
        emptyHint={<RegistrationHint />}
      />
      {member ? (
        requestedTab === "courts" ? (
          <>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => router.replace(`${pathname}?tab=all`)}
            >
              {language === "vi" ? "← Quay lại danh sách gói" : "← Back to packages"}
            </button>
            <CourtBookingCalendar
              key={member.userId}
              memberId={member.userId}
              memberName={member.fullName || member.email}
            />
          </>
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
