"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Stat, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { addDaysIso, todayIso } from "@/lib/format";
import {
  IconCalendar,
  IconClipboard,
  IconCreditCard,
  IconInvoice,
  IconLightning,
  StickerCalendarEmpty,
  StickerSuccessTrophy,
} from "@/components/icons";
import type { ClassSessionDto, InvoiceSummaryDto, Paged } from "@/lib/types";
import styles from "./receptionist.module.css";

export default function ReceptionDashboardPage() {
  const { language } = useLanguage();
  const today = todayIso();

  const todaySessions = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>("/api/class-sessions", {
        signal,
        query: { fromDate: today, toDate: today },
      }),
    [today],
  );

  const overdue = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/invoices", {
        signal,
        query: { overdueOnly: true, pageSize: 10 },
      }),
    [],
  );

  const unpaid = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/invoices", {
        signal,
        query: { status: "Issued", pageSize: 10 },
      }),
    [],
  );

  return (
    <AppShell
      title={language === "en" ? "Front Desk Terminal" : "Bàn Lễ Tân Trung Tâm"}
      description={
        language === "en"
          ? "High-speed turnstile check-in, point-of-sale packages, attendance logging, and payment collection"
          : "Điểm danh cửa quay gym tốc độ cao, quầy bán gói hội viên, điểm danh lớp học và thu phí"
      }
      allow={["Receptionist"]}
    >
      {/* Rapid Operational Workflows with Brand SVG Icons */}
      <div className={styles.quickActionsGrid}>
        <Link
          href="/receptionist/gym-checkin"
          className={`${styles.actionCard} ${styles.actionCardPrimary}`}
        >
          <div className={styles.actionCardHeader}>
            <span className={styles.actionIcon}>
              <IconLightning size={26} color="var(--primary-600, #2563eb)" />
            </span>
            <kbd className={styles.kbdBadge}>Alt + 1</kbd>
          </div>
          <div>
            <div className={styles.actionTitle}>
              {language === "en" ? "Gym Turnstile Check-in" : "Điểm danh Cửa Gym"}
            </div>
            <div className={styles.actionDesc}>
              {language === "en"
                ? "Barcode/QR terminal with instant active pass clearance (BR-64)"
                : "Quét thẻ/QR tức thì, kiểm tra gói tập hợp lệ cửa quay (BR-64)"}
            </div>
          </div>
        </Link>

        <Link href="/receptionist/sell-plans" className={styles.actionCard}>
          <div className={styles.actionCardHeader}>
            <span className={styles.actionIcon}>
              <IconCreditCard size={26} color="var(--primary-600, #2563eb)" />
            </span>
            <kbd className={styles.kbdBadge}>Alt + 2</kbd>
          </div>
          <div>
            <div className={styles.actionTitle}>
              {language === "en" ? "Sell Membership Package" : "Bán Gói Tập POS"}
            </div>
            <div className={styles.actionDesc}>
              {language === "en"
                ? "Instant enrollment, quick payments, and printable receipts"
                : "Đăng ký gói, thu tiền mặt/chuyển khoản và in hóa đơn tại quầy"}
            </div>
          </div>
        </Link>

        <Link href="/receptionist/attendance" className={styles.actionCard}>
          <div className={styles.actionCardHeader}>
            <span className={styles.actionIcon}>
              <IconClipboard size={26} color="var(--primary-600, #2563eb)" />
            </span>
            <kbd className={styles.kbdBadge}>Alt + 3</kbd>
          </div>
          <div>
            <div className={styles.actionTitle}>
              {language === "en" ? "Class Attendance Desk" : "Điểm Danh Lớp Học"}
            </div>
            <div className={styles.actionDesc}>
              {language === "en"
                ? "Mark Present or Absent for all daily class sessions (BR-22)"
                : "Ghi nhận có mặt hoặc vắng mặt cho các ca học trong ngày (BR-22)"}
            </div>
          </div>
        </Link>

        <Link href="/receptionist/invoices" className={styles.actionCard}>
          <div className={styles.actionCardHeader}>
            <span className={styles.actionIcon}>
              <IconInvoice size={26} color="var(--primary-600, #2563eb)" />
            </span>
            <kbd className={styles.kbdBadge}>Alt + 4</kbd>
          </div>
          <div>
            <div className={styles.actionTitle}>
              {language === "en" ? "Invoices & Cashier" : "Tra Cứu & Thu Tiền"}
            </div>
            <div className={styles.actionDesc}>
              {language === "en"
                ? "Collect outstanding balances and manage payout adjustments"
                : "Thu nợ hóa đơn quá hạn và xử lý hoàn tiền đã duyệt (BR-42)"}
            </div>
          </div>
        </Link>

        <Link href="/receptionist/registrations" className={styles.actionCard}>
          <div className={styles.actionCardHeader}>
            <span className={styles.actionIcon}>
              <IconCalendar size={26} color="var(--primary-600, #2563eb)" />
            </span>
            <kbd className={styles.kbdBadge}>Alt + 5</kbd>
          </div>
          <div>
            <div className={styles.actionTitle}>
              {language === "en" ? "Class Registration" : "Đăng Ký Lớp Hộ"}
            </div>
            <div className={styles.actionDesc}>
              {language === "en"
                ? "Enroll members into class sessions and manage bookings"
                : "Đăng ký ca học hộ hội viên và quản lý danh sách đặt chỗ"}
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid--stats">
        <Stat
          label={language === "en" ? "Today's Classes" : "Lớp học hôm nay"}
          value={todaySessions.data?.length ?? 0}
          hint={language === "en" ? "Scheduled class sessions" : "Ca học mở trong ngày"}
        />
        <Stat
          label={language === "en" ? "Unpaid Invoices" : "Hóa đơn chưa thu"}
          value={unpaid.data?.totalCount ?? 0}
          hint={language === "en" ? "Issued & awaiting payment" : "Trạng thái Đã phát hành"}
        />
        <Stat
          label={language === "en" ? "Overdue Invoices" : "Hóa đơn quá hạn"}
          value={overdue.data?.totalCount ?? 0}
          hint={language === "en" ? "Past deadline (BR-55)" : "Quá hạn thanh toán theo BR-55"}
        />
        <Stat
          label={language === "en" ? "Today" : "Hôm nay"}
          value={formatDate(today)}
          hint={
            language === "en"
              ? `7-day outlook to ${formatDate(addDaysIso(today, 7))}`
              : `Lịch 7 ngày tới ${formatDate(addDaysIso(today, 7))}`
          }
        />
      </div>

      <Card
        title={language === "en" ? "Today's Class Schedule" : "Lịch ca học hôm nay"}
        hint={
          language === "en"
            ? "Live capacity monitoring and fast roster access"
            : "Theo dõi sĩ số trực tiếp và truy cập nhanh danh sách lớp"
        }
        bodyless
      >
        <AsyncSection
          state={todaySessions}
          emptyMessage={
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <StickerCalendarEmpty size={68} style={{ marginBottom: 12 }} />
              <p style={{ margin: 0, fontWeight: 500, color: "var(--ink-700, #334155)" }}>
                {language === "en"
                  ? "No class sessions scheduled for today."
                  : "Không có ca học nào trong ngày hôm nay."}
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
                  text: language === "en" ? "Occupancy" : "Sĩ số",
                  numeric: true,
                },
                language === "en" ? "Status" : "Trạng thái",
                "",
              ]}
            >
              {data.map((session) => {
                const ratio = Math.min(
                  1,
                  session.capacity > 0 ? session.confirmedCount / session.capacity : 0,
                );
                const isFull = session.isFull || session.confirmedCount >= session.capacity;
                const isNearFull = !isFull && ratio >= 0.8;

                return (
                  <tr key={session.sessionId}>
                    <td>
                      <strong>{session.className}</strong>
                      <div className="small muted">{session.discipline}</div>
                    </td>
                    <td className="nowrap">
                      {formatDateTime(session.startAtUtc)}
                    </td>
                    <td>{session.roomName}</td>
                    <td>{session.coachName}</td>
                    <td className="num">
                      <span className={styles.metricValue}>
                        {session.confirmedCount}/{session.capacity}
                      </span>
                      <div className={styles.capacityTrack}>
                        <div
                          className={`${styles.capacityFill} ${
                            isFull
                              ? styles.capacityFillFull
                              : isNearFull
                              ? styles.capacityFillNear
                              : ""
                          }`}
                          style={{
                            transform: `scaleX(${ratio})`,
                          }}
                        />
                      </div>
                    </td>
                    <td>
                      <StatusChip value={session.status} />
                    </td>
                    <td className="right">
                      <Link
                        href={`/receptionist/attendance`}
                        className="btn btn--ghost btn--sm"
                      >
                        {language === "en" ? "Attendance" : "Điểm danh"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </AsyncSection>
      </Card>

      <Card
        title={
          language === "en"
            ? "Overdue Invoices Requiring Follow-up"
            : "Hóa đơn quá hạn cần xử lý"
        }
        hint={
          language === "en"
            ? "Overdue invoices do not auto-cancel — member settlement or manager adjustment required (BR-40, BR-42)."
            : "Hóa đơn quá hạn không tự hủy — cần hội viên thanh toán hoặc quản lý điều chỉnh (BR-40, BR-42)."
        }
        bodyless
      >
        <AsyncSection
          state={overdue}
          emptyMessage={
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <StickerSuccessTrophy size={68} style={{ marginBottom: 12 }} />
              <p style={{ margin: 0, fontWeight: 500, color: "var(--ink-700, #334155)" }}>
                {language === "en"
                  ? "No overdue invoices found. All member accounts are settled."
                  : "Không có hóa đơn nào quá hạn. Sổ nợ hội viên sạch sẽ."}
              </p>
            </div>
          }
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                language === "en" ? "Invoice #" : "Mã hóa đơn",
                language === "en" ? "Member" : "Hội viên",
                {
                  text: language === "en" ? "Outstanding Amount" : "Cần thu",
                  numeric: true,
                },
                language === "en" ? "Due Date" : "Hạn thanh toán",
                language === "en" ? "Status" : "Trạng thái",
                "",
              ]}
            >
              {data.items.map((invoice) => (
                <tr key={invoice.invoiceId}>
                  <td>
                    <strong>{invoice.invoiceNumber}</strong>
                  </td>
                  <td>
                    {invoice.memberName}
                    <div className="small muted">{invoice.memberEmail}</div>
                  </td>
                  <td className="num">
                    <span className={styles.metricValue}>
                      {formatMoney(invoice.outstanding)}
                    </span>
                  </td>
                  <td className="nowrap small">
                    {formatDate(invoice.dueDateUtc)}
                  </td>
                  <td>
                    <StatusChip value={invoice.status} />
                  </td>
                  <td className="right">
                    <Link
                      href="/receptionist/invoices"
                      className="btn btn--ghost btn--sm"
                    >
                      {language === "en" ? "Collect Payment" : "Thu nợ"}
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}
