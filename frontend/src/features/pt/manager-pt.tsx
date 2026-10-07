"use client";

import { Tabs } from "@/components/primitives";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { operationsStyles as styles } from "@/features/operations";
import { ManagerRelationships } from "./manager-relationships";
import { PtSessions } from "./pt-sessions";
import { PtChangeRequestPanel } from "./pt-change-request-panel";
import { ptApi } from "./api";

const TABS = ["relationships", "sessions", "requests"] as const;
type Tab = (typeof TABS)[number];

const pending = (rows: { status: string }[] | null) =>
  (rows ?? []).filter((r) => r.status.toUpperCase() === "PENDING").length;

/** Vận hành PT của Manager: quan hệ Coach–Member, buổi PT và hàng đợi yêu cầu, một trang ba tab. */
export function ManagerPt() {
  const { t } = useLanguage();
  const l = t.ptOps;
  const { values, setValues } = useUrlQuery(
    { tab: "sessions" },
    { tab: choiceQuery([...TABS], "sessions") },
  );
  const tab = values.tab as Tab;
  // Số yêu cầu chờ duyệt hiện ngay trên tab để Manager không phải mở từng hàng đợi.
  const sessionRequests = useApi(
    (signal) => ptApi.requests(false, 1, signal),
    [],
  );
  const coachRequests = useApi((signal) => ptApi.requests(true, 1, signal), []);
  const waiting = pending(sessionRequests.data) + pending(coachRequests.data);
  const labels: Record<Tab, string> = {
    relationships: l.tabRelationships,
    sessions: l.tabManagerSessions,
    requests:
      waiting > 0
        ? l.tabRequestsCount.replace("{n}", String(waiting))
        : l.tabRequests,
  };
  return (
    <div className={styles.workspace}>
      <Tabs
        tabs={TABS.map((id) => ({ id, label: labels[id] }))}
        value={tab}
        ariaLabel={l.managerTabsLabel}
        onChange={(id) => setValues({ tab: id })}
      >
        <div className={styles.workspace}>
          {tab === "relationships" && <ManagerRelationships />}
          {tab === "sessions" && <PtSessions manager />}
          {tab === "requests" && <PtChangeRequestPanel />}
        </div>
      </Tabs>
    </div>
  );
}
