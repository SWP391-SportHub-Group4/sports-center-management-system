"use client";

import { aiPlainText } from "@/lib/ai-plain-text";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/primitives";
import { api, ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { formatTime } from "@/lib/format";
import styles from "./assistant.module.css";
import chatStyles from "@/components/ai/chat-messages.module.css";

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

/** An upstream outage is not a misunderstanding of the user's question.
 * Never show a raw HTTP code as the assistant's answer or invent missing data.
 */
function chatFailure(cause: unknown, failed: string, question: string): string {
  const vi = /[À-ỹđĐ]/.test(question) ||
    /\b(cho toi|toi co|bao nhieu|trung tam|lich hoc|lop hoc|mon the thao|diem danh|cua toi|dang mo)\b/i.test(question);
  if (!(cause instanceof ApiError)) return vi
    ? "Tôi chưa thể xử lý câu hỏi này do lỗi kết nối. Vui lòng thử lại sau."
    : "I can't process that question because of a connection problem. Please try again later.";
  const { code, status } = cause;
  if (status === 401 || status === 403) return vi
    ? "Tôi không thể truy cập dữ liệu của tài khoản hiện tại. Vui lòng đăng nhập lại hoặc kiểm tra quyền truy cập."
    : "I can't access your account data. Please sign in again or check your permissions.";
  if (code === "ai_provider_rate_limited") return vi
    ? "Tôi chưa thể phân tích lúc này vì nhà cung cấp AI đang giới hạn số lượng yêu cầu. Vui lòng thử lại sau."
    : "I can't analyze this right now because the AI provider is rate limited. Please try again later.";
  if (code === "ai_provider_auth_failed" || code === "ai_model_unavailable") return vi
    ? "Tôi chưa thể trả lời vì cấu hình dịch vụ AI chưa khả dụng. Vui lòng liên hệ bộ phận hỗ trợ."
    : "I can't answer because the AI service configuration is unavailable. Please contact support.";
  if (status === 504 || code === "ai_service_timeout" || code === "ai_provider_timeout") return vi
    ? "Tôi chưa thể phân tích đầy đủ vì dịch vụ AI không phản hồi kịp thời. Tôi chưa có kết quả xác minh để trả lời chính xác."
    : "I can't finish this analysis because the AI service did not respond in time. I don't have a verified result to share.";
  if ([502, 503].includes(status) ||
      ["ai_service_error", "member_ai_answer_failed", "member_ai_answer_empty",
        "ai_provider_empty_answer", "ai_provider_unavailable", "member_gemini_data_hub_unavailable"].includes(code)) return vi
    ? "Tôi chưa thể phân tích yêu cầu này vì dịch vụ AI đang gặp sự cố. Tôi không muốn đưa ra thông tin chưa được xác minh. Vui lòng thử lại sau."
    : "I can't analyze this request because the AI service encountered a problem. I won't give an unverified answer. Please try again later.";
  return failed;
}

export function AssistantDrawer({ onClose, audience = "member" }: { onClose: () => void; audience?: "member" | "coach" }) {
  const { t } = useLanguage();
  const l = t.assistant;
  const coach = audience === "coach";
  const coachSuggestions = [
    "What are my assigned teaching sessions?",
    "How many support requests assigned to me are Done?",
    "Where do I submit an absence request?",
    "Which students are enrolled in my classes?",
  ];
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const previous = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

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

    if (record) {
      setTurns((all) => [
        ...all,
        {
          id: crypto.randomUUID(),
          from: "user",
          text,
          at: new Date().toISOString(),
        },
      ]);
    }

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
          text: aiPlainText(reply.answer),
          at: reply.createdAt,
        },
      ]);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(chatFailure(cause, l.failed, text));
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
      <p className={styles.intro}>{coach ? "Ask about assigned sessions, classes, students, absence requests and member support. Wolf reads authorized data and cannot change records." : l.intro}</p>
      {turns.length === 0 && (
        <section aria-label={l.suggestionsLabel}>
          <ul className={styles.chips}>
            {(coach ? coachSuggestions : l.suggestions).map((q) => (
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

      <ol className={chatStyles.thread} aria-live="polite">
        {turns.map((turn) => (
          <li key={turn.id} className={chatStyles.msg} data-from={turn.from}>
            <span className={chatStyles.who}>
              {turn.from === "user" ? l.you : l.assistantName} ·{" "}
              {formatTime(turn.at)}
            </span>
            <p className={chatStyles.bubble}>
              {turn.from === "assistant" ? aiPlainText(turn.text) : turn.text}
            </p>
          </li>
        ))}
        {busy && (
          <li className={chatStyles.msg} data-from="assistant">
            <span className={chatStyles.who}>{l.assistantName}</span>
            <p className={chatStyles.bubble} role="status">
              {l.thinking}
            </p>
          </li>
        )}
      </ol>

      {hasAnswer && !coach && (
        <p className={styles.links}>
          <span>{l.linksLabel}:</span>
          <Link href="/member/schedule">{l.linkSchedule}</Link>
          <Link href="/member/services">{l.linkServices}</Link>
          <Link href="/member/finance">{l.linkFinance}</Link>
        </p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
          {lastQuestion && !busy && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
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

/** Floating Member AI launcher. Restore the existing SportHub wolf mascot. */
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
          <Image
            src="/sporthub/mascot-wolf-full.png"
            alt=""
            width={112}
            height={168}
            className={styles.launcherMascot}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && <AssistantDrawer onClose={() => setOpen(false)} />}
    </>
  );
}
