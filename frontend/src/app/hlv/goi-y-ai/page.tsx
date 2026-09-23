"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Feedback, Field, Stat, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime, label } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { CoachMemberRelationshipDto, WorkoutSuggestionDto } from "@/lib/types";

/**
 * Gợi ý tập luyện từ AI — BR-26 (bắt buộc đủ ba đầu vào: mục tiêu, trình độ, lịch sử tập 30
 * ngày gần nhất) và BR-27 (mọi lượt gọi đều được ghi vào AI_Logs kèm thời gian phản hồi).
 *
 * Nếu hội viên chưa khai hồ sơ tập luyện thì API từ chối với mã insufficient_ai_input —
 * hệ thống không đoán mục tiêu thay hội viên.
 */
export default function AiSuggestionPage() {
  const [memberId, setMemberId] = useState("");
  const [suggestion, setSuggestion] = useState<WorkoutSuggestionDto | null>(null);
  const action = useAction();

  const relationships = useApi(
    (signal) =>
      api.get<CoachMemberRelationshipDto[]>("/api/coach-member-relationships", {
        signal,
        query: { activeOnly: true },
      }),
    [],
  );

  const logs = useApi(
    (signal) =>
      api.get<
        {
          logId: string;
          queryType: string;
          responseTimeMs: number;
          createdAt: string;
        }[]
      >("/api/ai/logs", { signal, query: { limit: 10 } }),
    [suggestion?.generatedAt],
  );

  const request = async () => {
    const result = await action.run(
      () => api.post<WorkoutSuggestionDto>(`/api/ai/workout-suggestions/${memberId}`),
      "Đã tạo gợi ý.",
    );

    if (result) setSuggestion(result);
  };

  return (
    <AppShell
      title="Gợi ý tập luyện từ AI"
      description="Đề xuất cho HLV tham khảo — không phải tư vấn y tế"
      allow={["Coach"]}
    >
      <Card
        title="Xin gợi ý"
        hint="Cần hội viên đã khai mục tiêu và trình độ; hệ thống tự tổng hợp lịch sử tập 30 ngày gần nhất (BR-26)."
      >
        <div className="form form--inline" style={{ maxWidth: 680 }}>
          <Field label="Hội viên">
            <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
              <option value="">— Chọn hội viên —</option>
              {(relationships.data ?? []).map((item) => (
                <option key={item.relationshipId} value={item.memberId}>
                  {item.memberName || item.memberEmail}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <button
              type="button"
              className="btn"
              disabled={!memberId || action.busy}
              onClick={() => void request()}
            >
              {action.busy ? "Đang tính toán…" : "Tạo gợi ý"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Feedback error={action.error} success={null} />
        </div>
      </Card>

      {suggestion && (
        <>
          <div className="grid grid--stats">
            <Stat
              label="Buổi có mặt (30 ngày)"
              value={suggestion.input.sessionsAttended}
            />
            <Stat label="Buổi vắng / không đến" value={suggestion.input.sessionsMissed} />
            <Stat label="Lần check-in Gym" value={suggestion.input.gymCheckIns} />
            <Stat
              label="Thời gian phản hồi"
              value={`${suggestion.responseTimeMs} ms`}
              hint="Được ghi vào AI_Logs (BR-27)"
            />
          </div>

          <Card title={`Gợi ý cho ${suggestion.memberName}`}>
            <div className="stack">
              <div className="alert alert--info">{suggestion.rationale}</div>

              <div>
                <h3>Nội dung đề xuất</h3>
                <ul>
                  {suggestion.exercises.map((exercise, index) => (
                    <li key={index}>{exercise}</li>
                  ))}
                </ul>
              </div>

              <div className="small muted">
                Đầu vào: mục tiêu &quot;{suggestion.goal}&quot; · trình độ{" "}
                {label(suggestion.level)} · lịch sử {suggestion.input.historyWindowDays} ngày
                {suggestion.input.recentDisciplines.length > 0 &&
                  ` · bộ môn gần đây: ${suggestion.input.recentDisciplines.join(", ")}`}
              </div>
            </div>
          </Card>
        </>
      )}

      <Card
        title="Nhật ký gọi AI"
        hint="BR-27 — mọi yêu cầu và phản hồi đều được ghi lại kèm thời gian phản hồi."
        bodyless
      >
        <AsyncSection
          state={logs}
          emptyMessage="Bạn chưa thực hiện lượt gọi AI nào."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={["Thời điểm", "Loại truy vấn", { text: "Thời gian phản hồi", numeric: true }]}
            >
              {data.map((item) => (
                <tr key={item.logId}>
                  <td className="nowrap">{formatDateTime(item.createdAt)}</td>
                  <td>{item.queryType}</td>
                  <td className="num">{item.responseTimeMs} ms</td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}
