"use client";

import { use } from "react";
import { CoachProfile } from "@/features/training/coach-profile";
import styles from "./profile-page.module.css";

export default function Page({
  params,
}: {
  params: Promise<{ coachId: string }>;
}) {
  const { coachId } = use(params);
  return (
    <div className={styles.page}>
      <main className={styles.profileMain}>
        <CoachProfile coachId={coachId} publicView />
      </main>
    </div>
  );
}
