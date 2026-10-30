"use client";

import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { IncidentResolutionSelection } from "./incident-api";

export function IncidentPlanSummary({
  plans,
  onRemove,
}: {
  plans: IncidentResolutionSelection[];
  onRemove?: (id: string) => void;
}) {
  const { t } = useLanguage();
  const c = t.incidentPlans;
  if (!plans.length) return null;
  return (
    <section className="stack" aria-label={c.title}>
      <h3>{c.title}</h3>
      <p>{c.hint}</p>
      <ul className="stack">
        {plans.map((plan) => (
          <li key={plan.sourceId}>
            <strong>{plan.label ?? c.actions[plan.action]}</strong>
            <p>
              {c.actions[plan.action]}
              {plan.startAtUtc ? ` · ${formatDateTime(plan.startAtUtc)}` : ""}
            </p>
            {plan.reason && <p>{plan.reason}</p>}
            {onRemove && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => onRemove(plan.sourceId)}
              >
                {c.remove}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
