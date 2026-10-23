"use client";
import { useState } from "react";
import { ArrowLeft, Clock3, Lock, Pencil, Search } from "lucide-react";
import { TableFilters } from "@/components/data/TableFilters";
import { UserAvatar } from "./UserAvatar";
import { api } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { formatDate, formatTime } from "@/lib/format";
import { AsyncSection, Card, Dialog, Table } from "@/components/ui";
import type { CourseRosterDto } from "@/lib/types";
import { phaseLabel, sessionPhase } from "./attendance-window";
import styles from "./AttendanceBoard.module.css";
import hub from "./AttendanceHub.module.css";

type Filter = "ALL" | "PRESENT" | "ABSENT" | "UNMARKED";

/** Member roster of one class session: mark attendance while it runs, correct it within 24 hours after it ends. */
export function AttendanceRoster({
  sessionId,
  writable,
  startEditing = false,
  onBack,
}: {
  sessionId: string;
  writable: boolean;
  /** Open a finished session straight in correction mode. */
  startEditing?: boolean;
  onBack?: () => void;
}) {
  const now = useNow(30_000);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editing, setEditing] = useState(startEditing);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [openOptions, setOpenOptions] = useState<string | null>(null);

  const roster = useApi(
    (signal) =>
      api.get<CourseRosterDto>(`/api/class-sessions/${sessionId}/roster`, {
        signal,
      }),
    [sessionId],
  );

  async function mark(id: string, status: "PRESENT" | "ABSENT") {
    const key = `${sessionId}-${id}`;
    setBusy((previous) => ({ ...previous, [key]: true }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
    try {
      await api.put(`/api/class-sessions/${sessionId}/attendance/${id}`, {
        status,
      });
      return true;
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        [key]: (error as Error).message,
      }));
      return false;
    } finally {
      setBusy((previous) => ({ ...previous, [key]: false }));
    }
  }

  return (
    <div className={styles.board}>
      {onBack && (
        <div>
          <button type="button" className={hub.backButton} onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" /> Quay lại
          </button>
        </div>
      )}
      <AsyncSection state={roster}>
        {(data) => {
          const phase = sessionPhase(
            data.session.startAtUtc,
            data.session.endAtUtc,
            now,
          );
          const canMark =
            writable && (phase === "live" || (phase === "editable" && editing));
          const confirmed = data.entries.filter(
            (entry) => entry.enrollmentStatus === "CONFIRMED",
          );
          const present = confirmed.filter(
            (entry) => entry.attendanceStatus === "PRESENT",
          ).length;
          const absent = confirmed.filter(
            (entry) => entry.attendanceStatus === "ABSENT",
          ).length;
          const unmarked = confirmed.length - present - absent;
          const query = search.trim().toLowerCase();
          const searched = confirmed.filter(
            (entry) =>
              entry.memberName.toLowerCase().includes(query) ||
              entry.enrollmentId.toLowerCase().includes(query),
          );
          const rows = searched.filter(
            (entry) =>
              filter === "ALL" ||
              (filter === "UNMARKED"
                ? !entry.attendanceStatus ||
                  entry.attendanceStatus === "NOT_RECORDED"
                : entry.attendanceStatus === filter),
          );
          const markable = rows.filter(
            (entry) =>
              entry.attendanceStatus !== "PRESENT" &&
              entry.memberIsActive !== false,
          );
          const filters: { key: Filter; label: string; count: number }[] = [
            { key: "ALL", label: "All", count: confirmed.length },
            { key: "PRESENT", label: "Present", count: present },
            { key: "ABSENT", label: "Absent", count: absent },
            { key: "UNMARKED", label: "Pending", count: unmarked },
          ];
          return (
            <>
              <section
                className={styles.summary}
                aria-label="Thông tin buổi học"
              >
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Lớp</span>
                  <strong className={styles.summaryValue}>
                    {data.session.className}
                  </strong>
                  <small className={hub.muted}>
                    Buổi {data.session.sessionNo} ·{" "}
                    {formatDate(data.session.startAtUtc)}{" "}
                    {formatTime(data.session.startAtUtc)}–
                    {formatTime(data.session.endAtUtc)}
                  </small>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Huấn luyện viên</span>
                  <strong className={styles.summaryValue}>
                    {data.session.coachName || "—"}
                  </strong>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Attendance</span>
                  <strong className={styles.summaryValue}>
                    {confirmed.length > 0 && unmarked === 0
                      ? "Completed"
                      : "Pending"}{" "}
                    · {present + absent}/{confirmed.length}
                  </strong>
                  <progress
                    className={styles.progress}
                    value={present + absent}
                    max={confirmed.length || 1}
                    aria-label="Tiến độ điểm danh"
                  />
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Trạng thái</span>
                  <span
                    className={`${hub.phaseBadge} ${hub[`phase_${phase}`]}`}
                  >
                    {phase === "locked" ? (
                      <Lock size={14} aria-hidden="true" />
                    ) : (
                      <Clock3 size={14} aria-hidden="true" />
                    )}
                    {phaseLabel(phase, data.session.endAtUtc, now)}
                  </span>
                </div>
              </section>

              {phase === "editable" && writable && (
                <div className={hub.editBar} role="status">
                  <span>
                    Buổi học đã kết thúc. Bạn có thể chỉnh sửa điểm danh trong
                    vòng 24 giờ.
                  </span>
                  <button
                    type="button"
                    className={editing ? "btn btn--secondary" : "btn"}
                    disabled={bulk}
                    onClick={() => setEditing(!editing)}
                  >
                    <Pencil size={15} aria-hidden="true" />{" "}
                    {editing ? "Xong" : "Sửa điểm danh"}
                  </button>
                </div>
              )}
              {phase === "locked" && (
                <p className={styles.windowNotice} role="status">
                  Đã quá 24 giờ kể từ khi buổi học kết thúc, điểm danh đã khóa
                  và chỉ có thể xem.
                </p>
              )}
              {phase === "upcoming" && (
                <p className={styles.windowNotice} role="status">
                  Điểm danh sẽ mở trước giờ học 5 phút.
                </p>
              )}

              <Card bodyless>
                <div className={styles.tableToolbar}>
                  <div className={styles.searchBox}>
                    <Search size={18} aria-hidden="true" />
                    <input
                      aria-label="Tìm hội viên trong buổi học"
                      placeholder="Tìm theo tên hội viên hoặc mã đăng ký"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <TableFilters>
                    <div
                      className={styles.filters}
                      role="group"
                      aria-label="Lọc điểm danh"
                    >
                      {filters.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={`${styles.filter} ${filter === item.key ? styles.filterActive : ""}`}
                          aria-pressed={filter === item.key}
                          onClick={() => setFilter(item.key)}
                        >
                          {item.label} ({item.count})
                        </button>
                      ))}
                    </div>
                  </TableFilters>
                  {canMark && (
                    <button
                      className="btn btn--secondary"
                      disabled={
                        bulk ||
                        !markable.length ||
                        Object.values(busy).some(Boolean)
                      }
                      onClick={() => setConfirmBulk(true)}
                    >
                      Có mặt tất cả
                    </button>
                  )}
                </div>
                <Table
                  headers={[
                    "Member",
                    "Attendance status",
                    canMark ? "Options" : "Attendance",
                    "Recorded at",
                  ]}
                >
                  {rows.map((entry) => {
                    const key = `${sessionId}-${entry.enrollmentId}`;
                    return (
                      <tr key={key}>
                        <td>
                          <div className={styles.member}>
                            <UserAvatar
                              userId={entry.memberId}
                              name={entry.memberName}
                              size={36}
                            />
                            <span>
                              <strong>{entry.memberName}</strong>
                              <small title={entry.enrollmentId}>
                                Mã: {entry.enrollmentId.slice(0, 8)}
                              </small>
                              {entry.memberIsActive === false && (
                                <small className={styles.inactiveAccount}>
                                  Account locked / deactivated
                                </small>
                              )}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`${hub.statusPill} ${
                              entry.attendanceStatus === "PRESENT"
                                ? hub.pillPresent
                                : entry.attendanceStatus === "ABSENT"
                                  ? hub.pillAbsent
                                  : hub.pillNone
                            }`}
                          >
                            {entry.attendanceStatus === "PRESENT"
                              ? "Completed · Present"
                              : entry.attendanceStatus === "ABSENT"
                                ? "Completed · Absent"
                                : "Pending"}
                          </span>
                        </td>
                        <td>
                          {canMark && entry.memberIsActive !== false ? (
                            <div className={styles.optionCell}>
                              <button
                                type="button"
                                className="btn btn--secondary"
                                aria-expanded={openOptions === key}
                                onClick={() =>
                                  setOpenOptions(
                                    openOptions === key ? null : key,
                                  )
                                }
                              >
                                Options
                              </button>
                              {openOptions === key && (
                                <div
                                  className={styles.actionGroup}
                                  role="group"
                                  aria-label={`Edit attendance for ${entry.memberName}`}
                                >
                                  {(["PRESENT", "ABSENT"] as const).map(
                                    (status) => (
                                      <button
                                        key={status}
                                        type="button"
                                        className={`${styles.actionButton} ${entry.attendanceStatus === status ? (status === "PRESENT" ? styles.presentSelected : styles.absentSelected) : ""}`}
                                        aria-pressed={
                                          entry.attendanceStatus === status
                                        }
                                        disabled={busy[key] || bulk}
                                        onClick={async () => {
                                          if (
                                            await mark(
                                              entry.enrollmentId,
                                              status,
                                            )
                                          )
                                            roster.reload();
                                        }}
                                      >
                                        {status === "PRESENT"
                                          ? "Present"
                                          : "Absent"}
                                      </button>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                          ) : entry.memberIsActive === false ? (
                            "Account inactive"
                          ) : (
                            "—"
                          )}
                          {errors[key] && (
                            <p role="alert" className={styles.rowError}>
                              {errors[key]}
                            </p>
                          )}
                        </td>
                        <td>
                          {entry.attendanceRecordedAt
                            ? `${formatDate(entry.attendanceRecordedAt)} ${formatTime(entry.attendanceRecordedAt)}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </Table>
                {!rows.length && (
                  <p className={styles.noRows}>
                    {confirmed.length === 0
                      ? "Buổi học này chưa có hội viên."
                      : "Không có hội viên phù hợp với tìm kiếm hoặc bộ lọc."}
                  </p>
                )}
              </Card>

              {confirmBulk && (
                <Dialog
                  title="Xác nhận điểm danh"
                  onClose={() => !bulk && setConfirmBulk(false)}
                >
                  <p>
                    Đánh dấu có mặt cho {markable.length} hội viên đang hiển
                    thị? Mỗi kết quả được lưu riêng.
                  </p>
                  <button
                    className="btn"
                    disabled={bulk}
                    onClick={async () => {
                      setBulk(true);
                      for (const entry of markable)
                        await mark(entry.enrollmentId, "PRESENT");
                      setBulk(false);
                      setConfirmBulk(false);
                      roster.reload();
                    }}
                  >
                    Xác nhận
                  </button>
                </Dialog>
              )}
            </>
          );
        }}
      </AsyncSection>
    </div>
  );
}
