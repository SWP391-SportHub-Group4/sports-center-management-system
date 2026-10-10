"use client";
import { AsyncSection } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import type { DeliveryCounts } from "./delivery-status";
import styles from "./incident-history.module.css";

export interface IncidentRecord {
  incidentId: string;
  scope: string;
  roomName: string | null;
  startAtUtc: string;
  endAtUtc: string;
  reason: string;
  createdAtUtc: string;
}
export interface IncidentDetail {
  incident: IncidentRecord;
  blockedRooms: string[];
  cancelledRentals: number;
  delivery: DeliveryCounts;
}
export function IncidentDeliverySummary({
  delivery,
}: {
  delivery: DeliveryCounts;
}) {
  const { t } = useLanguage();
  const l = t.incidentHistory;
  const waiting = delivery.pending + delivery.sending > 0;
  const text =
    delivery.total === 0
      ? l.noNotifications
      : delivery.failed > 0
        ? l.deliveryFailed.replace("{count}", String(delivery.failed))
        : waiting
          ? l.deliverySending
          : l.deliverySent;
  return (
    <p role="status" className={styles.delivery}>
      {text}
      {delivery.failed > 0 && waiting && <> {l.deliverySending}</>}
    </p>
  );
}
export function IncidentDeliveryReceipt({ id }: { id: string }) {
  const { t } = useLanguage();
  const state = useApi(
    (signal) =>
      api.get<IncidentDetail>(`/api/manager/incidents/${id}`, { signal }),
    [id],
  );
  return (
    <div className={styles.receipt}>
      <AsyncSection state={state}>
        {(data) => <IncidentDeliverySummary delivery={data.delivery} />}
      </AsyncSection>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={state.loading}
        onClick={state.reload}
      >
        {t.operations.refresh}
      </button>
    </div>
  );
}
