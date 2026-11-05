"use client";

import { useSyncExternalStore } from "react";
import {
  requestActivitySnapshot,
  serverActivitySnapshot,
  subscribeToRequests,
} from "@/lib/request-activity";
import { SportLoader } from "./SportLoader";
import styles from "./startup-experience.module.css";

export function RequestActivity() {
  const pending = useSyncExternalStore(
    subscribeToRequests,
    requestActivitySnapshot,
    serverActivitySnapshot,
  );
  return pending ? (
    <div className={styles.activity} role="status" data-request-activity>
      <SportLoader size="inline" decorative />
      <span>Loading…</span>
    </div>
  ) : null;
}
