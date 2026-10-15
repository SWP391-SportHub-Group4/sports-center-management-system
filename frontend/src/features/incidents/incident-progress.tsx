import { useLanguage } from "@/lib/language";
import { Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useOperationsCopy } from "@/features/manager";

export type StepStatus = "pending" | "succeeded" | "failed" | "unknown";
export interface IncidentStep {
  type: string;
  id: string;
  status: StepStatus;
  at: string;
  message?: string;
}
export function IncidentProgress({ steps }: { steps: IncidentStep[] }) {
  const { t } = useLanguage();
  const c = useOperationsCopy();
  return (
    <section className="stack" aria-live="polite">
      <h2>{c.results}</h2>
      <p>{c.resultsHint}</p>
      {!steps.some((s) => s.status === "succeeded") && (
        <p>{t.managerOperations.noSteps}</p>
      )}
      {!!steps.length && (
        <Table
          headers={[
            t.operations.impact,
            t.operations.status,
            c.recorded,
            t.operations.reason,
          ]}
        >
          {steps.map((step, index) => (
            <tr key={`${step.type}-${step.id}-${index}`}>
              <td>
                {step.type === "FINAL"
                  ? c.finalStep
                  : t.calendar.types[
                      step.type as keyof typeof t.calendar.types
                    ] || step.type}
              </td>
              <td>{c[step.status]}</td>
              <td>{formatDateTime(step.at)}</td>
              <td>
                {step.type === "FINAL" && step.status === "succeeded"
                  ? c.finalHint
                  : step.message || "—"}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
