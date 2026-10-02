"use client";
import { useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { Feedback } from "@/components/ui";
import { ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { Role } from "@/lib/auth";
import type { Translations } from "@/locales/en";
import styles from "./operations.module.css";

export function OperationsPage({
  title,
  roles = ["CenterManager"],
  children,
}: {
  title: keyof Omit<Translations["operations"], "weekdays">;
  roles?: Role[];
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <AppShell title={t.operations[title]} allow={roles} operationalLayout>
      <div className={styles.workspace}>{children}</div>
    </AppShell>
  );
}

// useAction cannot distinguish a successful 204 from a failed request. Mutations here return
// a boolean and retain structured conflicts for a useful, reviewable error state.
export function useMutation() {
  const { t } = useLanguage();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<{
    message: string;
    key?: keyof Omit<Translations["operations"], "weekdays">;
  } | null>(null);
  async function run(
    operation: () => Promise<unknown>,
    message = t.operations.saved,
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await operation();
      const key = Object.keys(t.operations).find(
        (key) => t.operations[key as keyof typeof t.operations] === message,
      ) as keyof Omit<Translations["operations"], "weekdays"> | undefined;
      setSuccess({ message, key });
      return true;
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError(0, "unknown_error", t.operations.unknownOutcome),
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    success: success?.key
      ? t.operations[success.key]
      : (success?.message ?? ""),
    run,
    reset: () => {
      setError(null);
      setSuccess(null);
    },
  };
}
export function MutationFeedback({
  mutation,
}: {
  mutation: ReturnType<typeof useMutation>;
}) {
  const { t } = useLanguage();
  const conflicts = mutation.error?.details.conflicts;
  const message =
    mutation.error?.code === "gym_already_checked_in"
      ? t.operations.gymAlreadyInside
      : mutation.error?.code === "member_schedule_conflict"
        ? t.operations.memberScheduleConflict
        : mutation.error?.code === "unknown_error"
          ? t.operations.unknownOutcome
          : mutation.error?.message;
  return (
    <>
      <Feedback error={message} success={mutation.success} />
      {Array.isArray(conflicts) && conflicts.length > 0 && (
        <div className={styles.conflicts}>
          <p>{t.operations.conflict}</p>
          <ul>
            {conflicts.map((conflict, index) => (
              <li key={index}>
                {t.operations[conflict.resource === "ROOM" ? "room" : "coach"]}
                {" · "}
                {
                  t.operations[
                    conflict.conflictSourceType === "CLASS_SESSION"
                      ? "classSession"
                      : conflict.conflictSourceType === "PT_SESSION"
                        ? "ptSession"
                        : conflict.conflictSourceType === "COURT_RENTAL"
                          ? "rental"
                          : "roomBlock"
                  ]
                }
                {" · "}
                {formatDateTime(conflict.startUtc)} –{" "}
                {formatDateTime(conflict.endUtc)}
                {" · "}
                {conflict.conflictSourceId}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
export function Pagination({
  page,
  count,
  size = 20,
  loading,
  onChange,
}: {
  page: number;
  count: number;
  size?: number;
  loading?: boolean;
  onChange: (page: number) => void;
}) {
  const { t } = useLanguage();
  if (count === 0) return null;
  return (
    <div className="btn-row">
      <button
        className="btn btn--secondary"
        disabled={loading || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {t.operations.previous}
      </button>
      <span>{page}</span>
      <button
        className="btn btn--secondary"
        disabled={loading || page * size >= count}
        onClick={() => onChange(page + 1)}
      >
        {t.operations.next}
      </button>
    </div>
  );
}
