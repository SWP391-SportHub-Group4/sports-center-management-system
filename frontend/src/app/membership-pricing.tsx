"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import styles from "./membership-pricing.module.css";

function CheckIcon() {
  return (
    <svg
      className={styles.checkIcon}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10l4 4L16 6" />
    </svg>
  );
}

export function MembershipPricing() {
  const { t } = useLanguage();
  const p = t.pricingSection;

  const tiers = [
    {
      id: "day-pass",
      badge: p.dayPassBadge,
      name: p.dayPassName,
      price: p.dayPassPrice,
      period: p.dayPassPeriod,
      desc: p.dayPassDesc,
      features: p.dayPassFeatures,
      actionLabel: p.dayPassAction,
      actionHref: "/register?plan=day-pass",
      popular: false,
    },
    {
      id: "standard",
      badge: p.standardBadge,
      name: p.standardName,
      price: p.standardPrice,
      period: p.standardPeriod,
      desc: p.standardDesc,
      features: p.standardFeatures,
      actionLabel: p.standardAction,
      actionHref: "/register?plan=standard",
      popular: true,
    },
    {
      id: "vip",
      badge: p.vipBadge,
      name: p.vipName,
      price: p.vipPrice,
      period: p.vipPeriod,
      desc: p.vipDesc,
      features: p.vipFeatures,
      actionLabel: p.vipAction,
      actionHref: "/register?plan=vip",
      popular: false,
    },
  ];

  return (
    <section className={styles.section} id="pricing" aria-labelledby="pricing-heading">
      <div className={styles.headingWrap}>
        <h2 className={styles.heading} id="pricing-heading">
          {p.heading}
        </h2>
        <p className={styles.intro}>{p.intro}</p>
      </div>

      <div className={styles.pricingGrid}>
        {tiers.map((tier) => (
          <article
            key={tier.id}
            className={`${styles.card} ${tier.popular ? styles.cardPopular : ""}`}
          >
            {tier.popular && (
              <span className={styles.popularBadge}>{tier.badge}</span>
            )}
            <div>
              {!tier.popular && (
                <span className={styles.badgePill}>{tier.badge}</span>
              )}
              <h3 className={styles.planName}>{tier.name}</h3>
              <div className={styles.planPriceWrap}>
                <span className={styles.planPrice}>{tier.price}</span>
                <span className={styles.planCurrency}>₫</span>
                <span className={styles.planPeriod}>/ {tier.period}</span>
              </div>
              <p className={styles.planDesc}>{tier.desc}</p>

              <ul className={styles.featureList} aria-label={`${tier.name} features`}>
                {tier.features.map((feat, idx) => (
                  <li key={idx} className={styles.featureItem}>
                    <CheckIcon />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Link
              href={tier.actionHref}
              className={`${styles.planAction} ${tier.popular ? styles.planActionPopular : ""}`}
            >
              {tier.actionLabel} <span aria-hidden="true">↗</span>
            </Link>
          </article>
        ))}
      </div>

      <p className={styles.guarantee}>{p.guaranteeNote}</p>
    </section>
  );
}
