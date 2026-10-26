"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, MessageSquare, Plus, Search, UserRound } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { formatDateTime } from "@/lib/format";
import {
  SupportStatus,
  SUPPORT_STATUS_FILTERS,
  supportStatusLabel,
} from "@/components/support-status";
import {
  SUPPORT_CATEGORIES,
  supportCategoryLabel,
} from "@/lib/support-categories";
import type { MemberSupportRequestDto, Paged } from "@/lib/types";
import type { SupportAssignee } from "./support-request-actions";
import { SupportCreateDialog } from "./support-create-dialog";
import { SupportDetail } from "./support-detail";
import { supportReference } from "./support-shared";
import styles from "./support-center.module.css";

const PAGE_SIZE = 20;
const emptyFilters = {
  status: "",
  category: "",
  search: "",
  assignedToUserId: "",
  overdue: "",
};

type SupportStats = {
  notStarted: number;
  open: number;
  assigned: number;
  inProgress: number;
  done: number;
  rejected: number;
  overdue: number;
};
const summaryCards: {
  key: keyof SupportStats;
  label: string;
  status: string;
}[] = [
  { key: "open", label: "Received", status: "OPEN" },
  { key: "assigned", label: "Assigned", status: "ASSIGNED" },
  { key: "inProgress", label: "In progress", status: "IN_PROGRESS" },
  { key: "done", label: "Done", status: "FINISHED" },
  { key: "rejected", label: "Reject", status: "REJECTED" },
];

