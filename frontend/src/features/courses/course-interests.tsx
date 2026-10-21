"use client";
import Link from "next/link";
import { Bell, BellOff, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useApi, useAction } from "@/lib/useApi";
import { formatDateTime, formatPoints } from "@/lib/format";
import { AsyncSection } from "@/components/ui";
import styles from "./threshold.module.css";

interface Interest {
  interestId: string;
  memberId: string;
  sportId: number;
  memberName: string;
  sourceClassName: string;
  sportName: string;
  active: boolean;
  refundedPoints: number;
  createdAtUtc: string;
  notifications: { classId: number; className: string; queuedAtUtc: string }[];
}

export function CourseInterests({ manager = false }: { manager?: boolean }) {
  const state = useApi(
    (signal) =>
      api.get<Interest[]>(
        manager
          ? "/api/manager/course-interests"
          : "/api/members/me/course-interests",
        { signal },
      ),
    [manager],
  );
  const action = useAction();
  if (manager)
    return (
      <section>
        <AsyncSection state={state}>
          {(rows) => {
            const unique = [
              ...new Map(
                rows
                  .filter((r) => r.active)
                  .map((r) => [r.memberId + "|" + r.sportId, r]),
              ).values(),
            ];
            return unique.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Sport</th>
                  </tr>
                </thead>
                <tbody>
                  {unique.map((r) => (
                    <tr key={r.interestId}>
                      <td>{r.memberName}</td>
                      <td>{r.sportName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p role="status">No members are following a next course.</p>
            );
          }}
        </AsyncSection>
      </section>
    );
  return (
    <section
      className={`${styles.page} ${manager ? styles.managerInterests : ""}`}
    >
      <header className={styles.header}>
        {!manager && <h2>Course interests</h2>}
        {manager && (
          <div className={styles.managerToolbar}>
            <Link className="btn btn--secondary" href="/manager/classes">
              Back to classes
            </Link>
            <div className="btn-row">
              <Link className="btn" href="/manager/classes/new">
                Create class
              </Link>
            </div>
          </div>
        )}
        <p>
          {manager
            ? "Members waiting for the next cohort. Link a new draft to its previous class to notify them when registration opens."
            : "Track the next cohorts you asked to hear about. Notifications do not reserve a seat or enroll you."}
        </p>
      </header>
      <AsyncSection state={state}>
        {(rows) =>
          rows.length ? (
            <ul className={styles.interests}>
              {rows.map((row) => (
                <li key={row.interestId} className={styles.interest}>
                  <div className={styles.interestHeading}>
                    <div>
                      <span>{row.sportName}</span>
                      <h3>{row.sourceClassName}</h3>
                    </div>
                    <span
                      className={styles.interestStatus}
                      data-active={row.active}
                    >
                      {row.active ? (
                        <Bell size={15} aria-hidden="true" />
                      ) : (
                        <BellOff size={15} aria-hidden="true" />
                      )}
                      {row.active
                        ? "Following next cohort"
                        : "Notifications stopped"}
                    </span>
                  </div>
                  {manager && (
                    <p>
                      Member: <strong>{row.memberName}</strong>
                    </p>
                  )}
                  <p>
                    {formatPoints(row.refundedPoints)} points refunded ·
                    Requested {formatDateTime(row.createdAtUtc)}
                  </p>
                  {row.notifications.length ? (
                    <ul className={styles.deliveries}>
                      {row.notifications.map((n) => (
                        <li key={n.classId}>
                          <Link
                            href={
                              manager
                                ? `/manager/classes/${n.classId}`
                                : `/member/services?view=explore&course=${n.classId}`
                            }
                          >
                            {n.className}
                            <ArrowUpRight size={16} aria-hidden="true" />
                          </Link>
                          <small>
                            Notified {formatDateTime(n.queuedAtUtc)}
                          </small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Waiting for the next cohort to open.</p>
                  )}
                  {!manager && row.active && (
                    <button
                      type="button"
                      className="btn btn--quiet"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          await api.del(
                            `/api/members/me/course-interests/${row.interestId}`,
                          );
                          state.reload();
                        })
                      }
                    >
                      Stop notifications
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {manager
                ? "No members are waiting for the next cohort yet."
                : "No course interests yet. They appear here after you choose ‘Wait for the next course’."}
            </p>
          )
        }
      </AsyncSection>
      {action.error && <p role="alert">{action.error}</p>}
      {!manager && (
        <div className="btn-row">
          <Link
            className="btn btn--secondary"
            href={manager ? "/manager/classes" : "/member/services"}
          >
            {manager ? "Back to classes" : "Browse classes"}
          </Link>
        </div>
      )}
    </section>
  );
}
