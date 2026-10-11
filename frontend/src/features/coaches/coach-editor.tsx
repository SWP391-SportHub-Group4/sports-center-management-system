"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { Field, AsyncSection } from "@/components/ui";
import { PasswordInput } from "@/components/primitives";
import { PasswordRequirements, passwordChecks } from "@/features/identity";
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
  coach?: CoachAdminDto;
  onClose: () => void;
  onSaved: (saved: CoachAdminDto) => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const mutation = useMutation();
  const [form, setForm] = useState({
    email: coach?.email ?? "",
    fullName: coach?.fullName ?? "",
    phone: coach?.phone ?? "",
    bio: coach?.bio ?? "",
    sportIds: coach?.sportIds ?? ([] as number[]),
    password: "",
    confirmPassword: "",
  });
  const sports = useApi((signal) => catalogApi.sports(signal, true), []);
  const valid =
    form.sportIds.length > 0 &&
    (!!coach ||
      (passwordChecks(form.password, form.email).every(Boolean) &&
        form.password === form.confirmPassword));
  return (
    <CatalogFormDialog
      title={coach ? l.edit : l.create}
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
          sportIds: form.sportIds,
        };
        let saved: CoachAdminDto | undefined;
        if (
          await mutation.run(async () => {
            saved = await (coach
              ? api.put<CoachAdminDto>(
                  `/api/manager/coaches/${coach.userId}`,
                  profile,
                )
              : api.post<CoachAdminDto>("/api/manager/coaches", {
                  ...profile,
                  email: form.email.trim(),
                  password: form.password,
                }));
          })
        )
          onSaved(saved!);
      }}
    >
      <div className="form-grid">
        {!coach && (
          <Field label={l.email}>
            <input
              required
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        )}
        <Field label={l.fullName}>
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
        {!coach && (
          <>
            <Field label={l.password}>
              <PasswordInput
                required
                autoComplete="new-password"
                maxLength={64}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Field label={l.confirmPassword}>
              <PasswordInput
                required
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) =>
                  setForm({ ...form, confirmPassword: e.target.value })
                }
              />
            </Field>
          </>
        )}
      </div>
      {!coach && (
        <PasswordRequirements password={form.password} email={form.email} />
      )}
      <Field label={l.bio}>
        <textarea
          maxLength={1000}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
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
      {coach && <p className="alert alert--info">{l.specialtyWarning}</p>}
    </CatalogFormDialog>
  );
}
