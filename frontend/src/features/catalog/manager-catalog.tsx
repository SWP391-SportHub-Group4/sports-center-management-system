"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { SportsManager } from "./sports-manager";
import { MembershipManager } from "./membership-manager";
import { PtPricingManager } from "./pt-pricing-manager";
import { CourtRateEditor } from "./court-rate-editor";
import styles from "./manager-catalog.module.css";
type Tab = "sports" | "gym" | "pt" | "court-rates";
function CatalogContent({ defaultTab }: { defaultTab: Tab }) {
  const { t } = useLanguage();
  const c = t.managerCatalog;
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab =
    requested === "membership-plans"
      ? "gym"
      : requested === "rates"
        ? "court-rates"
        : requested === "sports" ||
            requested === "gym" ||
            requested === "pt" ||
            requested === "court-rates"
          ? requested
          : defaultTab;
  const tabs: { id: Tab; label: string }[] = [
    { id: "sports", label: t.operations.sports },
    { id: "gym", label: c.gymPackages },
    { id: "pt", label: c.ptPricing },
    { id: "court-rates", label: t.operations.rates },
  ];
  return (
    <div className="stack">
      <nav className={styles.tabs} aria-label={c.title}>
        {tabs.map((item) => (
          <Link
            key={item.id}
            className={styles.tab}
            aria-current={tab === item.id ? "page" : undefined}
            href={"/manager/catalog?tab=" + item.id}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "sports" ? (
        <SportsManager />
      ) : tab === "gym" ? (
        <MembershipManager />
      ) : tab === "pt" ? (
        <PtPricingManager />
      ) : (
        <CourtRateEditor />
      )}
    </div>
  );
}
export function ManagerCatalog({
  defaultTab = "sports",
}: {
  defaultTab?: Tab;
}) {
  const { t } = useLanguage();
  return (
    <AppShell
      title={t.managerCatalog.title}
      allow={["CenterManager"]}
      operationalLayout
    >
      <Suspense fallback={<Loading />}>
        <CatalogContent defaultTab={defaultTab} />
      </Suspense>
    </AppShell>
  );
}
