"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type CSSProperties,
} from "react";
import { ArrowRight, Dumbbell, Grid2X2, UsersRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  homepageCategories,
  type CategoryId,
  type HomepageLanguage,
} from "./homepage-seed";
import { ScrollReveal } from "./ScrollReveal";
import styles from "./homepage-stats.module.css";

function CountUp({
  value,
  suffix,
  language,
}: {
  value: number;
  suffix: string;
  language: HomepageLanguage;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const formatted =
    new Intl.NumberFormat(language === "vi" ? "vi-VN" : "en-US").format(value) +
    suffix;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const formatter = new Intl.NumberFormat(
      language === "vi" ? "vi-VN" : "en-US",
    );
    let frame = 0;
    let start: number | undefined;
    const finish = () => {
      cancelAnimationFrame(frame);
      node.textContent = formatter.format(value) + suffix;
    };
    const animate = (now: number) => {
      start ??= now;
      const progress = Math.min((now - start) / 1250, 1);
      node.textContent =
        formatter.format(Math.round(value * (1 - (1 - progress) ** 4))) +
        suffix;
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    if (preference.matches) finish();
    else frame = requestAnimationFrame(animate);
    preference.addEventListener("change", finish);
    return () => {
      cancelAnimationFrame(frame);
      preference.removeEventListener("change", finish);
    };
  }, [value, suffix, language]);
  return (
    <>
      <span ref={ref} aria-hidden="true">
        {formatted}
      </span>
      <span className="sr-only">{formatted}</span>
    </>
  );
}

export function HomepageStats({ language }: { language: HomepageLanguage }) {
  const [active, setActive] = useState<CategoryId>("coaches");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const { user, loading } = useAuth();
  const vi = language === "vi";
  const memberPath =
    active === "facilities"
      ? "/member/services?section=courts&view=explore"
      : active === "coaches"
        ? "/member/training?tab=book"
        : "/member";
  const href =
    user?.role === "Member"
      ? memberPath
      : `/login?next=${encodeURIComponent(memberPath)}`;

  const select = (id: CategoryId) => {
    setActive(id);
    window.dispatchEvent(new CustomEvent("sporthub:showcase", { detail: id }));
  };

  useEffect(() => {
    const selectHash = () => {
      const id = window.location.hash.slice(1);
      if (homepageCategories.some((item) => item.id === id))
        setActive(id as CategoryId);
    };
    const selectNavigation = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (homepageCategories.some((item) => item.id === id))
        setActive(id as CategoryId);
    };
    const frame = requestAnimationFrame(selectHash);
    window.addEventListener("hashchange", selectHash);
    window.addEventListener("sporthub:section", selectNavigation);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", selectHash);
      window.removeEventListener("sporthub:section", selectNavigation);
    };
  }, []);

  const handleKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % 3
        : event.key === "ArrowLeft"
          ? (index + 2) % 3
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? 2
              : -1;
    if (next < 0) return;
    event.preventDefault();
    select(homepageCategories[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <section
      className={styles.section}
      aria-labelledby="homepage-stats-title"
      id="sporthub"
      data-home-section="sporthub"
    >
      <header className={styles.heading}>
        <h2 id="homepage-stats-title">
          {vi ? "Cùng nhau tiến bộ" : "A stronger community"}
        </h2>
        <p>
          {vi
            ? "Con người, không gian và cộng đồng cho mỗi buổi tập của bạn."
            : "The people, places and community behind every session."}
        </p>
      </header>
      <ScrollReveal>
        <div
          className={styles.bookmarks}
          role="tablist"
          aria-label={vi ? "Khám phá SportHub" : "Explore SportHub"}
        >
          {homepageCategories.map((item, index) => {
            const Icon =
              item.id === "coaches"
                ? Dumbbell
                : item.id === "facilities"
                  ? Grid2X2
                  : UsersRound;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                id={item.id}
                type="button"
                role="tab"
                aria-selected={active === item.id}
                aria-controls={`${item.id}-details`}
                tabIndex={active === item.id ? 0 : -1}
                className={styles.bookmark}
                onPointerEnter={(event) => {
                  if (
                    event.pointerType === "mouse" &&
                    window.matchMedia("(hover: hover)").matches
                  )
                    select(item.id);
                }}
                onClick={() => select(item.id)}
                onKeyDown={(event) => handleKey(event, index)}
              >
                <span className={styles.bookmarkTop}>
                  <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                  <span className={styles.value}>
                    <CountUp
                      value={item.value}
                      suffix={item.suffix}
                      language={language}
                    />
                  </span>
                  <ArrowRight
                    className={styles.tabArrow}
                    size={20}
                    aria-hidden="true"
                  />
                </span>
                <span className={styles.bookmarkLabel}>
                  {item.title[language]}
                </span>
              </button>
            );
          })}
        </div>
        <div className={styles.frame}>
          <div className={styles.panels}>
            {homepageCategories.map((item) => (
              <div
                key={item.id}
                className={styles.panel}
                data-active={active === item.id}
                role="tabpanel"
                id={`${item.id}-details`}
                aria-labelledby={item.id}
                aria-hidden={active !== item.id}
                inert={active !== item.id}
                tabIndex={active === item.id ? 0 : -1}
              >
                <p className={styles.panelLead}>{item.lead[language]}</p>
                <div className={styles.detailGrid}>
                  {item.items.map((detail, index) => (
                    <article
                      key={detail.name.en}
                      className={styles.detailCard}
                      style={
                        { "--reveal-delay": `${index * 70}ms` } as CSSProperties
                      }
                    >
                      <div className={styles.photo}>
                        <Image
                          src={detail.image}
                          alt={detail.alt[language]}
                          fill
                          sizes="(max-width: 767px) 90vw, (max-width: 1199px) 30vw, 400px"
                        />
                      </div>
                      <div className={styles.itemCopy}>
                        <h3>{detail.name[language]}</h3>
                        <p>{detail.detail[language]}</p>
                        <span className={styles.highlight}>
                          {detail.highlight[language]}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.panelFoot}>
            <p>
              {vi
                ? "Khám phá nhịp sống tại SportHub."
                : "Find your rhythm at SportHub."}
            </p>
            <Link
              href={href}
              className={styles.explore}
              aria-disabled={loading}
              tabIndex={loading ? -1 : undefined}
              onClick={(event) => {
                if (loading) event.preventDefault();
              }}
            >
              {active === "membership"
                ? vi
                  ? "Vào không gian hội viên"
                  : "Enter the member space"
                : vi
                  ? "Khám phá trong Member"
                  : "Explore in Member"}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
