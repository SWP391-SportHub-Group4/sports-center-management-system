"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { IconLocation, IconLightning } from "@/components/icons";
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
      ctaHref: "/member/class-schedule",
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
      ctaHref: "/member/class-schedule",
    },
  ];

  const [activeId, setActiveId] = useState<string>(events[0].id);
  const currentEvent = events.find((event) => event.id === activeId) ?? events[0];

  return (
    <section className={styles.section} id="events" aria-labelledby="events-heading">
      <div className={styles.copyCol}>
        <h2 className={styles.heading} id="events-heading">
          {ev.heading}
        </h2>
        <p className={styles.intro}>{ev.intro}</p>

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
            <span className={styles.eventDetail}>
              <IconLocation size={14} />
              {currentEvent.location}
            </span>
            <span className={styles.eventDetail}>
              <IconLightning size={14} />
              {currentEvent.capacity}
            </span>
          </div>
          <p className={styles.eventDesc}>{currentEvent.description}</p>
          <Link className={styles.eventAction} href={currentEvent.ctaHref}>
            {currentEvent.ctaText} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
