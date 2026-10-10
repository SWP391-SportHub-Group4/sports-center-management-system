"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Clock, MapPin } from "lucide-react";
import { AsyncSection, StatusChip } from "@/components/ui";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  formatDate,
  formatTime,
  formatMoney,
  formatPoints,
} from "@/lib/format";
import { rentalApi } from "../rentals/api";
import { RentalPriceBreakdown } from "../rentals/rental-price-breakdown";
import { RentalCancelConfirm } from "./rental-cancel";
import { CalendarSticker } from "./calendar-sticker";
import styles from "./schedule-course-page.module.css";

export function ScheduleRentalPage({
  rentalId,
  onBack,
  onChanged,
}: {
  rentalId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const backButton = useRef<HTMLButtonElement>(null);
  const [cancelling, setCancelling] = useState(false);
  const now = useNow();
  const state = useApi(
    (signal) => rentalApi.detail(rentalId, signal),
    [rentalId],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      backButton.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={styles.viewport}>
      <article
        className={styles.page}
        aria-label={vi ? "Chi tiết lượt thuê sân" : "Court booking details"}
      >
        <header className={styles.navigation}>
          <button
            ref={backButton}
            type="button"
            className="btn btn--quiet"
            onClick={onBack}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {vi ? "Trở về lịch của tôi" : "Back to my schedule"}
          </button>
          {state.data && (
            <StatusChip
              value={state.data.rental.status}
              label={
                state.data.rental.status === "CONFIRMED"
                  ? t.mSchedule.rentalBooked
                  : undefined
              }
            />
          )}
        </header>
        <AsyncSection state={state}>
          {(detail) => (
            <>
              <div className={styles.overview}>
                <figure className={styles.coach}>
                  <Image
                    src={
                      /basketball|bóng\s*rổ/i.test(detail.sportName)
                        ? "/sporthub/court-volt/course-basketball.png"
                        : "/sporthub/court-volt/course-badminton.png"
                    }
                    width={1024}
                    height={1024}
                    alt={
                      vi
                        ? `Ảnh minh họa sân ${detail.sportName}`
                        : `Illustrative ${detail.sportName} court image`
                    }
                    priority
                  />
                  <figcaption>
                    <span>
                      {vi ? "Không gian tập luyện" : "Training space"}
                    </span>
                    <strong>{detail.sportName}</strong>
                    <small>{vi ? "Ảnh minh họa" : "Illustrative image"}</small>
                  </figcaption>
                </figure>
                <div className={styles.summary}>
                  <div className={styles.sport}>
                    <CalendarSticker sport={detail.sportName} kind="rental" />
                    <span>{detail.sportName}</span>
                  </div>
                  <h2>{detail.roomName}</h2>
                  <p>
                    {vi
                      ? "Thông tin lượt đặt sân của bạn. Xem thời gian, chi phí và quản lý lượt thuê ngay trong lịch."
                      : "Your court booking: view the time, price and manage the booking right here in your schedule."}
                  </p>
                  <dl className={styles.facts}>
                    <div>
                      <dt>
                        <CalendarDays size={17} aria-hidden="true" />
                        {vi ? "Ngày đặt" : "Booking date"}
                      </dt>
                      <dd>{formatDate(detail.rental.startAtUtc)}</dd>
                    </div>
                    <div>
                      <dt>
                        <Clock size={17} aria-hidden="true" />
                        {vi ? "Khung giờ" : "Time slot"}
                      </dt>
                      <dd>
                        {formatTime(detail.rental.startAtUtc)}–
                        {formatTime(detail.rental.endAtUtc)}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <MapPin size={17} aria-hidden="true" />
                        {vi ? "Sân" : "Court"}
                      </dt>
                      <dd>{detail.roomName}</dd>
                    </div>
                    <div>
                      <dt>{vi ? "Tổng chi phí" : "Total price"}</dt>
                      <dd>{formatMoney(detail.rental.totalPrice)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              <section className={styles.sessions}>
                <RentalPriceBreakdown
                  quote={{
                    totalPrice: detail.rental.totalPrice,
                    blocks: detail.blocks,
                  }}
                />
                {detail.cancelReason && (
                  <p>
                    {vi ? "Lý do hủy" : "Cancellation reason"}:{" "}
                    {detail.cancelReason}
                  </p>
                )}
                {detail.cancelledAtUtc && (
                  <p>
                    {vi ? "Đã hủy lúc" : "Cancelled at"}:{" "}
                    {formatDate(detail.cancelledAtUtc)} ·{" "}
                    {formatTime(detail.cancelledAtUtc)}
                  </p>
                )}
                {detail.refundPoints > 0 && (
                  <p>
                    {vi ? "Điểm đã hoàn" : "Points refunded"}:{" "}
                    {formatPoints(detail.refundPoints)}
                  </p>
                )}
                <div className="btn-row">
                  {detail.rental.invoiceId && (
                    <Link
                      className="btn btn--secondary"
                      href={`/member/finance?tab=invoices&invoice=${detail.rental.invoiceId}`}
                    >
                      {t.operations.invoices}
                    </Link>
                  )}
                  <button
                    type="button"
                    className="btn btn--quiet"
                    onClick={state.reload}
                  >
                    {t.operations.refresh}
                  </button>
                  {detail.rental.status === "CONFIRMED" &&
                    Date.parse(detail.rental.startAtUtc) > now && (
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => setCancelling(true)}
                      >
                        {t.mSchedule.cancelRental}
                      </button>
                    )}
                </div>
              </section>
              {cancelling && (
                <RentalCancelConfirm
                  rental={detail.rental}
                  onClose={() => setCancelling(false)}
                  onCancelled={() => {
                    setCancelling(false);
                    state.reload();
                    onChanged();
                  }}
                />
              )}
            </>
          )}
        </AsyncSection>
      </article>
    </div>
  );
}
