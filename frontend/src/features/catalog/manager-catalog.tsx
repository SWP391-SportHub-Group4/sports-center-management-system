"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { SportsManager } from "./sports-manager";
import { MembershipManager } from "./membership-manager";
import { PtPricingManager } from "./pt-pricing-manager";
import { CourtRateEditor } from "./court-rate-editor";
type Tab = "sports" | "gym" | "pt" | "court-rates";
function CatalogContent({ defaultTab }: { defaultTab: Tab }) {
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
  return (
    <div className="stack">
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
