"use client";
import { useId } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatTime } from "@/lib/format";
import type { CourtRentalQuoteDto } from "@/lib/types";
import styles from "./rental-price-breakdown.module.css";
export function RentalPriceBreakdown({
  quote,
}: {
  quote: CourtRentalQuoteDto;
}) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const titleId = useId();
  const days = new Map<string, CourtRentalQuoteDto["blocks"]>();
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const dateLabel = new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  for (const block of [...quote.blocks].sort((a, b) =>
    a.startUtc.localeCompare(b.startUtc),
  )) {
    const day = dateKey.format(new Date(block.startUtc));
    days.set(day, [...(days.get(day) ?? []), block]);
  }
  return (
    <section className={styles.breakdown} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div>
          <h3 id={titleId}>{t.operations.priceBreakdown}</h3>
          <p>
            {vi
              ? "Giá theo từng khung giờ · Giờ Việt Nam (GMT+7)"
              : "Price per time slot · Vietnam time (GMT+7)"}
          </p>
        </div>
        {quote.blocks.length > 0 && (
          <span className={styles.count}>
            {quote.blocks.length} {vi ? "khung giờ" : "time slots"}
          </span>
        )}
      </header>
      <div className={styles.ledger}>
        {Array.from(days, ([day, blocks]) => (
          <div key={day} className={styles.dayGroup}>
            <div className={styles.dayHeading}>
              <CalendarDays size={17} aria-hidden="true" />
              <time dateTime={day}>
                {dateLabel.format(new Date(blocks[0].startUtc))}
              </time>
            </div>
            <ul className={styles.slots}>
              {blocks.map((block) => {
                const minutes = Math.round(
                  (Date.parse(block.endUtc) - Date.parse(block.startUtc)) /
                    60000,
                );
                return (
                  <li
                    key={`${block.startUtc}-${block.endUtc}`}
                    className={styles.slot}
                  >
                    <div className={styles.time}>
                      <Clock3 size={18} aria-hidden="true" />
                      <span>
                        <time dateTime={block.startUtc}>
                          {formatTime(block.startUtc)}
                        </time>
                        <span aria-hidden="true">–</span>
                        <span className="sr-only">{vi ? " đến " : " to "}</span>
                        <time dateTime={block.endUtc}>
                          {formatTime(block.endUtc)}
                        </time>
                      </span>
                    </div>
                    <span className={styles.duration}>
                      {minutes} {vi ? "phút thuê" : "minutes"}
                    </span>
                    <div className={styles.price}>
                      <span>{vi ? "Giá khung giờ" : "Slot price"}</span>
                      <strong>{formatMoney(block.price)}</strong>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {!quote.blocks.length && (
          <p className={styles.empty}>
            {vi
              ? "Chưa có chi tiết giá theo khung giờ."
              : "No time-slot price details available."}
          </p>
        )}
        <dl className={styles.total}>
          <dt>{t.refactor.total}</dt>
          <dd>{formatMoney(quote.totalPrice)}</dd>
        </dl>
      </div>
    </section>
  );
}
