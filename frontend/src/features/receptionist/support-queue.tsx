"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
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

const emptyFilters = { status: "", search: "", assignedToUserId: "" };
const categories: Record<string, string> = {
  GENERAL: "General",
  MEMBERSHIP: "Membership",
  CLASS: "Class",
  PAYMENT: "Payment",
  OTHER: "Other",
};

export function SupportQueue({
  workspace = "receptionist",
}: {
  workspace?: "manager" | "receptionist";
}) {
  const { user } = useAuth();
  const assignees = useApi(
    (signal) =>
      api.get<SupportAssignee[]>("/api/member-support-requests/assignees", {
        signal,
      }),
    [],
  );
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState<string | null | undefined>();
  const [feedback, setFeedback] = useState<
    Record<string, SupportFeedback | null>
  >({});
  const queue = useApi(
    (signal) =>
      api.get<Paged<MemberSupportRequestDto>>(
        "/api/member-support-requests/queue",
        {
          signal,
          query: { ...applied, page, pageSize: 20 },
        },
      ),
    [applied, page],
  );
  // Retain editors during refresh so an unsent note is not discarded.
  const [lastResult, setLastResult] =
    useState<Paged<MemberSupportRequestDto> | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (queue.data) setLastResult(queue.data);
  }, [queue.data]);
  // Never display a previous filter/page as though it belongs to the new query.
  const result = queue.loading || queue.error ? null : queue.data ?? lastResult;
  const selected =
    expanded === undefined ? result?.items[0]?.requestId : expanded;
  const filtered = !!(
    applied.search ||
    applied.status ||
    applied.assignedToUserId
  );
  function apply(next: typeof filters) {
    setLastResult(null);
    setFilters(next);
    setApplied({ ...next, search: next.search.trim() });
    setPage(1);
    setExpanded(undefined);
    setNotice("");
  }
  return (
    <section className={styles.panel} aria-label="Support requests">
      <div className={styles.header}>
        <p className={styles.intro}>
          Assign the right person, follow up on progress, and resolve member
          requests.
        </p>
        <div className={styles.toolbar}>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={queue.loading}
            onClick={() => {
              setNotice("");
              queue.reload();
              assignees.reload();
            }}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
          <Link className="btn" href={`/${workspace}/members`}>
            <Plus size={18} aria-hidden="true" />
            Record a request
          </Link>
        </div>
      </div>
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          apply(filters);
        }}
      >
        <label className={styles.searchField}>
          Search
          <span className={styles.searchInput}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={filters.search}
              maxLength={200}
              placeholder="Subject, member name or email"
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </span>
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
        <div className={styles.filterActions}>
          {user && (
            <button
              type="button"
              className="btn btn--secondary"
              aria-pressed={applied.assignedToUserId === user.userId}
              onClick={() =>
                apply({
                  ...filters,
                  assignedToUserId:
                    applied.assignedToUserId === user.userId ? "" : user.userId,
                })
              }
            >
              Assigned to me
            </button>
          )}
          <button type="submit" className="btn btn--secondary">
            Apply filters
          </button>
          {(filtered ||
            filters.search ||
            filters.status ||
            filters.assignedToUserId) && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => apply(emptyFilters)}
            >
              Clear filters
            </button>
          )}
        </div>
      </form>
      <div className={styles.quickFilters} aria-label="Quick status filters">
        <span>Quick view</span>
        {[
          { value: "", label: "All requests" },
          { value: "OPEN", label: "New" },
          { value: "ASSIGNED", label: "Assigned" },
          { value: "IN_PROGRESS", label: "In progress" },
          { value: "CLOSED", label: "Closed" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.quickFilter}
            aria-pressed={applied.status === option.value}
            onClick={() => apply({ ...filters, status: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>
      {notice && (
        <p className="alert alert--success" role="status">
          {notice}
        </p>
      )}
      {assignees.error && (
        <div className="alert alert--error" role="alert">
          Could not load staff.
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={assignees.reload}
          >
            Retry staff
          </button>
        </div>
      )}
      <div className={styles.inbox}>
        <header className={styles.listHeader}>
          <div>
            <h2>Request queue</h2>
            {result && (
              <span className={styles.count}>{result.totalCount}</span>
            )}
          </div>
          <span className={styles.listHint}>
            {filtered ? "Filtered results" : "All member requests"}
          </span>
        </header>
        {queue.loading && (
          <p className={styles.loading} role="status">
            Loading requests…
          </p>
        )}
        {queue.error && (
          <div className={styles.empty} role="alert">
            <MessageSquare size={28} aria-hidden="true" />
            <h3>Requests could not be loaded</h3>
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
        {!queue.loading && !queue.error && result?.items.length === 0 && (
          <div className={styles.empty}>
            <MessageSquare size={28} aria-hidden="true" />
            <h3>No requests match these filters</h3>
            <p>
              Change the filters or open a member’s profile to record a request.
            </p>
            {filtered && (
              <button
                className="btn btn--secondary"
                onClick={() => apply(emptyFilters)}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        <div aria-busy={queue.loading}>
          {result?.items.map((request) => {
            const open = selected === request.requestId;
            const assignee =
              request.assignedToName ||
              assignees.data?.find((x) => x.userId === request.assignedToUserId)
                ?.name;
            return (
              <article
                key={request.requestId}
                className={styles.request}
                data-expanded={open}
              >
                <div className={styles.requestHeader}>
                  <div className={styles.requestIdentity}>
                    <h3>
                      {request.subject}
                      <span
                        className={styles.status}
                        data-status={request.status}
                      >
                        {request.status.replaceAll("_", " ")}
                      </span>
                    </h3>
                    <div className={styles.memberLine}>
                      <Link href={`/${workspace}/members/${request.memberId}`}>
                        {request.memberName || "Member profile"}
                        {request.memberEmail ? ` · ${request.memberEmail}` : ""}
                      </Link>
                      <span className={styles.category}>
                        {categories[request.category] ?? request.category}
                      </span>
                    </div>
                  </div>
                  <div className={styles.requestMeta}>
                    <span className={styles.owner}>
                      <UserRound size={15} aria-hidden="true" />
                      {assignee ||
                        (request.assignedToUserId
                          ? "Former staff member"
                          : "Unassigned")}
                    </span>
                    <span>
                      {request.closedAt
                        ? `Closed ${formatDateTime(request.closedAt)}`
                        : `Created ${formatDateTime(request.createdAt)}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`btn btn--ghost ${styles.expandButton}`}
                    aria-expanded={open}
                    aria-controls={`support-detail-${request.requestId}`}
                    aria-label={`${open ? "Collapse request" : "View request"}: ${request.subject}`}
                    onClick={() => setExpanded(open ? null : request.requestId)}
                  >
                    {open ? "Hide details" : "View request"}
                    <ChevronDown size={18} aria-hidden="true" />
                  </button>
                </div>
                {!open && (
                  <p className={styles.preview}>{request.description}</p>
                )}
                <div id={`support-detail-${request.requestId}`} hidden={!open}>
                  <fieldset
                    className={styles.requestBody}
                    disabled={queue.loading || !!queue.error}
                  >
                    <div className={styles.requestContent}>
                      <h4>Request details</h4>
                      <p className={styles.message}>{request.description}</p>
                      <dl className={styles.timeline}>
                        <div>
                          <dt>Recorded</dt>
                          <dd>{formatDateTime(request.createdAt)}</dd>
                        </div>
                        {request.updatedAt && (
                          <div>
                            <dt>Last updated</dt>
                            <dd>{formatDateTime(request.updatedAt)}</dd>
                          </div>
                        )}
                      </dl>
                      <Link
                        className="btn btn--secondary btn--sm"
                        href={`/${workspace}/members/${request.memberId}`}
                      >
                        Open member profile
                      </Link>
                    </div>
                    <div className={styles.handling}>
                      <h4>
                        {request.status === "CLOSED"
                          ? "Resolution"
                          : "Handle request"}
                      </h4>
                      <SupportRequestActions
                        request={request}
                        assignees={assignees.data ?? []}
                        layout="queue"
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
                    </div>
                  </fieldset>
                </div>
              </article>
            );
          })}
        </div>
        {result && (
          <nav className={styles.pagination} aria-label="Support request pages">
            <span>
              Page {page} of {Math.max(1, Math.ceil(result.totalCount / 20))} ·{" "}
              {result.totalCount} requests
            </span>
            <div className={styles.toolbar}>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={queue.loading || page <= 1}
                onClick={() => {
                  setLastResult(null);
                  setPage(page - 1);
                  setExpanded(undefined);
                }}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={queue.loading || page * 20 >= result.totalCount}
                onClick={() => {
                  setLastResult(null);
                  setPage(page + 1);
                  setExpanded(undefined);
                }}
              >
                Next
              </button>
            </div>
          </nav>
        )}
      </div>
      <p className={styles.footnote}>
        New requests are recorded from the member’s profile. Managers and
        receptionists can handle requests assigned to any staff member.
      </p>
    </section>
  );
}
