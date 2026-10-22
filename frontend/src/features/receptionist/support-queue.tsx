"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  MessageSquare,
  Plus,
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

const emptyFilters = {
  status: "",
  category: "",
  search: "",
  assignedToUserId: "",
};

type SupportStats = {
  open: number;
  assigned: number;
  inProgress: number;
  closed: number;
};
const summaryCards: {
  key: keyof SupportStats;
  label: string;
  status: string;
}[] = [
  { key: "open", label: "Open", status: "OPEN" },
  { key: "assigned", label: "Assigned", status: "ASSIGNED" },
  { key: "inProgress", label: "In progress", status: "IN_PROGRESS" },
  { key: "closed", label: "Closed", status: "CLOSED" },
];
const categories: Record<string, string> = {
  GENERAL: "Uncategorized",
  PAYMENT: "Payment",
  MEMBERSHIP: "Membership",
  CLASS: "Coach",
  PT: "Coach",
  FACILITY: "Facilities",
  ACCOUNT: "Account",
  OTHER: "Other",
};
// Filter options are unique; legacy PT requests are included by the CLASS filter on the API.
const categoryFilterOptions = [
  "GENERAL",
  "PAYMENT",
  "MEMBERSHIP",
  "CLASS",
  "FACILITY",
  "ACCOUNT",
  "OTHER",
] as const;

export function SupportQueue({
  workspace = "receptionist",
  onChanged,
}: {
  workspace?: "manager" | "receptionist";
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const stats = useApi(
    (signal) =>
      api.get<SupportStats>("/api/member-support-requests/stats", { signal }),
    [],
  );
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
  // Do not render old results while a new filter or page is loading.
  const result =
    queue.loading || queue.error ? null : (queue.data ?? lastResult);
  const selected =
    expanded === undefined ? result?.items[0]?.requestId : expanded;
  const filtered = !!(
    applied.search ||
    applied.status ||
    applied.category ||
    applied.assignedToUserId
  );
  function apply(next: typeof filters) {
    setFilters(next);
    setApplied({ ...next, search: next.search.trim() });
    setPage(1);
    setExpanded(undefined);
    setNotice("");
  }
  return (
    <section className={styles.panel} aria-label="Support requests">
      <div className={styles.header}>
        <div className={styles.toolbar}>
          {workspace !== "receptionist" && (
            <Link
              className="btn"
              href={
                workspace === "manager"
                  ? "/manager/requests?type=support&record=1"
                  : "/receptionist/members"
              }
            >
              <Plus size={18} aria-hidden="true" />
              Record a request
            </Link>
          )}
        </div>
      </div>
      <div className={styles.statsGrid} aria-label="Request statistics">
        {summaryCards.map((item) => (
          <button
            key={item.key}
            type="button"
            className={styles.statCard}
            data-status={item.status}
            aria-pressed={applied.status === item.status}
            onClick={() =>
              apply({
                ...filters,
                status: applied.status === item.status ? "" : item.status,
              })
            }
          >
            <span className={styles.statLabel}>{item.label}</span>
            <strong className={styles.statValue}>
              {stats.data ? stats.data[item.key] : "—"}
            </strong>
          </button>
        ))}
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
          Request type
          <select
            value={filters.category}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value })
            }
          >
            <option value="">All types</option>
            {categoryFilterOptions.map((key) => (
              <option key={key} value={key}>
                {categories[key]}
              </option>
            ))}
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
            filters.category ||
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
              {workspace === "receptionist"
                ? "Change the filters, or record a request from Today’s desk."
                : "Change the filters or open a member’s profile to record a request."}
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
                          onChanged?.();
                          setNotice("Request updated.");
                          queue.reload();
                          stats.reload();
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
    </section>
  );
}
