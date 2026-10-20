"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDateTime } from "@/lib/format";
import type { Paged } from "@/lib/types";
import styles from "./ops.module.css";

type Visit = {
  checkInId: string;
  memberId: string;
  memberName: string;
  checkInTime: string;
};

export function ForgottenGymVisits() {
  const visits = useApi(
    (signal) =>
      api.get<Paged<Visit>>("/api/gym-checkins/inside", {
        signal,
        query: { staleOnly: true, page: 1, pageSize: 100 },
      }),
    [],
  );
  const [departure, setDeparture] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string) {
    setBusy(id);
    setError(null);
    try {
      const local = departure[id];
      const utc = new Date(`${local}+07:00`);
      if (!local || Number.isNaN(utc.getTime()))
        throw new Error("Enter the actual departure time in Vietnam time.");
      await api.post(`/api/gym-checkins/${id}/forgotten-checkout`, {
        departedAtUtc: utc.toISOString(),
        reason: reason[id]?.trim(),
      });
      setDeparture((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      setReason((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      visits.reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not correct this visit.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.stack}>
      <p className="small muted">
        Open visits from before today. Record the actual departure time; the
        correction is audited.
      </p>
      {visits.loading && <p>Loading…</p>}
      {visits.error && <p role="alert">{visits.error.message}</p>}
      {visits.data?.totalCount === 0 && <p>No forgotten check-outs.</p>}
      {visits.data?.items.map((v) => (
        <div key={v.checkInId} className={styles.divided}>
          <strong>{v.memberName}</strong>
          <span>Checked in {formatDateTime(v.checkInTime)}</span>
          <label className={styles.field}>
            Actual departure (Vietnam time)
            <input
              type="datetime-local"
              value={departure[v.checkInId] ?? ""}
              onChange={(e) =>
                setDeparture({ ...departure, [v.checkInId]: e.target.value })
              }
            />
          </label>
          <label className={styles.field}>
            Reason for correction
            <input
              maxLength={500}
              value={reason[v.checkInId] ?? ""}
              onChange={(e) =>
                setReason({ ...reason, [v.checkInId]: e.target.value })
              }
            />
          </label>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={
              busy !== null ||
              !departure[v.checkInId] ||
              (reason[v.checkInId]?.trim().length ?? 0) < 3
            }
            onClick={() => resolve(v.checkInId)}
          >
            Resolve forgotten check-out
          </button>
        </div>
      ))}
      {visits.data && visits.data.totalCount > 100 && (
        <p className="small muted">
          Showing the first 100 visits. Resolve these and refresh for more.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
