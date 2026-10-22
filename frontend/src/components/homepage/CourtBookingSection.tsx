"use client";

import Image from "./HomepageImage";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { buttonClass } from "@/components/primitives/Button";
import styles from "./court-booking-section.module.css";
import { useLandingCopy } from "./landing-content-context";

export const bookingCopy = {
  image: "/sporthub/court-volt/hero-rally.png",
  imageAlt: "Athletes playing badminton on an indoor court",
  eyebrow: "Make room for your next game",
  title: "Bring your team.\nMake it a game.",
  lead: "From a badminton rally to basketball with your teammates, find a court and a time that works for your game.",
  sports: "Badminton · Basketball",
  cta: "Book a court",
  note: "Check availability and prices in Member. Sign in to book.",
};

const bookingPath = "/member/services?section=courts&view=explore";

export function CourtBookingSection({ language }: { language: "en" | "vi" }) {
  const { user } = useAuth();
  const content = useLandingCopy("booking", bookingCopy);

  return (
    <section
      id="book-court"
      lang={language}
      className={styles.section}
      aria-labelledby="court-booking-title"
    >
      <div className={styles.photo}>
        <Image
          src={content.image}
          alt={content.imageAlt}
          fill
          sizes="(max-width: 900px) 100vw, 50vw"
        />
      </div>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{content.eyebrow}</p>
        <h2 id="court-booking-title">{content.title}</h2>
        <p className={styles.lead}>{content.lead}</p>
        <p className={styles.sports}>{content.sports}</p>
        <Link
          href={
            user?.role === "Member"
              ? bookingPath
              : `/login?next=${encodeURIComponent(bookingPath)}`
          }
          className={buttonClass({ size: "lg", className: styles.cta })}
        >
          {content.cta}
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
        <p className={styles.note}>{content.note}</p>
      </div>
    </section>
  );
}
