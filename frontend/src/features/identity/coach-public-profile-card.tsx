"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, Save, RotateCcw } from "lucide-react";
import { AsyncSection, Feedback, Field } from "@/components/ui";
import { AvatarImage } from "@/components/AvatarImage";
import { CoachCredentialsEditor } from "@/components/coach-credentials/coach-credentials";
import { api } from "@/lib/apiClient";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import styles from "./coach-public-profile-card.module.css";

type Dto = {
  title: string | null;
  bio: string | null;
  philosophy: string | null;
  yearsExperience: number | null;
  studentCount: number | null;
};
type Form = {
  title: string;
  bio: string;
  philosophy: string;
  years: string;
};
const toForm = (data: Dto): Form => ({
  title: data.title ?? "",
  bio: data.bio ?? "",
  philosophy: data.philosophy ?? "",
  years: data.yearsExperience?.toString() ?? "",
});
const normalize = (form: Form): Form => ({
  title: form.title.trim(),
  bio: form.bio.trim(),
  philosophy: form.philosophy.trim(),
  years: form.years === "" ? "" : String(Number(form.years)),
});

export function CoachPublicProfileCard() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const profile = useApi(
    (signal) => api.get<Dto>("/api/coaches/me/profile", { signal }),
    [],
  );
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2>{vi ? "Hồ sơ huấn luyện viên" : "Coach profile"}</h2>
        <p>
          {vi
            ? "Giới thiệu chuyên môn và cách bạn đồng hành cùng học viên. Nội dung được hiển thị trên hồ sơ công khai."
            : "Introduce your expertise and coaching approach. This information appears on your public profile."}
        </p>
      </header>
      <AsyncSection state={profile}>
        {(data) => <ProfileEditor initial={data} />}
      </AsyncSection>
      <CoachCredentialsEditor />
    </section>
  );
}

