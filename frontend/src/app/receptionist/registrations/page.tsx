"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MemberPicker } from "@/components/MemberPicker";
import {
  AsyncSection,
  Card,
  Dialog,
  Feedback,
  Field,
  StatusChip,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDate, formatDateTime, formatTime, todayIso } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type {
  ClassSessionDto,
  EnrollmentDto,
  MemberPackageDto,
  UserAdminDto,
} from "@/lib/types";
import {
  IconCalendar,
  IconUser,
  StickerCalendarEmpty,
  StickerRegistrationsEmpty,
} from "@/components/icons";

/**
 * Đăng ký lớp hộ hội viên — BR-17 cho phép Lễ tân hủy; việc đăng ký hộ dùng chung API với
 * hội viên tự đăng ký, chỉ khác ở chỗ memberId được truyền tường minh (và chỉ vai trò quầy
 * mới được phép truyền memberId của người khác).
 */
export default function AssistEnrollmentPage() {
  const { language } = useLanguage();
  const [member, setMember] = useState<UserAdminDto | null>(null);
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(addDaysIso(todayIso(), 6));
  const [cancelTarget, setCancelTarget] = useState<EnrollmentDto | null>(null);
  const action = useAction();

  const sessions = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>("/api/class-sessions", {
        signal,
        query: { fromDate, toDate },
      }),
    [fromDate, toDate],
  );

  const enrollments = useApi(
    (signal) =>
      member
        ? api.get<EnrollmentDto[]>(
            `/api/members/${member.userId}/enrollments`,
            {
              signal,
              query: { upcomingOnly: true },
            },
          )
        : Promise.resolve(null),
    [member?.userId],
  );

  const packages = useApi(
    (signal) =>
      member
        ? api.get<MemberPackageDto[]>(
            `/api/members/${member.userId}/packages`,
            { signal },
          )
        : Promise.resolve(null),
    [member?.userId],
  );

  const usable = packages.data?.filter((item) => item.isUsable) ?? [];

  const enroll = async (sessionId: string) => {
    if (!member) return;

    const done = await action.run(
      () =>
        api.post("/api/enrollments", { sessionId, memberId: member.userId }),
      language === "en"
        ? "Member enrollment successfully confirmed."
        : "Đã đăng ký lớp thành công cho hội viên.",
    );

    if (done !== null) {
      sessions.reload();
      enrollments.reload();
      packages.reload();
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;

    const done = await action.run(
      () => api.post(`/api/enrollments/${cancelTarget.enrollmentId}/cancel`),
      language === "en"
        ? "Enrollment cancelled. If cancelled before deadline, session was refunded (BR-18)."
        : "Đã hủy đăng ký. Nếu hủy trước hạn, buổi tập đã được hoàn lại vào gói (BR-18).",
    );

    if (done !== null) {
      setCancelTarget(null);
      sessions.reload();
      enrollments.reload();
      packages.reload();
    }
  };

  const enrolledSessionIds = new Set(
    (enrollments.data ?? [])
      .filter((item) => item.status === "Confirmed")
      .map((item) => item.sessionId),
  );

  return (
    <AppShell
      title={
        language === "en"
          ? "Class Booking Assistance"
          : "Đăng ký lớp hộ hội viên"
      }
      description={
        language === "en"
          ? "Assist members with class reservations or cancellations at the front desk"
          : "Hỗ trợ hội viên đặt chỗ hoặc hủy đăng ký lớp học tại quầy lễ tân"
      }
      allow={["Receptionist", "CenterManager"]}
    >
      <Card
        title={
          language === "en"
            ? "Member Selection & Schedule Filters"
            : "Chọn hội viên & Bộ lọc lịch ca học"
        }
        actions={
          member ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setMember(null);
                action.reset();
              }}
            >
              {language === "en" ? "Change Member" : "Đổi hội viên"}
            </button>
          ) : undefined
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Top: Member lookup full-width bar */}
          <div>
            <MemberPicker
              value={member}
              onChange={(m) => {
                setMember(m);
                action.reset();
              }}
              autoFocus
              label={language === "en" ? "Member Account Lookup" : "Tra cứu tài khoản hội viên"}
              placeholder={
                language === "en"
                  ? "Scan card barcode/QR, enter phone number, or search by member name..."
                  : "Quét mã thẻ barcode/QR, nhập số điện thoại hoặc tên hội viên..."
              }
            />

            {member && usable.length === 0 && !packages.loading && (
              <div className="alert alert--warn" style={{ marginTop: 10 }}>
                {language === "en"
                  ? "The member has no packages in effect — booking cannot proceed (BR-16)."
                  : "Hội viên không có gói tập nào còn hiệu lực — hệ thống sẽ từ chối đăng ký (BR-16)."}
              </div>
            )}

            {member && usable.length > 0 && (
              <div className="alert alert--success" style={{ marginTop: 10 }}>
                <strong>{language === "en" ? "Eligible Packages: " : "Gói tập khả dụng: "}</strong>
                <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {usable.map((item) => (
                    <span key={item.memberPackageId} className="chip chip--ok">
                      {item.packageName} ·{" "}
                      {item.remainingSessions === null
                        ? (language === "en" ? "Unlimited" : "Không giới hạn")
                        : (language === "en"
                            ? `${item.remainingSessions} sessions left`
                            : `còn ${item.remainingSessions} buổi`)}
                      {item.endDate && (
                        <span className="small muted"> ({language === "en" ? "exp" : "hạn"} {formatDate(item.endDate)})</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Feedback error={action.error} success={action.success} />
          </div>

          {/* Subtle separator */}
          <div style={{ borderTop: "1px solid var(--line, #dfe5ec)" }} />

          {/* Bottom Toolbar: Date Presets & Date Pickers */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            {/* Quick Presets on the left */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--ink-500, #64748b)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <IconCalendar size={14} />
                {language === "en" ? "Schedule Date Presets:" : "Bộ lọc thời gian nhanh:"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`btn btn--sm ${fromDate === todayIso() && toDate === todayIso() ? "btn--primary" : "btn--ghost"}`}
                  style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: 6 }}
                  onClick={() => {
                    setFromDate(todayIso());
                    setToDate(todayIso());
                  }}
                >
                  {language === "en" ? "Today" : "Hôm nay"}
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${fromDate === todayIso() && toDate === addDaysIso(todayIso(), 6) ? "btn--primary" : "btn--ghost"}`}
                  style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: 6 }}
                  onClick={() => {
                    setFromDate(todayIso());
                    setToDate(addDaysIso(todayIso(), 6));
                  }}
                >
                  {language === "en" ? "Next 7 Days" : "7 ngày tới"}
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${fromDate === todayIso() && toDate === addDaysIso(todayIso(), 13) ? "btn--primary" : "btn--ghost"}`}
                  style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: 6 }}
                  onClick={() => {
                    setFromDate(todayIso());
                    setToDate(addDaysIso(todayIso(), 13));
                  }}
                >
                  {language === "en" ? "Next 14 Days" : "14 ngày tới"}
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${fromDate === todayIso() && toDate === addDaysIso(todayIso(), 29) ? "btn--primary" : "btn--ghost"}`}
                  style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: 6 }}
                  onClick={() => {
                    setFromDate(todayIso());
                    setToDate(addDaysIso(todayIso(), 29));
                  }}
                >
                  {language === "en" ? "Next 30 Days" : "30 ngày tới"}
                </button>
              </div>
            </div>

            {/* Custom Date Range on the right */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
              <Field label={language === "en" ? "From Date" : "Từ ngày"}>
                <input
                  type="date"
                  value={fromDate}
                  style={{ height: 36, fontSize: "0.85rem" }}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </Field>
              <Field label={language === "en" ? "To Date" : "Đến ngày"}>
                <input
                  type="date"
                  value={toDate}
                  style={{ height: 36, fontSize: "0.85rem" }}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>
      </Card>

      {member && (
        <Card
          title={
            language === "en"
              ? "Current Registrations for Member"
              : "Lịch lớp đã đăng ký của hội viên"
          }
          bodyless
        >
          <AsyncSection
            state={enrollments}
            emptyMessage={
              <div style={{ textAlign: "center", padding: "28px 16px" }}>
                <StickerRegistrationsEmpty size={68} style={{ marginBottom: 10 }} />
                <p style={{ margin: 0, fontWeight: 500, color: "var(--ink-700, #334155)" }}>
                  {language === "en"
                    ? "No upcoming registrations found for this member."
                    : "Hội viên chưa có lịch đăng ký lớp nào sắp tới."}
                </p>
              </div>
            }
            isEmpty={(data) => !data || data.length === 0}
          >
            {(data) =>
              data ? (
                <Table
                  headers={[
                    language === "en" ? "Class" : "Lớp học",
                    language === "en" ? "Time" : "Thời gian",
                    language === "en" ? "Cancellation Deadline" : "Hạn hủy",
                    language === "en" ? "Status" : "Trạng thái",
                    "",
                  ]}
                >
                  {data.map((item) => (
                    <tr key={item.enrollmentId}>
                      <td>
                        <strong>{item.session.className}</strong>
                      </td>
                      <td className="nowrap">
                        {formatDateTime(item.session.startAtUtc)}
                      </td>
                      <td className="nowrap small">
                        {formatDateTime(item.cancellationDeadlineUtc)}
                      </td>
                      <td>
                        <StatusChip value={item.status} />
                      </td>
                      <td className="right">
                        {item.status === "Confirmed" && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={action.busy}
                            onClick={() => setCancelTarget(item)}
                          >
                            {language === "en" ? "Cancel Booking" : "Hủy đăng ký"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : null
            }
          </AsyncSection>
        </Card>
      )}

      <Card
        title={language === "en" ? "Available Class Sessions" : "Danh sách ca học mở đăng ký"}
        bodyless
      >
        <AsyncSection
          state={sessions}
          emptyMessage={
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <StickerCalendarEmpty size={68} style={{ marginBottom: 12 }} />
              <p style={{ margin: 0, fontWeight: 500, color: "var(--ink-700, #334155)" }}>
                {language === "en"
                  ? "No study sessions found in this date range."
                  : "Không có ca học nào trong khoảng thời gian này."}
              </p>
            </div>
          }
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                language === "en" ? "Class" : "Lớp học",
                language === "en" ? "Time" : "Thời gian",
                language === "en" ? "Room" : "Phòng tập",
                language === "en" ? "Coach" : "Huấn luyện viên",
                {
                  text: language === "en" ? "Slots" : "Chỗ trống",
                  numeric: true,
                },
                "",
              ]}
            >
              {data
                .filter((session) => session.status === "Scheduled")
                .map((session) => (
                  <tr key={session.sessionId}>
                    <td>
                      <strong>{session.className}</strong>
                      <div className="small muted">{session.discipline}</div>
                    </td>
                    <td className="nowrap">
                      {formatDateTime(session.startAtUtc)}
                      <div className="small muted">
                        {language === "en" ? "Until" : "Đến"} {formatTime(session.endAtUtc)}
                      </div>
                    </td>
                    <td>{session.roomName}</td>
                    <td>{session.coachName}</td>
                    <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {session.confirmedCount}/{session.capacity}
                    </td>
                    <td className="right">
                      {enrolledSessionIds.has(session.sessionId) ? (
                        <span className="chip chip--ok">
                          {language === "en" ? "Enrolled" : "Đã đăng ký"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={!member || action.busy || session.isFull || usable.length === 0}
                          onClick={() => void enroll(session.sessionId)}
                        >
                          {session.isFull
                            ? (language === "en" ? "Full" : "Đã hết chỗ")
                            : (language === "en" ? "Book Spot" : "Đăng ký")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      {cancelTarget && (
        <Dialog
          title={language === "en" ? "Confirm Cancellation" : "Xác nhận hủy đăng ký"}
          onClose={() => setCancelTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setCancelTarget(null)}
              >
                {language === "en" ? "Keep Booking" : "Giữ lại"}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={action.busy}
                onClick={() => void confirmCancel()}
              >
                {action.busy
                  ? (language === "en" ? "Cancelling..." : "Đang hủy...")
                  : (language === "en" ? "Confirm Cancellation" : "Xác nhận hủy")}
              </button>
            </>
          }
        >
          <div className="stack">
            <p>
              {language === "en"
                ? `Are you sure you want to cancel the registration for class "${cancelTarget.session.className}" on ${formatDateTime(cancelTarget.session.startAtUtc)}?`
                : `Bạn có chắc muốn hủy đăng ký lớp "${cancelTarget.session.className}" vào ${formatDateTime(cancelTarget.session.startAtUtc)}?`}
            </p>
            <div className="alert alert--info">
              {language === "en"
                ? `Cancellation deadline: ${formatDateTime(cancelTarget.cancellationDeadlineUtc)}. If cancelled before this deadline, the session credit will be refunded to member's package (BR-18).`
                : `Hạn hủy lớp: ${formatDateTime(cancelTarget.cancellationDeadlineUtc)}. Nếu hủy trước thời điểm này, lượt tập sẽ được hoàn trả lại vào gói tập của hội viên (BR-18).`}
            </div>
          </div>
        </Dialog>
      )}
    </AppShell>
  );
}
