"use client";
import { MemberShell } from "@/components/MemberShell";
import { CourseCatalog } from "@/features/courses/catalog";
import { MembershipCatalog, PtPurchase } from "@/features/membership";
import { Tabs } from "@/components/primitives";
import { AsyncSection } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import type { MemberPackageDto } from "@/lib/types";
import { useLanguage } from "@/lib/language";

const TABS = ["courses", "gym", "pt"] as const;

export default function Page() {
  const { t } = useLanguage();
  const { values, setValues } = useUrlQuery(
    { tab: "courses" },
    { tab: choiceQuery(TABS, "courses") },
  );
  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );
  return (
    <MemberShell
      title={t.memberPages.discover}
      description={t.mDiscover.description}
    >
      <Tabs
        ariaLabel={t.mDiscover.tabs}
        value={values.tab}
        onChange={(tab) => setValues({ tab })}
        tabs={[
          { id: "courses", label: t.mDiscover.tabCourses },
          { id: "gym", label: t.memberPages.gym },
          { id: "pt", label: t.memberPages.pt },
        ]}
      >
        {values.tab === "courses" ? (
          <CourseCatalog detailBasePath="/member/discover" />
        ) : values.tab === "gym" ? (
          <AsyncSection state={packages}>
            {(rows) => <MembershipCatalog purchase owned={rows} />}
          </AsyncSection>
        ) : (
          <AsyncSection state={packages}>
            {(rows) => <PtPurchase packages={rows} />}
          </AsyncSection>
        )}
      </Tabs>
    </MemberShell>
  );
}
