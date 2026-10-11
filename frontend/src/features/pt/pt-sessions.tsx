"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Drawer, Tabs } from "@/components/primitives";
import { CourseSticker } from "@/features/courses";
import { CourtCalendar } from "@/features/court-schedule";
import Link from "next/link";
import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";
import { useApi, useNow } from "@/lib/useApi";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatDate, formatTime } from "@/lib/format";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { PtEntitlementDto, PtSessionDto } from "@/lib/types";
import { ptApi } from "./api";
import { ListPager, Specialty } from "./ui";
import { PtQuotaSummary } from "./pt-quota-summary";
import { PtSessionEditor } from "./pt-session-editor";
import { PtStudentPreparation, PtStudentHistory } from "./pt-student-panel";
import { ResultEditor } from "./workout-result-form";
import styles from "./pt-coach-workspace.module.css";
import workspace from "./coach-workspace.module.css";

function SessionActions({
  session: s,
  manager,
  hasPt,
  reload,
  compact = false,
  beforeChange,
}: {
  session: PtSessionDto;
  manager: boolean;
  hasPt: boolean;
  reload: () => void;
  compact?: boolean;
  beforeChange?: () => boolean;
}) {
  const { t, language } = useLanguage();
  const l = t.staffWork;
  const mutation = useMutation();
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const now = useNow();
  const attendanceOpen =
    now >= Date.parse(s.startAtUtc) - 5 * 60_000 &&
    now <= Date.parse(s.endAtUtc) + 24 * 60 * 60_000;
  async function perform(action: string) {
    if (!manager && !attendanceOpen) return;
    if (
      !manager &&
      !window.confirm(
        language === "vi"
          ? action === "complete"
            ? "Xác nhận học viên có mặt và hoàn thành buổi PT này?"
            : "Xác nhận học viên vắng mặt trong buổi PT này?"
          : action === "complete"
            ? "Confirm the student was present and completed this PT session?"
            : "Confirm the student did not attend this PT session?",
      )
    )
      return;
    if (beforeChange && !beforeChange()) return;
    const ok = await mutation.run(() =>
      api.post(
        `/api/${manager ? "manager" : "coaches/me"}/pt-sessions/${s.sessionId}/${action}`,
        action === "complete" ? undefined : { reason: reason.trim() },
      ),
    );
    if (ok || mutation.error?.status === 409) reload();
  }
  const content = (
    <>
      {manager && (
        <p>
          {formatDateTime(s.startAtUtc)} – {formatDateTime(s.endAtUtc)} ·{" "}
          {s.roomName ?? l.noRoom}
        </p>
      )}
      {!compact && (
        <p>
          {manager && (
            <>
              <StatusChip value={s.status} /> ·{" "}
            </>
          )}
          <StatusChip value={s.quotaState} />
        </p>
      )}
      {s.cancellationReason && <p>{s.cancellationReason}</p>}
      {!compact && s.rescheduledFromSessionId && (
        <p>
          {l.previousSession}: {s.rescheduledFromSessionId}
        </p>
      )}
      {(manager
        ? s.status === "SCHEDULED"
        : hasPt &&
          ["SCHEDULED", "COMPLETED", "NO_SHOW"].includes(s.status)) && (
        <>
          {manager && (
            <Field label={l.reason}>
              <textarea
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          <div className="btn-row">
            {manager ? (
              <>
                <button
                  className="btn btn--secondary"
                  disabled={mutation.busy}
                  onClick={() => setEditing(!editing)}
                >
                  {l.reschedule}
                </button>
                <button
                  className="btn btn--danger"
                  disabled={mutation.busy || reason.trim().length < 3}
                  onClick={() => perform("cancel")}
                >
                  {l.cancelSession}
                </button>
              </>
            ) : (
              <>
                <button
                  className={
                    s.status === "NO_SHOW" ? "btn btn--secondary" : "btn"
                  }
                  aria-pressed={s.status === "COMPLETED"}
                  disabled={
                    mutation.busy || !attendanceOpen || s.status === "COMPLETED"
                  }
                  onClick={() => perform("complete")}
                >
                  Present
                </button>
                <button
                  className={
                    s.status === "NO_SHOW"
                      ? "btn btn--danger"
                      : "btn btn--secondary"
                  }
                  aria-pressed={s.status === "NO_SHOW"}
                  disabled={
                    mutation.busy || !attendanceOpen || s.status === "NO_SHOW"
                  }
                  onClick={() => perform("no-show")}
                >
                  Absent
                </button>
              </>
            )}
          </div>
        </>
      )}
      {!compact && !manager && hasPt && s.status === "COMPLETED" && (
        <Link
          className="btn btn--secondary"
          href={`/coach/progress?sessionId=${s.sessionId}`}
        >
          {l.results}
        </Link>
      )}
      <MutationFeedback mutation={mutation} />
      {editing && <PtSessionEditor session={s} onSaved={reload} />}
    </>
  );
  return manager ? (
    <Card title={`${s.memberName} · ${s.coachName}`}>{content}</Card>
  ) : (
    <div className={styles.section}>{content}</div>
  );
}
function SessionList({ manager, hasPt }: { manager: boolean; hasPt: boolean }) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [entitlement, setEntitlement] = useState<PtEntitlementDto | null>(null);
  const state = useApi(
    (signal) => ptApi.sessions(manager, page, signal),
    [manager, page, revision],
  );
  const reload = () => {
    setRevision((r) => r + 1);
    setEntitlement(null);
  };
  return (
    <>
      {!manager && !hasPt && (
        <p role="status">{t.staffWork.specialtyWarning}</p>
      )}
      <PtQuotaSummary
        key={revision}
        manager={manager}
        onSelect={manager ? setEntitlement : undefined}
      />
      {entitlement && (
        <PtSessionEditor
          key={entitlement.entitlementId}
          entitlement={entitlement}
          onSaved={reload}
        />
      )}
      <Card
        title={t.staffWork.sessions}
        actions={
          <button className="btn btn--secondary" onClick={state.reload}>
            {t.common.retry}
          </button>
        }
      >
        <AsyncSection state={state}>
          {(rows) => (
            <>
              <div className="stack">
                {rows.map((s) => (
                  <SessionActions
                    key={`${s.sessionId}-${s.status}`}
                    session={s}
                    manager={manager}
                    hasPt={hasPt}
                    reload={reload}
                  />
                ))}
              </div>
              {!rows.length && <p>{t.common.noData}</p>}
              <ListPager page={page} count={rows.length} onChange={setPage} />
            </>
          )}
        </AsyncSection>
      </Card>
    </>
  );
}
export function PtSessions({ manager = false }: { manager?: boolean }) {
  return manager ? (
    <SessionList manager hasPt />
  ) : (
    <Specialty>
      {(hasPt) =>
        hasPt ? (
          <CoachSessionList />
        ) : (
          <SessionList manager={false} hasPt={hasPt} />
        )
      }
    </Specialty>
  );
}

export function CoachPtSchedule() {
  const [selected, setSelected] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  return (
    <>
      <CourtCalendar
        refreshToken={revision}
        includeCoachPt
        planningLayout
        onSelectPtSession={setSelected}
      />
      <CoachSessionList
        calendarOnly
        selectedSessionId={selected}
        onSelectSession={setSelected}
        onChanged={() => setRevision((value) => value + 1)}
      />
    </>
  );
}

function CoachSessionList({
  calendarOnly = false,
  selectedSessionId,
  onSelectSession,
  onChanged,
}: {
  calendarOnly?: boolean;
  selectedSessionId?: string | null;
  onSelectSession?: (id: string | null) => void;
  onChanged?: () => void;
} = {}) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const now = useNow();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [tab, setTab] = useState("prepare");
  const dirty = useRef(false);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);
  const discard = () =>
    !dirty.current ||
    window.confirm(
      vi ? "Bỏ các thay đổi chưa lưu?" : "Discard unsaved changes?",
    );
  const changeTab = (value: string) => {
    if (value !== tab && discard()) {
      dirty.current = false;
      setTab(value);
    }
  };
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const sessionId =
    selectedSessionId === undefined ? localSessionId : selectedSessionId;
  const setSessionId = onSelectSession ?? setLocalSessionId;
  const state = useApi(
    (signal) =>
      calendarOnly
        ? Promise.resolve([])
        : ptApi.sessions(false, page, signal, status || undefined),
    [page, status, calendarOnly],
  );
  const detail = useApi(
    (signal) =>
      sessionId
        ? api.get<PtSessionDto>(`/api/coaches/me/pt-sessions/${sessionId}`, {
            signal,
          })
        : Promise.resolve(null),
    [sessionId],
  );
  const reload = () => {
    state.reload();
    detail.reload();
    onChanged?.();
  };
  return (
    <>
      {!calendarOnly && (
        <section className={styles.section}>
          <div className={styles.toolbar}>
            <div>
              <h2>
                {vi
                  ? "Các buổi huấn luyện cá nhân"
                  : "Personal training sessions"}
              </h2>
              <p className="muted">
                {vi
                  ? "Chọn một buổi để xem học viên, trạng thái và cập nhật kết quả."
                  : "Select a session to view the student, status and update results."}
              </p>
            </div>
            <button className="btn btn--secondary" onClick={reload}>
              {vi ? "Cập nhật" : "Refresh"}
            </button>
          </div>
          <Field label={t.staffWork.status}>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">
                {vi ? "Tất cả trạng thái" : "All statuses"}
              </option>
              {[
                "SCHEDULED",
                "COMPLETED",
                "NO_SHOW",
                "CANCELLED",
                "RESCHEDULED",
              ].map((value) => (
                <option key={value} value={value}>
                  {
                    {
                      SCHEDULED: vi ? "Đã lên lịch" : "Scheduled",
                      COMPLETED: vi ? "Hoàn thành" : "Completed",
                      NO_SHOW: vi ? "Vắng mặt" : "No show",
                      CANCELLED: vi ? "Đã hủy" : "Cancelled",
                      RESCHEDULED: vi ? "Đã dời lịch" : "Rescheduled",
                    }[value]
                  }
                </option>
              ))}
            </select>
          </Field>
          <AsyncSection state={state}>
            {(rows) => (
              <>
                <div className={styles.list}>
                  {rows.map((s) => (
                    <button
                      key={s.sessionId}
                      className={styles.session}
                      onClick={() => setSessionId(s.sessionId)}
                    >
                      <span>
                        <strong>
                          {formatTime(s.startAtUtc)} – {formatTime(s.endAtUtc)}
                        </strong>
                        <small>{formatDate(s.startAtUtc)}</small>
                      </span>
                      <span>
                        <strong>{s.memberName}</strong>
                        <small>{s.roomName ?? t.staffWork.noRoom}</small>
                      </span>
                      <StatusChip value={s.status} />
                      <ArrowRight size={18} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                {!rows.length && (
                  <div className={workspace.empty}>
                    <CourseSticker sport="Gym" compact />
                    <p>
                      {vi
                        ? "Chưa có buổi PT ở trạng thái này. Lịch đã xác nhận sẽ xuất hiện tại đây."
                        : "No PT sessions in this status. Confirmed sessions will appear here."}
                    </p>
                  </div>
                )}
                <ListPager page={page} count={rows.length} onChange={setPage} />
              </>
            )}
          </AsyncSection>
          <details className={styles.disclosure}>
            <summary>
              {vi ? "Quyền lợi PT của học viên" : "Student PT entitlements"}
            </summary>
            <PtQuotaSummary />
          </details>
        </section>
      )}
      {sessionId && (
        <Drawer
          title={vi ? "Chi tiết buổi PT" : "PT session details"}
          size="lg"
          onClose={() => {
            if (discard()) {
              dirty.current = false;
              setTab("prepare");
              setSessionId(null);
            }
          }}
        >
          <AsyncSection state={detail}>
            {(s) =>
              s && (
                <div
                  className={workspace.detail}
                  onChangeCapture={(event) => {
                    if ((event.target as HTMLElement).closest("form"))
                      dirty.current = true;
                  }}
                >
                  <dl className={styles.facts}>
                    <div>
                      <dt>{t.staffWork.member}</dt>
                      <dd>{s.memberName}</dd>
                    </div>
                    <div>
                      <dt>{t.staffWork.time}</dt>
                      <dd>
                        {formatDate(s.startAtUtc)} · {formatTime(s.startAtUtc)}–
                        {formatTime(s.endAtUtc)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t.staffWork.room}</dt>
                      <dd>{s.roomName ?? t.staffWork.noRoom}</dd>
                    </div>
                    <div>
                      <dt>{t.staffWork.status}</dt>
                      <dd>
                        <StatusChip
                          value={s.status}
                          label={
                            new Date(s.endAtUtc).getTime() <= now
                              ? s.status === "COMPLETED"
                                ? "Present"
                                : s.status === "NO_SHOW"
                                  ? "Absent"
                                  : s.status === "SCHEDULED"
                                    ? vi
                                      ? "Chưa điểm danh"
                                      : "Attendance pending"
                                    : undefined
                              : undefined
                          }
                        />
                      </dd>
                    </div>
                  </dl>
                  <Tabs
                    value={tab}
                    onChange={changeTab}
                    ariaLabel={
                      vi ? "Thông tin buổi PT" : "PT session information"
                    }
                    tabs={[
                      { id: "prepare", label: vi ? "Chuẩn bị" : "Preparation" },
                      { id: "record", label: vi ? "Ghi nhận" : "Record" },
                      { id: "history", label: vi ? "Lịch sử" : "History" },
                    ]}
                  >
                    {tab === "prepare" && (
                      <PtStudentPreparation
                        memberId={s.memberId}
                        editable={
                          s.status === "SCHEDULED" &&
                          new Date(s.endAtUtc).getTime() > now
                        }
                        onSaved={() => {
                          dirty.current = false;
                        }}
                      />
                    )}
                    {tab === "record" && (
                      <section className={styles.panelSection}>
                        <h3>
                          {vi ? "Ghi nhận buổi tập" : "Record this session"}
                        </h3>
                        {["SCHEDULED", "COMPLETED", "NO_SHOW"].includes(
                          s.status,
                        ) && (
                          <p className="muted">
                            {vi
                              ? "Điểm danh mở từ 5 phút trước giờ bắt đầu đến 24 giờ sau khi kết thúc buổi tập."
                              : "Attendance opens 5 minutes before the session starts and closes 24 hours after it ends."}
                          </p>
                        )}
                        {(["SCHEDULED", "COMPLETED", "NO_SHOW"].includes(
                          s.status,
                        ) ||
                          s.cancellationReason) && (
                          <SessionActions
                            key={`${s.sessionId}-${s.status}`}
                            session={s}
                            manager={false}
                            hasPt
                            compact
                            beforeChange={discard}
                            reload={() => {
                              dirty.current = false;
                              reload();
                            }}
                          />
                        )}
                        {s.status === "COMPLETED" ? (
                          <ResultEditor
                            session={s}
                            compact
                            reload={() => {
                              dirty.current = false;
                              onChanged?.();
                            }}
                          />
                        ) : (
                          s.status !== "SCHEDULED" && (
                            <p className="muted">
                              {vi
                                ? "Buổi này không diễn ra nên không ghi kết quả tập luyện."
                                : "This session did not take place; workout results cannot be recorded."}
                            </p>
                          )
                        )}
                      </section>
                    )}
                    {tab === "history" && (
                      <PtStudentHistory memberId={s.memberId} />
                    )}
                  </Tabs>
                  <div className={workspace.detailSticker}>
                    <CourseSticker sport="Gym" compact />
                  </div>
                </div>
              )
            }
          </AsyncSection>
        </Drawer>
      )}
    </>
  );
}
