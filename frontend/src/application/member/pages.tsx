"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useMember } from "./provider";
import { Card } from "@/shared/ui";
import { dateLabel, timeLabel } from "@/shared/lib/date";
import { useCurrentTime } from "@/shared/lib/clock";
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
  const currentTime = useCurrentTime();
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
        Date.parse(s.endAt) > currentTime &&
        data.enrollments.some(
          (e) => e.sessionId === s.id && e.status === "Confirmed",
        ),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 2);
  return (
    <div className="stack">
      <h1>Hey. {data.profile.fullName}!</h1>
      <NewsSlider />
      <div className="home-grid">
        <MemberQr name={data.profile.fullName} issuer={issuer} />
        <section className="stack">
          <div className="row between">
            <h2>Schedule</h2>
            <Link className="text-link" href="/member/calendar">
              Reschedule
            </Link>
          </div>
          {upcoming.map((s) => (
            <Card key={s.id}>
              <span className="badge">The place has been kept successful.</span>
              <h2>{s.name}</h2>
              <p>
                {dateLabel(s.startAt)} · {timeLabel(s.startAt)}–
                {timeLabel(s.endAt)}
              </p>
              <p className="muted">
                {s.coachName} · {s.room}
              </p>
              <Link className="text-link" href="/member/calendar">
                View Registers (10)
              </Link>
            </Card>
          ))}
          {!upcoming.length && (
            <Card>
              <h3>No upcoming training sessions</h3>
              <p className="muted">Select a suitable class to begin with.</p>
              <Link className="button" href="/member/calendar">
                Discovering Classes
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
      <h1>Personal Page</h1>
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
          Update Profile
        </Link>
      </Card>
      {data.packages
        .filter((p) => p.status === "Active")
        .map((p) => (
          <Card key={p.id} className="membership-card">
            <h2>{p.name}</h2>
            <p>Expire {dateLabel(p.expiresAt)}</p>
            <p>
              {p.remainingSessions === null
                ? "No Training Turn Limited"
                : `Remaining: ${p.remainingSessions} sessions`}
            </p>
            <Link className="button secondary" href="/member/packages">
              Plugins / Change packages
            </Link>
          </Card>
        ))}
      <Card className="profile-menu">
        {[
          ["/member/packages", "& Invoiceing Members Package"],
          ["/member/training", "& Coach review"],
          ["/member/history", "& Practice Results"],
          ["/member/profile/edit", "Install Profile"],
          ["/member/notifications", "Notifications"],
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
            "Keeping the place successful.",
          )
        }
        onCancel={(sessionId) =>
          execute(
            { type: "cancel", sessionId },
            "Cancelled. Session updated on cancel.",
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
        onSave={(input) => execute({ type: "profile", input }, "Profiled.")}
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
            "The package is pending payment at the counter.",
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
            "It was read by the notice.",
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
