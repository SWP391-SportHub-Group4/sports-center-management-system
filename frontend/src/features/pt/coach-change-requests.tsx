"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MessageSquare,
  RefreshCw,
  Send,
  Users,
  X,
} from "lucide-react";
import { AsyncSection, Feedback } from "@/components/ui";
import { useApi, useAction } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatTime } from "@/lib/format";
import {
  classChangeApi,
  changeStatusLabel,
  changeTypeLabel,
  type ClassChangeRequest,
  type ClassChangeType,
} from "./class-change-api";
import styles from "./coach-change-requests.module.css";

const changeIcons = {
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
        () => classChangeApi.withdraw(request.requestId),
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
          <h2>
            {vi
              ? "Theo dõi thay đổi lịch dạy"
              : "Keep track of schedule changes"}
          </h2>
          <p>
            {vi
              ? "Gửi yêu cầu từ buổi dạy. Theo dõi quyết định của quản lý tại đây."
              : "Request changes from your teaching schedule. Follow your Manager’s decisions here."}
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
                  {vi ? "Chưa có yêu cầu đổi lịch" : "No change requests yet"}
                </h3>
                <p>
                  {vi
                    ? "Cần đổi lịch? Chọn một buổi dạy sắp tới, sau đó gửi yêu cầu dạy thay, dời lịch hoặc học bù."
                    : "Need a change? Select an upcoming session to request a substitute, reschedule or makeup session."}
                </p>
                <Link href="/coach/schedule" className="btn btn--secondary">
                  {vi ? "Mở lịch dạy" : "Open teaching schedule"}
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
                            {changeStatusLabel(request.status, vi)}
                          </span>
                        </span>
                        <strong>{request.className}</strong>
                        <span>
                          {vi ? "Buổi" : "Session"} {request.sessionNo} ·{" "}
                          {changeTypeLabel(request.type, vi)}
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
                    {changeTypeLabel(selected.type, vi)}
                  </span>
                  <span className={styles.badge} data-status={selected.status}>
                    {changeStatusLabel(selected.status, vi)}
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
                  <ArrowRight
                    size={20}
                    className={styles.comparisonArrow}
                    aria-hidden="true"
                  />
                  <div>
                    <span>
                      <CalendarClock size={17} aria-hidden="true" />
                      {vi ? "Đề xuất của bạn" : "Your proposal"}
                    </span>
                    <strong>
                      {selected.proposedStartAtUtc
                        ? formatDateTime(selected.proposedStartAtUtc)
                        : changeTypeLabel(selected.type, vi)}
                    </strong>
                    <small>
                      {selected.proposedStartAtUtc && selected.proposedEndAtUtc
                        ? `${formatTime(selected.proposedStartAtUtc)} – ${formatTime(selected.proposedEndAtUtc)}`
                        : vi
                          ? "Quản lý xác nhận phương án cuối cùng"
                          : "Final arrangement confirmed by your Manager"}
                    </small>
                  </div>
                </div>
                <div className={styles.detailSection}>
                  <h4>{vi ? "Lý do thay đổi" : "Reason for change"}</h4>
                  <p>{selected.reason}</p>
                </div>
                <div className={styles.detailSection}>
                  <h4>
                    <MessageSquare size={18} aria-hidden="true" />
                    {vi ? "Phản hồi của quản lý" : "Manager response"}
                  </h4>
                  {selected.status === "PENDING" ? (
                    <div className={styles.reviewMessage} data-status="PENDING">
                      <Clock3 size={20} aria-hidden="true" />
                      <p>
                        {vi
                          ? "Đang chờ duyệt. Lịch dạy hiện tại vẫn có hiệu lực; hãy liên hệ trực tiếp với quản lý nếu cần xử lý gấp."
                          : "Awaiting review. Your current schedule remains in effect; contact your Manager directly for urgent changes."}
                      </p>
                    </div>
                  ) : selected.status === "WITHDRAWN" ? (
                    <p>
                      {vi
                        ? "Bạn đã rút yêu cầu này. Lịch dạy không thay đổi."
                        : "You withdrew this request. Your teaching schedule is unchanged."}
                    </p>
                  ) : (
                    <div
                      className={styles.reviewMessage}
                      data-status={selected.status}
                    >
                      {selected.status === "RESOLVED" ? (
                        <CheckCircle2 size={20} aria-hidden="true" />
                      ) : (
                        <X size={20} aria-hidden="true" />
                      )}
                      <div>
                        {selected.resolutionType && (
                          <strong>
                            {changeTypeLabel(selected.resolutionType, vi)}
                          </strong>
                        )}
                        <p>
                          {selected.reviewNote ||
                            (vi
                              ? "Quản lý đã cập nhật trạng thái yêu cầu."
                              : "Your Manager updated this request’s status.")}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className={styles.activity}>
                  <span>
                    <Send size={15} aria-hidden="true" />
                    {vi ? "Đã gửi" : "Submitted"}
                    <time dateTime={selected.createdAtUtc}>
                      {formatDateTime(selected.createdAtUtc)}
                    </time>
                  </span>
                  {selected.reviewedAtUtc && (
                    <span>
                      <CheckCircle2 size={15} aria-hidden="true" />
                      {vi ? "Đã xem xét" : "Reviewed"}
                      <time dateTime={selected.reviewedAtUtc}>
                        {formatDateTime(selected.reviewedAtUtc)}
                      </time>
                    </span>
                  )}
                </div>
                {selected.status === "RESOLVED" && (
                  <footer className={styles.detailFooter}>
                    <Link href="/coach/schedule" className="btn btn--secondary">
                      {vi ? "Xem lịch đã cập nhật" : "View updated schedule"}
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                  </footer>
                )}
                {selected.status === "PENDING" && (
                  <footer className={styles.detailFooter}>
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
