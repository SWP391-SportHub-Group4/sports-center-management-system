import { Card, EmptyState } from "@/shared/ui";
import { dateLabel } from "@/shared/lib/date";
import type { TrainingPlan, TrainingRecord } from "./model";
export function TrainingView({
  plan,
  records,
  historyOnly = false,
}: {
  plan: TrainingPlan;
  records: TrainingRecord[];
  historyOnly?: boolean;
}) {
  return (
    <div className="stack">
      <h1>{historyOnly ? "Results & roll check" : "& Coach review"}</h1>
      {!historyOnly && (
        <Card>
          <h2>Practice Plans</h2>
          <p className="muted">
            {plan.goal} · HLV {plan.coach}
          </p>
          <ul className="exercise-list">
            {plan.exercises.map((e) => (
              <li key={e.name}>
                <strong>{e.name}</strong>
                <span>
                  {e.sets} Octopus {e.reps}
                </span>
              </li>
            ))}
          </ul>
          <div className="subtle inset">
            <h3>Comments From Coach</h3>
            <p>{plan.comment}</p>
          </div>
        </Card>
      )}
      <h2>Practice History</h2>
      {records.map((r) => (
        <Card key={r.id}>
          <div className="row between wrap">
            <h3>{r.className}</h3>
            <span className="badge">
              {r.attendance === "Present"
                ? "INTERNATIONAL INCREASE"
                : "Face-to-face"}
            </span>
          </div>
          <p className="muted">{dateLabel(r.date)}</p>
          {r.result && (
            <p>
              <strong>Results:</strong> {r.result}
            </p>
          )}
          {r.coachComment && (
            <p>
              <strong>Commenting:</strong> {r.coachComment}
            </p>
          )}
        </Card>
      ))}
      {!records.length && (
        <EmptyState title="No Practice History">
          The results will appear after the recorded practice.
        </EmptyState>
      )}
    </div>
  );
}
