"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { SportsManager } from "./sports-manager";
import { MembershipManager } from "./membership-manager";
import { CourtRateEditor } from "./court-rate-editor";
type Tab = "sports" | "gym" | "court-rates";
function CatalogContent({ defaultTab }: { defaultTab: Tab }) {
  const { t } = useLanguage();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab =
    requested === "membership-plans"
      ? "gym"
      : requested === "rates"
        ? "court-rates"
        : requested === "sports" ||
            requested === "gym" ||
            requested === "court-rates"
          ? requested
          : defaultTab;
  return (
    <AppShell
      title={
        tab === "sports"
          ? t.operations.sports
          : tab === "gym"
            ? t.navigation.items.membershipPlans
            : t.operations.rates
      }
      allow={["CenterManager"]}
      operationalLayout
    >
      <div className="stack">
        {tab === "sports" ? (
          <SportsManager />
        ) : tab === "gym" ? (
          <MembershipManager />
        ) : (
          <CourtRateEditor />
        )}
      </div>
    </AppShell>
  );
}
export function ManagerCatalog({
  defaultTab = "sports",
}: {
  defaultTab?: Tab;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <CatalogContent defaultTab={defaultTab} />
    </Suspense>
  );
}
