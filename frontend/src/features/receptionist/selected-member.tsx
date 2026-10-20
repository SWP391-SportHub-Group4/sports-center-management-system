"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Ban, CalendarClock, CircleCheck } from "lucide-react";

import { api, ApiError } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import { DAY_PASS_PACKAGE_ID } from "@/lib/day-pass";
import { formatDate, formatTime, todayIso } from "@/lib/format";

import { StatusChip } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";

import type {
  GymCheckInDto,
  MemberPackageDto,
  Paged,
  UserAdminDto,
} from "@/lib/types";

import styles from "./desk.module.css";

import { AvatarImage } from "@/components/AvatarImage";

import { MemberCancellations } from "./member-cancellations";
import { MemberSupportRequests } from "./member-support-requests";
import { PendingMemberPanel } from "./register-member";

const EXPIRY_WARNING_DAYS = 7;

function daysUntil(isoDate: string) {
  const [ay, am, ad] = todayIso().split("-").map(Number);
  const [by, bm, bd] = isoDate.slice(0, 10).split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

type Tone = "ok" | "warn" | "danger" | "neutral";

/**
 * Hội viên đang phục vụ: tên, trạng thái tài khoản, Membership/vé ngày, trạng thái Gym
 * và các thao tác tiếp theo tại quầy.
 */
export function SelectedMemberPanel({
  member,
  onChange,
  showProfileLink = true,
  withExtras = true,
}: {
  member: UserAdminDto;
  onChange: (member: UserAdminDto | null) => void;
  showProfileLink?: boolean;
  /** Tắt để hồ sơ hội viên tự đặt hủy/hỗ trợ trong tab Overview. */
  withExtras?: boolean;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const mutation = useMutation();
  const [note, setNote] = useState<string | null>(null);
  const [localCooldown, setLocalCooldown] = useState({ memberId: "", until: 0 });
  const now = useNow(250);
  const memberId = member.userId;

  // Hội viên được lưu theo tab nên có thể đã cũ (vd. vừa kích hoạt qua Google).
  // Làm mới khi mở, khi quay lại tab, và định kỳ trong lúc còn chờ kích hoạt.
  const latest = useRef({ member, onChange });
  useEffect(() => {
    latest.current = { member, onChange };
  });
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const fresh = await api.get<UserAdminDto>(`/api/users/${memberId}`);
        const { member: shown, onChange: update } = latest.current;
        if (
          active &&
          (fresh.activationPending !== shown.activationPending ||
            fresh.status !== shown.status ||
            fresh.hasPassword !== shown.hasPassword ||
            fresh.hasGoogleLink !== shown.hasGoogleLink ||
            fresh.email !== shown.email)
        )
          update(fresh);
      } catch {
        /* giữ dữ liệu đang hiển thị */
      }
    }
    void refresh();
    const timer = member.activationPending
      ? window.setInterval(refresh, 10_000)
      : undefined;
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [memberId, member.activationPending]);

  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>(`/api/members/${memberId}/packages`, {
        signal,
      }),
    [memberId],
  );
  const visits = useApi(
    (signal) =>
      api.get<Paged<GymCheckInDto>>(`/api/members/${memberId}/gym-checkins`, {
        signal,
        query: { page: 1, pageSize: 5 },
      }),
    [memberId],
  );
  const usable = (packages.data ?? []).filter(
    (p) => p.status === "ACTIVE" && p.isUsable,
  );
  const dayPass = usable.find((p) => p.packageId === DAY_PASS_PACKAGE_ID);
  const membership = usable.find((p) => p.packageId !== DAY_PASS_PACKAGE_ID);

  const latestCheckIn = pagedItems(visits.data)[0];
  const cooldownUntil = Math.max(
    localCooldown.memberId === memberId ? localCooldown.until : 0,
    latestCheckIn ? Date.parse(latestCheckIn.checkInTime) + 10_000 : 0,
  );
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const ready = !packages.loading && !visits.loading;
  const locked = member.status === "BANNED" || member.status === "DEACTIVATED";
  const hasAccess = Boolean(membership || dayPass);
  const blocked = ready && (!hasAccess || locked);

  const daysLeft = membership ? daysUntil(membership.endDate) : null;
  const expiring =
    membership && daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS;

  async function checkIn() {
    setNote(null);

    const ok = await mutation.run(async () => {
      try {
        await api.post("/api/gym-checkins", { targetMemberId: memberId });
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.code === "gym_checkin_cooldown"
        ) {
          visits.reload();
          throw new ApiError(
            error.status,
            error.code,
            vi
              ? "Vui lòng chờ 10 giây trước khi check-in lại hội viên này."
              : "Wait 10 seconds before checking in this member again.",
            error.details,
          );
        }
        throw error;
      }
    });

    if (ok) {
      const time = formatTime(new Date().toISOString());
      setLocalCooldown({ memberId, until: Date.now() + 10_000 });
      setNote(
        vi ? `Đã check-in lúc ${time}` : `Checked in at ${time}`,
      );
      visits.reload();
    }
  }

  const accessTip = vi
    ? "Cần Membership Gym còn hạn hoặc vé Gym 1 ngày."
    : "Requires an active Gym membership or Day Pass.";
  const blockReason = locked
    ? vi
      ? "Tài khoản đang bị khóa; không thể check-in hoặc bán dịch vụ."
      : "This account is locked, so check-in and sales are unavailable."
    : accessTip;

  const tiles: { key: string; label: string; value: string; tone: Tone }[] = [
    {
      key: "membership",
      label: vi ? "Membership Gym" : "Gym membership",
      value: !ready
        ? "…"
        : membership
          ? vi
            ? `Còn hạn đến ${formatDate(membership.endDate)}`
            : `Active until ${formatDate(membership.endDate)}`
          : vi
            ? "Chưa có Membership còn hạn"
            : "No active Gym membership",
      tone: !ready ? "neutral" : membership ? "ok" : "warn",
    },
    {
      key: "daypass",
      label: vi ? "Vé Gym 1 ngày" : "Day Pass",
      value: !ready
        ? "…"
        : dayPass
          ? vi
            ? "Có hiệu lực hôm nay"
            : "Valid today"
          : vi
            ? "Chưa có vé ngày"
            : "No Day Pass",
      tone: !ready ? "neutral" : dayPass ? "ok" : "neutral",
    },
    {
      key: "gym",
      label: vi ? "Phòng Gym" : "Gym",
      value: !ready
        ? "…"
        : latestCheckIn
          ? vi
            ? `Lần check-in gần nhất: ${formatTime(latestCheckIn.checkInTime)}`
            : `Last check-in: ${formatTime(latestCheckIn.checkInTime)}`
          : vi
            ? "Chưa có lượt check-in"
            : "No check-ins yet",
      tone: latestCheckIn ? "ok" : "neutral",
    },
  ];

  const sellHref = "/receptionist/sales";

  return (
    <section
      className={`${styles.selected} ${locked ? styles.selectedLocked : ""}`}
      aria-label={vi ? "Hội viên đang chọn" : "Selected member"}
    >
      <div className={styles.selectedTop}>
        <AvatarImage
          name={member.fullName || member.email}
          avatarUrl={member.avatarUrl}
          size={64}
        />

        <div className={styles.identity}>
          <div className={styles.nameRow}>
            <h2 className={styles.selectedName}>
              {member.fullName || member.email}
            </h2>
            {member.status === "BANNED" && (
              <span className={styles.lockBadge}>
                <Ban size={16} aria-hidden="true" />
                {vi ? "Đã khóa" : "Locked"}
              </span>
            )}
            {member.status === "DEACTIVATED" && (
              <span className={styles.lockBadge}>
                <Ban size={16} aria-hidden="true" />
                {vi ? "Đã vô hiệu hóa" : "Deactivated"}
              </span>
            )}
            {member.activationPending ? (
              <StatusChip
                value="PENDING_ACTIVATION"
                tone="warning"
                label={vi ? "Chờ kích hoạt" : "Activation pending"}
              />
            ) : (
              !locked && (
                <StatusChip
                  value="ACTIVE"
                  tone="success"
                  label={vi ? "Đã kích hoạt" : "Activated"}
                />
              )
            )}
          </div>

          <p className={styles.selectedMeta}>
            {member.email}
            {member.phone ? ` · ${member.phone}` : ""}
          </p>

        </div>

        <div className={styles.sideActions}>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => onChange(null)}
          >
            {vi ? "Đổi hội viên" : "Change member"}
          </button>
        </div>
      </div>

      {member.activationPending && (
        <PendingMemberPanel member={member} onChange={onChange} />
      )}

      <dl className={styles.facts}>
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className={`${styles.fact} ${
              tile.tone === "ok"
                ? styles.factOk
                : tile.tone === "warn"
                  ? styles.factWarn
                  : ""
            }`}
          >
            <dt>{tile.label}</dt>
            <dd>{tile.value}</dd>
          </div>
        ))}
      </dl>

      {expiring && membership && (
        <div className={styles.expiring} role="status">
          <CalendarClock size={18} aria-hidden="true" />
          <span>
            {daysLeft! <= 0
              ? vi
                ? "Membership Gym hết hạn hôm nay"
                : "Gym membership expires today"
              : vi
                ? `Membership Gym còn ${daysLeft} ngày`
                : `Gym membership expiring in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`}
          </span>
          <Link
            className="btn btn--secondary btn--sm"
            href={`${sellHref}?tab=membership&plan=${membership.packageId}`}
          >
            {vi ? "Gia hạn" : "Renew"}
          </Link>
        </div>
      )}

      <div className={styles.actions}>
        <span
          className={styles.tip}
          title={blocked ? blockReason : undefined}
        >
          <button
            type="button"
            className="btn"
            disabled={!ready || mutation.busy || blocked || cooldownSeconds > 0}
            aria-describedby={blocked ? "checkin-block-reason" : undefined}
            onClick={checkIn}
          >
            <CircleCheck size={18} aria-hidden="true" />
            {cooldownSeconds > 0
              ? `${vi ? "Check-in" : "Check in"} (${cooldownSeconds}s)`
              : vi ? "Check-in" : "Check in"}
          </button>
        </span>

        {!locked && (
          <Link className="btn btn--secondary" href={sellHref}>
            {vi ? "Bán dịch vụ" : "Sell a service"}
          </Link>
        )}

        {showProfileLink && (
          <Link
            className="btn btn--ghost"
            href={`/receptionist/members/${memberId}`}
          >
            {vi ? "Mở hồ sơ" : "Open profile"}
          </Link>
        )}
      </div>

      {blocked && (
        <p className={styles.block} id="checkin-block-reason">
          {blockReason}
        </p>
      )}

      {note && (
        <p className={styles.note} role="status">
          {note}
        </p>
      )}

      <MutationFeedback mutation={mutation} />

      {withExtras && (
        <>
          <MemberCancellations
            memberId={memberId}
            packages={packages.data ?? []}
            onChanged={packages.reload}
          />
          <MemberSupportRequests memberId={memberId} />
        </>
      )}
    </section>
  );
}
