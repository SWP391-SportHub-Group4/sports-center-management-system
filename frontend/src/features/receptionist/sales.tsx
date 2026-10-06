"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { MemberPicker } from "@/components/MemberPicker";
import { Tabs } from "@/components/primitives";
import { useDeskMember } from "./desk-context";
import { CoursePurchase, PlanSales } from "./front-desk";
import { RegistrationHint } from "./dashboard";
import styles from "./desk.module.css";

/** Bán dịch vụ (H05/H06): giữ hội viên đang chọn; Membership/PT và khóa học dùng checkout dùng chung (OTP khi dùng điểm). */
export function SalesDesk() {
  const { t } = useLanguage();
  const l = t.frontDesk;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { member, setMember } = useDeskMember();
  const tab = params.get("tab") === "courses" ? "courses" : "membership";

  return (
    <div className={styles.work}>
      <MemberPicker
        value={member}
        onChange={setMember}
        emptyHint={<RegistrationHint />}
      />
      {member ? (
        <>
          <p className={styles.hint}>
            {l.salesFor.replace("{name}", member.fullName || member.email)}
          </p>
          <Tabs
            tabs={[
              { id: "membership", label: l.tabMembershipPt },
              { id: "courses", label: l.tabCourses },
            ]}
            value={tab}
            ariaLabel={l.salesTabsLabel}
            onChange={(id) => router.replace(`${pathname}?tab=${id}`)}
          >
            <div className={styles.tabsBody}>
              {tab === "courses" ? (
                <CoursePurchase key={member.userId} memberId={member.userId} />
              ) : (
                <PlanSales key={member.userId} member={member} />
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
