"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import styles from "./community-events.module.css";

interface EventItem {
  id: string;
  tabLabel: string;
  badge: string;
  dateStr: string;
  title: string;
  location: string;
  capacity: string;
  description: string;
  ctaText: string;
  ctaHref: string;
}

export function CommunityEvents() {
  const { t } = useLanguage();
  const ev = t.eventsSection;

  const events: EventItem[] = [
    {
      id: "fitness",
      tabLabel: ev.combineTab,
      badge: ev.combineBadge,
      dateStr: ev.combineDate,
      title: ev.combineTitle,
      location: ev.combineLocation,
      capacity: ev.combineCapacity,
      description: ev.combineDesc,
      ctaText: ev.combineCta,
      ctaHref: "/member-dashboard/class-schedule",
    },
    {
      id: "sunrise",
      tabLabel: ev.sunriseTab,
      badge: ev.sunriseBadge,
      dateStr: ev.sunriseDate,
      title: ev.sunriseTitle,
      location: ev.sunriseLocation,
      capacity: ev.sunriseCapacity,
      description: ev.sunriseDesc,
      ctaText: ev.sunriseCta,
      ctaHref: "/member-dashboard/class-schedule",
    },
    {
      id: "pass",
      tabLabel: ev.passTab,
      badge: ev.passBadge,
      dateStr: ev.passDate,
      title: ev.passTitle,
      location: ev.passLocation,
      capacity: ev.passCapacity,
      description: ev.passDesc,
      ctaText: ev.passCta,
      ctaHref: "#guest-pass-form",
    },
  ];

  const [activeId, setActiveId] = useState<string>("fitness");
  const [guestName, setGuestName] = useState<string>("");
  const [claimed, setClaimed] = useState<boolean>(false);
  const [claimedPassNumber, setClaimedPassNumber] = useState<string>("");

  const currentEvent = events.find((e) => e.id === activeId) || events[0];

  const handleClaim = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = guestName.trim() || ev.defaultGuestName;
    const passCode = `SH-GUEST-${Math.floor(100000 + Math.random() * 900000)}`;
    setGuestName(finalName);
    setClaimedPassNumber(passCode);
    setClaimed(true);
  };

  const handleReset = () => {
    setClaimed(false);
    setGuestName("");
  };

  return (
    <section className={styles.section} id="events" aria-labelledby="events-heading">
      <div className={styles.copyCol}>
        <h2 className={styles.heading} id="events-heading">
          {ev.heading}
        </h2>
        <p className={styles.intro}>
          {ev.intro}
        </p>

        <div className={styles.tabList} role="tablist" aria-label={ev.heading}>
          {events.map((item) => {
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${item.id}`}
                id={`tab-${item.id}`}
                className={`${styles.tabButton} ${isActive ? styles.tabButtonActive : ""}`}
                onClick={() => setActiveId(item.id)}
                type="button"
              >
                {item.tabLabel}
              </button>
            );
          })}
        </div>

        <div
          className={styles.eventCard}
          id={`panel-${currentEvent.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${currentEvent.id}`}
        >
          <div className={styles.cardHeader}>
            <span className={styles.eventDate}>{currentEvent.dateStr}</span>
            <span className={styles.eventBadge}>{currentEvent.badge}</span>
          </div>
          <h3 className={styles.eventTitle}>{currentEvent.title}</h3>
          <div className={styles.eventDetails}>
            <span>📍 {currentEvent.location}</span>
            <span>⚡ {currentEvent.capacity}</span>
          </div>
          <p className={styles.eventDesc}>{currentEvent.description}</p>
          {currentEvent.id !== "pass" ? (
            <Link
              className={styles.passAction}
              href={currentEvent.ctaHref}
              style={{ display: "inline-flex", width: "auto", marginTop: "24px" }}
            >
              {currentEvent.ctaText} <span aria-hidden="true">↗</span>
            </Link>
          ) : (
            <button
              className={styles.passAction}
              onClick={() => {
                const el = document.getElementById("guest-name-input");
                if (el) el.focus();
              }}
              style={{ display: "inline-flex", width: "auto", marginTop: "24px" }}
              type="button"
            >
              {ev.passCtaPrompt} <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </div>

      <div className={styles.interactiveCol}>
        <div className={styles.passContainer}>
          <div className={styles.passHeader}>
            <div className={styles.passBrand}>
              <Image src="/sporthub/brand.svg" alt="" width={24} height={24} />
              <span>{ev.turnstileTitle}</span>
            </div>
            <span className={styles.passType}>{ev.digitalPassType}</span>
          </div>

          <div className={styles.passBody} id="guest-pass-form">
            {!claimed ? (
              <form onSubmit={handleClaim} className={styles.passInputGroup}>
                <label className={styles.passLabel} htmlFor="guest-name-input">
                  {ev.formLabel}
                </label>
                <input
                  id="guest-name-input"
                  className={styles.passInput}
                  type="text"
                  placeholder={ev.inputPlaceholder}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  required
                />
                <button className={styles.passAction} type="submit">
                  {ev.generateBtn} <span aria-hidden="true">⚡</span>
                </button>
                <small style={{ color: "var(--text-muted)", marginTop: "6px", fontSize: "0.78rem" }}>
                  {ev.formNote}
                </small>
              </form>
            ) : (
              <div className={styles.claimedBadge}>
                <p className={styles.claimedHolder}>{guestName}</p>
                <p className={styles.claimedValidity}>
                  {ev.passValidity}
                </p>
                <div className={styles.qrContainer} aria-label="Turnstile QR Code">
                  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="100" height="100" fill="white" />
                    <rect x="10" y="10" width="25" height="25" fill="black" />
                    <rect x="15" y="15" width="15" height="15" fill="white" />
                    <rect x="18" y="18" width="9" height="9" fill="black" />
                    <rect x="65" y="10" width="25" height="25" fill="black" />
                    <rect x="70" y="15" width="15" height="15" fill="white" />
                    <rect x="73" y="18" width="9" height="9" fill="black" />
                    <rect x="10" y="65" width="25" height="25" fill="black" />
                    <rect x="15" y="70" width="15" height="15" fill="white" />
                    <rect x="18" y="73" width="9" height="9" fill="black" />
                    <rect x="42" y="12" width="6" height="12" fill="black" />
                    <rect x="52" y="16" width="6" height="6" fill="black" />
                    <rect x="44" y="32" width="14" height="6" fill="black" />
                    <rect x="12" y="44" width="10" height="6" fill="black" />
                    <rect x="30" y="44" width="6" height="12" fill="black" />
                    <rect x="44" y="44" width="12" height="12" fill="black" />
                    <rect x="64" y="44" width="14" height="6" fill="black" />
                    <rect x="84" y="44" width="6" height="14" fill="black" />
                    <rect x="44" y="64" width="8" height="16" fill="black" />
                    <rect x="60" y="64" width="14" height="6" fill="black" />
                    <rect x="78" y="70" width="12" height="16" fill="black" />
                    <rect x="60" y="80" width="10" height="8" fill="black" />
                  </svg>
                </div>
                <small style={{ letterSpacing: "0.1em", color: "var(--brand-navy)", fontWeight: 700, background: "var(--brand-sky)", padding: "2px 8px", borderRadius: "2px" }}>
                  {claimedPassNumber}
                </small>
                <p className={styles.claimedInstruction}>
                  {ev.passInstruction}
                </p>
                <button className={styles.resetLink} onClick={handleReset} type="button">
                  {ev.resetBtn}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

