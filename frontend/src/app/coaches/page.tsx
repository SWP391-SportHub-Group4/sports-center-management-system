"use client";

import { PublicHeader } from "@/app/public-header";
import { AvatarImage } from "@/components/AvatarImage";
import { ReportAvatarButton } from "@/components/ReportAvatarButton";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import styles from "./coaches.module.css";

type Coach = {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  bio?: string | null;
};

export default function PublicCoachesPage() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const coaches = useApi(
    (signal) => api.get<Coach[]>("/api/coaches", { signal, anonymous: true }),
    [],
  );
  return (
    <div className={styles.page}>
      <PublicHeader />
      <main className={styles.main}>
        <h1>{vi ? "Huấn luyện viên" : "Our coaches"}</h1>
        <p>
          {vi
            ? "Gặp gỡ đội ngũ huấn luyện viên tại SportHub."
            : "Meet the SportHub coaching team."}
        </p>
        {coaches.error && <p role="alert">{coaches.error.message}</p>}
        {!coaches.data && !coaches.error && (
          <p>{vi ? "Đang tải…" : "Loading…"}</p>
        )}
        {coaches.data?.length === 0 && (
          <p>{vi ? "Chưa có huấn luyện viên." : "No coaches are available."}</p>
        )}
        <div className={styles.grid}>
          {coaches.data?.map((coach) => (
            <article key={coach.userId} className={styles.coach}>
              <AvatarImage
                name={coach.fullName}
                avatarUrl={coach.avatarUrl}
                size={112}
              />
              <h2>{coach.fullName}</h2>
              {coach.bio && <p>{coach.bio}</p>}
              <ReportAvatarButton
                targetUserId={coach.userId}
                avatarUrl={coach.avatarUrl}
              />
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
