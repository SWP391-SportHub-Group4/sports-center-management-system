"use client";
import { Tabs } from "@/components/primitives";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { ManagerClassChangeRequests } from "./class-change-requests";
import { ManagerRefunds } from "@/features/payments";
import { SupportQueue } from "@/features/receptionist";
import styles from "./request-center.module.css";
import { OperationsWorkspace } from "@/features/operations";

const types = ["coach", "refunds", "support"];
export function RequestCenter() {
  const { values, setValues } = useUrlQuery(
    { type: "coach" },
    { type: choiceQuery(types, "coach") },
  );
  const counts = useApi(
    (signal) =>
      api.get<Record<string, number>>("/api/manager/requests/summary", {
        signal,
      }),
    [values.type],
  );
  const label = (type: string, text: string) => (
    <>
      {text}
      {!!counts.data?.[type] && (
        <span className={styles.count}>{counts.data[type]}</span>
      )}
      {type === "support" && !!counts.data?.payment && (
        <span
          className={styles.count}
          title="Open Payment (bank refund) requests; they need a manager"
        >
          {counts.data.payment} refund
          {counts.data.awaitingPayout
            ? ` · ${counts.data.awaitingPayout} to transfer`
            : ""}
        </span>
      )}
    </>
  );
  return (
    <div className={styles.page}>
      <Tabs
        value={values.type}
        onChange={(type) => {
          setValues({ type });
        }}
        ariaLabel="Request type"
        tabs={[
          { id: "coach", label: label("coach", "Coach absence") },
          { id: "refunds", label: label("refunds", "Refunds") },
          { id: "support", label: label("support", "Member support") },
        ]}
      >
        <div className={styles.body}>
          {values.type === "coach" && (
            <ManagerClassChangeRequests onChanged={counts.reload} />
          )}
          {values.type === "refunds" && (
            <ManagerRefunds onChanged={counts.reload} />
          )}
          {values.type === "support" && (
            <OperationsWorkspace>
              <SupportQueue workspace="manager" onChanged={counts.reload} />
            </OperationsWorkspace>
          )}
        </div>
      </Tabs>
    </div>
  );
}
