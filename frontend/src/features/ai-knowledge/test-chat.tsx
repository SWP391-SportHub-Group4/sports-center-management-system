"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, RotateCcw, Send } from "lucide-react";
import { Drawer } from "@/components/primitives";
import { api, ApiError } from "@/lib/apiClient";
import { aiPlainText } from "@/lib/ai-plain-text";
import memberChat from "@/components/ai/chat-messages.module.css";
import type { Article, Content } from "./service";
import s from "./test-chat.module.css";

type Mode = "Member" | "Coach";
type Message = { role: "user" | "assistant"; text: string };
type Reply = {
  conversationId: string;
  answer: string;
  role: Mode;
  provider: string;
  model: string;
  responseTimeMs: number;
  contextSources: string[];
};
type Conversation = {
  messages: Message[];
  draft: string;
  promptSnapshot?: string;
  conversationId?: string;
  failedQuestion?: string;
  error?: string;
  restartRequired?: boolean;
};
const empty = (): Conversation => ({ messages: [], draft: "" });

export function PromptTestChat({
  form,
  onClose,
}: {
  form: Content;
  article?: Article;
  articles: Article[];
  dirty: boolean;
  onClose: () => void;
}) {
  const initial: Mode = form.audience === "Coach" ? "Coach" : "Member";
  const [mode, setMode] = useState<Mode>(initial);
  const [conversations, setConversations] = useState<
    Record<Mode, Conversation>
  >({ Member: empty(), Coach: empty() });
  const [busy, setBusy] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const controller = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const locked = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const [published, setPublished] = useState<
    Partial<Record<Mode, { content: string; version: string }>>
  >({});
  const [sourceError, setSourceError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void api
      .get<Record<Mode, { content: string; version: string }>>(
        "/api/ai/system-prompts/current",
        { signal: abort.signal },
      )
      .then(setPublished)
      .catch(() => {
        if (!abort.signal.aborted)
          setSourceError(
            "Unable to load the published prompt. Close the chat and retry.",
          );
      });
    return () => abort.abort();
  }, []);
  const session = conversations[mode];
  const currentEditor = form.audience === mode || form.audience === "Both";
  const backendPrompt = published[mode];
  // Test the complete published prompt, with the current category's draft as a final override.
  // The real chat uses only published sections, not this draft preview.
  const prompt = backendPrompt?.content
    ? currentEditor && form.content.trim()
      ? `${backendPrompt.content}\n\n=== TEST OVERRIDE ${form.category.toUpperCase()} ===\n${form.content}`
      : backendPrompt.content
    : currentEditor ? form.content : "";
  const source = currentEditor ? "Published sections + editor preview" : "Published combined prompt";
  const changed =
    session.promptSnapshot !== undefined && session.promptSnapshot !== prompt;
  const promptError = !prompt.trim()
    ? "Enter prompt content in the editor before testing."
    : prompt.length > 120000
      ? "The assembled prompt exceeds 120,000 characters. Shorten its categories."
      : "";
  const cannotSend =
    changed ||
    session.restartRequired ||
    !prompt.trim() ||
    prompt.length > 120000;

  useEffect(
    () => () => {
      controller.current?.abort();
      requestNumber.current += 1;
    },
    [],
  );
  useEffect(() => {
    const viewport = end.current?.closest(".drawer__body");
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [mode, session.messages.length, busy, session.error]);

  function cancelPending() {
    controller.current?.abort();
    controller.current = null;
    requestNumber.current += 1;
    locked.current = false;
    setBusy(false);
    setPendingQuestion("");
  }
  function selectMode(next: Mode) {
    if (next === mode) return;
    if (pendingQuestion)
      setConversations((prev) => ({
        ...prev,
        [mode]: { ...prev[mode], draft: pendingQuestion },
      }));
    cancelPending();
    setMode(next);
  }
  function restart() {
    cancelPending();
    setConversations((prev) => ({ ...prev, [mode]: empty() }));
  }
  async function send(text: string) {
    const question = text.trim();
    if (locked.current || cannotSend || !question || question.length > 2000)
      return;
    locked.current = true;
    const abort = new AbortController();
    controller.current = abort;
    const number = ++requestNumber.current;
    const activeMode = mode;
    setBusy(true);
    setPendingQuestion(question);
    setConversations((prev) => ({
      ...prev,
      [activeMode]: {
        ...prev[activeMode],
        draft: "",
        error: undefined,
        failedQuestion: undefined,
        promptSnapshot: prompt,
      },
    }));
    try {
      const reply = await api.post<Reply>(
        "/api/ai/prompts/test-chat",
        {
          role: activeMode,
          systemPrompt: prompt,
          question,
          conversationId: session.conversationId ?? null,
        },
        { signal: abort.signal },
      );
      if (abort.signal.aborted || requestNumber.current !== number) return;
      setConversations((prev) => ({
        ...prev,
        [activeMode]: {
          ...prev[activeMode],
          conversationId: reply.conversationId,
          messages: [
            ...prev[activeMode].messages,
            { role: "user", text: question },
            { role: "assistant", text: aiPlainText(reply.answer) },
          ],
        },
      }));
    } catch (error) {
      if (abort.signal.aborted || requestNumber.current !== number) return;
      const restartRequired =
        error instanceof ApiError &&
        error.code === "prompt_test_restart_required";
      setConversations((prev) => ({
        ...prev,
        [activeMode]: {
          ...prev[activeMode],
          failedQuestion: question,
          error:
            error instanceof ApiError
              ? error.message
              : "The AI is unavailable. Retry your message.",
          restartRequired,
        },
      }));
    } finally {
      if (requestNumber.current === number) {
        locked.current = false;
        controller.current = null;
        setBusy(false);
        setPendingQuestion("");
      }
    }
  }
  const suggestions =
    mode === "Member"
      ? [
          "What is on my demo schedule today?",
          "When does my demo membership expire?",
        ]
      : [
          "Which demo class am I teaching today?",
          "Draft a warm-up for my demo badminton class.",
        ];

  return (
    <Drawer
      title="Prompt test chat"
      description="Test mode — changes are not published"
      nonModalDesktop
      onClose={onClose}
      footer={
        <form
          className={s.composer}
          onSubmit={(event) => {
            event.preventDefault();
            void send(session.draft);
          }}
        >
          <label htmlFor="prompt-test-message">Message</label>
          <textarea
            id="prompt-test-message"
            rows={3}
            maxLength={2000}
            value={session.draft}
            disabled={busy || cannotSend}
            onChange={(event) =>
              setConversations((prev) => ({
                ...prev,
                [mode]: { ...prev[mode], draft: event.target.value },
              }))
            }
            placeholder={
              promptError
                ? "Update the prompt in the editor to continue"
                : cannotSend
                  ? "Start a new conversation to continue"
                  : "Ask a question to test this prompt…"
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send(session.draft);
              }
            }}
          />
          <div className={s.actions}>
            <span>
              {session.draft.length}/2,000 · Shift+Enter for a new line
            </span>
            <button
              className="btn"
              type="submit"
              disabled={busy || cannotSend || !session.draft.trim()}
            >
              <Send size={16} aria-hidden="true" />
              {busy ? "Thinking…" : "Send"}
            </button>
          </div>
        </form>
      }
    >
      <div className={s.toolbar}>
        <div className={s.modes} role="group" aria-label="Test role">
          {(["Member", "Coach"] as const).map((role) => (
            <button
              key={role}
              type="button"
              aria-pressed={mode === role}
              onClick={() => selectMode(role)}
            >
              {role}
            </button>
          ))}
        </div>
        <button type="button" className={s.restart} onClick={restart}>
          <RotateCcw size={15} aria-hidden="true" />
          New conversation
        </button>
      </div>
      <div className={s.scope}>
        <strong>{mode} mode</strong>
        <span>{source}</span>
        <p>
          Synthetic demo data only. No real accounts or center records are used.
          AI replies are real when the provider is configured.
        </p>
      </div>
      {sourceError && !currentEditor && (
        <p className={s.error} role="alert">
          {sourceError}
        </p>
      )}
      {changed && (
        <div className={s.warning} role="status">
          Prompt changed — start a new conversation to test this version.
        </div>
      )}
      {promptError && (
        <p className={s.error} role="alert">
          {promptError}
        </p>
      )}
      {!session.messages.length && !busy && (
        <div className={s.welcome}>
          <Bot size={28} aria-hidden="true" />
          <h3>Try your {mode.toLowerCase()} prompt</h3>
          <p>
            Ask a question, then follow up to test how the conversation behaves.
          </p>
          <div className={s.suggestions}>
            {suggestions.map((question) => (
              <button
                key={question}
                type="button"
                disabled={!!cannotSend}
                onClick={() => void send(question)}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}
      <ol
        className={memberChat.thread}
        role="log"
        aria-live="polite"
        aria-label={`${mode} test conversation`}
      >
        {session.messages.map((message, index) => (
          <li className={memberChat.msg} data-from={message.role} key={index}>
            <span className={memberChat.who}>
              {message.role === "user" ? "You" : `${mode} assistant`}
            </span>
            <p className={memberChat.bubble}>{message.text}</p>
          </li>
        ))}
        {(busy || session.failedQuestion) && (
          <li className={memberChat.msg} data-from="user">
            <span className={memberChat.who}>You</span>
            <p className={memberChat.bubble}>
              {pendingQuestion || session.failedQuestion}
            </p>
          </li>
        )}
      </ol>
      {busy && (
        <p className={s.thinking} role="status">
          Thinking…
        </p>
      )}
      {session.error && (
        <div className={s.error} role="alert">
          <p>{session.error}</p>
          {!cannotSend && session.failedQuestion && (
            <button
              className="btn btn--ghost"
              type="button"
              disabled={busy}
              onClick={() => void send(session.failedQuestion!)}
            >
              Retry message
            </button>
          )}
          {session.restartRequired && (
            <button className="btn btn--ghost" type="button" onClick={restart}>
              Start new conversation
            </button>
          )}
        </div>
      )}
      <div ref={end} />
    </Drawer>
  );
}
