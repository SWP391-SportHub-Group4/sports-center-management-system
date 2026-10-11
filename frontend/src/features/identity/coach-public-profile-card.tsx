"use client";

import { useEffect, useState } from "react";
import { AsyncSection, Card, Feedback, Field } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";

type Form = {
  title: string;
  bio: string;
  philosophy: string;
  years: string;
  students: string;
};
type Dto = {
  title: string | null;
  bio: string | null;
  philosophy: string | null;
  yearsExperience: number | null;
  studentCount: number | null;
};

/** Coach tự sửa phần hồ sơ hiển thị cho hội viên (trang hồ sơ PT). */
export function CoachPublicProfileCard() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const profile = useApi(
    (signal) => api.get<Dto>("/api/coaches/me/profile", { signal }),
    [],
  );
  const save = useAction();
  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => {
    const d = profile.data;
    if (d && !form)
      setForm({
        title: d.title ?? "",
        bio: d.bio ?? "",
        philosophy: d.philosophy ?? "",
        years: d.yearsExperience?.toString() ?? "",
        students: d.studentCount?.toString() ?? "",
      });
  }, [profile.data, form]);

  return (
    <Card
      title={tx("Hồ sơ huấn luyện viên", "Coach profile")}
      hint={tx(
        "Hội viên thấy phần này khi xem hồ sơ PT của bạn.",
        "Members see this when they view your PT profile.",
      )}
    >
      <AsyncSection state={profile}>
        {() =>
          form && (
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                await save.run(
                  () =>
                    api.put("/api/coaches/me/profile", {
                      title: form.title.trim(),
                      bio: form.bio.trim(),
                      philosophy: form.philosophy.trim(),
                      yearsExperience:
                        form.years === "" ? null : Number(form.years),
                      studentCount:
                        form.students === "" ? null : Number(form.students),
                    }),
                  tx("Đã lưu hồ sơ.", "Profile saved."),
                );
              }}
            >
              <Field label={tx("Chức danh", "Title")}>
                <input
                  maxLength={100}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>
              <div className="form-grid">
                <Field label={tx("Số năm kinh nghiệm", "Years of experience")}>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={form.years}
                    onChange={(e) =>
                      setForm({ ...form, years: e.target.value })
                    }
                  />
                </Field>
                <Field label={tx("Số học viên đã đào tạo", "Students trained")}>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={form.students}
                    onChange={(e) =>
                      setForm({ ...form, students: e.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label={tx("Giới thiệu", "About you")}>
                <textarea
                  maxLength={1000}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                />
              </Field>
              <Field label={tx("Triết lý huấn luyện", "Coaching philosophy")}>
                <textarea
                  maxLength={1000}
                  value={form.philosophy}
                  onChange={(e) =>
                    setForm({ ...form, philosophy: e.target.value })
                  }
                />
              </Field>
              <Feedback error={save.error} success={save.success} />
              <div>
                <button className="btn" type="submit" disabled={save.busy}>
                  {tx("Lưu hồ sơ", "Save profile")}
                </button>
              </div>
            </form>
          )
        }
      </AsyncSection>
    </Card>
  );
}
