"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useMember } from "./provider";
import { Card } from "@/shared/ui";
import { dateLabel, timeLabel } from "@/shared/lib/date";
import { MemberQr } from "@/features/check-in";
import { NewsSlider } from "@/features/news";
import { MemberCalendar } from "@/features/scheduling";
import { CoachList } from "@/features/coaches";
import { ProfileForm } from "@/features/identity";
import { PackageList } from "@/features/membership";
import { TrainingView } from "@/features/training";
import { NotificationList } from "@/features/notifications";

export type MemberPageName =
  | "home"
  | "calendar"
  | "coaches"
  | "profile"
  | "edit-profile"
  | "packages"
  | "training"
  | "history"
  | "notifications";
function MemberHome() {
  const { data } = useMember();
  const issuer = useMemo(
    () => ({
      async issue() {
        return {
          value: JSON.stringify({
            kind: "SPORTHUB_DEMO_ONLY",
            member: data.profile.id,
            nonce: crypto.randomUUID(),
            expiresAt: Date.now() + 60000,
          }),
          expiresAt: Date.now() + 60000,
        };
      },
    }),
    [data.profile.id],
  );
  const upcoming = data.sessions
    .filter(
      (s) =>
        Date.parse(s.endAt) > Date.now() &&
        data.enrollments.some(
          (e) => e.sessionId === s.id && e.status === "Confirmed",
        ),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 2);
  return (
    <div className="stack">
      <h1>Chào {data.profile.fullName}!</h1>
      <NewsSlider />
      <div className="home-grid">
        <MemberQr name={data.profile.fullName} issuer={issuer} />
        <section className="stack">
          <div className="row between">
            <h2>Lịch tập sắp tới</h2>
            <Link className="text-link" href="/member/calendar">
              Xem lịch →
            </Link>
          </div>
          {upcoming.map((s) => (
            <Card key={s.id}>
              <span className="badge">✓ Đã giữ chỗ thành công</span>
              <h2>{s.name}</h2>
              <p>
                {dateLabel(s.startAt)} · {timeLabel(s.startAt)}–
                {timeLabel(s.endAt)}
              </p>
              <p className="muted">
                {s.coachName} · {s.room}
              </p>
              <Link className="text-link" href="/member/calendar">
                Xem đăng ký →
              </Link>
            </Card>
          ))}
          {!upcoming.length && (
            <Card>
              <h3>Chưa có buổi tập sắp tới</h3>
              <p className="muted">Chọn một lớp phù hợp để bắt đầu.</p>
              <Link className="button" href="/member/calendar">
                Khám phá lớp học
              </Link>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
function ProfilePage() {
  const { data } = useMember();
  return (
    <div className="stack">
      <h1>Trang cá nhân</h1>
      <Card>
        <div className="row">
          <span className="avatar large" aria-hidden="true">
            {data.profile.fullName
              .split(" ")
              .map((n) => n[0])
              .slice(-2)
              .join("")}
          </span>
          <div>
            <h2>{data.profile.fullName}</h2>
            <p className="muted">{data.profile.email}</p>
          </div>
        </div>
        <Link className="button" href="/member/profile/edit">
          Cập nhật hồ sơ
        </Link>
      </Card>
      {data.packages
        .filter((p) => p.status === "Active")
        .map((p) => (
          <Card key={p.id} className="membership-card">
            <h2>{p.name}</h2>
            <p>Hạn dùng {dateLabel(p.expiresAt)}</p>
            <p>
              {p.remainingSessions === null
                ? "Không giới hạn lượt tập"
                : `Còn ${p.remainingSessions} lượt tập`}
            </p>
            <Link className="button secondary" href="/member/packages">
              Gia hạn / Đổi gói
            </Link>
          </Card>
        ))}
      <Card className="profile-menu">
        {[
          ["/member/packages", "Gói thành viên & hóa đơn"],
          ["/member/training", "Kế hoạch & nhận xét HLV"],
          ["/member/history", "Điểm danh & kết quả tập luyện"],
          ["/member/profile/edit", "Cài đặt hồ sơ"],
          ["/member/notifications", "Thông báo"],
        ].map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </Card>
    </div>
  );
}
export function MemberPage({ page }: { page: MemberPageName }) {
  const { data, execute, busy } = useMember();
  const params = useSearchParams();
  if (page === "home") return <MemberHome />;
  if (page === "profile") return <ProfilePage />;
  if (page === "calendar")
    return (
      <MemberCalendar
        sessions={data.sessions}
        enrollments={data.enrollments}
        packages={data.packages}
        initialCoach={params.get("coach") ?? ""}
        key={params.get("coach") ?? ""}
        busy={busy}
        onBook={(sessionId, memberPackageId) =>
          execute(
            { type: "book", sessionId, memberPackageId },
            "Đã giữ chỗ thành công.",
          )
        }
        onCancel={(sessionId) =>
          execute(
            { type: "cancel", sessionId },
            "Đã hủy đăng ký. Lượt tập được cập nhật theo hạn hủy.",
          )
        }
      />
    );
  if (page === "coaches") return <CoachList coaches={data.coaches} />;
  if (page === "edit-profile")
    return (
      <ProfileForm
        profile={data.profile}
        busy={busy}
        onSave={(input) => execute({ type: "profile", input }, "Đã lưu hồ sơ.")}
      />
    );
  if (page === "packages")
    return (
      <PackageList
        catalog={data.catalog}
        invoices={data.invoices}
        busy={busy}
        onPurchase={(packageId) =>
          execute(
            { type: "purchase", packageId },
            "Đã tạo yêu cầu. Gói đang chờ thanh toán tại quầy.",
          )
        }
      />
    );
  if (page === "notifications")
    return (
      <NotificationList
        items={data.notifications}
        busy={busy}
        onRead={(notificationId) => {
          void execute(
            { type: "read", notificationId },
            "Đã đánh dấu thông báo đã đọc.",
          );
        }}
      />
    );
  return (
    <TrainingView
      plan={data.training}
      records={data.history}
      historyOnly={page === "history"}
    />
  );
}