/** Support requests workspace for the front desk and managers: filterable list plus a detail panel. */
export function SupportQueue({
  workspace = "receptionist",
  onChanged,
}: {
  workspace?: "manager" | "receptionist" | "coach" | "admin";
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const isManager = workspace === "manager";
  const isReceiver = workspace === "coach" || workspace === "admin";
  const cards = isReceiver ? [
    { key: "notStarted" as const, label: "Not started", status: "NOT_STARTED" },
    { key: "inProgress" as const, label: "In progress", status: "IN_PROGRESS" },
    { key: "done" as const, label: "Done", status: "FINISHED" },
  ] : summaryCards;
  const statusLabel = (status: string) =>
    status === "NOT_STARTED" ? "Not started" : status === "FINISHED" ? "Done" : (SUPPORT_STATUS_LABELS[status] ?? status);

  const stats = useApi(
    (signal) =>
      api.get<SupportStats>("/api/member-support-requests/stats", { signal }),
    [],
  );
  const assignees = useApi(
    (signal) =>
      isReceiver
        ? Promise.resolve([] as SupportAssignee[])
        : api.get<SupportAssignee[]>("/api/member-support-requests/assignees", {
            signal,
          }),
    [isReceiver],
  );
  const [filters, setFilters] = useState(emptyFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);
  const openedLink = useRef<string | null>(null);
  const { values: link, setValues: setLink } = useUrlQuery(
    { request: "", overdue: "" },
    { overdue: choiceQuery(["", "1"], "") },
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked(link.request || null);
    setFilters({
      ...emptyFilters,
      overdue: link.overdue === "1" ? "true" : "",
    });
    setPage(1);
    setSearch("");
  }, [link.request, link.overdue]);

  // Typing in the search box filters after a short pause.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((f) =>
        f.search === search.trim() ? f : { ...f, search: search.trim() },
      );
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
          query: {
            ...filters,
            overdue: filters.overdue || undefined,
            page,
            pageSize: PAGE_SIZE,
          },
        },
      ),
    [filters, page],
  );
  const [lastResult, setLastResult] =
    useState<Paged<MemberSupportRequestDto> | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (queue.data) setLastResult(queue.data);
  }, [queue.data]);
  const result = queue.error ? null : (queue.data ?? lastResult);
  const items = result?.items ?? [];
  // A deep link (?request=id) may point at a request outside the current page or filter.
  const missing = !!picked && !items.some((x) => x.requestId === picked);
  const linked = useApi(
    (signal) =>
      missing
        ? api.get<MemberSupportRequestDto>(
            `/api/member-support-requests/${picked}`,
            { signal },
          )
        : Promise.resolve(null),
    [missing, picked],
  );
  const selected = missing
    ? linked.data?.requestId === picked
      ? linked.data
      : null
    : (items.find((x) => x.requestId === picked) ?? items[0] ?? null);
  const openedFromLink = isManager && !!link.request && picked === link.request;
  useEffect(() => {
    if (!link.request) openedLink.current = null;
    if (
      !openedFromLink ||
      selected?.requestId !== link.request ||
      openedLink.current === link.request
    )
      return;
    const frame = window.requestAnimationFrame(() => {
      openedLink.current = link.request;
      detailRef.current?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 1100px)").matches)
        detailRef.current?.scrollIntoView({
          block: "start",
          behavior: "instant",
        });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openedFromLink, selected?.requestId, link.request]);

  const filtered = !!(
    filters.search ||
    filters.status ||
    filters.category ||
    filters.assignedToUserId ||
    filters.overdue
  );

  function patch(next: Partial<typeof filters>) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
    setPicked(null);
    setNotice("");
  }
  function clearFilters() {
    setSearch("");
    setFilters(emptyFilters);
    setPage(1);
    setPicked(null);
  }
  function refresh() {
    onChanged?.();
    queue.reload();
    stats.reload();
    linked.reload();
  }

  return (
    <section className={styles.page} aria-label="Support requests">
      {!isReceiver && (
        <div className={styles.head}>
          <button
            type="button"
            className={`btn ${styles.primary}`}
            onClick={() => setCreating(true)}
          >
            <Plus size={18} aria-hidden="true" />
            Record a request for member
          </button>
        </div>
      )}

      <div className={styles.stats} role="group" aria-label="Filter by status">
        {cards.map((item) => (
          <button
            key={item.key}
            type="button"
            className={styles.stat}
            aria-pressed={filters.status === item.status}
            onClick={() =>
              patch({
                status: filters.status === item.status ? "" : item.status,
                overdue: "",
              })
            }
          >
            <span className={styles.statLabel}>
              <span className={styles.dot} data-status={item.status} />
              {supportStatusLabel(item.status)}
            </span>
            <strong className={styles.statValue}>
              {stats.data ? stats.data[item.key] : "—"}
            </strong>
          </button>
        ))}
        <button
          type="button"
          className={styles.stat}
          aria-pressed={filters.overdue === "true"}
          onClick={() =>
            patch({
              overdue: filters.overdue === "true" ? "" : "true",
              status: "",
            })
          }
        >
          <span className={styles.statLabel}>
            <span className={styles.dot} data-status="OVERDUE" />
            Overdue
          </span>
          <strong className={styles.statValue}>
            {stats.data ? stats.data.overdue : "—"}
          </strong>
        </button>
      </div>

      <div className={styles.filters}>
        <label>
          Search
          <span className={styles.searchBox}>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              maxLength={200}
              placeholder="Search name, email, subject…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </span>
        </label>
        <label>
          Status
          <select
            value={filters.status}
            onChange={(e) => patch({ status: e.target.value })}
          >
            <option value="">All statuses</option>
              const cards = isReceiver
                ? [
                    { key: "notStarted" as const, label: "Not started", status: "NOT_STARTED" },
                    { key: "inProgress" as const, label: "In progress", status: "IN_PROGRESS" },
                    { key: "done" as const, label: "Done", status: "FINISHED" },
                  ]
                : summaryCards;

              const statusLabel = (status: string) =>
                status === "NOT_STARTED"
                  ? "Not started"
                  : status === "FINISHED"
                    ? "Done"
                    : (SUPPORT_STATUS_LABELS[status] ?? status);
              </option>
            ))}
          </select>
        </label>
        <label>
          Request type
          <select
            value={filters.category}
            onChange={(e) => patch({ category: e.target.value })}
          >
            <option value="">All types</option>
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {!isReceiver && (
          <label>
            Assigned staff
            <select
              value={filters.assignedToUserId}
              onChange={(e) => patch({ assignedToUserId: e.target.value })}
            >
              <option value="">All staff</option>
              {user && <option value={user.userId}>Assigned to me</option>}
              {assignees.data
                ?.filter((x) => x.userId !== user?.userId)
                .map((x) => (
                  <option key={x.userId} value={x.userId}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {filtered && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={clearFilters}
          >
            Clear
          </button>
        )}
      </div>

      {notice && (
        <p className="alert alert--success" role="status">
          {notice}
        </p>
      )}
      {assignees.error && (
        <div className="alert alert--error" role="alert">
          Could not load staff.{" "}
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={assignees.reload}
          >
            Retry
          </button>
        </div>
      )}

      <div className={styles.split}>
        <div className={styles.listCard}>
          <div className={styles.listHead}>
            <strong>Requests</strong>
            <span>{result ? `${result.totalCount} total` : ""}</span>
          </div>
          {queue.loading && !result && (
            <p className={styles.state} role="status">
              Loading requests…
            </p>
          )}
          {queue.error && (
            <div className={styles.state} role="alert">
              <MessageSquare size={26} aria-hidden="true" />
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
          {!queue.loading && !queue.error && items.length === 0 && (
            <div className={styles.state}>
              <MessageSquare size={26} aria-hidden="true" />
              <h3>No requests found</h3>
              <p>
                {filtered
                  ? "Try changing or clearing the filters."
                  : "New requests will appear here."}
              </p>
              {filtered && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
          {items.length > 0 && (
            <ul className={styles.list} aria-busy={queue.loading}>
              {items.map((request) => {
                return (
                  <li key={request.requestId}>
                    <button
                      type="button"
                      className={styles.row}
                      aria-current={selected?.requestId === request.requestId}
                      onClick={() => {
                        setPicked(request.requestId);
                        setNotice("");
                        window.setTimeout(
                          () =>
                            detailRef.current?.scrollIntoView?.({
                              block: "nearest",
                            }),
                          0,
                        );
                      }}
                    >
                      <span className={styles.rowTop}>
                        <span className={styles.rowBadges}>
                          <SupportStatus status={request.status} />
                          {request.isOverdue && (
                            <span className={styles.overdueBadge}>Overdue</span>
                          )}
                        </span>
                        <span className={styles.rowDate}>
                          {formatDateTime(request.createdAt)}
                        </span>
                      </span>
                      <span className={styles.rowSubject}>
                        {request.subject?.trim() ||
                          supportCategoryLabel(request.category)}
                      </span>
                      {isManager && (
                        <>
                          <span className={styles.rowMember}>
                            Ref {supportReference(request.requestId)}
                          </span>
                          <span className={styles.rowPreview}>
                            {request.description}
                          </span>
                        </>
                      )}
                      <span className={styles.rowMember}>
                        {request.memberName || request.memberEmail || "Member"}
                      </span>
                      <span className={styles.rowMeta}>
                        <span>{supportCategoryLabel(request.category)}</span>
                        <span>
                          <UserRound size={13} aria-hidden="true" />{" "}
                          {request.assignedToName ??
                            (request.assignedToUserId
                              ? "Former staff"
                              : "Unassigned")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {result && result.totalCount > PAGE_SIZE && (
            <nav className={styles.pager} aria-label="Support request pages">
              <span>
                Page {page} of{" "}
                {Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE))}
              </span>
              <div>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={queue.loading || page <= 1}
                  onClick={() => {
                    setPage(page - 1);
                    setPicked(null);
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={
                    queue.loading || page * PAGE_SIZE >= result.totalCount
                  }
                  onClick={() => {
                    setPage(page + 1);
                    setPicked(null);
                  }}
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </div>

        <div
          className={styles.detailCard}
          ref={detailRef}
          tabIndex={-1}
          role="region"
          aria-label="Support request details"
          aria-live="polite"
        >
          {selected ? (
            <>
              {openedFromLink && (
                <section
                  className={styles.linkedRequest}
                  aria-label="Linked support request"
                >
                  <BellRing size={20} aria-hidden="true" />
                  <div>
                    <h3>Request {supportReference(selected.requestId)}</h3>
                    <p>
                      {["DONE", "REJECTED", "CLOSED"].includes(selected.status)
                        ? "This request has already been finalized. Review the current outcome and reply below."
                        : link.overdue === "1" && !selected.isOverdue
                          ? "This request is no longer overdue. Its latest status and updates are shown below."
                          : selected.isOverdue
                            ? "This request is overdue. Review the latest reply and activity before taking action."
                            : "You are viewing the linked request. Check its latest status, reply and payout details below."}
                    </p>
                    {missing && (
                      <p>
                        This request is outside the current list. It is
                        displayed here so you can review it.
                      </p>
                    )}
                    <button
                      type="button"
                      className={styles.queueLink}
                      onClick={() => {
                        setLink({ request: "", overdue: "" });
                        clearFilters();
                      }}
                    >
                      View all support requests
                    </button>
                  </div>
                </section>
              )}
              <SupportDetail
                key={selected.requestId}
                request={selected}
                assignees={assignees.data ?? []}
                workspace={workspace}
                onChanged={refresh}
              />
            </>
          ) : missing && linked.error ? (
            <div className={styles.state} role="alert">
              <MessageSquare size={26} aria-hidden="true" />
              <h3>This request couldn’t open</h3>
              <p>
                It may have been removed, or you may no longer have access. Try
                again or return to the queue.
              </p>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={linked.reload}
              >
                Try again
              </button>
              <button
                type="button"
                className={styles.queueLink}
                onClick={() => {
                  setLink({ request: "", overdue: "" });
                  clearFilters();
                }}
              >
                View all support requests
              </button>
            </div>
          ) : missing && linked.loading ? (
            <div className={styles.state} role="status">
              Opening the linked request…
            </div>
          ) : (
            <div className={styles.state}>
              <MessageSquare size={26} aria-hidden="true" />
              <h3>Select a request</h3>
              <p>Its details, routing and history appear here.</p>
            </div>
          )}
        </div>
      </div>

      {creating && !isReceiver && (
        <SupportCreateDialog
          workspace={workspace === "manager" ? "manager" : "receptionist"}
          assignees={assignees.data ?? []}
          onClose={() => setCreating(false)}
          onCreated={(message) => {
            setCreating(false);
            setNotice(message);
            clearFilters();
            refresh();
          }}
        />
      )}
    </section>
  );
}
