"use client";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Card, Table } from "@/components/ui";
import { useOperationsCopy } from "@/features/manager";
import { incidentApi, type IncidentDelivery } from "./incident-api";
export type DeliveryCounts = IncidentDelivery;
export function DeliveryStatus({
  path,
  incidentId,
  receipt = false,
}: {
  path?: string;
  incidentId?: string;
  receipt?: boolean;
}) {
  const { t } = useLanguage();
  const c = useOperationsCopy();
  const state = useApi(
    async (signal) => {
      if (incidentId) return incidentApi.notifications(incidentId, signal);
      if (!path) throw new Error("A notification source is required.");
      const result = await api.get<
        DeliveryCounts | { delivery: DeliveryCounts }
      >(path, { signal });
      return receipt
        ? (result as { delivery: DeliveryCounts }).delivery
        : (result as DeliveryCounts);
    },
    [path, receipt, incidentId],
  );
  return (
    <Card title={t.operations.delivery}>
      <p>{c.deliveryHint}</p>
      <AsyncSection state={state}>
        {(d) => (
          <Table
            headers={[
              t.wireStatus.PENDING,
              t.wireStatus.SENDING,
              t.wireStatus.SENT,
              t.wireStatus.FAILED,
              t.wireStatus.READ,
            ]}
          >
            <tr>
              <td>{d.pending}</td>
              <td>{d.sending}</td>
              <td>{d.sent}</td>
              <td>{d.failed}</td>
              <td>{d.read}</td>
            </tr>
          </Table>
        )}
      </AsyncSection>
    </Card>
  );
}
