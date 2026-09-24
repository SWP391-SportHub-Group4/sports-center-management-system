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
      "Made the suggestion.",
    );

    if (result) setSuggestion(result);
  };

  return (
    <AppShell
      title="Hint of Training From AI"
      description="Offering to Coach References — Not Medical Advisory"
      allow={["Coach"]}
    >
      <Card
        title="Please advise"
        hint="The need for membership has made a statement of goals and degrees; the history-regulation system of the last 30 days (BR-26)."
      >
        <div className="form form--inline" style={{ maxWidth: 680 }}>
          <Field label="Members">
            <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
              <option value="">— Select Members —</option>
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
              {action.busy ? "Computing..." : "Create suggestions"}
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
              label="The show-up (30 days)"
              value={suggestion.input.sessionsAttended}
            />
            <Stat label="The Descent/ Not Comes" value={suggestion.input.sessionsMissed} />
            <Stat label="Check-in Gym time" value={suggestion.input.gymCheckIns} />
            <Stat
              label="Schedule"
              value={`${suggestion.responseTimeMs} ms`}
              hint="Written to AI_Logs (BR-27)"
            />
          </div>

          <Card title={`Suggestions for ${suggestion.memberName}`}>
            <div className="stack">
              <div className="alert alert--info">{suggestion.rationale}</div>

              <div>
                <h3>Suggested Content</h3>
                <ul>
                  {suggestion.exercises.map((exercise, index) => (
                    <li key={index}>{exercise}</li>
                  ))}
                </ul>
              </div>

              <div className="small muted">
                Enter: target &:{suggestion.goal}& ‹; › Level{" "}
                {label(suggestion.level)} · History {suggestion.input.historyWindowDays} days
                {suggestion.input.recentDisciplines.length > 0 &&
                  ` · recent activity: ${suggestion.input.recentDisciplines.join(", ")}`}
              </div>
            </div>
          </Card>
        </>
      )}

      <Card
        title="AI Call Diary"
        hint="BR-27 — All requests and responses are recorded with response time."
        bodyless
      >
        <AsyncSection
          state={logs}
          emptyMessage="You haven't made any AI calls yet."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={["Schedule", "Query Type", { text: "Schedule", numeric: true }]}
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
