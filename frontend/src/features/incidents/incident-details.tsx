"use client";
import { AsyncSection, Card } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { incidentApi } from "./incident-api";
import { DeliveryStatus } from "./delivery-status";
import styles from "./incident-history.module.css";

export function IncidentDetailsView({ id }: { id: string }) {
  const { t } = useLanguage();
  const l = t.managerOperations;
  const state = useApi((signal) => incidentApi.get(id, signal), [id]);
  return (
    <AsyncSection state={state}>
      {(incident) => (
        <>
          <Card title={incident.reason}>
            <dl className={styles.details}>
              <div>
                <dt>{l.incidentScope}</dt>
                <dd>
                  {incident.scope === "CENTER"
                    ? t.operations.center
                    : (incident.roomName ?? t.operations.room)}
                </dd>
              </div>
              <div>
                <dt>{t.operations.start}</dt>
                <dd>{formatDateTime(incident.startAtUtc)}</dd>
              </div>
              <div>
                <dt>{t.operations.end}</dt>
                <dd>{formatDateTime(incident.endAtUtc)}</dd>
              </div>
              <div>
                <dt>{l.incidentRecordedAt}</dt>
                <dd>{formatDateTime(incident.createdAtUtc)}</dd>
              </div>
            </dl>
            <p>{incident.resolutionSummary}</p>
          </Card>
          <DeliveryStatus path={`/api/manager/incidents/${id}/notifications`} />
        </>
      )}
    </AsyncSection>
  );
}
