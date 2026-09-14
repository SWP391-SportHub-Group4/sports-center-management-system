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
      <h1>{historyOnly ? "Điểm danh & kết quả" : "Kế hoạch & nhận xét HLV"}</h1>
      {!historyOnly && (
        <Card>
          <h2>Kế hoạch tập luyện</h2>
          <p className="muted">
            {plan.goal} · HLV {plan.coach}
          </p>
          <ul className="exercise-list">
            {plan.exercises.map((e) => (
              <li key={e.name}>
                <strong>{e.name}</strong>
                <span>
                  {e.sets} hiệp × {e.reps}
                </span>
              </li>
            ))}
          </ul>
          <div className="subtle inset">
            <h3>Nhận xét từ huấn luyện viên</h3>
            <p>{plan.comment}</p>
          </div>
        </Card>
      )}
      <h2>Lịch sử tập luyện</h2>
      {records.map((r) => (
        <Card key={r.id}>
          <div className="row between wrap">
            <h3>{r.className}</h3>
            <span className="badge">
              {r.attendance === "Present" ? "✓ Đã tham gia" : "Vắng mặt"}
            </span>
          </div>
          <p className="muted">{dateLabel(r.date)}</p>
          {r.result && (
            <p>
              <strong>Kết quả:</strong> {r.result}
            </p>
          )}
          {r.coachComment && (
            <p>
              <strong>Nhận xét:</strong> {r.coachComment}
            </p>
          )}
        </Card>
      ))}
      {!records.length && (
        <EmptyState title="Chưa có lịch sử tập luyện">
          Kết quả sẽ xuất hiện sau buổi tập được ghi nhận.
        </EmptyState>
      )}
    </div>
  );
}
