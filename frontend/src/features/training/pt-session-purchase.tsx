"use client";

import { useState } from "react";
import Link from "next/link";
import { AsyncSection, Field, Feedback } from "@/components/ui";
import { CheckoutPanel } from "@/features/payments";
import { isRetiredActivityPackage } from "@/features/membership";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useUrlQuery } from "@/lib/useUrlQuery";
import {
  addDaysIso,
  formatDateTime,
  formatMoney,
  formatTime,
  todayIso,
} from "@/lib/format";
import type { MemberPackageDto, PtAvailabilityDto } from "@/lib/types";
import styles from "./training.module.css";

type SessionQuote = {
  totalQuota: number;
  totalPrice: number;
  pricePerSession: number;
  priceVersion: string;
  body: {
    memberPackageId: string;
    coachId: string;
    frequencyPerWeek: number;
    startAtUtc: string;
    roomId: number;
  };
  coachName: string;
  roomName: string;
};

export function PtSessionPurchase({
  showBackLink = true,
}: {
  showBackLink?: boolean;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const text = (viText: string, enText: string) => (vi ? viText : enText);
  const today = todayIso();
  const [packagePick, setPackage] = useState("");
  const [coachId, setCoach] = useState("");
  const [date, setDate] = useState(addDaysIso(today, 1));
  const [start, setStart] = useState("");
  const [roomPick, setRoom] = useState<number | null>(null);
  const [quote, setQuote] = useState<SessionQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { values } = useUrlQuery({ checkout: "" });
  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );
  const active = (packages.data ?? []).filter(
    (p) =>
      p.isUsable &&
      p.status.toUpperCase() === "ACTIVE" &&
      !isRetiredActivityPackage(p.packageName),
  );
  const packageId = active.some((p) => p.memberPackageId === packagePick)
    ? packagePick
    : (active[0]?.memberPackageId ?? "");
  const coaches = useApi(
    (signal) =>
      api.get<{ userId: string; fullName: string }[]>("/api/coaches", {
        signal,
        query: { service: "PERSONAL_TRAINING" },
      }),
    [],
  );
  const availability = useApi(
    (signal) =>
      packageId && coachId
        ? api.get<PtAvailabilityDto>(
            "/api/members/me/pt-session-availability",
            {
              signal,
              query: {
                memberPackageId: packageId,
                coachId,
                fromDate: date,
                toDate: date,
              },
            },
          )
        : Promise.resolve(null),
    [packageId, coachId, date],
  );
  const chosen = availability.data?.slots.find((s) => s.startAtUtc === start);
  const room =
    chosen?.rooms.find((r) => r.roomId === roomPick) ?? chosen?.rooms[0];
  const refresh = availability.reload;
  function resetSelection() {
    setStart("");
    setRoom(null);
    setQuote(null);
    setError(null);
  }
  async function review() {
    if (!chosen || !room || busy) return;
    setBusy(true);
    setError(null);
    const body = {
      memberPackageId: packageId,
      coachId,
      frequencyPerWeek: 1,
      startAtUtc: chosen.startAtUtc,
      roomId: room.roomId,
    };
    try {
      const result = await api.post<
        Omit<SessionQuote, "body" | "coachName" | "roomName">
      >("/api/checkouts/pt/quote", body);
      if (result.totalQuota !== 1)
        throw new Error(
          text(
            "Chưa thể báo giá PT từng buổi. Vui lòng thử lại sau hoặc liên hệ trung tâm.",
            "Per-session PT pricing is unavailable. Please try again later or contact the center.",
          ),
        );
      setQuote({
        ...result,
        body,
        coachName: availability.data!.coachName,
        roomName: room.name,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      {showBackLink && (
        <Link className={styles.back} href="/member/training">
          ← {text("Trở về Training", "Back to Training")}
        </Link>
      )}
      <section className={styles.sessionIntro}>
        <span>{text("PT TỪNG BUỔI", "PAY PER SESSION")}</span>
        <h2>
          {text(
            "Chọn lịch tập. Thanh toán một buổi.",
            "Choose your time. Pay for one session.",
          )}
        </h2>
        <p>
          {text(
            "90 phút cùng coach · Cần Membership Gym còn hiệu lực · Lịch xác nhận sau khi thanh toán thành công.",
            "90 minutes with your coach · Active Gym membership required · Booking confirmed after successful payment.",
          )}
        </p>
      </section>
      {values.checkout && !quote && (
        <section className={styles.panel}>
          <h3>{text("Tiếp tục thanh toán", "Resume checkout")}</h3>
          <CheckoutPanel
            key={values.checkout}
            invoiceId={values.checkout}
            modal
            onChange={refresh}
          />
        </section>
      )}
      <AsyncSection state={packages}>
        {() =>
          !active.length ? (
            <div className={styles.panel}>
              <p>
                {text(
                  "Bạn cần Membership Gym đang có hiệu lực để đặt PT.",
                  "You need an active Gym membership to book PT.",
                )}
              </p>
              <Link className="btn" href="/member/services">
                {text("Chọn Membership", "Choose a membership")}
              </Link>
            </div>
          ) : (
            <div className={styles.purchaseLayout}>
              <section className={styles.panel}>
                <h3>
                  {text(
                    "1. Chọn coach và lịch trống",
                    "1. Choose a coach and available time",
                  )}
                </h3>
                <div className={styles.purchaseFields}>
                  <Field label="Membership Gym">
                    <select
                      disabled={busy}
                      value={packageId}
                      onChange={(e) => {
                        setPackage(e.target.value);
                        resetSelection();
                      }}
                    >
                      {active.map((p) => (
                        <option
                          key={p.memberPackageId}
                          value={p.memberPackageId}
                        >
                          {p.packageName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <AsyncSection state={coaches}>
                    {() => (
                      <Field label={text("Huấn luyện viên", "Coach")}>
                        <select
                          disabled={busy}
                          value={coachId}
                          onChange={(e) => {
                            setCoach(e.target.value);
                            resetSelection();
                          }}
                        >
                          <option value="">
                            {text("Chọn coach", "Choose a coach")}
                          </option>
                          {coaches.data?.map((c) => (
                            <option key={c.userId} value={c.userId}>
                              {c.fullName}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                  </AsyncSection>
                  <Field label={text("Ngày tập", "Training date")}>
                    <input
                      disabled={busy}
                      type="date"
                      min={today}
                      max={addDaysIso(today, 30)}
                      value={date}
                      onChange={(e) => {
                        if (e.target.value) setDate(e.target.value);
                        resetSelection();
                      }}
                    />
                  </Field>
                </div>
                {coachId && (
                  <AsyncSection state={availability}>
                    {(data) =>
                      data && (
                        <div className="stack">
                          {data.bookableReason ? (
                            <p role="status">
                              {text(
                                "Hiện không có phòng PT phù hợp. Vui lòng liên hệ trung tâm.",
                                "No suitable PT room is available. Please contact the center.",
                              )}
                            </p>
                          ) : data.slots.length ? (
                            <div
                              className={styles.times}
                              role="group"
                              aria-label={text(
                                "Giờ tập còn trống",
                                "Available training times",
                              )}
                            >
                              {data.slots.map((s) => (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className={styles.time}
                                  key={s.startAtUtc}
                                  aria-pressed={start === s.startAtUtc}
                                  onClick={() => {
                                    setStart(s.startAtUtc);
                                    setRoom(null);
                                    setQuote(null);
                                    setError(null);
                                  }}
                                >
                                  {formatTime(s.startAtUtc)}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p role="status">
                              {text(
                                "Không có giờ trống ngày này. Chọn ngày hoặc coach khác.",
                                "No available times on this day. Choose another date or coach.",
                              )}
                            </p>
                          )}
                          {chosen && room && (
                            <Field label={text("Phòng tập", "Training room")}>
                              <select
                                value={room.roomId}
                                onChange={(e) => {
                                  setRoom(Number(e.target.value));
                                  setQuote(null);
                                }}
                              >
                                {chosen.rooms.map((r) => (
                                  <option key={r.roomId} value={r.roomId}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          )}
                        </div>
                      )
                    }
                  </AsyncSection>
                )}
              </section>
              <section className={styles.sessionReview}>
                <h3>{text("2. Xem giá và thanh toán", "2. Review and pay")}</h3>
                <p>
                  {text(
                    "Chỉ thanh toán buổi tập bạn chọn. Không mua gói theo tuần.",
                    "Pay only for your selected session. No weekly package purchase.",
                  )}
                </p>
                {quote ? (
                  <>
                    <dl className={styles.facts}>
                      <div>
                        <dt>{text("Coach", "Coach")}</dt>
                        <dd>{quote.coachName}</dd>
                      </div>
                      <div>
                        <dt>{text("Lịch tập", "Session time")}</dt>
                        <dd>
                          {formatDateTime(quote.body.startAtUtc)} · 90{" "}
                          {text("phút", "minutes")}
                        </dd>
                      </div>
                      <div>
                        <dt>{text("Phòng", "Room")}</dt>
                        <dd>{quote.roomName}</dd>
                      </div>
                    </dl>
                    <strong className={styles.sessionPrice}>
                      {formatMoney(quote.totalPrice)}{" "}
                      <small>/ {text("buổi", "session")}</small>
                    </strong>
                    <CheckoutPanel
                      key={JSON.stringify(quote.body)}
                      modal
                      intent={{
                        kind: "pt",
                        body: {
                          ...quote.body,
                          priceVersion: quote.priceVersion,
                        },
                      }}
                      onChange={refresh}
                      review={{
                        title: text("Thanh toán buổi PT", "PT session payment"),
                        submitLabel: text("Thanh toán", "Pay"),
                        items: [
                          { label: "Coach", value: quote.coachName },
                          {
                            label: text("Lịch tập", "Time"),
                            value: formatDateTime(quote.body.startAtUtc),
                          },
                          {
                            label: text("Phòng", "Room"),
                            value: quote.roomName,
                          },
                          {
                            label: text("Thời lượng", "Duration"),
                            value: "90 " + text("phút", "minutes"),
                          },
                        ],
                      }}
                    />
                    <Link href="/member/training?tab=sessions">
                      {text("Xem lịch PT của tôi", "View my PT sessions")}
                    </Link>
                  </>
                ) : (
                  <>
                    {chosen && (
                      <p>
                        <strong>{formatDateTime(chosen.startAtUtc)}</strong> ·
                        90 {text("phút", "minutes")}
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn"
                      disabled={!chosen || !room || busy}
                      onClick={review}
                    >
                      {busy
                        ? text("Đang lấy báo giá…", "Loading quote…")
                        : text("Xem giá buổi tập", "Review session price")}
                    </button>
                  </>
                )}
                <Feedback error={error} />
              </section>
            </div>
          )
        }
      </AsyncSection>
    </div>
  );
}