function ProfileEditor({ initial }: { initial: Dto }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const tx = (vi: string, en: string) => (language === "vi" ? vi : en);
  const [form, setForm] = useState(() => toForm(initial));
  const [saved, setSaved] = useState(() => toForm(initial));
  const save = useAction();
  const submitting = useRef(false);
  const dirty =
    JSON.stringify(normalize(form)) !== JSON.stringify(normalize(saved));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(key: keyof Form, value: string) {
    save.reset();
    setForm((current) => ({ ...current, [key]: value }));
  }
  return (
    <div className={styles.layout}>
      <form
        className={styles.editor}
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current || !dirty) return;
          submitting.current = true;
          const next = normalize(form);
          try {
            const done = await save.run(
              async () => {
                await api.put<void>("/api/coaches/me/profile", {
                  title: next.title,
                  bio: next.bio,
                  philosophy: next.philosophy,
                  yearsExperience:
                    next.years === "" ? null : Number(next.years),
                  studentCount: initial.studentCount,
                });
                return true;
              },
              tx("Đã lưu hồ sơ huấn luyện viên.", "Coach profile saved."),
            );
            if (done) {
              setSaved(next);
              setForm(next);
            }
          } finally {
            submitting.current = false;
          }
        }}
      >
        <fieldset disabled={save.busy} className={styles.fields}>
          <section className={styles.group}>
            <h3>{tx("Thông tin chuyên môn", "Professional details")}</h3>
            <Field
              label={tx("Chức danh / chuyên môn", "Title / expertise")}
              hint={tx(
                "Ví dụ: Huấn luyện viên cầu lông. Bộ môn phụ trách do trung tâm quản lý.",
                "For example: Badminton coach. Sport assignments are managed by the center.",
              )}
            >
              <input
                maxLength={100}
                value={form.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </Field>
            <div className={styles.numbers}>
              <Field
                label={tx("Kinh nghiệm (năm)", "Experience (years)")}
                hint={tx("Từ 0 đến 60 năm", "From 0 to 60 years")}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={60}
                  step={1}
                  value={form.years}
                  onChange={(e) => change("years", e.target.value)}
                />
              </Field>
            </div>
          </section>
          <section className={`${styles.group} ${styles.writing}`}>
            <h3>{tx("Giới thiệu với học viên", "Introduce yourself")}</h3>
            <div className={styles.writingField}>
              <Field
                label={tx("Giới thiệu", "About you")}
                hint={tx(
                  "Nêu kinh nghiệm, đối tượng học viên và điểm mạnh của bạn.",
                  "Describe your experience, the students you coach and your strengths.",
                )}
              >
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={form.bio}
                  onChange={(e) => change("bio", e.target.value)}
                />
              </Field>
              <span className={styles.counter}>
                {form.bio.length}/1.000 {tx("ký tự", "characters")}
              </span>
            </div>
            <div className={styles.writingField}>
              <Field
                label={tx("Phương pháp huấn luyện", "Coaching approach")}
                hint={tx(
                  "Bạn hướng dẫn, theo dõi và giúp học viên tiến bộ như thế nào?",
                  "How do you guide students, track their progress and help them improve?",
                )}
              >
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={form.philosophy}
                  onChange={(e) => change("philosophy", e.target.value)}
                />
              </Field>
              <span className={styles.counter}>
                {form.philosophy.length}/1.000 {tx("ký tự", "characters")}
              </span>
            </div>
          </section>
        </fieldset>
        <Feedback error={save.error} success={save.success} />
        <footer className={styles.actions}>
          <span role="status">
            {save.busy
              ? tx("Đang lưu…", "Saving…")
              : dirty
                ? tx("Có thay đổi chưa lưu", "Unsaved changes")
                : tx("Không có thay đổi chưa lưu", "No unsaved changes")}
          </span>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={!dirty || save.busy}
              onClick={() => {
                setForm(saved);
                save.reset();
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {tx("Hoàn tác", "Reset")}
            </button>
            <button
              type="submit"
              className="btn"
              disabled={!dirty || save.busy}
            >
              <Save size={16} aria-hidden="true" />
              {tx("Lưu hồ sơ", "Save profile")}
            </button>
          </div>
        </footer>
      </form>
      <aside
        className={styles.preview}
        aria-label={tx("Xem trước hồ sơ", "Profile preview")}
      >
        <div className={styles.previewLabel}>
          <Eye size={18} aria-hidden="true" />
          <h3>{tx("Xem trước", "Preview")}</h3>
        </div>
        <p className={styles.note}>
          {tx(
            "Nội dung cập nhật khi bạn nhập. Nhấn Lưu hồ sơ để công khai thay đổi.",
            "Updates as you type. Save your profile to publish changes.",
          )}
        </p>
        <div className={styles.identity}>
          <AvatarImage
            name={user?.fullName ?? "Coach"}
            avatarUrl={user?.avatarUrl}
            size={64}
          />
          <div>
            <h4>{user?.fullName}</h4>
            <p>
              {form.title.trim() ||
                tx("Chưa thêm chức danh", "Title not added")}
            </p>
          </div>
        </div>
        {form.years !== "" && (
          <dl className={styles.facts}>
            {form.years !== "" && (
              <div>
                <dt>{tx("Kinh nghiệm", "Experience")}</dt>
                <dd>
                  {form.years} {tx("năm", "years")}
                </dd>
              </div>
            )}
          </dl>
        )}
        <section className={styles.prose}>
          <h4>{tx("Giới thiệu", "About")}</h4>
          <p>
            {form.bio.trim() ||
              tx(
                "Giới thiệu ngắn giúp học viên hiểu chuyên môn của bạn.",
                "A short introduction helps students understand your expertise.",
              )}
          </p>
        </section>
        <section className={styles.prose}>
          <h4>{tx("Phương pháp huấn luyện", "Coaching approach")}</h4>
          <p>
            {form.philosophy.trim() ||
              tx(
                "Chia sẻ cách bạn hỗ trợ học viên đạt mục tiêu.",
                "Share how you help students reach their goals.",
              )}
          </p>
        </section>
        {user && (
          <Link
            className="btn btn--secondary"
            href={`/coaches/${user.userId}?returnTo=%2Faccount`}
            onClick={(event) => {
              if (
                (dirty || save.busy) &&
                !window.confirm(
                  tx(
                    "Trang công khai chỉ hiển thị nội dung đã lưu. Tiếp tục rời trang?",
                    "The public page only shows saved content. Leave this page?",
                  ),
                )
              )
                event.preventDefault();
            }}
          >
            {tx("Xem hồ sơ công khai", "View public profile")}
          </Link>
        )}
      </aside>
    </div>
  );
}
