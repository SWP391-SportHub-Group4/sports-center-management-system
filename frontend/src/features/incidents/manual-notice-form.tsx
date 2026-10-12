"use client";
import { pagedItems } from "@/lib/paged";
import { useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";
import { DeliveryStatus } from "./delivery-status";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { todayIso, addDaysIso } from "@/lib/format";
import { useOperationsCopy, validReceiptId } from "@/features/manager";
import { AsyncSection, Card, Field, Table } from "@/components/ui";
import {
  MutationFeedback,
  useMutation,
  Pagination,
} from "@/features/operations";
import type { UserAdminDto, Paged, CourtScheduleEntryDto } from "@/lib/types";
export function ManualNoticeForm() {
  const { t } = useLanguage();
  const l = t.operations;
  const c = useOperationsCopy();
  const mutation = useMutation();
  const [role, setRole] = useState("COACH");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(addDaysIso(todayIso(), 6));
  const [classId, setClass] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sendEmail, setEmail] = useState(true);
  const [sendInApp, setInApp] = useState(true);
  const [chosen, setChosen] = useState<
    Record<string, { name: string; email: string }>
  >({});
  const [review, setReview] = useState(false);
  const [audienceChanged, setAudienceChanged] = useState(false);
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
  const request = useRef<{
    key: string;
    body: {
      subject: string;
      message: string;
      recipientUserIds: string[];
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
        recipientUserIds: Object.keys(chosen),
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
      setRecoveryKey("");
      setUncertain(false);
      window.history.replaceState(null, "", `?noticeId=${response.noticeId}`);
    }, l.queued);
    if (!ok) setUncertain(request.current !== null);
  }
  const users = useApi(
    (s) =>
      api.get<Paged<UserAdminDto>>("/api/users", {
        signal: s,
        query: { role, status: "ACTIVE", keyword, page, pageSize: 20 },
      }),
    [role, keyword, page],
  );
  const schedule = useApi(
    (s) =>
      api.get<CourtScheduleEntryDto[]>("/api/manager/court-schedule", {
        signal: s,
        query: { fromDate: from, toDate: to },
      }),
    [from, to],
  );
  const classes = [
    ...new Map(
      (schedule.data ?? [])
        .filter((r) => r.sourceType === "CLASS_SESSION")
        .map((r) => [r.classId, r]),
    ).values(),
  ];
  const allowed =
    role === "MEMBER"
      ? new Set(
          (schedule.data ?? [])
            .filter(
              (r) =>
                ["CLASS_SESSION", "COURT_RENTAL"].includes(r.sourceType) &&
                (!classId || String(r.classId) === classId),
            )
            .flatMap((r) =>
              r.sourceType === "COURT_RENTAL"
                ? r.memberId
                  ? [r.memberId]
                  : []
                : r.participants.map((p) => p.memberId),
            ),
        )
      : classId
        ? new Set(
            (schedule.data ?? [])
              .filter((r) => String(r.classId) === classId && r.coachId)
              .map((r) => r.coachId!),
          )
        : null;
  const invalidSelection = Object.keys(chosen).some(
    (id) => allowed && !allowed.has(id),
  );
  const validSelection =
    Object.keys(chosen).length > 0 &&
    !invalidSelection &&
    !schedule.loading &&
    !schedule.error &&
    !users.loading &&
    !users.error &&
    subject.trim().length >= 3 &&
    message.trim().length >= 3 &&
    (sendEmail || sendInApp);
  const locked = mutation.busy || !!sentId || uncertain || !!recoveryKey;
  function change() {
    setReview(false);
  }
  function changeAudience() {
    change();
    setChosen({});
    setAudienceChanged(true);
    setPage(1);
  }
  return (
    <>
      {recoveryKey && (
        <Card title={l.delivery}>
          <p>{l.noticeRecovery}</p>
          <p>{c.recoveryOnly}</p>
          {recovered.error && <p role="alert">{recovered.error.message}</p>}
          <button className="btn btn--ghost" onClick={recovered.reload}>
            {l.refresh}
          </button>
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
      <Card title={l.recipients}>
        <fieldset disabled={locked}>
          <div className="form-grid">
            <Field label={l.from}>
              <input
                type="date"
                required
                value={from}
                onChange={(e) => {
                  if (e.target.value) {
                    setFrom(e.target.value);
                    setTo(addDaysIso(e.target.value, 6));
                    setClass("");
                    changeAudience();
                  }
                }}
              />
            </Field>
            <Field label={l.to}>
              <input
                type="date"
                required
                min={from}
                max={addDaysIso(from, 30)}
                value={to}
                onChange={(e) => {
                  if (e.target.value) {
                    setTo(e.target.value);
                    setClass("");
                    changeAudience();
                  }
                }}
              />
            </Field>
            <Field label={l.recipients}>
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setPage(1);
                  changeAudience();
                }}
              >
                <option value="COACH">{l.coaches}</option>
                <option value="MEMBER">{l.member}</option>
              </select>
            </Field>
            <Field label={l.registration}>
              <select
                value={classId}
                onChange={(e) => {
                  setClass(e.target.value);
                  changeAudience();
                }}
              >
                <option value="">{l.all}</option>
                {classes.map((c) => (
                  <option key={c.classId} value={c.classId ?? ""}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={l.search}>
              <input
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
          </div>
          <AsyncSection state={schedule}>
            {(entries) => (
              <AsyncSection state={users}>
                {(data) => {
                  void entries;
                  const rows = pagedItems(data).filter(
                    (u) => !allowed || allowed.has(u.userId),
                  );
                  return (
                    <>
                      {!rows.length && <p role="status">{c.noRecipients}</p>}
                      <Table headers={[l.fullName, l.email, ""]}>
                        {rows.map((u) => (
                          <tr key={u.userId}>
                            <td>{u.fullName}</td>
                            <td>{u.email}</td>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={u.fullName || u.email}
                                checked={!!chosen[u.userId]}
                                disabled={
                                  !!sentId ||
                                  uncertain ||
                                  mutation.busy ||
                                  (!chosen[u.userId] &&
                                    Object.keys(chosen).length >= 200)
                                }
                                onChange={(e) => {
                                  const next = { ...chosen };
                                  if (e.target.checked)
                                    next[u.userId] = {
                                      name: u.fullName,
                                      email: u.email,
                                    };
                                  else delete next[u.userId];
                                  setChosen(next);
                                  setAudienceChanged(false);
                                  change();
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </Table>
                      <Pagination
                        page={page}
                        count={data.totalCount}
                        onChange={setPage}
                      />
                    </>
                  );
                }}
              </AsyncSection>
            )}
          </AsyncSection>
        </fieldset>
        {audienceChanged && <p role="status">{c.audienceChanged}</p>}
        {invalidSelection && <p role="alert">{c.invalidSelection}</p>}
      </Card>
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
        <p>{l.noticeLimit}</p>
        {review && (
          <>
            <p role="note">{c.localReview}</p>
            <dl>
              <dt>{c.recipientCount}</dt>
              <dd>{Object.keys(chosen).length}</dd>
              <dt>{c.channels}</dt>
              <dd>
                {[sendInApp ? l.sendInApp : "", sendEmail ? l.sendEmail : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
              <dt>{l.recipients}</dt>
              <dd>
                {role === "COACH" ? l.coaches : l.member} · {from} – {to}
                {classId
                  ? ` · ${classes.find((row) => String(row.classId) === classId)?.title || t.managerAudit.nameUnavailable}`
                  : ""}
              </dd>
            </dl>
            <p>{l.recipientPreview}</p>
            <ul>
              {Object.entries(chosen).map(([id, u]) => (
                <li key={id}>
                  {u.name} · {u.email}
                  <button
                    className="btn btn--ghost"
                    disabled={locked}
                    onClick={() => {
                      const next = { ...chosen };
                      delete next[id];
                      setChosen(next);
                      change();
                    }}
                  >
                    {l.remove}
                  </button>
                </li>
              ))}
            </ul>
            <p>{subject}</p>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {message}
            </p>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={locked}
              onClick={() => setReview(false)}
            >
              {t.managerOperations.editReview}
            </button>
            <button
              className="btn"
              disabled={locked || !validSelection}
              onClick={send}
            >
              {l.send}
            </button>
          </>
        )}
        <MutationFeedback mutation={mutation} />
        {sentId && <p role="status">{t.wireStatus.SENT}</p>}
        {sentId && (
          <DeliveryStatus path={`/api/manager/notices/${sentId}`} receipt />
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
        {sentId && (
          <button
            className="btn btn--secondary"
            onClick={() => {
              setSentId("");
              setRecoveryKey("");
              setSubject("");
              setMessage("");
              setChosen({});
              setReview(false);
              mutation.reset();
              request.current = null;
              window.history.replaceState(null, "", window.location.pathname);
            }}
          >
            {l.newNotice}
          </button>
        )}
      </Card>
    </>
  );
}
