"use client";
import { useState } from "react";
import Link from "next/link";
import { Tabs } from "@/components/primitives";
import { AsyncSection, Field, Pager, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi, useAction } from "@/lib/useApi";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import type { Paged, UserAdminDto } from "@/lib/types";
import { MemberPicker } from "@/components/MemberPicker";
import { AvatarImage } from "@/components/AvatarImage";
import { formatDateTime } from "@/lib/format";
import { ManagerClassChangeRequests } from "./class-change-requests";
import { ManagerRefunds } from "@/features/payments";
import { SupportQueue, MemberSupportRequests } from "@/features/receptionist";
import styles from "./request-center.module.css";

const types = ["coach", "refunds", "support", "avatar"];
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
          { id: "avatar", label: label("avatar", "Avatar reports") },
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
          {values.type === "avatar" && (
            <AvatarReports onChanged={counts.reload} />
          )}
        </div>
      </Tabs>
    </div>
  );
}

type AvatarReport = {
  reportId: string;
  targetUserId: string;
  targetName: string;
  targetRole: string;
  avatarUrl: string;
  currentAvatarUrl: string | null;
  reason: string;
  status: string;
  createdAtUtc: string;
};
function AvatarReports({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState("OPEN");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) =>
      api.get<Paged<AvatarReport>>("/api/manager/avatar-reports", {
        signal,
        query: { status, search, page, pageSize: 20 },
      }),
    [status, search, page],
  );
  const action = useAction();
  return (
    <section className="stack" aria-label="Avatar reports">
      <div className={styles.filters}>
        <Field label="Search account">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="OPEN">Pending</option>
            <option value="REMOVED">Photo removed</option>
            <option value="DISMISSED">Dismissed</option>
            <option value="">All</option>
          </select>
        </Field>
      </div>
      {action.error && <p role="alert">{action.error}</p>}
      <AsyncSection state={state}>
        {(data) => (
          <>
            {data.items.length ? (
              <Table
                headers={[
                  "Account",
                  "Reported photo",
                  "Reason",
                  "Reported",
                  "Status",
                  "Actions",
                ]}
              >
                {data.items.map((r) => (
                  <tr key={r.reportId}>
                    <td>
                      <Link
                        href={`/manager/${r.targetRole.toUpperCase().includes("COACH") ? "coaches" : "members"}/${r.targetUserId}`}
                      >
                        {r.targetName}
                      </Link>
                    </td>
                    <td>
                      <AvatarImage
                        name={r.targetName}
                        avatarUrl={r.avatarUrl}
                        size={48}
                      />
                      {r.currentAvatarUrl !== r.avatarUrl && (
                        <small>Photo has changed</small>
                      )}
                    </td>
                    <td className={styles.reason}>{r.reason}</td>
                    <td>{formatDateTime(r.createdAtUtc)}</td>
                    <td>
                      <StatusChip value={r.status} />
                    </td>
                    <td>
                      <div className="btn-row">
                        <Link
                          className="btn btn--secondary btn--sm"
                          href={`/manager/${r.targetRole.toUpperCase().includes("COACH") ? "coaches" : "members"}/${r.targetUserId}`}
                        >
                          View details
                        </Link>
                        {r.status === "OPEN" && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(async () => {
                                await api.post(
                                  `/api/manager/avatar-reports/${r.reportId}/dismiss`,
                                );
                                state.reload();
                                onChanged();
                              })
                            }
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p role="status">No avatar reports match these filters.</p>
            )}
            <Pager
              page={data.page}
              pageSize={data.pageSize}
              totalCount={data.totalCount}
              onChange={setPage}
            />
          </>
        )}
      </AsyncSection>
    </section>
  );
}
