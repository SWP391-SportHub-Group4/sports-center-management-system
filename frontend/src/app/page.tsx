"use client";
import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "./public-header";
import { MembershipPricing } from "./membership-pricing";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import type { SportDto } from "@/lib/types";
import { Card } from "@/components/ui";
import styles from "./home.module.css";
export default function Page() {
  const { t } = useLanguage();
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { anonymous: true, signal }),
    [],
  );
  return (
    <>
      <PublicHeader />
      <main>
        <section className={styles.catalogHero}>
          <Image
            src="/sporthub/activity-fitness.jpg"
            alt="SportHub"
            width={1200}
            height={500}
            style={{
              width: "100%",
              height: "auto",
              maxHeight: 500,
              objectFit: "cover",
            }}
          />
          <div className="refactor-public">
            <h1>{t.refactor.sports}</h1>
            <Link className="btn" href="/courses">
              {t.refactor.courses}
            </Link>
          </div>
        </section>
        <div className="refactor-public">
          <section id="activities">
            <h2>{t.refactor.sports}</h2>
            {sports.loading ? (
              <p>{t.refactor.loading}</p>
            ) : sports.error ? (
              <p role="alert">{sports.error.message}</p>
            ) : !sports.data?.length ? (
              <p>{t.refactor.empty}</p>
            ) : (
              <div className="refactor-grid">
                {sports.data.map((s) => (
                  <Card key={s.sportId} title={s.name}>
                    <p>{s.description}</p>
                    <Link
                      href={
                        s.operationType === "GROUP_COURSE"
                          ? "/courses"
                          : s.operationType === "WALK_IN"
                            ? "/#pricing"
                            : "/member/my-plans"
                      }
                    >
                      {s.operationType === "GROUP_COURSE"
                        ? t.refactor.courses
                        : s.operationType === "WALK_IN"
                          ? t.refactor.gym
                          : t.refactor.pt}
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </section>
          <MembershipPricing />
        </div>
      </main>
    </>
  );
}
