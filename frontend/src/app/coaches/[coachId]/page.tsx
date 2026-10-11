"use client";

import { use } from "react";
import { PublicHeader } from "@/app/public-header";
import { CoachProfile } from "@/features/training/coach-profile";
import styles from "../coaches.module.css";

export default function Page({ params }: { params: Promise<{ coachId: string }> }) {
  const { coachId } = use(params);
  return (
    <div className={styles.page}>
      <PublicHeader />
      <main className={styles.main}>
        <CoachProfile coachId={coachId} publicView />
      </main>
    </div>
  );
}
