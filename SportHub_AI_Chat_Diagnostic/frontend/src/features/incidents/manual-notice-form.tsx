"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";
import { NoticeReview } from "./notice-review";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useOperationsCopy, validReceiptId } from "@/features/manager";
import { Card, Feedback, Field } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import {
  NoticeRecipients,
  noticeRoles,
  type NoticeSelection,
  type NoticeRole,
} from "./notice-recipient-picker";
export function ManualNoticeForm({ onSent }: { onSent?: () => void } = {}) {
  const { t } = useLanguage();
  const l = t.operations;
  const c = useOperationsCopy();
  const mutation = useMutation();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sendEmail, setEmail] = useState(true);
  const [sendInApp, setInApp] = useState(true);
  const [chosen, setChosen] = useState<NoticeSelection>({});
  const [sendToAll, setSendToAll] = useState(false);
  const [sendToRoles, setSendToRoles] = useState<NoticeRole[]>([]);
  const [review, setReview] = useState(false);
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
    if (mutation.busy || sentId || (!uncertain && (!review || !validSelection)))
      return;
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
      onSent?.();
      setRecoveryKey("");
      setUncertain(false);
      window.history.replaceState(null, "", `?noticeId=${response.noticeId}`);
    }, t.manualNotices.sentSuccess);
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
    setReview(false);
  }
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
                  setReview(false);
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
      <NoticeRecipients
        value={chosen}
        disabled={locked}
        sendToAll={sendToAll}
        sendToRoles={sendToRoles}
        onSendToRoleChange={(role, checked) => {
          setSendToRoles((current) =>
            checked
              ? [...current, role]
              : current.filter((selected) => selected !== role),
          );
          change();
        }}
        onSendToAllChange={(checked) => {
          setSendToAll(checked);
          change();
        }}
        onChange={(next) => {
          setChosen(next);
          change();
        }}
      />
      <Card title={l.notices}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!locked && validSelection) setReview(true);
          }}
        >
          <Field label={l.subject}>
            <input
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
          <label>
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
          <label>
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
          <button
            className="btn btn--secondary"
            disabled={locked || !validSelection}
          >
            {l.review}
          </button>
        </form>
        {review && (
          <NoticeReview
            recipients={individualRecipients}
            sendToAll={sendToAll}
            sendToRoles={sendToRoles}
            subject={subject}
            message={message}
            sendInApp={sendInApp}
            sendEmail={sendEmail}
            disabled={locked || !validSelection}
            onSend={() => void send()}
          />
        )}
        {sentId ? (
          <Feedback success={t.manualNotices.sentSuccess} />
        ) : (
          <MutationFeedback mutation={mutation} />
        )}
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
      </Card>
    </>
  );
}
