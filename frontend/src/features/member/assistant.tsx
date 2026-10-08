"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUrlQuery } from "@/lib/useUrlQuery";
import { useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/primitives";
import { IconSparkles } from "@/components/icons";
import { api, ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { formatDate, formatTime, todayIso } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { memberSchedule } from "./api";
import styles from "./assistant.module.css";

interface ChatReply {
  interactionId: string;
  answer: string;
  createdAt: string;
}
interface Turn {
  id: string;
  from: "user" | "assistant";
  text: string;
  at: string;
}

const MAX = 2000;

/**
 * Trợ lý hỏi đáp của Member (A18): chỉ đọc dữ liệu SportHub của chính mình, không thực hiện nghiệp vụ.
 * Câu trả lời là văn bản thuần (không render HTML). Có thể dừng khi đang chờ, thử lại khi lỗi, và mở cuộc trò chuyện mới.
 */
export function AssistantDrawer({ onClose }: { onClose: () => void }) {
  const { t, language } = useLanguage();
  const l = t.assistant;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const previous = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { values, setValues } = useUrlQuery({ date: "", event: "" });
  const requestedDate = pathname === "/member/schedule" ? values.date : null;
  const date =
    requestedDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    !Number.isNaN(Date.parse(`${requestedDate}T00:00:00Z`))
      ? requestedDate
      : todayIso();
  const schedule = useApi((signal) => memberSchedule(date, 1, signal), [date]);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [turns, busy]);

  async function ask(question: string, record = true) {
    const text = question.trim();
    if (!text || busy) return;
    if (text.length > MAX) {
      setError(l.tooLong);
      return;
    }
    setError(null);
    setLastQuestion(text);
    if (record)
      setTurns((all) => [
        ...all,
        {
          id: crypto.randomUUID(),
          from: "user",
          text,
          at: new Date().toISOString(),
        },
      ]);
    setDraft("");
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const reply = await api.post<ChatReply>(
        "/api/ai/chat",
        { question: text, previousInteractionId: previous.current },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      previous.current = reply.interactionId;
      setTurns((all) => [
        ...all,
        {
          id: crypto.randomUUID(),
          from: "assistant",
          text: reply.answer,
          at: reply.createdAt,
        },
      ]);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(
        cause instanceof ApiError &&
          (cause.status === 502 || cause.status === 503)
          ? l.unavailable
          : l.failed,
      );
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(false);
      }
    }
  }

  const hasAnswer = turns.some((turn) => turn.from === "assistant");

  return (
    <Drawer
      title={l.title}
      nonModalDesktop
      onClose={onClose}
      footer={
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
        >
          <label className="field">
            <span>{l.inputLabel}</span>
            <textarea
              value={draft}
              maxLength={MAX + 200}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(draft);
                }
              }}
            />
          </label>
          <div className={styles.formActions}>
            {turns.length > 0 && (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => {
                  setTurns([]);
                  previous.current = null;
                  setError(null);
                  setLastQuestion(null);
                }}
              >
                {l.newChat}
              </button>
            )}
            {busy ? (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  abort.current?.abort();
                  abort.current = null;
                  setBusy(false);
                }}
              >
                {l.stop}
              </button>
            ) : (
              <button type="submit" className="btn" disabled={!draft.trim()}>
                {l.send}
              </button>
            )}
          </div>
        </form>
      }
    >
      <p className={styles.intro}>{l.intro}</p>
      {pathname === "/member/schedule" && (
        <p className={styles.intro}>
          {language === "vi"
            ? "Bạn vẫn có thể thao tác trên lịch khi trò chuyện ở màn hình lớn."
            : "You can keep using your calendar while chatting on a large screen."}
        </p>
      )}
      {turns.length === 0 && (
        <section aria-label={l.suggestionsLabel}>
          <ul className={styles.chips}>
            {l.suggestions.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  className={styles.chip}
                  onClick={() => void ask(q)}
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ol className={styles.thread} aria-live="polite">
        {turns.map((turn) => (
          <li key={turn.id} className={styles.msg} data-from={turn.from}>
            <span className={styles.who}>
              {turn.from === "user" ? l.you : l.assistantName} ·{" "}
              {formatTime(turn.at)}
            </span>
            <p className={styles.bubble}>{turn.text}</p>
          </li>
        ))}
        {busy && (
          <li className={styles.msg} data-from="assistant">
            <span className={styles.who}>{l.assistantName}</span>
            <p className={styles.bubble} role="status">
              {l.thinking}
            </p>
          </li>
        )}
      </ol>
      {hasAnswer && (
        <p className={styles.links}>
          <span>{l.linksLabel}:</span>
          <Link href="/member/schedule">{l.linkSchedule}</Link>
          <Link href="/member/services">{l.linkServices}</Link>
          <Link href="/member/finance">{l.linkFinance}</Link>
        </p>
      )}
      {hasAnswer && (
        <section
          className={styles.scheduleLinks}
          aria-label={
            language === "vi" ? "Lịch từ hệ thống" : "Schedule from SportHub"
          }
        >
          <h3>
            {language === "vi" ? "Lịch từ hệ thống" : "Schedule from SportHub"}{" "}
            · {formatDate(date)}
          </h3>
          <p className={styles.intro}>
            {language === "vi"
              ? "Các buổi được tải trực tiếp từ lịch của bạn, độc lập với câu trả lời AI."
              : "Sessions loaded directly from your calendar, independently of the AI answer."}
          </p>
          {schedule.loading ? (
            <p role="status">{t.common.loading}</p>
          ) : schedule.error ? (
            <button className="btn btn--secondary" onClick={schedule.reload}>
              {l.retry}
            </button>
          ) : !schedule.data?.length ? (
            <p>{t.common.noData}</p>
          ) : (
            <ul className={styles.chips}>
              {schedule.data.map((event) => (
                <li key={event.id}>
                  <Link
                    onClick={(click) => {
                      if (pathname === "/member/schedule") {
                        click.preventDefault();
                        setValues({ date, event: event.id });
                      }
                      onClose();
                    }}
                    href={`/member/schedule?date=${date}&event=${encodeURIComponent(event.id)}`}
                  >
                    {formatTime(event.startAtUtc)} · {event.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}{" "}
          {lastQuestion && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => void ask(lastQuestion, false)}
            >
              {l.retry}
            </button>
          )}
        </p>
      )}
      <div ref={end} />
    </Drawer>
  );
}

/** Nút mở trợ lý cố định trong MemberFrame, giữ trạng thái qua các trang Member. */
export function AssistantButton() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={styles.launcher}>
        <button
          type="button"
          className={styles.launcherButton}
          aria-label={t.assistant.open}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={t.assistant.open}
          onClick={() => setOpen(true)}
        >
          <IconSparkles size={22} aria-hidden="true" />
          <span aria-hidden="true">AI</span>
        </button>
      </div>
      {open && <AssistantDrawer onClose={() => setOpen(false)} />}
    </>
  );
}
