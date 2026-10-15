"use client";

import Link from "next/link";
import { AvatarImage } from "@/components/AvatarImage";
import { AsyncSection } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { SportDto } from "@/lib/types";
import styles from "./coach-profile.module.css";

type CoachDto = {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  bio?: string | null;
  sportIds?: number[];
  title?: string | null;
  yearsExperience?: number | null;
  philosophy?: string | null;
};

export function CoachProfile({
  coachId,
  publicView = false,
}: {
  coachId: string;
  publicView?: boolean;
  onSelectCoach?: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const coaches = useApi(
    (signal) =>
      api.get<CoachDto[]>("/api/coaches", { signal, anonymous: true }),
    [],
  );
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { signal, anonymous: true }),
    [],
  );

  return (
    <div className={styles.page}>
      <Link
        className={styles.back}
        href={publicView ? "/coaches" : "/member/schedule"}
      >
        {publicView
          ? vi
            ? "← Quay lại danh sách huấn luyện viên"
            : "← Back to coaches"
          : vi
            ? "← Trở về lịch của tôi"
            : "← Back to my schedule"}
      </Link>
      <AsyncSection state={coaches}>
        {(list) => {
          const coach = list?.find((item) => item.userId === coachId);
          if (!coach)
            return (
              <p role="status">
                {vi ? "Không tìm thấy huấn luyện viên." : "Coach not found."}
              </p>
            );
          const specialties = (sports.data ?? []).filter((sport) =>
            coach.sportIds?.includes(sport.sportId),
          );
          return (
            <div className={styles.layoutSingle}>
              <div className={styles.main}>
                <header className={styles.hero}>
                  <AvatarImage
                    name={coach.fullName}
                    avatarUrl={coach.avatarUrl}
                    size={144}
                    className={styles.avatar}
                  />
                  <div className={styles.heroText}>
                    <p className={styles.eyebrow}>
                      {coach.title ?? (vi ? "Huấn luyện viên" : "Coach")}
                    </p>
                    <h1>{coach.fullName}</h1>
                    {specialties.length > 0 && (
                      <ul
                        className={styles.badges}
                        aria-label={vi ? "Bộ môn" : "Sports"}
                      >
                        {specialties.map((sport) => (
                          <li key={sport.sportId}>{sport.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </header>
                <section className={styles.card}>
                  <h2>{vi ? "Giới thiệu" : "About"}</h2>
                  <p>
                    {coach.bio ||
                      (vi ? "Chưa có giới thiệu." : "No biography yet.")}
                  </p>
                  {coach.philosophy && <p>{coach.philosophy}</p>}
                  {coach.yearsExperience != null && (
                    <p>
                      {coach.yearsExperience}{" "}
                      {vi ? "năm kinh nghiệm" : "years of experience"}
                    </p>
                  )}
                </section>
              </div>
            </div>
          );
        }}
      </AsyncSection>
    </div>
  );
}
