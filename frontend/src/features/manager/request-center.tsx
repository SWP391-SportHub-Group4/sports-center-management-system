"use client";
import { useState } from "react";
import { Tabs } from "@/components/primitives";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import type { UserAdminDto } from "@/lib/types";
import { MemberPicker } from "@/components/MemberPicker";
import { ManagerClassChangeRequests } from "./class-change-requests";
import { ManagerRefunds } from "@/features/payments";
import { SupportQueue, MemberSupportRequests } from "@/features/receptionist";
import styles from "./request-center.module.css";

const types = ["coach", "refunds", "support"];
export function RequestCenter() {
  const { values, setValues } = useUrlQuery(
    { type: "coach", record: "" },
    { type: choiceQuery(types, "coach"), record: choiceQuery(["", "1"], "") },
  );
  const recording = values.record === "1";
  const setRecording = (value: boolean) =>
    setValues({ record: value ? "1" : "" });
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
    </>
  );
  const [member, setMember] = useState<UserAdminDto | null>(null);
  return (
    <div className={styles.page}>
      <Tabs
        value={values.type}
        onChange={(type) => {
          setValues({ type, record: "" });
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
            <>
              {recording && (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setRecording(!recording)}
                  >
                    {recording ? "Back to support queue" : "Record a request"}
                  </button>
                </div>
              )}
              {recording ? (
                <div className="stack">
                  <MemberPicker value={member} onChange={setMember} />
                  {member && <MemberSupportRequests memberId={member.userId} />}
                </div>
              ) : (
                <SupportQueue workspace="manager" onChanged={counts.reload} />
              )}
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}
