"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  AsyncSection,
  Card,
  Feedback,
  Field,
  Stat,
  Table,
} from "@/components/ui";
import {
  IconClipboard,
  IconClock,
  IconDumbbell,
  IconLightning,
  IconSparkles,
  IconTarget,
  IconUser,
} from "@/components/icons";
import { api } from "@/lib/apiClient";
import { formatDateTime, label } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type {
  CoachMemberRelationshipDto,
  WorkoutSuggestionDto,
} from "@/lib/types";
import { useLanguage } from "@/lib/language";
import styles from "../coach.module.css";

/**
 * Gợi ý tập luyện từ AI — BR-26 (bắt buộc đủ ba đầu vào: mục tiêu, trình độ, lịch sử tập 30
 * ngày gần nhất) và BR-27 (mọi lượt gọi đều được ghi vào AI_Logs kèm thời gian phản hồi).
 */
function AiSuggestionPageContent() {
  const initialMemberId = useSearchParams().get("memberId") || "";
  return (
    <AiSuggestionContent key={initialMemberId} initialMemberId={initialMemberId} />
  );
}

export default function AiSuggestionPage() {
  return (
    <Suspense fallback={<div role="status">Đang tải…</div>}>
      <AiSuggestionPageContent />
    </Suspense>
  );
}

