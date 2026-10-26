"use client";
import { OperationsPage } from "@/features/operations/ui";
import { ManualNoticeForm } from "@/features/incidents/manual-notice-form";
import { useLanguage } from "@/lib/language";
import { useState } from "react";
import { NoticeHistory } from "@/features/incidents/notice-history";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import styles from "@/features/incidents/notice-history.module.css";
export default function Page() {
  const { t } = useLanguage();
  const { values, setValues } = useUrlQuery(
    { view: "compose" },
    { view: choiceQuery(["compose", "history"], "compose") },
  );
  const view = values.view;
  const [revision, setRevision] = useState(0);
  return (
    <OperationsPage title="notices">
      <div
        className={styles.views}
        role="group"
        aria-label={t.manualNotices.views}
      >
        <button
          type="button"
          className={view === "compose" ? "btn" : "btn btn--secondary"}
          aria-pressed={view === "compose"}
          onClick={() => setValues({ view: "compose" })}
        >
          {t.manualNotices.compose}
        </button>
        <button
          type="button"
          className={view === "history" ? "btn" : "btn btn--secondary"}
          aria-pressed={view === "history"}
          onClick={() => setValues({ view: "history" })}
        >
          {t.manualNotices.history}
        </button>
      </div>
      {view === "compose" ? (
        <ManualNoticeForm onSent={() => setRevision((n) => n + 1)} />
      ) : (
        <NoticeHistory refreshKey={revision} />
      )}
    </OperationsPage>
  );
}
