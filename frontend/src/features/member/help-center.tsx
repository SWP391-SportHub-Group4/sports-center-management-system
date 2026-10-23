"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CloudUpload, Eye, Trash2, XCircle } from "lucide-react";
import { AsyncSection, Dialog, StatusChip } from "@/components/ui";
import { api, ApiError } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  SUPPORT_CATEGORIES,
  supportCategoryLabel,
  type SupportCategory,
} from "@/lib/support-categories";
import { useApi } from "@/lib/useApi";
import styles from "./help-center.module.css";

const MAX_FILES = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_LENGTH = 2000;

interface MyRequest {
  requestId: string;
  category: string;
  description: string;
  status: string;
  createdAt: string;
  response: string | null;
}

interface Sent {
  reference: string;
}

/** Trợ giúp của Member: một biểu mẫu duy nhất cho mọi yêu cầu hỗ trợ; Lễ tân và Manager xử lý ở hàng đợi hỗ trợ. */
export function HelpCenter({ initialTopic }: { initialTopic?: string }) {
  const { user } = useAuth();
  const [category, setCategory] = useState<SupportCategory | "">(
    SUPPORT_CATEGORIES.some((c) => c.value === initialTopic)
      ? (initialTopic as SupportCategory)
      : "",
  );
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [zoomed, setZoomed] = useState<{ url: string; name: string } | null>(
    null,
  );
  const picker = useRef<HTMLInputElement>(null);

  const mine = useApi(
    (signal) => api.get<MyRequest[]>("/api/support/requests/mine", { signal }),
    [],
  );

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  useEffect(
    () => () => previews.forEach((p) => URL.revokeObjectURL(p.url)),
    [previews],
  );

  const ready =
    category !== "" && message.trim().length >= 3 && consent && !busy;

  function toast(text: string) {
    const id = Date.now() + Math.random();
    setToasts((all) =>
      all.some((t) => t.text === text) ? all : [...all, { id, text }],
    );
    window.setTimeout(
      () => setToasts((all) => all.filter((t) => t.id !== id)),
      4000,
    );
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!ACCEPT.split(",").includes(file.type)) {
        toast("Only JPG, PNG or WebP images can be attached.");
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast("Each image must be 5 MB or smaller.");
        continue;
      }
      if (next.length >= MAX_FILES) {
        toast(`You can attach up to ${MAX_FILES} images.`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
    if (picker.current) picker.current.value = "";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || !ready) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("category", category);
      form.append("description", message.trim());
      files.forEach((file) => form.append("files", file));
      const result = await api.postForm<Sent>("/api/support/requests", form);
      setSent(result);
      setMessage("");
      setFiles([]);
      setConsent(false);
      mine.reload();
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "We could not send your request. Please try again.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.card} aria-label="Contact support">
        <p className={styles.intro}>
          Tell us what you need. Our front desk team will review your request
          and follow up. You will get a notification and an email as soon as it
          is received.
        </p>
        {sent ? (
          <div className={styles.success} role="status">
            <h2>Request received</h2>
            <p>
              Your reference is <strong>{sent.reference}</strong>. We have sent a
              confirmation to {user?.email}.
            </p>
            <div>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setSent(null)}
              >
                Send another request
              </button>
            </div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate>
            <label className={styles.field}>
              <span>What is your request about? *</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SupportCategory)}
                required
              >
                <option value="">Select a topic</option>
                {SUPPORT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Email *</span>
              <input type="email" value={user?.email ?? ""} readOnly />
              <span className={styles.hint}>
                We reply to the email registered on your account.
              </span>
            </label>

            <label className={styles.field}>
              <span>Your message *</span>
              <textarea
                value={message}
                maxLength={MAX_LENGTH}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe the problem with as much detail as you can"
                required
              />
              <span className={styles.counter}>
                {message.length}/{MAX_LENGTH}
              </span>
            </label>

            <div className={styles.upload}>
              <p className={styles.uploadNote}>
                Please upload images showing the problem you are facing
                (optional).
              </p>
              <span className={styles.uploadTitle}>Upload images</span>
              <p className={styles.uploadHint}>
                You can attach up to {MAX_FILES} files in .jpg, .jpeg, .png or
                .webp format. Each file must not exceed 5 MB.
              </p>
              <input
                ref={picker}
                type="file"
                accept={ACCEPT}
                multiple
                hidden
                onChange={(e) => addFiles(e.target.files)}
              />
              <button
                type="button"
                className={styles.uploadButton}
                onClick={() => picker.current?.click()}
              >
                <CloudUpload size={18} aria-hidden="true" /> Click to upload (
                {files.length}/{MAX_FILES})
              </button>
              {previews.length > 0 && (
                <ul className={styles.files}>
                  {previews.map((p, index) => (
                    <li key={p.url} className={styles.file}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.file.name} />
                      <div className={styles.fileActions}>
                        <button
                          type="button"
                          aria-label={`View ${p.file.name}`}
                          onClick={() =>
                            setZoomed({ url: p.url, name: p.file.name })
                          }
                        >
                          <Eye size={20} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${p.file.name}`}
                          onClick={() =>
                            setFiles(files.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 size={20} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label className={styles.consent}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I agree that SportHub may use the details above to handle this
                request. *
              </span>
            </label>

            {error && (
              <p className="alert alert--error" role="alert">
                {error}
              </p>
            )}
            <div className={styles.actions}>
              <button type="submit" className="btn" disabled={!ready}>
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </section>

      {toasts.length > 0 && (
        <div className={styles.toasts} role="alert">
          {toasts.map((t) => (
            <p key={t.id} className={styles.toast}>
              <XCircle size={18} aria-hidden="true" /> {t.text}
            </p>
          ))}
        </div>
      )}
      {zoomed && (
        <Dialog
          title="Image preview"
          size="lg"
          closeIconOnly
          onClose={() => setZoomed(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.zoomed} src={zoomed.url} alt={zoomed.name} />
        </Dialog>
      )}
      <section className={styles.card} aria-label="My requests">
        <h2 style={{ margin: 0 }}>My requests</h2>
        <AsyncSection
          state={mine}
          isEmpty={(rows) => rows.length === 0}
          emptyMessage={<p className={styles.intro}>No requests yet.</p>}
        >
          {(rows) => (
            <ul className={styles.history}>
              {rows.map((row) => (
                <li key={row.requestId}>
                  <div className={styles.historyHead}>
                    <strong>{supportCategoryLabel(row.category)}</strong>
                    <StatusChip value={row.status} />
                  </div>
                  <span className={styles.meta}>
                    {formatDateTime(row.createdAt)}
                  </span>
                  <p>{row.description}</p>
                  {row.response && (
                    <p className={styles.meta}>Reply: {row.response}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </AsyncSection>
      </section>
    </div>
  );
}
