"use client";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { Drawer } from "@/components/primitives";
import { AsyncSection, Feedback } from "@/components/ui";
import { CourseSticker } from "@/features/courses";
import { api } from "@/lib/apiClient";
import { useApi, useAction } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { vietnamLocal, vietnamUtc } from "@/lib/vietnam-time";
import { catalogApi } from "@/features/catalog";
import type { CoachAdminDto, Paged } from "@/lib/types";
import {
  classChangeApi,
  changeTypeLabel,
  changeStatusLabel,
  type ClassChangeRequest,
  type ClassChangeType,
  classChangeStyles as styles,
} from "@/features/pt";

export function ManagerClassChangeRequests({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [classId, setClassId] = useState("");
  const [coachId, setCoachId] = useState("");
  const filters = useApi(
    (signal) =>
      api.get<{
        classes: { classId: number; name: string }[];
        coaches: { coachId: string; name: string }[];
      }>("/api/manager/class-session-change-requests/filters", { signal }),
    [],
  );
  const [selected, setSelected] = useState<ClassChangeRequest | null>(null);
  const state = useApi(
    (signal) =>
      classChangeApi.list(
        true,
        {
          page,
          status: status || undefined,
          classId: classId ? Number(classId) : undefined,
          coachId: coachId || undefined,
        },
        signal,
      ),
    [page, status, classId, coachId],
  );
  return (
    <section
      className={styles.panel}
      aria-label={
        vi ? "Yêu cầu thay đổi lịch lớp" : "Class schedule change requests"
      }
    >
      <header className={styles.heading}>
        <h2>
          {vi ? "Yêu cầu thay đổi lịch lớp" : "Class schedule change requests"}
        </h2>
        <button
          type="button"
          className="btn btn--quiet btn--sm"
          onClick={() => state.reload()}
          disabled={state.loading}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {vi ? "Cập nhật" : "Refresh"}
        </button>
      </header>
      <p className={styles.hint}>
        {vi
          ? "Xem lý do từ Coach và xác nhận phương án phù hợp. Học viên chỉ nhận thay đổi lịch sau khi xử lý thành công."
          : "Review the Coach’s reason and confirm a suitable resolution. Students receive schedule changes only after the operation succeeds."}
      </p>
      <div className={styles.filters}>
        <label>
          {vi ? "Trạng thái" : "Status"}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{vi ? "Tất cả" : "All"}</option>
            {["PENDING", "RESOLVED", "REJECTED", "WITHDRAWN"].map((id) => (
              <option key={id} value={id}>
                {changeStatusLabel(id, vi)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {vi ? "Khóa học" : "Class"}
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{vi ? "Tất cả khóa" : "All classes"}</option>
            {filters.data?.classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {vi ? "Coach" : "Coach"}
          <select
            value={coachId}
            onChange={(e) => {
              setCoachId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{vi ? "Tất cả Coach" : "All coaches"}</option>
            {filters.data?.coaches.map((c) => (
              <option key={c.coachId} value={c.coachId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <AsyncSection state={state}>
        {(data) => (
          <>
            {!data.items.length ? (
              <div className={styles.empty}>
                <CourseSticker sport="Badminton" compact />
                <p className={styles.hint}>
                  {vi
                    ? "Không có yêu cầu trong bộ lọc này."
                    : "No requests match these filters."}
                </p>
              </div>
            ) : (
              <div className={styles.queue}>
                {data.items.map((r) => (
                  <button
                    type="button"
                    className={styles.row}
                    key={r.requestId}
                    onClick={() => setSelected(r)}
                  >
                    <span>
                      <strong>
                        {r.className} · {vi ? "Buổi" : "Session"} {r.sessionNo}
                      </strong>
                      <small>
                        {r.coachName} · {changeTypeLabel(r.type, vi)}
                      </small>
                      <small>{formatDateTime(r.originalStartAtUtc)}</small>
                      <small>
                        {vi ? "Gửi lúc " : "Requested "}
                        {formatDateTime(r.createdAtUtc)}
                      </small>
                    </span>
                    <span className={styles.status} data-status={r.status}>
                      {changeStatusLabel(r.status, vi)}{" "}
                      <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {data.totalCount > 50 && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  {vi ? "Trước" : "Previous"}
                </button>
                <span>
                  {page} / {Math.ceil(data.totalCount / 50)}
                </span>
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  disabled={page * 50 >= data.totalCount}
                  onClick={() => setPage(page + 1)}
                >
                  {vi ? "Tiếp" : "Next"}
                </button>
              </div>
            )}
          </>
        )}
      </AsyncSection>
      {selected && (
        <ReviewDrawer
          key={selected.requestId}
          request={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            state.reload();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}

function ReviewDrawer({
  request: r,
  onClose,
  onSaved,
}: {
  request: ClassChangeRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const action = useAction();
  const lock = useRef(false);
  const [type, setType] = useState<ClassChangeType | "REJECT">(r.type);
  const [note, setNote] = useState("");
  const [start, setStart] = useState(
    r.proposedStartAtUtc ? vietnamLocal(r.proposedStartAtUtc) : "",
  );
  const [coach, setCoach] = useState("");
  const [room, setRoom] = useState(String(r.originalRoomId));
  const [dirty, setDirty] = useState(false);
  const rooms = useApi(
    (signal) =>
      r.status === "PENDING" ? catalogApi.rooms(signal) : Promise.resolve([]),
    [r.status],
  );
  const coaches = useApi(
    async (signal) => {
      if (r.status !== "PENDING") return [];
      const all: CoachAdminDto[] = [];
      let page = 1;
      while (true) {
        const data = await api.get<Paged<CoachAdminDto>>(
          "/api/manager/coaches",
          { signal, query: { sportId: r.sportId, page, pageSize: 100 } },
        );
        all.push(...data.items);
        if (!data.items.length || all.length >= data.totalCount) break;
        page++;
      }
      return all.filter((c) => c.status === "ACTIVE" && c.userId !== r.coachId);
    },
    [r.status, r.sportId, r.coachId],
  );
  const cancel = () => {
    if (
      !action.busy &&
      (!dirty ||
        window.confirm(
          vi ? "Bỏ phương án chưa lưu?" : "Discard this unsaved resolution?",
        ))
    )
      onClose();
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    try {
      const saved = await action.run(() =>
        type === "REJECT"
          ? classChangeApi.reject(r.requestId, note.trim())
          : classChangeApi.resolve(r.requestId, {
              type,
              reviewNote: note.trim(),
              startAtUtc: type === "SUBSTITUTE" ? null : vietnamUtc(start),
              roomId: room ? Number(room) : null,
              coachId: coach || null,
            }),
      );
      if (saved) onSaved();
    } finally {
      lock.current = false;
    }
  }
  return (
    <Drawer
      size="lg"
      title={vi ? "Xử lý yêu cầu đổi lịch" : "Review schedule change"}
      description={`${r.className} · ${vi ? "Buổi" : "Session"} ${r.sessionNo}`}
      onClose={cancel}
    >
      <div className={styles.panel}>
        <span className={styles.status} data-status={r.status}>
          {changeStatusLabel(r.status, vi)}
        </span>
        <div className={styles.facts}>
          <strong>
            {r.coachName} · {changeTypeLabel(r.type, vi)}
          </strong>
          <p>
            {formatDateTime(r.originalStartAtUtc)} –{" "}
            {formatDateTime(r.originalEndAtUtc)}
          </p>
          <p>{r.reason}</p>
          {r.proposedStartAtUtc && (
            <p>
              {vi ? "Giờ đề xuất: " : "Suggested time: "}
              {formatDateTime(r.proposedStartAtUtc)}
            </p>
          )}
        </div>
        <Feedback error={action.error} />
        {r.status === "PENDING" ? (
          <form
            className={styles.form}
            onSubmit={submit}
            onChange={() => setDirty(true)}
          >
            <label>
              {vi ? "Quyết định" : "Decision"}
              <select
                value={type}
                disabled={action.busy}
                onChange={(e) => {
                  setType(e.target.value as ClassChangeType | "REJECT");
                  setCoach("");
                }}
              >
                {(
                  ["SUBSTITUTE", "RESCHEDULE", "CANCEL_WITH_MAKEUP"] as const
                ).map((id) => (
                  <option key={id} value={id}>
                    {changeTypeLabel(id, vi)}
                  </option>
                ))}
                <option value="REJECT">
                  {vi ? "Từ chối yêu cầu" : "Reject request"}
                </option>
              </select>
            </label>
            {type !== "REJECT" && (
              <>
                {type !== "SUBSTITUTE" && (
                  <label>
                    {type === "CANCEL_WITH_MAKEUP"
                      ? vi
                        ? "Giờ bắt đầu buổi bù"
                        : "Makeup start"
                      : vi
                        ? "Giờ bắt đầu mới"
                        : "New start"}
                    <input
                      type="datetime-local"
                      required
                      value={start}
                      disabled={action.busy}
                      onChange={(e) => setStart(e.target.value)}
                    />
                    <small>
                      {vi
                        ? "Giờ Việt Nam; thời lượng giữ nguyên. Buổi bù phải sau buổi cuối của khóa."
                        : "Vietnam time; duration stays unchanged. Makeup must follow the course’s final session."}
                    </small>
                  </label>
                )}
                <label>
                  {vi ? "Coach thực hiện" : "Assigned coach"}
                  <select
                    value={coach}
                    required={type === "SUBSTITUTE"}
                    disabled={action.busy || coaches.loading || !!coaches.error}
                    onChange={(e) => setCoach(e.target.value)}
                  >
                    <option value="">
                      {type === "SUBSTITUTE"
                        ? vi
                          ? "Chọn Coach dạy thay"
                          : "Select substitute coach"
                        : vi
                          ? "Giữ Coach hiện tại"
                          : "Keep current coach"}
                    </option>
                    {coaches.data?.map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.fullName}
                      </option>
                    ))}
                  </select>
                  <small>
                    {vi
                      ? "Coach đang hoạt động và có chuyên môn phù hợp. Hệ thống kiểm lịch trống khi lưu."
                      : "Active coaches with matching specialty. Availability is rechecked on save."}
                  </small>
                </label>
                <Feedback error={coaches.error?.message} />
                {type !== "SUBSTITUTE" && (
                  <label>
                    {vi ? "Sân / phòng" : "Court / room"}
                    <select
                      value={room}
                      disabled={action.busy || rooms.loading || !!rooms.error}
                      onChange={(e) => setRoom(e.target.value)}
                    >
                      <option value="">
                        {vi ? "Giữ sân hiện tại" : "Keep current court"}
                      </option>
                      {rooms.data?.map((s) => (
                        <option key={s.roomId} value={s.roomId}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <Feedback error={rooms.error?.message} />
              </>
            )}
            <label>
              {vi
                ? "Lý do xử lý / phản hồi cho Coach"
                : "Decision reason / feedback to Coach"}
              <textarea
                rows={3}
                required
                minLength={3}
                maxLength={500}
                value={note}
                disabled={action.busy}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p className={styles.hint}>
              {type === "REJECT"
                ? vi
                  ? "Lịch học giữ nguyên khi từ chối."
                  : "Rejecting keeps the current schedule unchanged."
                : vi
                  ? "Xác nhận sẽ cập nhật lịch và gửi thông báo. Nếu phương án xung đột, lịch cũ và yêu cầu được giữ nguyên."
                  : "Confirmation updates the schedule and sends notifications. On conflict, the current schedule and request remain unchanged."}
            </p>
            <div className={styles.actions}>
              <button
                className="btn"
                disabled={
                  action.busy ||
                  note.trim().length < 3 ||
                  (type === "SUBSTITUTE" &&
                    (coaches.loading || !!coaches.error)) ||
                  (type !== "SUBSTITUTE" &&
                    type !== "REJECT" &&
                    (rooms.loading || !!rooms.error))
                }
              >
                <Check size={16} aria-hidden="true" />
                {action.busy
                  ? vi
                    ? "Đang xử lý…"
                    : "Processing…"
                  : vi
                    ? "Xác nhận quyết định"
                    : "Confirm decision"}
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                disabled={action.busy}
                onClick={cancel}
              >
                {vi ? "Đóng" : "Close"}
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.facts}>
            <strong>
              {r.resolutionType
                ? changeTypeLabel(r.resolutionType, vi)
                : changeStatusLabel(r.status, vi)}
            </strong>
            <p>{r.reviewNote ?? r.reason}</p>
            {r.reviewedAtUtc && <p>{formatDateTime(r.reviewedAtUtc)}</p>}
          </div>
        )}
      </div>
    </Drawer>
  );
}
