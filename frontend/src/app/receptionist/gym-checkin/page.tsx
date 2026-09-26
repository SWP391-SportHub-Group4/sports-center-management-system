"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MemberPicker } from "@/components/MemberPicker";
import { CameraQrScanner } from "@/components/CameraQrScanner";
import {
  AsyncSection,
  Feedback,
  StatusChip,
  Table,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  IconQrCode,
  IconCheck,
  IconClock,
  IconFlame,
  StickerGatePass,
} from "@/components/icons";
import type {
  GymCheckInDto,
  MemberPackageDto,
  Paged,
  UserAdminDto,
} from "@/lib/types";
import styles from "./gym-checkin.module.css";

interface PagedCheckIns {
  items: GymCheckInDto[];
  page: number;
  pageSize: number;
  totalCount: number;
}

/**
 * Gym check-in (BR-64) — Gym/Fitness ra vào tự do, KHÔNG đặt lịch qua lớp.
 *
 * Điều kiện duy nhất là hội viên có ≥1 gói ở trạng thái Hoạt động; không giới hạn số lần
 * check-in trong ngày và KHÔNG trừ số buổi còn lại của bất kỳ gói nào. Kiểm tra thật nằm ở
 * API (một transaction) — phần hiển thị dưới đây chỉ giúp lễ tân biết trước kết quả.
 */
