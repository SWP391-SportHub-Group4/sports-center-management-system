"use client";
import { useRef, useState } from "react";
import { Button, Card } from "@/shared/ui";
import {
  validateProfile,
  type MemberProfile,
  type ProfileInput,
} from "./model";
export function ProfileForm({
  profile,
  busy,
  onSave,
}: {
  profile: MemberProfile;
  busy: boolean;
  onSave: (input: ProfileInput) => Promise<boolean>;
}) {
  const [input, setInput] = useState<ProfileInput>({
    fullName: profile.fullName,
    phone: profile.phone,
    goal: profile.goal,
    level: profile.level,
  });
  const [errors, setErrors] = useState<ReturnType<typeof validateProfile>>({});
  const form = useRef<HTMLFormElement>(null);
  return (
    <div className="stack">
      <h1>Cập nhật hồ sơ</h1>
      <Card>
        <form
          ref={form}
          className="form"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const next = validateProfile(input);
            setErrors(next);
            const key = Object.keys(next)[0];
            if (key) {
              form.current
                ?.querySelector<HTMLInputElement>(`[name="${key}"]`)
                ?.focus();
              return;
            }
            await onSave(input);
          }}
        >
          {(
            [
              ["fullName", "Họ và tên", "name"],
              ["phone", "Số điện thoại", "tel"],
              ["goal", "Mục tiêu tập luyện", "off"],
            ] as const
          ).map(([key, label, autoComplete]) => (
            <div className="field" key={key}>
              <label htmlFor={`profile-${key}`}>{label}</label>
              <input
                id={`profile-${key}`}
                name={key}
                autoComplete={autoComplete}
                type={key === "phone" ? "tel" : "text"}
                maxLength={key === "goal" ? 240 : 100}
                value={input[key]}
                aria-invalid={!!errors[key]}
                aria-describedby={errors[key] ? `${key}-error` : undefined}
                onChange={(e) => setInput({ ...input, [key]: e.target.value })}
              />
              {errors[key] && (
                <span className="field-error" id={`${key}-error`}>
                  Lỗi: {errors[key]}
                </span>
              )}
            </div>
          ))}
          <label className="field">
            Trình độ
            <select
              value={input.level}
              onChange={(e) =>
                setInput({
                  ...input,
                  level: e.target.value as ProfileInput["level"],
                })
              }
            >
              <option value="Beginner">Mới bắt đầu</option>
              <option value="Intermediate">Trung cấp</option>
              <option value="Advanced">Nâng cao</option>
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
