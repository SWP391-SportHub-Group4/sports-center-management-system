"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import styles from "./home.module.css";
import { PublicHeader } from "./public-header";
import { MembershipPricing } from "./membership-pricing";
import { CommunityEvents } from "./community-events";

export default function HomePage() {
  const { t } = useLanguage();

  const activities = [
    {
      name: t.homepage.actYogaName,
      short: t.homepage.actYogaShort,
      detail: t.homepage.actYogaDesc,
      focus: t.homepage.actYogaFocus,
      intensity: t.homepage.actYogaIntensity,
      action: t.homepage.actYogaAction,
      href: "/member-dashboard/class-schedule",
      image: "/sporthub/activity-yoga.jpg",
      imageAlt: "Group practicing mindful yoga flows in sunlit minimalist studio",
    },
    {
      name: t.homepage.actFitnessName,
      short: t.homepage.actFitnessShort,
      detail: t.homepage.actFitnessDesc,
      focus: t.homepage.actFitnessFocus,
      intensity: t.homepage.actFitnessIntensity,
      action: t.homepage.actFitnessAction,
      href: "/member-dashboard/my-plans",
      image: "/sporthub/activity-fitness.jpg",
      imageAlt: "Athlete performing coach-guided barbell strength lift in modern gym",
    },
    {
      name: t.homepage.actGroupXName,
      short: t.homepage.actGroupXShort,
      detail: t.homepage.actGroupXDesc,
      focus: t.homepage.actGroupXFocus,
      intensity: t.homepage.actGroupXIntensity,
      action: t.homepage.actGroupXAction,
      href: "/member-dashboard/class-schedule",
      image: "/sporthub/activity-groupx.jpg",
      imageAlt: "Coach leading high-energy GroupX conditioning class in vibrant studio",
    },
    {
      name: t.homepage.actRecoveryName,
      short: t.homepage.actRecoveryShort,
      detail: t.homepage.actRecoveryDesc,
      focus: t.homepage.actRecoveryFocus,
      intensity: t.homepage.actRecoveryIntensity,
      action: t.homepage.actRecoveryAction,
      href: "/member-dashboard/training",
      image: "/sporthub/activity-recovery.jpg",
      imageAlt: "Guided active recovery, foam rolling, and mobility session with coach",
    },
  ];

  const facilities = [
    {
      tag: t.homepage.facilitiesGymTag,
      name: t.homepage.facilitiesGymName,
      specs: t.homepage.facilitiesGymSpecs,
      description: t.homepage.facilitiesGymDesc,
      image: "/sporthub/facility-gym.jpg",
      imageAlt: "Spacious modern luxury athletic gym floor with Olympic power racks and turf track",
      actionLabel: t.homepage.facilitiesGymAction,
      actionHref: "/member-dashboard/my-plans",
    },
    {
      tag: t.homepage.facilitiesStudioTag,
      name: t.homepage.facilitiesStudioName,
      specs: t.homepage.facilitiesStudioSpecs,
      description: t.homepage.facilitiesStudioDesc,
      image: "/sporthub/facility-studio.jpg",
      imageAlt: "Boutique group fitness and yoga studio with natural wood sprung floors and mirrors",
      actionLabel: t.homepage.facilitiesStudioAction,
      actionHref: "/member-dashboard/class-schedule",
    },
    {
      tag: t.homepage.facilitiesSaunaTag,
      name: t.homepage.facilitiesSaunaName,
      specs: t.homepage.facilitiesSaunaSpecs,
      description: t.homepage.facilitiesSaunaDesc,
      image: "/sporthub/facility-sauna.jpg",
      imageAlt: "Luxury cedar wood sauna and post-workout recovery lounge",
      actionLabel: t.homepage.facilitiesSaunaAction,
      actionHref: "/member-dashboard/training",
    },
  ];

  return (
    <div className={styles.site}>
      <a className="skip-link" href="#main">
        {t.homepage.skipLink}
      </a>
      <PublicHeader />

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.heroLabel}>{t.homepage.heroTag}</p>
            <h1 id="hero-title">
              {t.homepage.heroTitle}<span>{t.homepage.heroTitleSpan}</span>
            </h1>
            <p className={styles.heroIntro}>
              {t.homepage.heroIntro}
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryAction} href="/register">
                {t.homepage.heroJoinBtn} <span aria-hidden="true">↗</span>
              </Link>
              <a className={styles.outlineAction} href="#facilities">
                {t.homepage.heroExploreBtn} <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className={styles.heroBadges} aria-label="Key highlights">
              <span className={styles.heroBadgeItem}>
                <svg className={styles.heroBadgeIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t.homepage.heroBadge1}
              </span>
              <span className={styles.heroBadgeItem}>
                <svg className={styles.heroBadgeIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t.homepage.heroBadge2}
              </span>
              <span className={styles.heroBadgeItem}>
                <svg className={styles.heroBadgeIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t.homepage.heroBadge3}
              </span>
            </div>
          </div>
          <div
            className={styles.heroMosaic}
            aria-label="Illustrated activities"
          >
            <div className={styles.heroFrame}>
              <Image
                src="/sporthub/hero-left.jpg"
                alt="Athlete preparing on the indoor track in athletic training center"
                fill
                sizes="(max-width: 760px) 33vw, 38vw"
                quality={90}
                priority
              />
            </div>
            <div className={`${styles.heroFrame} ${styles.heroFrameMain}`}>
              <Image
                src="/sporthub/hero-main.jpg"
                alt="Determined athlete in modern athletic facility with volumetric lighting"
                fill
                sizes="(max-width: 760px) 42vw, 30vw"
                quality={90}
                priority
              />
            </div>
            <div className={styles.heroFrame}>
              <Image
                src="/sporthub/hero-right.jpg"
                alt="Athlete performing dynamic kettlebell training in modern gym"
                fill
                sizes="(max-width: 760px) 33vw, 38vw"
                quality={90}
                priority
              />
            </div>
          </div>
          <p className={styles.imageNote}>
            {t.homepage.heroImageNote}
          </p>
        </section>

        <section
          className={styles.facilities}
          id="facilities"
          aria-labelledby="facilities-title"
        >
          <div className={styles.facilitiesHeading}>
            <h2 id="facilities-title">{t.homepage.facilitiesTitle}</h2>
            <p>{t.homepage.facilitiesIntro}</p>
          </div>
          <div className={styles.facilityList}>
            {facilities.map((fac) => (
              <article className={styles.facilityItem} key={fac.name}>
                <div className={styles.facilityMedia}>
                  <Image
                    src={fac.image}
                    alt={fac.imageAlt}
                    fill
                    sizes="(max-width: 900px) 100vw, 55vw"
                    quality={90}
                  />
                  <span className={styles.facilityTag}>{fac.tag}</span>
                </div>
                <div className={styles.facilityContent}>
                  <h3>{fac.name}</h3>
                  <p className={styles.facilitySpecs}>{fac.specs}</p>
                  <p className={styles.facilityDesc}>{fac.description}</p>
                  <Link className={styles.facilityLink} href={fac.actionHref}>
                    {fac.actionLabel} <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <MembershipPricing />

        <section
          className={styles.activities}
          id="activities"
          aria-labelledby="activities-title"
        >
          <div className={styles.activitiesHeading}>
            <h2 id="activities-title">{t.homepage.activitiesTitle}</h2>
            <p>{t.homepage.activitiesIntro}</p>
          </div>
          <div className={styles.activityList}>
            {activities.map((item) => (
              <article className={styles.activity} key={item.name}>
                <div className={styles.activityHeading}>
                  <p>{item.short}</p>
                  <h3>{item.name}</h3>
                </div>
                <div className={styles.activityImageWrap}>
                  <Image
                    className={styles.activityImage}
                    src={item.image}
                    alt={item.imageAlt}
                    fill
                    sizes="(max-width: 760px) calc(100vw - 44px), 50vw"
                    quality={90}
                  />
                </div>
                <div className={styles.activityBody}>
                  <p className={styles.activityDetail}>{item.detail}</p>
                  <div className={styles.activityMeta}>
                    <div className={styles.activityPillRow}>
                      <span className={styles.activityIntensityTag}>
                        {item.intensity}
                      </span>
                      <span className={styles.activityFocusTag}>
                        {item.focus}
                      </span>
                    </div>
                    <Link className={styles.activityLink} href={item.href}>
                      {item.action} <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <p className={styles.demoNote}>
            {t.homepage.activitiesNote}
          </p>
        </section>

        <div className={styles.manifesto} aria-hidden="true">
          <span>MOVE · CONNECT · PROGRESS ·</span>
          <span>MOVE · CONNECT · PROGRESS ·</span>
        </div>

        <CommunityEvents />
      </main>

      <footer className={styles.footer}>
        <div>
          <strong>SportHub.</strong>
          <p>{t.homepage.footerTagline}</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#facilities">{t.publicNav.facilities}</a>
          <a href="#pricing">{t.publicNav.pricing}</a>
          <a href="#activities">{t.publicNav.activities}</a>
          <a href="#events">{t.publicNav.events}</a>
          <Link href="/member">{t.homepage.footerMemberArea}</Link>
        </nav>
        <small>© {new Date().getFullYear()} SportHub</small>
      </footer>
    </div>
  );
}
