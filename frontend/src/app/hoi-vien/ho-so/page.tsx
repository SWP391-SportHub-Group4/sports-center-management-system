"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, Feedback, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useAction } from "@/lib/useApi";
import type { MemberTrainingProfileDto } from "@/lib/types";

const LEVELS = [
  { value: "Beginner", label: "Mới bắt đầu" },
  { value: "Intermediate", label: "Trung cấp" },
  { value: "Advanced", label: "Nâng cao" },
];

/**
 * Hồ sơ tập luyện — hai trong ba đầu vào bắt buộc của gợi ý AI (BR-26: mục tiêu cá nhân +
 * trình độ hiện tại; đầu vào thứ ba là lịch sử tập 30 ngày, hệ thống tự tổng hợp).
 *
 * Endpoint trả 204 khi hội viên chưa khai hồ sơ — đó là trạng thái bình thường của người mới,
 * không phải lỗi, nên form vẫn hiện ra trống để điền.
 */
export default function TrainingProfilePage() {
  const action = useAction();
  const [profile, setProfile] = useState<MemberTrainingProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ goal: "", experienceLevel: "Beginner", notes: "" });

  useEffect(() => {
    const controller = new AbortController();

    api
      .get<MemberTrainingProfileDto | null>("/api/members/me/training-profile", {
        signal: controller.signal,
      })
      .then((data) => {
        if (!data) return;

        setProfile(data);
        setForm({
          goal: data.goal,
          experienceLevel: data.experienceLevel,
          notes: data.notes ?? "",
        });
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiError) action.setError(cause.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const saved = await action.run(
      () =>
        api.put<MemberTrainingProfileDto>("/api/members/me/training-profile", {
          goal: form.goal.trim(),
          experienceLevel: form.experienceLevel,
          notes: form.notes.trim() || null,
        }),
      "Đã lưu hồ sơ tập luyện.",
    );

    if (saved) setProfile(saved);
  };

  return (
    <AppShell
      title="Hồ sơ tập luyện"
      description="Mục tiêu và trình độ của bạn — cơ sở để HLV lập kế hoạch và xin gợi ý AI"
      allow={["Member"]}
    >
      <Card
        title="Thông tin tập luyện"
        hint="Huấn luyện viên phụ trách bạn sẽ đọc được hồ sơ này khi lập kế hoạch tập."
      >
        {loading ? (
          <p className="muted">Đang tải hồ sơ…</p>
        ) : (
          <form className="form" onSubmit={submit} style={{ maxWidth: 620 }}>
            <Field label="Mục tiêu tập luyện">
              <input
                value={form.goal}
                required
                minLength={3}
                placeholder="Ví dụ: giảm 5kg trong 3 tháng, tăng sức bền"
                onChange={(event) => setForm({ ...form, goal: event.target.value })}
              />
            </Field>

            <Field label="Trình độ hiện tại">
              <select
                value={form.experienceLevel}
                onChange={(event) =>
                  setForm({ ...form, experienceLevel: event.target.value })
                }
              >
                {LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Ghi chú sức khỏe (không bắt buộc)"
              hint="Chấn thương cũ, hạn chế vận động, bệnh nền cần lưu ý khi tập."
            >
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>

            <Feedback error={action.error} success={action.success} />

            <div className="row spread">
              <button type="submit" className="btn" disabled={action.busy}>
                {action.busy ? "Đang lưu…" : "Lưu hồ sơ"}
              </button>
              {profile && (
                <span className="small muted">
                  Cập nhật lần cuối {formatDateTime(profile.updatedAt)}
                </span>
              )}
            </div>
          </form>
        )}
      </Card>
    </AppShell>
  );
}
