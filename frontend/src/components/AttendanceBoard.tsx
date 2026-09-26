"use client";

import { useState } from "react";
import {
  AsyncSection,
  Card,
  Feedback,
  Field,
  StatusChip,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDateTime, formatTime, todayIso } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { ClassSessionDto, SessionRosterDto } from "@/lib/types";
import {
  IconCheck,
  IconClose,
  StickerCalendarEmpty,
  StickerRegistrationsEmpty,
} from "@/components/icons";

/**
 * Bảng điểm danh — BR-22 (chỉ HLV được gán buổi đó hoặc Lễ tân), BR-53 (chỉ ghi tay
 * Present/Absent; No-show do tiến trình tự động sinh sau khi buổi kết thúc, BR-20).
 *
 * Vì vậy UI chỉ có hai nút Có mặt / Vắng — không có nút nào đặt No-show.
 */
export function AttendanceBoard({
  coachOnly,
  onResultRequested,
}: {
  /** true = chỉ liệt kê buổi của HLV đang đăng nhập. */
  coachOnly: boolean;
  /** Cho phép màn hình HLV mở form ghi kết quả tập ngay từ danh sách điểm danh. */
  onResultRequested?: (entry: {
    enrollmentId: string;
    memberName: string;
  }) => void;
}) {
  const { language } = useLanguage();
  const [date, setDate] = useState(todayIso());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Present" | "Absent">("All");
  const [timeFilter, setTimeFilter] = useState<"All" | "Morning" | "Afternoon" | "Evening">("All");
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [localStatusMap, setLocalStatusMap] = useState<Record<string, "Present" | "Absent">>({});
  const action = useAction();

  const sessions = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>(
        coachOnly ? "/api/class-sessions/mine" : "/api/class-sessions",
        {
          signal,
          query: { fromDate: date, toDate: date },
        },
      ),
    [date, coachOnly],
  );

  const roster = useApi(
    (signal) =>
      sessionId
        ? api.get<SessionRosterDto>(`/api/class-sessions/${sessionId}/roster`, {
            signal,
          })
        : Promise.resolve(null),
    [sessionId],
  );

  const mark = async (enrollmentId: string, status: "Present" | "Absent") => {
    // Optimistic UI update
    setLocalStatusMap((prev) => ({ ...prev, [enrollmentId]: status }));
    setBusyMap((prev) => ({ ...prev, [enrollmentId]: true }));
    try {
      await api.post(`/api/attendance/${enrollmentId}`, { status });
      roster.reload();
    } catch (err: unknown) {
      setLocalStatusMap((prev) => {
        const next = { ...prev };
        delete next[enrollmentId];
        return next;
      });
      action.run(() => Promise.reject(err), "");
    } finally {
      setBusyMap((prev) => ({ ...prev, [enrollmentId]: false }));
    }
  };

  // Compute roster statistics with optimistic overrides
  const entries = roster.data?.entries ?? [];
  const confirmedEntries = entries.filter((e) => e.enrollmentStatus === "Confirmed");

  const getEffectiveStatus = (entry: typeof entries[0]) => {
    return localStatusMap[entry.enrollmentId] ?? entry.attendanceStatus;
  };

  const presentCount = confirmedEntries.filter((e) => getEffectiveStatus(e) === "Present").length;
  const absentCount = confirmedEntries.filter((e) => getEffectiveStatus(e) === "Absent").length;
  const pendingCount = confirmedEntries.filter((e) => {
    const s = getEffectiveStatus(e);
    return !s || (s !== "Present" && s !== "Absent");
  }).length;

  const markAllPresent = async () => {
    const toMark = confirmedEntries.filter((e) => {
      const current = getEffectiveStatus(e);
      return current !== "Present";
    });

    if (toMark.length === 0) return;

    setBulkBusy(true);
    const optimistic: Record<string, "Present" | "Absent"> = {};
    for (const e of toMark) {
      optimistic[e.enrollmentId] = "Present";
    }
    setLocalStatusMap((prev) => ({ ...prev, ...optimistic }));

    try {
      await Promise.all(
        toMark.map((e) =>
          api.post(`/api/attendance/${e.enrollmentId}`, { status: "Present" })
        )
      );
      roster.reload();
    } catch (err: unknown) {
      roster.reload();
      action.run(() => Promise.reject(err), "");
    } finally {
      setBulkBusy(false);
    }
  };

  // Filter entries based on search and status tab
  const filteredEntries = entries.filter((entry) => {
    const status = getEffectiveStatus(entry);
    if (statusFilter === "Pending" && (status === "Present" || status === "Absent")) return false;
    if (statusFilter === "Present" && status !== "Present") return false;
    if (statusFilter === "Absent" && status !== "Absent") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = (entry.memberName || "").toLowerCase();
      const email = (entry.memberEmail || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    }
    return true;
  });

  return (
    <>
      <Card title={language === "en" ? "Select Class Session" : "Chọn ca học"}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 14 }}>
          <Field label={language === "en" ? "Date" : "Ngày"}>
            <input
              type="date"
              value={date}
              style={{ height: 36 }}
              onChange={(event) => {
                setDate(event.target.value);
                setSessionId(null);
                setLocalStatusMap({});
              }}
            />
          </Field>

          {/* Quick Date Presets */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingBottom: 2 }}>
            <span className="small muted" style={{ fontWeight: 600 }}>
              {language === "en" ? "Quick Date:" : "Chọn nhanh:"}
            </span>
            <button
              type="button"
              className={`btn btn--sm ${date === addDaysIso(todayIso(), -1) ? "btn--primary" : "btn--ghost"}`}
              style={{ padding: "3px 8px", fontSize: "0.75rem", borderRadius: 6 }}
              onClick={() => {
                setDate(addDaysIso(todayIso(), -1));
                setSessionId(null);
                setLocalStatusMap({});
              }}
            >
              {language === "en" ? "Yesterday" : "Hôm qua"}
            </button>
            <button
              type="button"
              className={`btn btn--sm ${date === todayIso() ? "btn--primary" : "btn--ghost"}`}
              style={{ padding: "3px 8px", fontSize: "0.75rem", borderRadius: 6 }}
              onClick={() => {
                setDate(todayIso());
                setSessionId(null);
                setLocalStatusMap({});
              }}
            >
              {language === "en" ? "Today" : "Hôm nay"}
            </button>
            <button
              type="button"
              className={`btn btn--sm ${date === addDaysIso(todayIso(), 1) ? "btn--primary" : "btn--ghost"}`}
              style={{ padding: "3px 8px", fontSize: "0.75rem", borderRadius: 6 }}
              onClick={() => {
                setDate(addDaysIso(todayIso(), 1));
                setSessionId(null);
                setLocalStatusMap({});
              }}
            >
              {language === "en" ? "Tomorrow" : "Ngày mai"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <AsyncSection
            state={sessions}
            emptyMessage={
              <div style={{ textAlign: "center", padding: "28px 16px" }}>
                <StickerCalendarEmpty size={68} style={{ marginBottom: 12 }} />
                <p style={{ margin: 0, fontWeight: 500, color: "var(--ink-700, #334155)" }}>
                  {language === "en"
                    ? "No class sessions scheduled for this date."
                    : "Không có ca học nào trong ngày này."}
                </p>
              </div>
            }
            isEmpty={(data) => data.length === 0}
          >
            {(data) => {
              const morningCount = data.filter((s) => new Date(s.startAtUtc).getHours() < 12).length;
              const afternoonCount = data.filter((s) => {
                const h = new Date(s.startAtUtc).getHours();
                return h >= 12 && h < 17;
              }).length;
              const eveningCount = data.filter((s) => new Date(s.startAtUtc).getHours() >= 17).length;

              const displayedSessions = data.filter((s) => {
                const h = new Date(s.startAtUtc).getHours();
                if (timeFilter === "Morning") return h < 12;
                if (timeFilter === "Afternoon") return h >= 12 && h < 17;
                if (timeFilter === "Evening") return h >= 17;
                return true;
              });

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Time Segment Filter Pills */}
                  {data.length > 3 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span className="small muted" style={{ fontWeight: 600 }}>
                        {language === "en" ? "Filter Time:" : "Khung giờ:"}
                      </span>
                      <button
                        type="button"
                        className={`btn btn--sm ${timeFilter === "All" ? "btn--primary" : "btn--ghost"}`}
                        style={{ padding: "3px 8px", fontSize: "0.75rem", borderRadius: 6 }}
                        onClick={() => setTimeFilter("All")}
                      >
                        {language === "en" ? "All Shifts" : "Tất cả"} ({data.length})
                      </button>
                      {morningCount > 0 && (
                        <button
                          type="button"
                          className={`btn btn--sm ${timeFilter === "Morning" ? "btn--primary" : "btn--ghost"}`}
                          style={{ padding: "3px 8px", fontSize: "0.75rem", borderRadius: 6 }}
                          onClick={() => setTimeFilter("Morning")}
                        >
                          {language === "en" ? "Morning" : "Buổi sáng"} ({morningCount})
                        </button>
                      )}
                      {afternoonCount > 0 && (
                        <button
                          type="button"
                          className={`btn btn--sm ${timeFilter === "Afternoon" ? "btn--primary" : "btn--ghost"}`}
                          style={{ padding: "3px 8px", fontSize: "0.75rem", borderRadius: 6 }}
                          onClick={() => setTimeFilter("Afternoon")}
                        >
                          {language === "en" ? "Afternoon" : "Buổi chiều"} ({afternoonCount})
                        </button>
                      )}
                      {eveningCount > 0 && (
                        <button
                          type="button"
                          className={`btn btn--sm ${timeFilter === "Evening" ? "btn--primary" : "btn--ghost"}`}
                          style={{ padding: "3px 8px", fontSize: "0.75rem", borderRadius: 6 }}
                          onClick={() => setTimeFilter("Evening")}
                        >
                          {language === "en" ? "Evening" : "Buổi tối"} ({eveningCount})
                        </button>
                      )}
                    </div>
                  )}

                  {/* Structured Session Cards Grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {displayedSessions.map((session) => {
                      const isSelected = sessionId === session.sessionId;
                      const occupancyPercent =
                        session.capacity > 0 ? Math.round((session.confirmedCount / session.capacity) * 100) : 0;
                      const isFull = session.isFull || session.confirmedCount >= session.capacity;

                      return (
                        <div
                          key={session.sessionId}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSessionId(session.sessionId);
                            setLocalStatusMap({});
                            setSearchQuery("");
                            setStatusFilter("All");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSessionId(session.sessionId);
                              setLocalStatusMap({});
                              setSearchQuery("");
                              setStatusFilter("All");
                            }
                          }}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "var(--radius-sm, 8px)",
                            border: isSelected
                              ? "2px solid var(--navy, #1a2b4c)"
                              : "1px solid var(--line, #dfe5ec)",
                            background: isSelected ? "var(--ice, #f0f5fc)" : "var(--surface, #ffffff)",
                            boxShadow: isSelected ? "0 2px 8px rgba(26, 43, 76, 0.08)" : "none",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            transition: "all 0.15s ease",
                            outline: "none",
                          }}
                        >
                          {/* Time & Capacity Row */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "0.82rem",
                                fontWeight: 700,
                                color: isSelected ? "var(--navy, #1a2b4c)" : "var(--ink-700, #334155)",
                              }}
                            >
                              {formatTime(session.startAtUtc)} – {formatTime(session.endAtUtc)}
                            </span>
                            <span
                              className={`chip ${isFull ? "chip--warn" : "chip--ok"}`}
                              style={{ fontSize: "0.72rem", padding: "1px 6px" }}
                            >
                              {session.confirmedCount}/{session.capacity}
                            </span>
                          </div>

                          {/* Class Name */}
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: "0.92rem",
                              color: "var(--ink-900, #0f172a)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={session.className}
                          >
                            {session.className}
                          </div>

                          {/* Discipline, Room & Coach */}
                          <div
                            className="small muted"
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "0.75rem",
                              gap: 6,
                            }}
                          >
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {session.discipline} · {session.roomName}
                            </span>
                            <span style={{ flexShrink: 0 }}>{session.coachName}</span>
                          </div>

                          {/* Occupancy Progress Bar */}
                          <div
                            style={{
                              width: "100%",
                              height: 3,
                              borderRadius: 2,
                              background: "var(--line, #e2e8f0)",
                              overflow: "hidden",
                              marginTop: 2,
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(occupancyPercent, 100)}%`,
                                height: "100%",
                                background: isFull
                                  ? "var(--warning-500, #f59e0b)"
                                  : isSelected
                                  ? "var(--navy, #1a2b4c)"
                                  : "var(--primary-600, #2563eb)",
                                borderRadius: 2,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          </AsyncSection>
        </div>
      </Card>

      {sessionId && (
        <Card
          title={language === "en" ? "Session Roster & Attendance" : "Danh sách điểm danh"}
          hint={
            language === "en"
              ? "Mark Present or Absent only. No-show status is assigned automatically by the system after session end (BR-20, BR-53)."
              : "Chỉ ghi nhận Có mặt hoặc Vắng mặt. Trạng thái Vắng không phép sẽ do hệ thống tự động xử lý sau khi ca kết thúc (BR-20, BR-53)."
          }
          actions={
            confirmedEntries.length > 0 ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={pendingCount === 0 || bulkBusy}
                onClick={markAllPresent}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <IconCheck size={14} />
                {bulkBusy
                  ? (language === "en" ? "Checking in..." : "Đang điểm danh...")
                  : pendingCount === 0
                  ? (language === "en" ? "All Checked In" : "Đã điểm danh đủ")
                  : (language === "en"
                      ? `Mark All Present (${pendingCount})`
                      : `Điểm danh tất cả (${pendingCount})`)}
              </button>
            ) : undefined
          }
          bodyless
        >
          {(action.error || action.success) && (
            <div style={{ padding: "10px 18px 0" }}>
              <Feedback error={action.error} success={action.success} />
            </div>
          )}

          <AsyncSection
            state={roster}
            emptyMessage={
              <div style={{ textAlign: "center", padding: "28px 16px" }}>
                <StickerRegistrationsEmpty size={68} style={{ marginBottom: 10 }} />
                <p style={{ margin: 0, fontWeight: 500, color: "var(--ink-700, #334155)" }}>
                  {language === "en"
                    ? "No members enrolled in this session."
                    : "Chưa có hội viên nào đăng ký ca học này."}
                </p>
              </div>
            }
            isEmpty={(data) => !data || data.entries.length === 0}
          >
            {(data) =>
              data ? (
                <>
                  {/* Session Overview Bar */}
                  <div
                    style={{
                      padding: "12px 18px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                    className="small muted"
                  >
                    <div>
                      <strong>{data.session.className}</strong> ·{" "}
                      {formatDateTime(data.session.startAtUtc)} ·{" "}
                      {data.session.roomName} · {language === "en" ? "Coach" : "HLV"}{" "}
                      {data.session.coachName}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span className="chip chip--ok">
                        {language === "en" ? "Present" : "Có mặt"}: {presentCount}
                      </span>
                      {absentCount > 0 && (
                        <span className="chip chip--warn">
                          {language === "en" ? "Absent" : "Vắng"}: {absentCount}
                        </span>
                      )}
                      <span className="chip">
                        {language === "en" ? "Pending" : "Chưa điểm danh"}: {pendingCount}
                      </span>
                    </div>
                  </div>

                  {/* Search & Filter Toolbar */}
                  <div
                    style={{
                      padding: "4px 18px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      borderBottom: "1px solid var(--line, #dfe5ec)",
                      marginBottom: 8,
                    }}
                  >
                    {/* Status Filter Chips */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={`btn btn--sm ${statusFilter === "All" ? "btn--primary" : "btn--ghost"}`}
                        style={{ padding: "3px 10px", fontSize: "0.78rem", borderRadius: 6 }}
                        onClick={() => setStatusFilter("All")}
                      >
                        {language === "en" ? "All" : "Tất cả"} ({confirmedEntries.length})
                      </button>
                      <button
                        type="button"
                        className={`btn btn--sm ${statusFilter === "Pending" ? "btn--primary" : "btn--ghost"}`}
                        style={{ padding: "3px 10px", fontSize: "0.78rem", borderRadius: 6 }}
                        onClick={() => setStatusFilter("Pending")}
                      >
                        {language === "en" ? "Pending" : "Chưa điểm danh"} ({pendingCount})
                      </button>
                      <button
                        type="button"
                        className={`btn btn--sm ${statusFilter === "Present" ? "btn--primary" : "btn--ghost"}`}
                        style={{ padding: "3px 10px", fontSize: "0.78rem", borderRadius: 6 }}
                        onClick={() => setStatusFilter("Present")}
                      >
                        {language === "en" ? "Present" : "Có mặt"} ({presentCount})
                      </button>
                      {absentCount > 0 && (
                        <button
                          type="button"
                          className={`btn btn--sm ${statusFilter === "Absent" ? "btn--primary" : "btn--ghost"}`}
                          style={{ padding: "3px 10px", fontSize: "0.78rem", borderRadius: 6 }}
                          onClick={() => setStatusFilter("Absent")}
                        >
                          {language === "en" ? "Absent" : "Vắng"} ({absentCount})
                        </button>
                      )}
                    </div>

                    {/* In-Roster Search Box */}
                    <div style={{ position: "relative", minWidth: 200, maxWidth: 280, flex: 1 }}>
                      <input
                        type="text"
                        placeholder={language === "en" ? "Search member name/email..." : "Tìm tên hoặc email hội viên..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: "100%",
                          paddingRight: searchQuery ? 28 : 10,
                          height: 32,
                          fontSize: "0.82rem",
                        }}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          style={{
                            position: "absolute",
                            right: 6,
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "transparent",
                            border: "none",
                            color: "var(--ink-500, #64748b)",
                            cursor: "pointer",
                            display: "grid",
                            placeItems: "center",
                            padding: 2,
                          }}
                          title={language === "en" ? "Clear search" : "Xóa tìm kiếm"}
                        >
                          <IconClose size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {filteredEntries.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 16px" }}>
                      <p style={{ margin: 0, fontWeight: 500, color: "var(--ink-700, #334155)" }}>
                        {language === "en"
                          ? "No attendees match the active filter or search."
                          : "Không có hội viên nào khớp với bộ lọc hoặc tìm kiếm."}
                      </p>
                      {(searchQuery || statusFilter !== "All") && (
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost"
                          style={{ marginTop: 8 }}
                          onClick={() => {
                            setSearchQuery("");
                            setStatusFilter("All");
                          }}
                        >
                          {language === "en" ? "Reset filters" : "Xóa bộ lọc"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <Table
                      headers={[
                        language === "en" ? "Member" : "Hội viên",
                        language === "en" ? "Booking" : "Đăng ký",
                        language === "en" ? "Attendance" : "Điểm danh",
                        language === "en" ? "Check-in Time" : "Giờ điểm danh",
                        "",
                      ]}
                    >
                      {filteredEntries.map((entry) => {
                        const effectiveStatus = getEffectiveStatus(entry);
                        const isBusy = Boolean(busyMap[entry.enrollmentId]);
                        const initial = ((entry.memberName || entry.memberEmail || "?")[0] || "?").toUpperCase();

                        return (
                          <tr key={entry.enrollmentId}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: "50%",
                                    background: "var(--ice, #e0ecfb)",
                                    color: "var(--navy, #1a2b4c)",
                                    fontWeight: 700,
                                    fontSize: "0.8rem",
                                    display: "grid",
                                    placeItems: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  {initial}
                                </div>
                                <div>
                                  <strong>
                                    {entry.memberName || entry.memberEmail}
                                  </strong>
                                  <div className="small muted">{entry.memberEmail}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <StatusChip value={entry.enrollmentStatus} />
                            </td>
                            <td>
                              <StatusChip value={effectiveStatus} />
                            </td>
                            <td className="small nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>
                              {entry.checkInTime ? (
                                <span title={formatDateTime(entry.checkInTime)}>
                                  {formatTime(entry.checkInTime)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="right">
                              {entry.enrollmentStatus === "Confirmed" ? (
                                <div
                                  className="btn-row"
                                  style={{ justifyContent: "flex-end", gap: 6 }}
                                >
                                  <button
                                    type="button"
                                    className={`btn btn--sm ${
                                      effectiveStatus === "Present"
                                        ? "btn--primary"
                                        : "btn--ghost"
                                    }`}
                                    disabled={isBusy || effectiveStatus === "Present"}
                                    onClick={() =>
                                      void mark(entry.enrollmentId, "Present")
                                    }
                                  >
                                    {language === "en" ? "Present" : "Có mặt"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`btn btn--sm ${
                                      effectiveStatus === "Absent"
                                        ? "btn--danger"
                                        : "btn--ghost"
                                    }`}
                                    disabled={isBusy || effectiveStatus === "Absent"}
                                    onClick={() =>
                                      void mark(entry.enrollmentId, "Absent")
                                    }
                                  >
                                    {language === "en" ? "Absent" : "Vắng"}
                                  </button>
                                  {onResultRequested && (
                                    <button
                                      type="button"
                                      className="btn btn--sm btn--ghost"
                                      onClick={() =>
                                        onResultRequested({
                                          enrollmentId: entry.enrollmentId,
                                          memberName:
                                            entry.memberName || entry.memberEmail,
                                        })
                                      }
                                    >
                                      {language === "en"
                                        ? "Record Result"
                                        : "Ghi kết quả"}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="small muted">
                                  {language === "en" ? "Cancelled" : "Đã hủy"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Table>
                  )}
                </>
              ) : null
            }
          </AsyncSection>
        </Card>
      )}
    </>
  );
}
