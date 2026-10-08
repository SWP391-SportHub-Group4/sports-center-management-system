"use client";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Card, Table } from "@/components/ui";
import { useOperationsCopy } from "@/features/manager";
export interface DeliveryCounts {
  total: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  read: number;
}
export function DeliveryStatus({
  path,
  receipt = false,
}: {
  path: string;
  receipt?: boolean;
}) {
  const { t } = useLanguage();
  const c = useOperationsCopy();
  const state = useApi(
    async (signal) => {
      const result = await api.get<
        DeliveryCounts | { delivery: DeliveryCounts }
      >(path, { signal });
      return receipt
        ? (result as { delivery: DeliveryCounts }).delivery
        : (result as DeliveryCounts);
    },
    [path, receipt],
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
      <button
        className="btn btn--ghost"
        disabled={state.loading}
        onClick={state.reload}
      >
        {t.operations.refresh}
      </button>
    </Card>
  );
}
