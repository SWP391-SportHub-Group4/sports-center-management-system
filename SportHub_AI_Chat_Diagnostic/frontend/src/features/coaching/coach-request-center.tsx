"use client";

import { Tabs } from "@/components/primitives";
import { SupportQueue } from "@/features/receptionist";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { CoachChangeRequests } from "./coach-change-requests";
import styles from "./coach-request-center.module.css";

export function CoachRequestCenter() {
  // Existing support-notification links (?request=id) keep opening the support inbox.
  const { values, setValues } = useUrlQuery(
    { type: "support" },
    { type: choiceQuery(["absence", "support"], "support") },
  );

  return (
    <div className={styles.page}>
      <Tabs
        ariaLabel="Request type"
        value={values.type}
        onChange={(type) => setValues({ type })}
        tabs={[
          { id: "absence", label: "Absence requests" },
          { id: "support", label: "Member support" },
        ]}
      >
        {values.type === "absence" ? (
          <CoachChangeRequests />
        ) : (
          <SupportQueue workspace="coach" />
        )}
      </Tabs>
    </div>
  );
}
