"use client";

import { useEffect, useState, useMemo } from "react";
import { MemberShell } from "@/components/MemberShell";
import { Card, Feedback, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useAction } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { MemberTrainingProfileDto } from "@/lib/types";

/**
 * Member Training Profile — Core fitness input for personal coach plans and AI recommendations.
 * Returns 204 when new member has not yet filled out their profile.
 */
export default function TrainingProfilePage() {
  const { language } = useLanguage();
  const action = useAction();
  const [profile, setProfile] = useState<MemberTrainingProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    goal: "",
    experienceLevel: "Beginner",
    notes: "",
  });

  const levelOptions = useMemo(
    () => [
      {
        value: "Beginner",
        label: language === "en" ? "Beginner (0–6 months training)" : "Mới bắt đầu (0–6 tháng tập)",
      },
      {
        value: "Intermediate",
        label: language === "en" ? "Intermediate (6 months–2 years)" : "Trung cấp (6 tháng–2 năm)",
      },
      {
        value: "Advanced",
        label: language === "en" ? "Advanced (2+ years consistent)" : "Nâng cao (Trên 2 năm liên tục)",
      },
    ],
    [language],
  );

  useEffect(() => {
    const controller = new AbortController();

    api
      .get<MemberTrainingProfileDto | null>(
        "/api/members/me/training-profile",
        {
          signal: controller.signal,
        },
      )
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

    const successMessage =
      language === "en"
        ? "Training profile saved successfully. Your assigned coach will review these details."
        : "Hồ sơ tập luyện đã được cập nhật thành công. Huấn luyện viên sẽ tham khảo thông tin này.";

    const saved = await action.run(
      () =>
        api.put<MemberTrainingProfileDto>("/api/members/me/training-profile", {
          goal: form.goal.trim(),
          experienceLevel: form.experienceLevel,
          notes: form.notes.trim() || null,
        }),
      successMessage,
    );

    if (saved) setProfile(saved);
  };

  return (
    <MemberShell
      title={language === "en" ? "Training Profile" : "Hồ sơ tập luyện"}
      description={
        language === "en"
          ? "Define your fitness goals, experience level, and health considerations for personalized coaching"
          : "Thiết lập mục tiêu thể hình, trình độ và tình trạng sức khỏe để huấn luyện viên xây dựng giáo án phù hợp"
      }
      allow={["Member"]}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Card
          title={language === "en" ? "Fitness & Health Information" : "Thông tin thể chất & Mục tiêu"}
          hint={
            language === "en"
              ? "Your coach and nutrition advisors will use this information to tailor your personal training program."
              : "Huấn luyện viên phụ trách sẽ sử dụng hồ sơ này khi lên lịch và cường độ giáo án riêng cho bạn."
          }
        >
          {loading ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ink-500, #64748b)" }}>
              ⏳ {language === "en" ? "Loading your profile..." : "Đang tải hồ sơ của bạn..."}
            </div>
          ) : (
            <form className="form" onSubmit={submit}>
              <Field
                label={language === "en" ? "Primary Training Goal" : "Mục tiêu tập luyện chính"}
                hint={
                  language === "en"
                    ? "Specific targets help us recommend suitable classes and intensities."
                    : "Mục tiêu cụ thể giúp hệ thống và HLV gợi ý lớp tập và bài tập chuẩn xác."
                }
              >
                <input
                  value={form.goal}
                  required
                  minLength={3}
                  maxLength={200}
                  placeholder={
                    language === "en"
                      ? "e.g. Lose 5kg in 3 months, improve core mobility, prepare for marathon"
                      : "Ví dụ: Giảm 5kg trong 3 tháng, tăng sức bền cơ bắp, tập luyện chuẩn bị chạy marathon"
                  }
                  onChange={(event) =>
                    setForm({ ...form, goal: event.target.value })
                  }
                />
              </Field>

              <Field
                label={language === "en" ? "Current Experience Level" : "Trình độ tập luyện hiện tại"}
              >
                <select
                  value={form.experienceLevel}
                  onChange={(event) =>
                    setForm({ ...form, experienceLevel: event.target.value })
                  }
                >
                  {levelOptions.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={language === "en" ? "Health Notes & Physical Limitations (Optional)" : "Lưu ý sức khỏe & Tiền sử chấn thương (Không bắt buộc)"}
                hint={
                  language === "en"
                    ? "Past injuries, joint mobility limitations, or cardiovascular notes our coaches should know."
                    : "Chấn thương cũ, hạn chế khớp hoặc tình trạng tim mạch cần HLV lưu ý để đảm bảo an toàn."
                }
              >
                <textarea
                  value={form.notes}
                  rows={4}
                  maxLength={500}
                  placeholder={
                    language === "en"
                      ? "e.g. Lower back stiffness when lifting heavy, mild asthma during intense HIIT cardio..."
                      : "Ví dụ: Hay bị mỏi lưng dưới khi gánh tạ, từng phẫu thuật dây chằng gối phải năm 2023..."
                  }
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </Field>

              <Feedback error={action.error} success={action.success} />

              <div className="row spread" style={{ alignItems: "center", marginTop: 16 }}>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={action.busy}
                  style={{ minWidth: 140 }}
                >
                  {action.busy
                    ? (language === "en" ? "Saving..." : "Đang lưu...")
                    : (language === "en" ? "Save Profile" : "Lưu hồ sơ")}
                </button>
                {profile && (
                  <span className="small muted">
                    {language === "en" ? "Last updated: " : "Cập nhật gần nhất: "}
                    {formatDateTime(profile.updatedAt)}
                  </span>
                )}
              </div>
            </form>
          )}
        </Card>
      </div>
    </MemberShell>
  );
}
