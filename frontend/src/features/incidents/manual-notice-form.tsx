"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check } from "lucide-react";
import successStyles from "./notice-success.module.css";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";
import styles from "./notice-recipient-table.module.css";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useOperationsCopy, validReceiptId } from "@/features/manager";
import { Card, Dialog, Field } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import {
  NoticeRecipients,
  noticeRoles,
  type NoticeSelection,
  type NoticeRole,
} from "./notice-recipient-picker";
export function ManualNoticeForm({ onSent }: { onSent?: () => void } = {}) {
  const { t, language } = useLanguage();
  const l = t.operations;
  const c = useOperationsCopy();
  const mutation = useMutation();
  const [subject, setSubject] = useState("");
  const subjectInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [sendEmail, setEmail] = useState(true);
  const [sendInApp, setInApp] = useState(true);
  const sending = useRef(false);
  const [chosen, setChosen] = useState<NoticeSelection>({});
  const [sendToAll, setSendToAll] = useState(false);
  const [sendToRoles, setSendToRoles] = useState<NoticeRole[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [savedId, setSentId] = useState(() => {
    if (typeof window === "undefined") return "";
    const id = new URLSearchParams(window.location.search).get("noticeId");
    return id && validReceiptId(id) ? id : "";
  });
  const [recoveryKey, setRecoveryKey] = useState(() => {
    if (typeof window === "undefined") return "";
    const key = new URLSearchParams(window.location.search).get("noticeKey");
    return key && validReceiptId(key) ? key : "";
  });
  const recovered = useApi(
    async (signal) => {
      if (!recoveryKey) return null;
      const response = await api.get<{ noticeId: string }>(
        `/api/manager/notices/by-key/${recoveryKey}`,
        { signal },
      );
      if (!validReceiptId(response.noticeId)) throw new Error(c.invalidReceipt);
      return response;
    },
    [recoveryKey],
  );
  const sentId = savedId || (recoveryKey ? recovered.data?.noticeId : "") || "";
  const [uncertain, setUncertain] = useState(false);
  const individualRecipients = Object.values(chosen).filter(
    (account) => !sendToRoles.includes(account.role),
  );
  const request = useRef<{
    key: string;
    body: {
      subject: string;
      message: string;
      recipientUserIds: string[];
      sendToAll?: boolean;
      sendToRoles?: string[];
      sendEmail: boolean;
      sendInApp: boolean;
    };
  } | null>(null);
  async function send() {
    if (
      sending.current ||
      mutation.busy ||
      sentId ||
      (!uncertain && !validSelection)
    )
      return;
    sending.current = true;
    request.current ??= {
      key: recoveryKey || crypto.randomUUID(),
      body: {
        subject,
        message,
        recipientUserIds: sendToAll
          ? []
          : individualRecipients.map((account) => account.userId),
        ...(sendToAll ? { sendToAll: true } : {}),
        ...(!sendToAll && sendToRoles.length
          ? {
              sendToRoles: noticeRoles.filter((role) =>
                sendToRoles.includes(role),
              ),
            }
          : {}),
        sendEmail,
        sendInApp,
      },
    };
    const pending = request.current;
    window.history.replaceState(null, "", `?noticeKey=${pending.key}`);
    const ok = await mutation.run(async () => {
      let response: { noticeId: string } | null = null;
      if (uncertain) {
        try {
          response = await api.get<{ noticeId: string }>(
            `/api/manager/notices/by-key/${pending.key}`,
          );
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
        }
      }
      response ??= await api
        .post<{ noticeId: string }>("/api/manager/notices", pending.body, {
          idempotencyKey: pending.key,
        })
        .catch((error) => {
          if (
            error instanceof ApiError &&
            [400, 403, 404, 422].includes(error.status)
          ) {
            request.current = null;
            window.history.replaceState(null, "", window.location.pathname);
          }
          throw error;
        });
      if (!validReceiptId(response.noticeId)) throw new Error(c.invalidReceipt);
      setSentId(response.noticeId);
      setComposerOpen(false);
      onSent?.();
      setRecoveryKey("");
      setUncertain(false);
      window.history.replaceState(null, "", `?noticeId=${response.noticeId}`);
    }, t.manualNotices.sentSuccess);
    sending.current = false;
    if (!ok) setUncertain(request.current !== null);
  }
  const validSelection =
    (sendToAll ||
      ((sendToRoles.length > 0 || individualRecipients.length > 0) &&
        individualRecipients.length <= 200)) &&
    subject.trim().length >= 3 &&
    message.trim().length >= 3 &&
    (sendEmail || sendInApp);
  const locked = mutation.busy || !!sentId || uncertain || !!recoveryKey;
  function change() {
    mutation.reset();
  }
  function resetAfterSuccess() {
    if (mutation.busy) return;
    setSentId("");
    setRecoveryKey("");
    setUncertain(false);
    setComposerOpen(false);
    setSubject("");
    setMessage("");
    setEmail(true);
    setInApp(true);
    setChosen({});
    setSendToAll(false);
    setSendToRoles([]);
    request.current = null;
    mutation.reset();
    const url = new URL(window.location.href);
    url.searchParams.delete("noticeId");
    url.searchParams.delete("noticeKey");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    requestAnimationFrame(() => subjectInput.current?.focus());
  }
  const deliveryFeedback = (
    <>
      {!sentId && <MutationFeedback mutation={mutation} />}
      {uncertain && (
        <>
          <p role="status">{t.managerOperations.noticeUncertain}</p>
          <button
            className="btn btn--secondary"
            disabled={mutation.busy}
            onClick={send}
          >
            {l.retryNotice}
          </button>
          <Link href="/manager/audit-log">{t.navigation.items.auditLog}</Link>
        </>
      )}
    </>
  );
  return (
    <>
      {recoveryKey && (
        <Card title={l.delivery}>
          <p>{l.noticeRecovery}</p>
          <p>{c.recoveryOnly}</p>
          {recovered.error && (
            <div role="alert">
              <p>{recovered.error.message}</p>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={recovered.reload}
              >
                {t.common.retry}
              </button>
            </div>
          )}

          {recovered.error?.status === 404 && (
            <>
              <p>{c.recoveryNotFound}</p>
              <button
                className="btn btn--secondary"
                onClick={() => {
                  setRecoveryKey("");
                  setUncertain(false);
                  setComposerOpen(false);
                  setChosen({});
                  request.current = null;
                  mutation.reset();
                  window.history.replaceState(
                    null,
                    "",
                    window.location.pathname,
                  );
                }}
              >
                {c.clearRecovery}
              </button>
            </>
          )}
        </Card>
      )}
      <Card title={t.operations.recipients}>
        <NoticeRecipients
          value={chosen}
          disabled={locked}
          onChange={(next) => {
            setChosen(next);
            mutation.reset();
          }}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className="btn"
            disabled={
              locked ||
              !individualRecipients.length ||
              individualRecipients.length > 200
            }
            aria-haspopup="dialog"
            onClick={() => {
              mutation.reset();
              setComposerOpen(true);
            }}
          >
            {language === "vi" ? "Gửi thông báo" : "Send notice"} (
            {individualRecipients.length})
          </button>
        </div>
        {!composerOpen && deliveryFeedback}
      </Card>
      {composerOpen &&
        createPortal(
          <Dialog
            title={l.notices}
            size="lg"
            className={styles.dialog}
            closeIconOnly
            showCloseButton={!mutation.busy}
            onClose={() => {
              if (!mutation.busy && !uncertain) setComposerOpen(false);
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!locked && validSelection) void send();
              }}
            >
              <Field label={l.subject}>
                <input
                  ref={subjectInput}
                  required
                  minLength={3}
                  maxLength={150}
                  disabled={locked}
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    change();
                  }}
                />
              </Field>
              <Field label={l.message}>
                <textarea
                  required
                  minLength={3}
                  maxLength={3000}
                  disabled={locked}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    change();
                  }}
                />
              </Field>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "var(--space-2) var(--space-5)",
                }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    margin: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    disabled={locked}
                    onChange={(e) => {
                      setEmail(e.target.checked);
                      change();
                    }}
                  />
                  {l.sendEmail}
                </label>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    margin: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sendInApp}
                    disabled={locked}
                    onChange={(e) => {
                      setInApp(e.target.checked);
                      change();
                    }}
                  />
                  {l.sendInApp}
                </label>
              </div>
              <button
                className="btn"
                type="submit"
                disabled={locked || !validSelection}
              >
                {mutation.busy
                  ? t.common.loading
                  : language === "vi"
                    ? "Gửi"
                    : "Send"}
              </button>
            </form>
            {deliveryFeedback}
          </Dialog>,
          document.body,
        )}
      {sentId &&
        createPortal(
          <Dialog
            title={t.common.success}
            size="sm"
            className={successStyles.dialog}
            closeIconOnly
            showCloseButton={!mutation.busy}
            onClose={resetAfterSuccess}
          >
            <div className={successStyles.content}>
              <span className={successStyles.mark} aria-hidden="true">
                <Check size={28} strokeWidth={2.5} />
              </span>
              <div className={successStyles.title} role="status">
                {t.manualNotices.sentSuccess}
              </div>
              <p className={successStyles.hint}>
                {t.manualNotices.successHint}
              </p>
              <div className={successStyles.actions}>
                <button
                  type="button"
                  className={`btn ${successStyles.newNotice}`}
                  disabled={mutation.busy}
                  onClick={resetAfterSuccess}
                >
                  {t.manualNotices.newNotice}
                </button>
                <Link
                  className={successStyles.details}
                  href={`/manager/notices/${sentId}`}
                >
                  {t.manualNotices.openDetails}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </Dialog>,
          document.body,
        )}
    </>
  );
}
