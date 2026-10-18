"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDateTime } from "@/lib/format";
import type { MemberSupportRequestDto, Paged } from "@/lib/types";
import styles from "./support-queue.module.css";
import {
  SupportRequestActions,
  type SupportAssignee,
  type SupportFeedback,
} from "./support-request-actions";

export function SupportQueue({
  workspace = "receptionist",
}: {
  workspace?: "manager" | "receptionist";
}) {
  const assignees = useApi(
    (signal) =>
      api.get<SupportAssignee[]>("/api/member-support-requests/assignees", {
        signal,
      }),
    [],
  );
  const [filters, setFilters] = useState({
    status: "",
    search: "",
    assignedToUserId: "",
  });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [feedback, setFeedback] = useState<
    Record<string, SupportFeedback | null>
  >({});
  const queue = useApi(
    (signal) =>
      api.get<Paged<MemberSupportRequestDto>>(
        "/api/member-support-requests/queue",
        { signal, query: { ...applied, page, pageSize: 20 } },
      ),
    [applied, page],
  );
  return (
    <section className={`card ${styles.panel}`} aria-label="Support requests">
      <div className={styles.header}>
        <div>
          <h2>Support requests</h2>
          <p className="small muted">
            Assign a staff member, record progress, and close resolved requests.
          </p>
        </div>
        <div className={styles.row}>
          <Link className="btn btn--secondary" href={`/${workspace}/members`}>
            Record a request
          </Link>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={queue.loading}
            onClick={() => {
              queue.reload();
              assignees.reload();
            }}
          >
            Refresh
          </button>
        </div>
      </div>
      <p className="small muted">
        To record a new request, open the member’s profile. Receptionists and
        managers can handle requests assigned to any staff member.
      </p>
      <form
        className={`${styles.filters} form-grid`}
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied({ ...filters, search: filters.search.trim() });
        }}
      >
        <label>
          Search
          <input
            value={filters.search}
            maxLength={200}
            placeholder="Subject, member name or email"
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </label>
        <label>
          Status
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="CLOSED">Closed</option>
          </select>
        </label>
        <label>
          Assigned staff
          <select
            value={filters.assignedToUserId}
            onChange={(e) =>
              setFilters({ ...filters, assignedToUserId: e.target.value })
            }
          >
            <option value="">All staff</option>
            {assignees.data?.map((x) => (
              <option key={x.userId} value={x.userId}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn">
          Apply filters
        </button>
      </form>
      {notice && <p role="status">{notice}</p>}
      {assignees.error && (
        <p role="alert">
          Could not load staff.{" "}
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={assignees.reload}
          >
            Retry staff
          </button>
        </p>
      )}
      {queue.loading && <p role="status">Loading requests…</p>}
      {queue.error && (
        <div role="alert">
          <p>{queue.error.message}</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={queue.reload}
          >
            Retry
          </button>
        </div>
      )}
      {queue.data?.items.length === 0 && (
        <p>
          No requests match these filters. Change the filters or open a member’s
          profile to record a request.
        </p>
      )}
      {queue.data?.items.map((request) => (
        <article key={request.requestId} className={styles.request}>
          <div className={styles.header}>
            <h3>
              {request.subject}{" "}
              <span className={styles.status}>
                {request.status.replaceAll("_", " ")}
              </span>
            </h3>
            <Link href={`/${workspace}/members/${request.memberId}`}>
              {request.memberName || "Member profile"}
              {request.memberEmail ? ` · ${request.memberEmail}` : ""}
            </Link>
          </div>
          <p className="small muted">
            {request.category} · Created {formatDateTime(request.createdAt)}
            {request.updatedAt && (
              <> · Updated {formatDateTime(request.updatedAt)}</>
            )}
            {request.closedAt && (
              <> · Closed {formatDateTime(request.closedAt)}</>
            )}
          </p>
          <p className={styles.message}>{request.description}</p>
          <SupportRequestActions
            request={request}
            assignees={assignees.data ?? []}
            feedback={feedback[request.requestId] ?? null}
            onFeedback={(next) =>
              setFeedback((previous) => ({
                ...previous,
                [request.requestId]: next,
              }))
            }
            onChanged={() => {
              setNotice("Request updated.");
              queue.reload();
            }}
          />
        </article>
      ))}
      {queue.data && (
        <nav className={styles.row} aria-label="Support request pages">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} · {queue.data.totalCount} requests
          </span>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={page * 20 >= queue.data.totalCount}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