function AiSuggestionContent({ initialMemberId }: { initialMemberId: string }) {
  const { language } = useLanguage();
  const isEn = language === "en";

  const [memberId, setMemberId] = useState(initialMemberId);
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
      () =>
        api.post<WorkoutSuggestionDto>(
          `/api/ai/workout-suggestions/${memberId}`,
        ),
      isEn
        ? "AI workout routine suggestion generated successfully."
        : "Đã tạo gợi ý giáo án thành công từ AI.",
    );

    if (result) setSuggestion(result);
  };

  const selectedMember = (relationships.data ?? []).find(
    (item) => item.memberId === memberId,
  );

  return (
    <AppShell
      title={isEn ? "AI Routine Generator Assistant" : "Trợ lý AI gợi ý giáo án"}
      description={
        isEn
          ? "Professional coaching reference — aggregates profile & 30-day training history (BR-26, BR-27)"
          : "Hỗ trợ tham khảo chuyên môn cho Huấn luyện viên — tổng hợp hồ sơ & lịch sử tập luyện 30 ngày (BR-26, BR-27)"
      }
      allow={["Coach"]}
      requirePtSpecialty
    >
      <Card
        title={isEn ? "Generate Smart Routine Suggestion" : "Khởi tạo gợi ý giáo án thông minh"}
        hint={
          isEn
            ? "Members must have a declared training profile with goal & level; the system cross-references real-time 30-day activity (BR-26)."
            : "Hội viên bắt buộc phải có hồ sơ tập luyện đã khai báo mục tiêu và trình độ; hệ thống tự động đối chiếu lịch sử 30 ngày gần nhất (BR-26)."
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          <div className={styles.aiGeneratorInline}>
            <Field label={isEn ? "Assigned Member" : "Học viên phụ trách"}>
              <select
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
              >
                <option value="">{isEn ? "— Select member for AI recommendations —" : "— Chọn học viên cần gợi ý —"}</option>
                {(relationships.data ?? []).map((item) => (
                  <option key={item.relationshipId} value={item.memberId}>
                    {item.memberName || item.memberEmail} ({item.sourceType === "Personal" ? "PT 1:1" : (isEn ? "Group Class" : "Lớp nhóm")})
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
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", width: "100%", justifyContent: "center" }}
              >
                <IconSparkles size={16} />
                <span>
                  {action.busy
                    ? (isEn ? "Analyzing data..." : "Đang phân tích dữ liệu...")
                    : (isEn ? "Generate AI Routine" : "Tạo gợi ý AI")}
                </span>
              </button>
            </div>
          </div>

          {selectedMember && (
            <div
              style={{
                background: "var(--ice)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px",
                fontSize: "0.85rem",
                maxWidth: 720,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <IconUser size={15} color="var(--navy)" />
                <strong style={{ color: "var(--navy)" }}>{selectedMember.memberName || selectedMember.memberEmail}</strong>
                <span className="muted">·</span>
                <span className={`${styles.disciplineBadge} ${selectedMember.sourceType === "Personal" ? styles["disciplineBadge--pt"] : styles["disciplineBadge--yoga"]}`}>
                  {selectedMember.sourceType === "Personal" ? "Personal Training 1:1" : (isEn ? "Group Class" : "Lớp nhóm")}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Link
                  href={`/coach/training-plans?memberId=${memberId}`}
                  className="btn btn--ghost btn--sm"
                  style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                >
                  <IconClipboard size={13} />
                  <span>{isEn ? "Workout Plans" : "Giáo án tập"}</span>
                </Link>
                <Link
                  href={`/coach/members?memberId=${memberId}`}
                  className="btn btn--ghost btn--sm"
                  style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                >
                  <IconTarget size={13} />
                  <span>{isEn ? "Trainee Profile" : "Hồ sơ thể trạng"}</span>
                </Link>
              </div>
            </div>
          )}

          <Feedback error={action.error} success={action.success} />
        </div>
      </Card>

      {!suggestion && (
        <div className={styles.guideCard}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <IconSparkles size={18} color="var(--navy)" />
            <strong style={{ fontSize: "1rem", color: "var(--navy)" }}>
              {isEn
                ? "AI 3-Stream Data Synthesis Pipeline (BR-26)"
                : "Quy trình phân tích dữ liệu 3 luồng của AI (BR-26)"}
            </strong>
          </div>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            {isEn
              ? "The system synthesizes health profiles and real-time operational logs to ensure safe, calibrated workouts:"
              : "Hệ thống đối chiếu hồ sơ và dữ liệu vận hành thời gian thực để đảm bảo bài tập an toàn, phù hợp thể trạng:"}
          </p>

          <div className={styles.guideStepList}>
            <div className={styles.guideStepItem}>
              <span className={styles.guideStepNum}>
                {isEn ? "Step 1 · Health Profile" : "Bước 1 · Hồ sơ sức khỏe"}
              </span>
              <div className={styles.guideStepTitle}>
                {isEn ? "Goal & Baseline" : "Mục tiêu & Thể trạng"}
              </div>
              <p className={styles.guideStepDesc}>
                {isEn
                  ? "Evaluates goal (fat loss, hypertrophy, mobility) and medical/injury flags from member profile."
                  : "Kiểm tra mục tiêu (giảm mỡ, tăng cơ, dẻo dai) và tiền sử chấn thương từ hồ sơ học viên."}
              </p>
            </div>

            <div className={styles.guideStepItem}>
              <span className={styles.guideStepNum}>
                {isEn ? "Step 2 · 30-Day Activity" : "Bước 2 · Lịch sử 30 ngày"}
              </span>
              <div className={styles.guideStepTitle}>
                {isEn ? "Frequency & Attendance" : "Tần suất & Điểm danh"}
              </div>
              <p className={styles.guideStepDesc}>
                {isEn
                  ? "Analyzes attended sessions, missed bookings, and turnstile gym check-in frequency."
                  : "Phân tích số buổi tham gia, số ca vắng mặt và lượt quét thẻ qua cổng kiểm soát Gym."}
              </p>
            </div>

            <div className={styles.guideStepItem}>
              <span className={styles.guideStepNum}>
                {isEn ? "Step 3 · Expert Synthesis" : "Bước 3 · Đề xuất chuyên môn"}
              </span>
              <div className={styles.guideStepTitle}>
                {isEn ? "Exercise Plan & Rationale" : "Bài tập & Lý giải"}
              </div>
              <p className={styles.guideStepDesc}>
                {isEn
                  ? "Generates targeted exercise recommendations with a scientific rationale for the coach."
                  : "Sinh danh mục động tác phù hợp, kèm bản giải trình khoa học làm tài liệu tham khảo cho HLV."}
              </p>
            </div>
          </div>
        </div>
      )}

      {suggestion && (
        <>
          <div className="grid grid--stats">
            <Stat
              label={isEn ? "Attended Sessions (30d)" : "Buổi tham gia (30 ngày)"}
              value={suggestion.input.sessionsAttended}
              hint={isEn ? "Completed classes & PT workouts" : "Lớp học & ca PT đã hoàn thành"}
            />
            <Stat
              label={isEn ? "Missed / Cancelled Sessions" : "Số buổi vắng / bỏ lỡ"}
              value={suggestion.input.sessionsMissed}
              hint={isEn ? "Absent or late cancellations" : "Vắng mặt hoặc No-show"}
            />
            <Stat
              label={isEn ? "Gym Check-ins (30d)" : "Lượt check-in Gym tự do"}
              value={suggestion.input.gymCheckIns}
              hint={isEn ? "Turnstile access log records" : "Ghi nhận qua cổng từ turnstile"}
            />
            <Stat
              label={isEn ? "AI Response Latency" : "Thời gian phản hồi AI"}
              value={`${suggestion.responseTimeMs} ms`}
              hint={isEn ? "Logged in AI_Logs (BR-27)" : "Đã lưu vào AI_Logs (BR-27)"}
            />
          </div>

          <Card
            title={
              isEn
                ? `Recommended Routine for Member: ${suggestion.memberName}`
                : `Đề xuất lộ trình cho học viên: ${suggestion.memberName}`
            }
            hint={
              isEn
                ? "Calibrated from goals, current level, and 30-day verified attendance data (BR-26)"
                : "Dựa trên phân tích hồi quy chuyên môn từ mục tiêu, trình độ và 30 ngày tập luyện (BR-26)"
            }
          >
            <div className="stack" style={{ gap: "18px" }}>
              <div
                style={{
                  background: "var(--ice)",
                  border: "1px solid var(--sky)",
                  borderRadius: "var(--radius-sm)",
                  padding: "16px 20px",
                  color: "var(--navy)",
                  fontSize: "0.95rem",
                  lineHeight: 1.6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, marginBottom: "8px" }}>
                  <IconSparkles size={18} color="var(--navy)" />
                  <span>{isEn ? "AI Clinical & Biomechanical Rationale:" : "Phân tích & Lý giải của AI:"}</span>
                </div>
                {suggestion.rationale}
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                  <h3 style={{ fontSize: "1rem", color: "var(--navy)", margin: 0, fontWeight: 700 }}>
                    {isEn
                      ? `Suggested Exercises & Movements (${suggestion.exercises.length} items)`
                      : `Danh mục động tác & bài tập gợi ý (${suggestion.exercises.length} bài)`}
                  </h3>
                  <Link
                    className="btn btn--secondary btn--sm"
                    href={`/coach/training-plans?memberId=${suggestion.memberId}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <IconClipboard size={14} />
                    <span>{isEn ? "Apply to Workout Plan" : "Áp dụng vào Giáo án"}</span>
                  </Link>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: "10px",
                  }}
                >
                  {suggestion.exercises.map((exercise, index) => (
                    <div key={index} className={styles.aiExerciseCard}>
                      <span className={styles.aiExerciseIndex}>{index + 1}</span>
                      <div style={{ fontWeight: 600, color: "var(--navy)", fontSize: "0.92rem", lineHeight: 1.4 }}>
                        {exercise}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="small muted"
                style={{
                  borderTop: "1px solid var(--line)",
                  paddingTop: "14px",
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <span><strong>{isEn ? "Input Parameters:" : "Dữ liệu đầu vào:"}</strong></span>
                <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--pt"]}`}>
                  <IconTarget size={12} /> {suggestion.goal}
                </span>
                <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--yoga"]}`}>
                  <IconDumbbell size={12} /> {label(suggestion.level)}
                </span>
                <span>
                  {isEn ? "History Window:" : "Cửa sổ lịch sử:"}{" "}
                  <em>
                    {suggestion.input.historyWindowDays} {isEn ? "days" : "ngày"}
                  </em>
                </span>
                {suggestion.input.recentDisciplines.length > 0 && (
                  <span>
                    · {isEn ? "Recent Disciplines:" : "Bộ môn gần đây:"}{" "}
                    <em>{suggestion.input.recentDisciplines.join(", ")}</em>
                  </span>
                )}
              </div>
            </div>
          </Card>
        </>
      )}

      <Card
        title={isEn ? "AI Audit Log" : "Nhật ký truy vấn AI (AI Audit Log)"}
        hint={
          isEn
            ? "BR-27 — All AI generation calls are tracked for compliance, verification, and latency SLA metrics"
            : "BR-27 — Toàn bộ lượt gọi AI gợi ý giáo án đều được lưu vết phục vụ đối soát và đo lường hiệu năng"
        }
        bodyless
      >
        <AsyncSection
          state={logs}
          emptyMessage={isEn ? "No AI query logs recorded yet." : "Chưa có lượt gọi AI nào được ghi nhận."}
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table
              headers={[
                isEn ? "Timestamp" : "Thời điểm gọi",
                isEn ? "Query Type" : "Loại tác vụ (Query Type)",
                { text: isEn ? "Latency" : "Thời gian xử lý", numeric: true },
              ]}
            >
              {data.map((item) => (
                <tr key={item.logId}>
                  <td className="nowrap">{formatDateTime(item.createdAt)}</td>
                  <td>
                    <code>{item.queryType}</code>
                  </td>
                  <td className="num">
                    {item.responseTimeMs <= 150 ? (
                      <span className={styles.latencyFast}>
                        <IconLightning size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
                        {item.responseTimeMs} ms · {isEn ? "Optimal" : "Tối ưu"}
                      </span>
                    ) : (
                      <span className={styles.latencyNormal}>
                        <IconClock size={12} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
                        {item.responseTimeMs} ms
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}
