"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
  Send,
  Users,
  UserRoundMinus,
  X,
} from "lucide-react";
import { AsyncSection, Feedback } from "@/components/ui";
import { useApi, useAction } from "@/lib/useApi";
import { ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatTime } from "@/lib/format";
import {
  classChangeApi,
  changeRequestStatusLabel,
  coachChangeTypeLabel,
  type ClassChangeRequest,
  type ClassChangeType,
} from "./class-change-api";
import { RequestOutcome } from "./request-outcome";
import styles from "./coach-change-requests.module.css";

const changeIcons = {
  ABSENCE: UserRoundMinus,
  SUBSTITUTE: Users,
  RESCHEDULE: CalendarClock,
  CANCEL_WITH_MAKEUP: CalendarDays,
} satisfies Record<ClassChangeType, typeof Users>;

export function CoachChangeRequests() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const lock = useRef(false);
  const action = useAction();
  const state = useApi(
    (signal) => classChangeApi.list(false, { page }, signal),
    [page],
  );

  function selectRequest(id: string) {
    setSelectedId(id);
    setConfirmWithdraw(false);
    action.reset();
    if (window.matchMedia("(max-width: 760px)").matches) {
      requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({
          block: "start",
          behavior: "instant",
        });
        detailRef.current?.focus({ preventScroll: true });
      });
    }
  }

  async function withdraw(request: ClassChangeRequest) {
    if (lock.current) return;
    lock.current = true;
    try {
      const result = await action.run(
        async () => {
          try {
            return await classChangeApi.withdraw(request.requestId);
          } catch (error) {
            if (
              error instanceof ApiError &&
              (error.status === 404 ||
                error.code === "class_change_not_pending")
            ) {
              setConfirmWithdraw(false);
              state.reload();
            }
            throw error;
          }
        },
        vi
          ? "Đã rút yêu cầu. Lịch dạy vẫn giữ nguyên."
          : "Request withdrawn. Your teaching schedule is unchanged.",
      );
      if (result) {
        setConfirmWithdraw(false);
        state.reload();
      }
    } finally {
      lock.current = false;
    }
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.intro}>
        <div>
          <h2>{vi ? "Theo dõi yêu cầu vắng" : "Absence requests"}</h2>
          <p>
            {vi
              ? "Gửi yêu cầu từ buổi dạy. Theo dõi quyết định của quản lý tại đây."
              : "Request absence from a session at least 6 hours in advance. Your Manager decides the resolution; follow the outcome here."}
          </p>
        </div>
        <Link href="/coach/schedule" className="btn">
          <CalendarDays size={18} aria-hidden="true" />
          {vi ? "Chọn buổi dạy" : "Select a session"}
        </Link>
      </header>
      <div className={styles.toolbar}>
        <span className={styles.sortLabel}>
          <Clock3 size={16} aria-hidden="true" />
          {vi
            ? "Tất cả yêu cầu · Mới nhất trước"
            : "All requests · Newest first"}
        </span>
        <button
          type="button"
          className="btn btn--quiet"
          disabled={state.loading || action.busy}
          onClick={() => state.reload()}
          aria-label={vi ? "Tải lại yêu cầu" : "Refresh requests"}
          title={vi ? "Tải lại" : "Refresh"}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>
      <Feedback error={action.error} success={action.success} />
      <AsyncSection state={state}>
        {(data) => {
          const selected =
            data.items.find((item) => item.requestId === selectedId) ??
            data.items[0];
          if (!selected)
            return (
              <div className={styles.empty}>
                <CalendarClock size={40} aria-hidden="true" />
                <h3>
                  {vi ? "Chưa có yêu cầu vắng" : "No absence requests yet"}
                </h3>
                <p>
                  {vi
                    ? "Không thể dạy buổi sắp tới? Chọn buổi học và nhập lý do vắng để Manager xử lý."
                    : "Unable to teach an upcoming session? Select it and send your reason for absence. Your Manager will arrange the schedule."}
                </p>
                <Link href="/coach/schedule" className="btn btn--secondary">
                  {vi ? "Mở lịch" : "Open schedule"}
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </div>
            );
          const Icon = changeIcons[selected.type];
          return (
            <div className={styles.inbox}>
              <section
                className={styles.requestList}
                aria-label={vi ? "Danh sách yêu cầu" : "Request list"}
              >
                <div className={styles.listHeading}>
                  <strong>{vi ? "Yêu cầu của tôi" : "My requests"}</strong>
                  <span>
                    {data.totalCount} {vi ? "yêu cầu" : "requests"}
                  </span>
                </div>
                <div className={styles.rows}>
                  {data.items.map((request) => {
                    const RowIcon = changeIcons[request.type];
                    return (
                      <button
                        type="button"
                        key={request.requestId}
                        className={styles.requestRow}
                        aria-pressed={selected.requestId === request.requestId}
                        aria-controls="coach-request-detail"
                        disabled={action.busy}
                        onClick={() => selectRequest(request.requestId)}
                      >
                        <span className={styles.rowTop}>
                          <span className={styles.typeIcon}>
                            <RowIcon size={18} aria-hidden="true" />
                          </span>
                          <span
                            className={styles.badge}
                            data-status={request.status}
                          >
                            {changeRequestStatusLabel(request, vi)}
                          </span>
                        </span>
                        <strong>{request.className}</strong>
                        <span>
                          {vi ? "Buổi" : "Session"} {request.sessionNo} ·{" "}
                          {coachChangeTypeLabel(request.type, vi)}
                        </span>
                        <span className={styles.rowDate}>
                          {vi ? "Đã gửi: " : "Submitted: "}
                          {formatDateTime(request.createdAtUtc)}
                          <ChevronRight size={16} aria-hidden="true" />
                        </span>
                      </button>
                    );
                  })}
                </div>
                {data.totalCount > 50 && (
                  <div className={styles.pagination}>
                    <button
                      type="button"
                      className="btn btn--quiet"
                      aria-label={vi ? "Trang trước" : "Previous page"}
                      disabled={page === 1 || action.busy}
                      onClick={() => {
                        setPage(page - 1);
                        setSelectedId(null);
                        setConfirmWithdraw(false);
                      }}
                    >
                      <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                    <span>
                      {page} / {Math.ceil(data.totalCount / 50)}
                    </span>
                    <button
                      type="button"
                      className="btn btn--quiet"
                      aria-label={vi ? "Trang sau" : "Next page"}
                      disabled={page * 50 >= data.totalCount || action.busy}
                      onClick={() => {
                        setPage(page + 1);
                        setSelectedId(null);
                        setConfirmWithdraw(false);
                      }}
                    >
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </section>
              <section
                id="coach-request-detail"
                className={styles.detail}
                ref={detailRef}
                tabIndex={-1}
                aria-label={vi ? "Chi tiết yêu cầu" : "Request details"}
              >
                <header className={styles.detailHeader}>
                  <span className={styles.detailType}>
                    <Icon size={20} aria-hidden="true" />
                    {coachChangeTypeLabel(selected.type, vi)}
                  </span>
                  <span className={styles.badge} data-status={selected.status}>
                    {changeRequestStatusLabel(selected, vi)}
                  </span>
                  <h3>{selected.className}</h3>
                  <p>
                    {vi ? "Buổi học" : "Session"} {selected.sessionNo}
                  </p>
                </header>
                <div className={styles.scheduleComparison}>
                  <div>
                    <span>
                      <CalendarDays size={17} aria-hidden="true" />
                      {vi ? "Lịch ban đầu" : "Original session"}
                    </span>
                    <strong>
                      {formatDateTime(selected.originalStartAtUtc)}
                    </strong>
                    <small>
                      {formatTime(selected.originalStartAtUtc)} –{" "}
                      {formatTime(selected.originalEndAtUtc)}
                    </small>
                  </div>
                  {selected.type !== "ABSENCE" &&
                    selected.status === "PENDING" && (
                      <div>
                        <span>
                          <CalendarClock size={17} aria-hidden="true" />
                          {vi ? "Đề xuất trước đây" : "Earlier proposal"}
                        </span>
                        <strong>
                          {selected.proposedStartAtUtc
                            ? formatDateTime(selected.proposedStartAtUtc)
                            : coachChangeTypeLabel(selected.type, vi)}
                        </strong>
                        <small>
                          {selected.proposedStartAtUtc &&
                          selected.proposedEndAtUtc
                            ? `${formatTime(selected.proposedStartAtUtc)} – ${formatTime(selected.proposedEndAtUtc)}`
                            : vi
                              ? "Đang chờ Manager quyết định"
                              : "Awaiting your Manager’s decision"}
                        </small>
                      </div>
                    )}
                </div>
                <div className={styles.detailSection}>
                  <h4>
                    {selected.type === "ABSENCE"
                      ? vi
                        ? "Lý do vắng"
                        : "Reason for absence"
                      : vi
                        ? "Lý do thay đổi"
                        : "Reason for change"}
                  </h4>
                  <p>{selected.reason}</p>
                </div>
                <RequestOutcome request={selected} />
                <div className={styles.activity}>
                  <span>
                    <Send size={15} aria-hidden="true" />
                    {vi ? "Đã gửi" : "Submitted"}
                    <time dateTime={selected.createdAtUtc}>
                      {formatDateTime(selected.createdAtUtc)}
                    </time>
                  </span>
                </div>
                {(selected.status === "RESOLVED" ||
                  selected.resolutionType === "SCHEDULE_UPDATED") && (
                  <footer className={styles.detailFooter}>
                    <Link href="/coach/schedule" className="btn btn--secondary">
                      {vi ? "Xem lịch đã cập nhật" : "View updated schedule"}
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                  </footer>
                )}
                {selected.status === "PENDING" && (
                  <footer className={styles.detailFooter}>
                    {!confirmWithdraw && (
                      <p className={styles.hint}>
                        Submitted requests cannot be edited. You can withdraw
                        this request while it is pending.
                      </p>
                    )}
                    {confirmWithdraw ? (
                      <div className={styles.confirmation}>
                        <p>
                          {vi
                            ? "Rút yêu cầu này? Lịch dạy hiện tại vẫn giữ nguyên."
                            : "Withdraw this request? Your current teaching schedule will remain unchanged."}
                        </p>
                        <div>
                          <button
                            type="button"
                            className="btn btn--secondary"
                            disabled={action.busy}
                            onClick={() => withdraw(selected)}
                          >
                            {action.busy
                              ? vi
                                ? "Đang xử lý…"
                                : "Withdrawing…"
                              : vi
                                ? "Xác nhận rút"
                                : "Confirm withdrawal"}
                          </button>
                          <button
                            type="button"
                            className="btn btn--quiet"
                            disabled={action.busy}
                            onClick={() => setConfirmWithdraw(false)}
                          >
                            {vi ? "Giữ yêu cầu" : "Keep request"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--quiet"
                        disabled={action.busy}
                        onClick={() => setConfirmWithdraw(true)}
                      >
                        <X size={17} aria-hidden="true" />
                        {vi ? "Rút yêu cầu" : "Withdraw request"}
                      </button>
                    )}
                  </footer>
                )}
              </section>
            </div>
          );
        }}
      </AsyncSection>
    </div>
  );
}
