"use client";

import { useState } from "react";
import { Dialog, Field } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { UserAdminDto } from "@/lib/types";
import styles from "./desk.module.css";

const sameEmail = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Đăng ký Member mới tại quầy: email nhập hai lần (không dán lại được), tài khoản chưa có mật khẩu và
 * Member nhận email kích hoạt để tự đặt mật khẩu. Email thuộc đúng người chỉ được chứng minh bằng link đó.
 */
export function RegisterMemberDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (member: UserAdminDto) => void;
}) {
  const { t } = useLanguage();
  const l = t.frontDesk;
  const s = t.staffWork;
  const mutation = useMutation();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    confirmEmail: "",
    phone: "",
  });
  const matches = sameEmail(form.email, form.confirmEmail);
  const valid =
    form.fullName.trim().length >= 2 && form.email.trim() !== "" && matches;

  return (
    <Dialog
      title={l.registerMemberTitle}
      description={l.registerMemberHint}
      size="lg"
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
    >
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid) return;
          let created: UserAdminDto | undefined;
          if (
            await mutation.run(async () => {
              created = await api.post<UserAdminDto>(
                "/api/members/front-desk",
                {
                  fullName: form.fullName.trim(),
                  email: form.email.trim(),
                  confirmEmail: form.confirmEmail.trim(),
                  phone: form.phone.trim() || null,
                },
              );
            })
          )
            onCreated(created!);
        }}
      >
        <div className="form-grid">
          <Field label={s.fullName} required>
            <input
              required
              pattern=".*\S.*"
              autoComplete="off"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </Field>
          <Field label={s.phone}>
            <input
              type="tel"
              autoComplete="off"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label={s.email} required>
            <input
              type="email"
              required
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label={l.confirmEmail} required>
            <input
              type="email"
              required
              autoComplete="off"
              value={form.confirmEmail}
              onChange={(e) =>
                setForm({ ...form, confirmEmail: e.target.value })
              }
              onPaste={(e) => e.preventDefault()}
              aria-invalid={form.confirmEmail !== "" && !matches}
            />
          </Field>
        </div>
        {form.confirmEmail !== "" && !matches && (
          <p role="alert">{l.emailMismatch}</p>
        )}
        <p className={styles.hint}>{l.activationNote}</p>
        <MutationFeedback mutation={mutation} />
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={mutation.busy}
            onClick={onClose}
          >
            {s.cancel}
          </button>
          <button
            type="submit"
            className="btn"
            disabled={mutation.busy || !valid}
          >
            {l.registerMemberSubmit}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Member đăng ký tại quầy nhưng chưa kích hoạt: lễ tân vẫn phục vụ được, đồng thời gửi lại link hoặc sửa email gõ sai
 * (link cũ bị vô hiệu, link mới tới email mới).
 */
export function PendingMemberPanel({
  member,
  onChange,
}: {
  member: UserAdminDto;
  onChange: (member: UserAdminDto) => void;
}) {
  const { t } = useLanguage();
  const l = t.frontDesk;
  const s = t.staffWork;
  const mutation = useMutation();
  const [changing, setChanging] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [reason, setReason] = useState("");
  const matches = sameEmail(email, confirmEmail);
  const valid =
    email.trim() !== "" &&
    matches &&
    reason.trim().length >= 3 &&
    reason.trim().length <= 500;

  return (
    <section className={styles.pending} aria-labelledby="pending-member-title">
      <h3 id="pending-member-title">{l.pendingActivation}</h3>
      <p className={styles.hint}>{l.pendingHint}</p>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={mutation.busy}
          onClick={() =>
            void mutation.run(async () => {
              onChange(
                await api.post<UserAdminDto>(
                  `/api/members/front-desk/${member.userId}/resend-activation`,
                ),
              );
            })
          }
        >
          {l.resendActivation}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={mutation.busy}
          onClick={() => setChanging((value) => !value)}
        >
          {l.changeEmail}
        </button>
      </div>
      {changing && (
        <div className="stack">
          <Field label={l.newEmail} required>
            <input
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label={l.confirmNewEmail} required>
            <input
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              aria-invalid={confirmEmail !== "" && !matches}
            />
          </Field>
          {confirmEmail !== "" && !matches && (
            <p role="alert">{l.emailMismatch}</p>
          )}
          <Field label={s.reason} required>
            <textarea
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button
            type="button"
            className="btn"
            disabled={mutation.busy || !valid}
            onClick={() =>
              void mutation.run(async () => {
                const updated = await api.put<UserAdminDto>(
                  `/api/members/front-desk/${member.userId}/email`,
                  {
                    email: email.trim(),
                    confirmEmail: confirmEmail.trim(),
                    reason: reason.trim(),
                  },
                );
                setChanging(false);
                setEmail("");
                setConfirmEmail("");
                setReason("");
                onChange(updated);
              })
            }
          >
            {l.saveNewEmail}
          </button>
        </div>
      )}
      <MutationFeedback mutation={mutation} />
    </section>
  );
}
