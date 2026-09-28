"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AttendanceBoard } from "@/components/AttendanceBoard";
import { Dialog, Feedback, Field } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useAction } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";

/**
 * Điểm danh buổi mình dạy, kèm ghi kết quả tập ngay tại chỗ.
 *
 * BR-24 — chỉ HLV thực sự dạy buổi đó mới ghi được kết quả; BR-61 — đăng ký phải còn ở
 * trạng thái Đã xác nhận. Hai điều kiện này được backend kiểm lại, nút bấm ở đây chỉ là lối vào.
 */
export default function CoachAttendancePage() {
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get("sessionId");
  const initialDate = searchParams.get("date");

  const [target, setTarget] = useState<{
    enrollmentId: string;
    memberName: string;
  } | null>(null);
  const [form, setForm] = useState({ progressNote: "", coachComment: "" });
  const action = useAction();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target) return;

    const done = await action.run(
      () =>
        api.post("/api/workout-results", {
          enrollmentId: target.enrollmentId,
          progressNote: form.progressNote.trim() || null,
          coachComment: form.coachComment.trim() || null,
        }),
      language === "en"
        ? "Workout assessment recorded successfully."
        : "Đã lưu kết quả tập luyện cho học viên thành công.",
    );

    if (done !== null) {
      setForm({ progressNote: "", coachComment: "" });
      setTarget(null);
    }
  };

  return (
    <AppShell
      title={language === "en" ? "Attendance & Workout Results" : "Điểm danh & Ghi nhận kết quả"}
      description={
        language === "en"
          ? "Applicable only to sessions officially assigned to you (Studio Yoga/Group X classes or 1:1 PT sessions) (BR-22, BR-24)"
          : "Chỉ áp dụng cho các ca dạy bạn được phân công chính thức (Lớp nhóm Yoga/Group X hoặc ca PT) (BR-22, BR-24)"
      }
      allow={["Coach"]}
    >
      <AttendanceBoard
        coachOnly
        initialSessionId={initialSessionId}
        initialDate={initialDate}
        onResultRequested={(entry) => {
          action.reset();
          setForm({ progressNote: "", coachComment: "" });
          setTarget(entry);
        }}
      />

      {target && (
        <Dialog
          title={
            language === "en"
              ? `Record Workout Assessment — ${target.memberName}`
              : `Ghi nhận kết quả tập luyện — ${target.memberName}`
          }
          onClose={() => setTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setTarget(null)}
              >
                {language === "en" ? "Close" : "Đóng"}
              </button>
              <button
                type="submit"
                form="workout-result-form"
                className="btn"
                disabled={action.busy}
              >
                {action.busy
                  ? language === "en"
                    ? "Saving..."
                    : "Đang lưu..."
                  : language === "en"
                    ? "Save Assessment"
                    : "Lưu kết quả"}
              </button>
            </>
          }
        >
          <form id="workout-result-form" className="form" onSubmit={submit}>
            <Field
              label={language === "en" ? "Progress Notes & Metrics" : "Ghi chú tiến độ"}
              hint={
                language === "en"
                  ? "Objective indicators: weight lifted, reps completed, asana hold time, mobility score..."
                  : "Chỉ số khách quan: mức tạ, số lần lặp, thời gian giữ thế asana, độ dẻo dai..."
              }
            >
              <textarea
                rows={3}
                placeholder={
                  language === "en"
                    ? "e.g. Completed 3 sets of Cat-Cow, held Plank for 45 seconds, improved hip extension compared to last session..."
                    : "Ví dụ: Hoàn thành 3 hiệp Cat-Cow, giữ thế Plank 45 giây, khớp hông linh hoạt hơn buổi trước..."
                }
                value={form.progressNote}
                onChange={(event) =>
                  setForm({ ...form, progressNote: event.target.value })
                }
              />
            </Field>

            <Field
              label={language === "en" ? "Coach Feedback & Advice" : "Nhận xét & Lời khuyên của HLV"}
            >
              <textarea
                rows={3}
                placeholder={
                  language === "en"
                    ? "e.g. Great focus and stamina. Remember diaphragmatic breathing and keep neutral spine during Warrior pose..."
                    : "Ví dụ: Tinh thần tập trung tốt. Cần chú ý hít thở sâu bằng bụng và giữ lưng thẳng khi vào thế Warrior..."
                }
                value={form.coachComment}
                onChange={(event) =>
                  setForm({ ...form, coachComment: event.target.value })
                }
              />
            </Field>

            <Feedback error={action.error} success={action.success} />

            <p className="small muted" style={{ margin: 0 }}>
              {language === "en"
                ? "Trainees can review these notes inside their workout plans, but cannot edit them (BR-25)."
                : "Hội viên có thể xem nhận xét này trong mục kế hoạch tập nhưng không được chỉnh sửa (BR-25)."}
            </p>
          </form>
        </Dialog>
      )}
    </AppShell>
  );
}
