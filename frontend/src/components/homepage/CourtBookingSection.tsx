"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { buttonClass } from "@/components/primitives/Button";
import styles from "./court-booking-section.module.css";

const bookingPath = "/member/courts/book";

export function CourtBookingSection({ language }: { language: "en" | "vi" }) {
  const { user } = useAuth();
  const vi = language === "vi";

  return (
    <section className={styles.section} aria-labelledby="court-booking-title">
      <div className={styles.photo}>
        <Image
          src="/sporthub/court-volt/hero-rally.png"
          alt={
            vi
              ? "Vận động viên thi đấu cầu lông trên sân trong nhà"
              : "Athletes playing badminton on an indoor court"
          }
          fill
          sizes="(max-width: 900px) 100vw, 50vw"
        />
      </div>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>
          {vi ? "Sân cho cuộc hẹn tiếp theo" : "Make room for your next game"}
        </p>
        <h2 id="court-booking-title">
          {vi
            ? "Hẹn bạn bè.\nLên sân thôi."
            : "Bring your team.\nMake it a game."}
        </h2>
        <p className={styles.lead}>
          {vi
            ? "Từ những đường cầu đến trận bóng rổ cùng đồng đội, tìm sân và khung giờ phù hợp cho buổi chơi của bạn."
            : "From a badminton rally to basketball with your teammates, find a court and a time that works for your game."}
        </p>
        <p className={styles.sports}>
          {vi ? "Cầu lông · Bóng rổ" : "Badminton · Basketball"}
        </p>
        <Link
          href={
            user
              ? bookingPath
              : `/login?next=${encodeURIComponent(bookingPath)}`
          }
          className={buttonClass({ size: "lg", className: styles.cta })}
        >
          {vi ? "Đặt sân" : "Book a court"}
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
        <p className={styles.note}>
          {vi
            ? "Xem sân trống và giá trong Member. Cần đăng nhập để đặt sân."
            : "Check availability and prices in Member. Sign in to book."}
        </p>
      </div>
    </section>
  );
}
