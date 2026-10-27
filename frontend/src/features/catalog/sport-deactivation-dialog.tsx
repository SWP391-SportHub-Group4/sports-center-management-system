"use client";

import { createPortal } from "react-dom";
import { Dialog } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useMutation } from "@/features/operations";
import type { SportDto } from "@/lib/types";
import { catalogApi } from "./api";
import { CatalogFeedback } from "./manager-shared";
import styles from "./manager-catalog.module.css";

export function SportDeactivationDialog({
  sport,
  onClose,
  onConfirmed,
}: {
  sport: SportDto;
  onClose: () => void;
  onConfirmed: (sport: SportDto) => void;
}) {
  const impact = useApi(
    (signal) => catalogApi.sportDeactivationImpact(sport.sportId, signal),
    [sport.sportId],
  );
  const mutation = useMutation();
  const close = () => {
    if (!mutation.busy) onClose();
  };

  return createPortal(
    <Dialog
      title={`Are you sure you want to deactivate ${sport.name}?`}
      description="All related classes listed below will be cancelled, including classes with enrolled students. Completed and already cancelled classes will remain unchanged."
      showCloseButton={false}
      onClose={close}
      footer={
        <>
          <button
            type="button"
            className={`btn ${styles.deactivationConfirm}`}
            disabled={mutation.busy || impact.loading || !!impact.error}
            onClick={async () => {
              let saved: SportDto | undefined;
              if (
                await mutation.run(async () => {
                  saved = await catalogApi.setSportActive({
                    ...sport,
                    isActive: true,
                  });
                })
              ) {
                if (saved) onConfirmed(saved);
              }
            }}
          >
            {mutation.busy ? "Deactivating…" : "Yes"}
          </button>
          <button
            type="button"
            className={`btn ${styles.deactivationCancel}`}
            disabled={mutation.busy}
            onClick={close}
          >
            No
          </button>
        </>
      }
    >
      {impact.loading && <p role="status">Loading affected classes…</p>}
      {impact.error && (
        <div role="alert">
          <p>Could not load affected classes.</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={impact.reload}
          >
            Try again
          </button>
        </div>
      )}
      {impact.data && (
        <>
          <p>Affected classes ({impact.data.length})</p>
          {impact.data.length ? (
            <div
              className={styles.affectedClasses}
              tabIndex={0}
              role="region"
              aria-label="Affected classes"
            >
              <ul>
                {impact.data.map((course) => (
                  <li key={course.classId}>
                    <strong>{course.name}</strong>
                    <span>
                      {course.code} · Enrolled students: {course.confirmedCount}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>No classes will be affected.</p>
          )}
        </>
      )}
      {mutation.error && <CatalogFeedback mutation={mutation} />}
    </Dialog>,
    document.body,
  );
}
