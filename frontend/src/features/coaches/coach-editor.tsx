"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { Field, AsyncSection } from "@/components/ui";
import { useMutation } from "@/features/operations";
import { catalogApi } from "@/features/catalog";
import { CatalogFormDialog } from "@/features/catalog";
import { SpecialtyEditor } from "./specialty-editor";
import type { CoachAdminDto } from "@/lib/types";
export function CoachEditor({
  coach,
  onClose,
  onSaved,
}: {
  coach: CoachAdminDto;
  onClose: () => void;
  onSaved: (saved: CoachAdminDto) => void;
}) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const l = t.operations;
  const mutation = useMutation();
  const [form, setForm] = useState({
    fullName: coach?.fullName ?? "",
    phone: coach?.phone ?? "",
    bio: coach?.bio ?? "",
    title: coach?.title ?? "",
    years: coach?.yearsExperience?.toString() ?? "",
    students: coach?.studentCount?.toString() ?? "",
    philosophy: coach?.philosophy ?? "",
    sportIds: coach?.sportIds ?? ([] as number[]),
  });
  const sports = useApi((signal) => catalogApi.sports(signal, true), []);
  const valid = form.sportIds.length > 0;
  return (
    <CatalogFormDialog
      title={`${l.edit} ${l.coach.toLocaleLowerCase()}`}
      busy={mutation.busy}
      canSubmit={valid}
      mutation={mutation}
      onClose={onClose}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        const profile = {
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || null,
          bio: form.bio.trim(),
          title: form.title.trim(),
          philosophy: form.philosophy.trim(),
          yearsExperience: form.years === "" ? null : Number(form.years),
          studentCount: form.students === "" ? null : Number(form.students),
          sportIds: form.sportIds,
        };
        let saved: CoachAdminDto | undefined;
        if (
          await mutation.run(async () => {
            saved = await api.put<CoachAdminDto>(
              `/api/manager/coaches/${coach.userId}`,
              profile,
            );
          })
        )
          onSaved(saved!);
      }}
    >
      <div className="form-grid">
        <Field label={l.fullName} required>
          <input
            required
            minLength={2}
            maxLength={100}
            pattern=".*\S.*"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </Field>
        <Field label={l.phone}>
          <input
            type="tel"
            maxLength={20}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>
      </div>
      <Field label={l.bio}>
        <textarea
          maxLength={1000}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
        />
      </Field>
      <Field label={vi ? "Chức danh hiển thị" : "Public title"}>
        <input
          maxLength={100}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label={vi ? "Số năm kinh nghiệm" : "Years of experience"}>
          <input
            type="number"
            min={0}
            max={60}
            value={form.years}
            onChange={(e) => setForm({ ...form, years: e.target.value })}
          />
        </Field>
        <Field label={vi ? "Số học viên đã đào tạo" : "Students trained"}>
          <input
            type="number"
            min={0}
            max={100000}
            value={form.students}
            onChange={(e) => setForm({ ...form, students: e.target.value })}
          />
        </Field>
      </div>
      <Field label={vi ? "Triết lý huấn luyện" : "Coaching philosophy"}>
        <textarea
          maxLength={1000}
          value={form.philosophy}
          onChange={(e) => setForm({ ...form, philosophy: e.target.value })}
        />
      </Field>
      <AsyncSection state={sports}>
        {(rows) => (
          <SpecialtyEditor
            sports={rows.filter(
              (s) => s.isActive || form.sportIds.includes(s.sportId),
            )}
            value={form.sportIds}
            onChange={(sportIds) => setForm({ ...form, sportIds })}
          />
        )}
      </AsyncSection>
      {!form.sportIds.length && <p role="alert">{l.specialties}</p>}
      <p className="alert alert--info">{l.specialtyWarning}</p>
    </CatalogFormDialog>
  );
}