export default function GymCheckInPage() {
  const { language } = useLanguage();
  const [member, setMember] = useState<UserAdminDto | null>(null);
  const [autoUnlock, setAutoUnlock] = useState(true);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const action = useAction();

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

  const history = useApi(
    (signal) =>
      member
        ? api.get<PagedCheckIns>(`/api/members/${member.userId}/gym-checkins`, {
            signal,
            query: { pageSize: 15 },
          })
        : Promise.resolve(null),
    [member?.userId],
  );

  const activePackages =
    packages.data?.filter((item) => item.status === "Active") ?? [];

  const checkIn = async (targetUser?: UserAdminDto) => {
    const userToVerify = targetUser || member;
    if (!userToVerify) return;

    const done = await action.run(
      () => api.post("/api/gym-checkins", { targetMemberId: userToVerify.userId }),
      language === "en"
        ? `Gym check-in confirmed for ${userToVerify.fullName || userToVerify.email}. Turnstile unlocked.`
        : `Đã xác nhận check-in Gym cho ${userToVerify.fullName || userToVerify.email}. Cổng turnstile đã mở.`,
    );

    if (done !== null) history.reload();
  };

  /**
   * Handle real-time camera QR scan:
   * Parses member pass payload (JSON or token/ID), resolves user account,
   * verifies package eligibility, and optionally unlocks gate immediately.
   */
  const handleCameraQrScan = async (decodedText: string) => {
    setScanNotice(null);
    let targetUserId: string | null = null;
    let targetKeyword: string | null = null;

    try {
      const parsed = JSON.parse(decodedText);
      if (parsed.userId && typeof parsed.userId === "string") {
        targetUserId = parsed.userId;
      } else if (parsed.memberId && typeof parsed.memberId === "string") {
        targetKeyword = parsed.memberId;
      } else if (parsed.email && typeof parsed.email === "string") {
        targetKeyword = parsed.email;
      }
    } catch {
      const trimmed = decodedText.trim();
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
        targetUserId = trimmed;
      } else {
        targetKeyword = trimmed;
      }
    }

    try {
      let resolvedUser: UserAdminDto | null = null;

      if (targetUserId) {
        try {
          resolvedUser = await api.get<UserAdminDto>(`/api/users/${targetUserId}`);
        } catch {
          targetKeyword = targetUserId;
        }
      }

      if (!resolvedUser && targetKeyword) {
        const paged = await api.get<Paged<UserAdminDto>>("/api/users", {
          query: { keyword: targetKeyword, role: "Member", pageSize: 5 },
        });
        resolvedUser = paged.items?.[0] ?? null;
      }

      if (resolvedUser) {
        setMember(resolvedUser);
        const successMsg =
          language === "en"
            ? `QR verified: ${resolvedUser.fullName || resolvedUser.email}`
            : `Đã nhận diện QR: ${resolvedUser.fullName || resolvedUser.email}`;
        setScanNotice(successMsg);

        // If auto-unlock is toggled on, check pass status and unlock immediately
        if (autoUnlock) {
          try {
            const userPkgs = await api.get<MemberPackageDto[]>(
              `/api/members/${resolvedUser.userId}/packages`
            );
            const hasActivePass = (userPkgs || []).some((p) => p.status === "Active");

            if (hasActivePass) {
              await checkIn(resolvedUser);
            } else {
              action.setError(
                language === "en"
                  ? `Access Refused: Member ${resolvedUser.fullName || resolvedUser.email} has no active gym pass (BR-64).`
                  : `Từ chối vào tập: Hội viên ${resolvedUser.fullName || resolvedUser.email} không có gói tập hiệu lực (BR-64).`
              );
            }
          } catch {
            // Checked by standard package state
          }
        }
      } else {
        action.setError(
          language === "en"
            ? `QR scanned, but no member account found matching "${targetKeyword || targetUserId || decodedText}".`
            : `Đã quét mã QR, nhưng không tìm thấy tài khoản hội viên phù hợp.`
        );
      }
    } catch (err: unknown) {
      action.setError(
        err instanceof Error ? err.message : "Error verifying scanned QR code."
      );
    }
  };

  return (
    <AppShell
      title={language === "en" ? "Gym Turnstile Terminal" : "Điểm danh Cổng Turnstile Gym"}
      description={
        language === "en"
          ? "Rapid barcode/QR scanning and open gym floor check-in terminal (BR-64)"
          : "Trạm quét mã QR/Barcode và ghi nhận hội viên vào tập Gym tự do (BR-64)"
      }
      allow={["Receptionist"]}
    >
      <div className={styles.container}>
        {/* Top Hardware Scanner HUD */}
        <section className={styles.scannerBar} aria-label={language === "en" ? "Turnstile status" : "Trạng thái cổng turnstile"}>
          <div className={styles.scannerInfo}>
            <div className={styles.scannerIconBox} aria-hidden="true">
              <IconQrCode size={26} />
            </div>
            <div>
              <h2 className={styles.scannerTitle}>
                {language === "en" ? "Optical Gate Turnstile Reader Active" : "Đầu đọc cổng quang Turnstile đang sẵn sàng"}
              </h2>
              <p className={styles.scannerSubtitle}>
                {language === "en"
                  ? "Scan member card / app QR or enter phone number below for sub-second verification"
                  : "Quét thẻ hội viên, mã QR trên app hoặc gõ SĐT bên dưới để xác thực ngay"}
              </p>
            </div>
          </div>

          <div className={styles.scannerStatusPill}>
            <span className={styles.pulseGreen} aria-hidden="true" />
            <span>{language === "en" ? "Hardware Online" : "Cổng kết nối tốt"}</span>
          </div>
        </section>

        {/* 2-Column Terminal Layout */}
        <div className={styles.terminalGrid}>
          {/* Main Action Desk */}
          <div className={styles.deskCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                {language === "en" ? "1. Camera QR Scanner & Member Lookup" : "1. Camera Quét Mã QR & Tra cứu"}
              </h3>
              <span className={styles.cardHint}>
                {language === "en" ? "Optical Video Scanner Active" : "Camera quét quang học trực tiếp"}
              </span>
            </div>

            {/* Live Camera Scanner Feed */}
            <CameraQrScanner
              onScan={(decoded) => void handleCameraQrScan(decoded)}
              defaultActive={true}
              title={
                language === "en"
                  ? "Live Camera Turnstile Scanner"
                  : "Camera Quét Mã Cổng Turnstile"
              }
            />

            {/* Auto-Unlock Turnstile Switch */}
            <div className={styles.autoUnlockRow}>
              <label className={styles.autoUnlockLabel}>
                <input
                  type="checkbox"
                  checked={autoUnlock}
                  onChange={(e) => setAutoUnlock(e.target.checked)}
                  className={styles.checkboxInput}
                />
                <span>
                  <strong>
                    {language === "en"
                      ? "Auto-unlock gate on valid active membership pass (BR-64)"
                      : "Tự động mở cổng khi hội viên có gói tập hiệu lực (BR-64)"}
                  </strong>
                </span>
              </label>
            </div>

            {scanNotice && (
              <div className={styles.scanNoticePill} role="status">
                <IconCheck size={14} strokeWidth={2.5} />
                <span>{scanNotice}</span>
              </div>
            )}

            <div style={{ marginTop: 6, marginBottom: 10 }}>
              <span className="small muted" style={{ display: "block", marginBottom: 6 }}>
                {language === "en"
                  ? "Or lookup manually / swipe physical card barcode:"
                  : "Hoặc tra cứu thủ công / quét đầu đọc barcode vật lý:"}
              </span>
              <MemberPicker
                autoFocus={false}
                value={member}
                onChange={(m) => {
                  setMember(m);
                  setScanNotice(null);
                }}
                placeholder={
                  language === "en"
                    ? "Scan barcode/QR or type name/phone..."
                    : "Quét mã Barcode/QR hoặc nhập tên/SĐT..."
                }
              />
            </div>

            {member && (
              <AsyncSection
                state={packages}
                emptyMessage={
                  language === "en"
                    ? "Could not load membership packages."
                    : "Không thể tải thông tin gói tập của hội viên."
                }
              >
                {(data) => {
                  const hasActive = activePackages.length > 0;
                  return (
                    <div
                      className={`${styles.clearanceCard} ${hasActive ? styles.clearanceGranted : styles.clearanceRefused}`}
                    >
                      <div className={styles.clearanceIcon} aria-hidden="true">
                        {hasActive ? <IconCheck size={20} strokeWidth={2.5} /> : <IconFlame size={20} />}
                      </div>
                      <div className={styles.clearanceDetails}>
                        <h4 className={styles.clearanceTitle}>
                          {hasActive
                            ? (language === "en" ? "Access Granted · Active Package Verified" : "Được phép qua cổng · Gói tập hợp lệ")
                            : (language === "en" ? "Access Refused · No Active Package (BR-64)" : "Từ chối vào tập · Không có gói hiệu lực (BR-64)")}
                        </h4>
                        <p className={styles.clearanceMeta}>
                          {hasActive ? (
                            <>
                              <strong>
                                {activePackages.map((p) => p.packageName).join(", ")}
                              </strong>
                              {" · "}
                              {language === "en" ? "Valid until" : "Hạn đến"}{" "}
                              {formatDate(activePackages[0]?.endDate)}
                            </>
                          ) : (
                            <>
                              {language === "en"
                                ? "Member does not hold an active gym pass. Turnstile cannot unlock."
                                : "Hội viên chưa có gói tập gym đang hoạt động. Cổng không thể mở."}
                              {" "}
                              <Link
                                href="/receptionist/sell-plans"
                                style={{ fontWeight: 700, textDecoration: "underline" }}
                              >
                                {language === "en" ? "Sell or Renew Package →" : "Đăng ký gói ngay →"}
                              </Link>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                }}
              </AsyncSection>
            )}

            <Feedback error={action.error} success={action.success} />

            <div className={styles.actionBtnRow}>
              <button
                type="button"
                className={styles.confirmCheckInBtn}
                disabled={!member || action.busy || activePackages.length === 0}
                onClick={() => void checkIn()}
              >
                <span>
                  {action.busy
                    ? (language === "en" ? "Confirming..." : "Đang xác nhận...")
                    : (language === "en" ? "Confirm Check-in & Unlock Gate" : "Xác nhận Check-in & Mở cổng")}
                </span>
                <span className={styles.keyHintBadge}>↵ Enter</span>
              </button>
            </div>
          </div>

          {/* Audit History Card */}
          <div className={styles.deskCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                {member
                  ? (language === "en" ? `Recent Visits · ${member.fullName || member.email}` : `Lịch sử vào tập · ${member.fullName || member.email}`)
                  : (language === "en" ? "2. Turnstile Verification Logs" : "2. Nhật ký lượt qua cổng")}
              </h3>
              <span className={styles.cardHint}>
                {language === "en" ? "Last 15 records" : "15 lượt gần nhất"}
              </span>
            </div>

            {member ? (
              <AsyncSection
                state={history}
                emptyMessage={
                  <div style={{ textAlign: "center", padding: "28px 16px" }}>
                    <StickerGatePass size={64} style={{ marginBottom: 10, opacity: 0.8 }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>
                      {language === "en"
                        ? "This member has no recorded gym visits yet."
                        : "Hội viên chưa từng check-in Gym."}
                    </p>
                  </div>
                }
                isEmpty={(data) => !data || data.items.length === 0}
              >
                {(data) =>
                  data ? (
                    <div className={styles.historyTableWrapper}>
                      <Table
                        headers={[
                          language === "en" ? "Check-in Timestamp" : "Thời gian vào cổng",
                          language === "en" ? "Clearance" : "Trạng thái",
                        ]}
                      >
                        {data.items.map((item) => (
                          <tr key={item.checkInId}>
                            <td className={styles.historyTimestamp}>
                              {formatDateTime(item.checkInTime)}
                            </td>
                            <td>
                              <StatusChip value="Present" />
                            </td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  ) : null
                }
              </AsyncSection>
            ) : (
              <div style={{ textAlign: "center", padding: "36px 16px", color: "var(--ink-500, #64748b)" }}>
                <div style={{ display: "grid", placeItems: "center", marginBottom: 14 }}>
                  <StickerGatePass size={84} />
                </div>
                <p style={{ margin: 0, fontSize: "0.9rem", maxWidth: 360, marginInline: "auto" }}>
                  {language === "en"
                    ? "Scan a member's card or enter their name/phone on the left to preview pass status and visit history."
                    : "Quét thẻ hoặc nhập tên/SĐT hội viên ở bên trái để xem trạng thái gói tập và lịch sử vào cổng."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
