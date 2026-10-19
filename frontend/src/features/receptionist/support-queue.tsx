"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import type { MemberSupportRequestDto, Paged } from "@/lib/types";
import styles from "./support-queue.module.css";
import {
  SupportRequestActions,
  type SupportAssignee,
  type SupportFeedback,
} from "./support-request-actions";

const STATUSES = [
  ["", "All"],
  ["OPEN", "Open"],
  ["ASSIGNED", "Assigned"],
  ["IN_PROGRESS", "In progress"],
  ["CLOSED", "Closed"],
] as const;

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
  const { user } = useAuth();
  const [status, setStatus] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [feedback, setFeedback] = useState<
    Record<string, SupportFeedback | null>
  >({});

  // Lọc áp dụng ngay khi đổi; ô tìm kiếm chờ người dùng ngừng gõ.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const queue = useApi(
    (signal) =>
      api.get<Paged<MemberSupportRequestDto>>(
        "/api/member-support-requests/queue",
        {
          signal,
          query: { status, assignedToUserId, search: term, page, pageSize: 20 },
        },
      ),
    [status, assignedToUserId, term, page],
  );

  return (
    <section className={styles.panel} aria-label="Support requests">
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          aria-label="Search requests"
          value={search}
          maxLength={200}
          placeholder="Search subject, member name or email"
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Assigned staff"
          value={assignedToUserId}
          onChange={(e) => {
            setAssignedToUserId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All staff</option>
          {assignees.data?.map((x) => (
            <option key={x.userId} value={x.userId}>
              {x.name}
            </option>
          ))}
        </select>
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
        <Link className="btn" href={`/${workspace}/members`}>
          Record a request
        </Link>
      </div>
      <div className={styles.tabs} role="group" aria-label="Status">
        {STATUSES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={styles.tab}
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
        {user && (
          <button
            type="button"
            className={styles.tab}
            aria-pressed={assignedToUserId === user.userId}
            onClick={() => {
              setAssignedToUserId(
                assignedToUserId === user.userId ? "" : user.userId,
              );
              setPage(1);
            }}
          >
            Assigned to me
          </button>
        )}
      </div>
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
        <div className={styles.emptyState}>
          <p>No support requests match your filters.</p>
          {(status || assignedToUserId || search) && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                setStatus("");
                setAssignedToUserId("");
                setSearch("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      <div className={styles.list}>
        {queue.data?.items.map((request) => (
          <article
            key={request.requestId}
            className={styles.request}
            data-status={request.status}
          >
            <div className={styles.requestHead}>
              <h3>{request.subject}</h3>
              <span className={styles.status} data-status={request.status}>
                {request.status.replaceAll("_", " ").toLowerCase()}
              </span>
            </div>
            <p className={styles.meta}>
              <Link href={`/${workspace}/members/${request.memberId}`}>
                {request.memberName || "Member profile"}
                {request.memberEmail ? ` · ${request.memberEmail}` : ""}
              </Link>
              <span>{request.category}</span>
              <span>{formatDateTime(request.createdAt)}</span>
              {request.closedAt && (
                <span>Closed {formatDateTime(request.closedAt)}</span>
              )}
            </p>
            {request.description.trim() !== request.subject.trim() && (
              <p className={styles.message}>{request.description}</p>
            )}
            <SupportRequestActions
              collapsible
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
      </div>
      {queue.data && queue.data.totalCount > 0 && (
        <nav className={styles.pager} aria-label="Support request pages">
          <span>
            Showing {(page - 1) * 20 + 1}–
            {Math.min(page * 20, queue.data.totalCount)} of{" "}
            {queue.data.totalCount}
          </span>
          {queue.data.totalCount > 20 && (
            <>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={page * 20 >= queue.data.totalCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </>
          )}
        </nav>
      )}
    </section>
  );
}
