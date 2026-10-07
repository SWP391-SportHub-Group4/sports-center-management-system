"use client";
import { pagedItems } from "@/lib/paged";
import { useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";
import { DeliveryStatus } from "./delivery-status";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { todayIso, addDaysIso } from "@/lib/format";
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
  const [savedId, setSentId] = useState(() => {
    if (typeof window === "undefined") return "";
    const id = new URLSearchParams(window.location.search).get("noticeId");
    return id && /^[0-9a-f-]{36}$/i.test(id) ? id : "";
  });
  const [recoveryKey, setRecoveryKey] = useState(() => {
    if (typeof window === "undefined") return "";
    const key = new URLSearchParams(window.location.search).get("noticeKey");
    return key && /^[0-9a-f-]{36}$/i.test(key) ? key : "";
  });
  const recovered = useApi(
    (signal) =>
      recoveryKey
        ? api.get<{ noticeId: string }>(
            `/api/manager/notices/by-key/${recoveryKey}`,
            { signal },
          )
        : Promise.resolve(null),
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
      setSentId(response.noticeId);
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
  function change() {
    setReview(false);
  }
  return (
    <>
      {recoveryKey && (
        <Card title={l.delivery}>
          <p>{l.noticeRecovery}</p>
          {recovered.error && <p role="alert">{recovered.error.message}</p>}
          <button className="btn btn--ghost" onClick={recovered.reload}>
            {l.refresh}
          </button>
        </Card>
      )}
      <Card title={l.recipients}>
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
                  change();
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
                  change();
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
                change();
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
                change();
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
                const allowed =
                  role === "MEMBER"
                    ? new Set(
                        entries
                          .filter(
                            (r) =>
                              ["CLASS_SESSION", "COURT_RENTAL"].includes(
                                r.sourceType,
                              ) &&
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
                          entries
                            .filter(
                              (r) => String(r.classId) === classId && r.coachId,
                            )
                            .map((r) => r.coachId!),
                        )
                      : null;
                const rows = pagedItems(data).filter(
                  (u) => !allowed || allowed.has(u.userId),
                );
                return (
                  <>
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
      </Card>
      <Card title={l.notices}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setReview(true);
          }}
        >
          <Field label={l.subject}>
            <input
              required
              minLength={3}
              maxLength={150}
              disabled={mutation.busy || !!sentId || uncertain}
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
              disabled={mutation.busy || !!sentId || uncertain}
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
              disabled={mutation.busy || !!sentId || uncertain}
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
              disabled={mutation.busy || !!sentId || uncertain}
              onChange={(e) => {
                setInApp(e.target.checked);
                change();
              }}
            />
            {l.sendInApp}
          </label>
          <button
            className="btn btn--secondary"
            disabled={
              !!sentId ||
              mutation.busy ||
              (recoveryKey !== "" && recovered.loading) ||
              uncertain ||
              !Object.keys(chosen).length ||
              (!sendEmail && !sendInApp)
            }
          >
            {l.review}
          </button>
        </form>
        <p>{l.noticeLimit}</p>
        {review && (
          <>
            <p>{l.recipientPreview}</p>
            <ul>
              {Object.entries(chosen).map(([id, u]) => (
                <li key={id}>
                  {u.name} · {u.email}
                  <button
                    className="btn btn--ghost"
                    disabled={mutation.busy || !!sentId || uncertain}
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
            <p style={{ whiteSpace: "pre-wrap" }}>{message}</p>
            <button
              className="btn"
              disabled={mutation.busy || !!sentId || uncertain}
              onClick={send}
            >
              {l.send}
            </button>
          </>
        )}
        <MutationFeedback mutation={mutation} />
        {sentId && <p role="status">{sentId}</p>}
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
