"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AttendanceBoard } from "@/components/AttendanceBoard";
import { Dialog, Feedback, Field } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useAction } from "@/lib/useApi";

/**
 * Điểm danh buổi mình dạy, kèm ghi kết quả tập ngay tại chỗ.
 *
 * BR-24 — chỉ HLV thực sự dạy buổi đó mới ghi được kết quả; BR-61 — đăng ký phải còn ở
 * trạng thái Đã xác nhận. Hai điều kiện này được backend kiểm lại, nút bấm ở đây chỉ là lối vào.
 */
export default function CoachAttendancePage() {
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
      "Training Results Archived.",
    );

    if (done !== null) {
      setForm({ progressNote: "", coachComment: "" });
      setTarget(null);
    }
  };

  return (
    <AppShell
      title="Training & Results Score"
      description="Only sessions you are assigned to teach (BR-22, BR-24)"
      allow={["Coach"]}
    >
      <AttendanceBoard
        coachOnly
        onResultRequested={(entry) => {
          action.reset();
          setForm({ progressNote: "", coachComment: "" });
          setTarget(entry);
        }}
      />

      {target && (
        <Dialog
          title={`Record training results — ${target.memberName}`}
          onClose={() => setTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setTarget(null)}
              >
                Abort
              </button>
              <button
                type="submit"
                form="workout-result-form"
                className="btn"
                disabled={action.busy}
              >
                {action.busy ? "Saving..." : "Save Results"}
              </button>
            </>
          }
        >
          <form id="workout-result-form" className="form" onSubmit={submit}>
            <Field
              label="Progress Notes"
              hint="Objective statistics: weight levels, number of times, time holding position..."
            >
              <textarea
                value={form.progressNote}
                onChange={(event) =>
                  setForm({ ...form, progressNote: event.target.value })
                }
              />
            </Field>

            <Field label="Coach's Comments">
              <textarea
                value={form.coachComment}
                onChange={(event) =>
                  setForm({ ...form, coachComment: event.target.value })
                }
              />
            </Field>

            <Feedback error={action.error} success={action.success} />

            <p className="small muted" style={{ margin: 0 }}>
              The member can view this content but cannot fix it (BR-25).
            </p>
          </form>
        </Dialog>
      )}
    </AppShell>
  );
}
