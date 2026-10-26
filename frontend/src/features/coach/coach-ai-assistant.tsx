"use client";

import { aiPlainText } from "@/lib/ai-plain-text";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/primitives";
import { api } from "@/lib/apiClient";
import styles from "./coach-ai-assistant.module.css";

type Reply = { interactionId: string; answer: string };
type Message = { role: "user" | "assistant"; content: string };
const SUGGESTIONS = [
  "What classes am I assigned to teach?",
  "Summarize my upcoming teaching sessions.",
  "How do I create a lesson plan for an assigned class?",
  "How do I update or delete one of my teaching records?",
];

export function CoachAiAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const previous = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading || q.length > 2000) return;
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setDraft("");
    setError("");
    setLoading(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await api.post<Reply>("/api/ai/chat", {
        question: q, previousInteractionId: previous.current,
      }, { signal: abort.signal });
      if (!abort.signal.aborted) {
        previous.current = response.interactionId;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: aiPlainText(response.answer),
          },
        ]);
      }
    } catch {
      if (!abort.signal.aborted) setError("The assistant is unavailable. Please retry.");
    } finally {
      if (controller.current === abort) { controller.current = null; setLoading(false); }
    }
  }

  return <>
    <div className={styles.launcher}>
      <button type="button" className={styles.launcherButton} aria-label="Open Coach AI Assistant"
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <Image src="/sporthub/mascot-wolf-full.png" alt="" width={112} height={168}
          className={styles.launcherMascot} aria-hidden="true" />
      </button>
    </div>
    {open && <Drawer title="Coach AI Assistant" nonModalDesktop onClose={() => setOpen(false)}
      footer={<form className={styles.form} onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
        <label className="field"><span>Message</span>
          <textarea value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <div className={styles.formActions}>
          <button type="button" className="btn btn--ghost" disabled={loading} onClick={() => {
            setMessages([]); previous.current = null; setError("");
          }}>New chat</button>
          <button type="submit" className="btn" disabled={loading || !draft.trim()}>Send</button>
        </div>
      </form>}>
      {messages.length === 0 && (<div className={styles.chatSuggestions}>
        {SUGGESTIONS.map((s) => <button className="btn btn--ghost" style={{display:"block",marginBottom:8}}
          key={s} type="button" onClick={() => void send(s)}>{s}</button>)}
      </div>)}
      <div aria-live="polite" className={styles.chatMessages}>
        {messages.map((m, i) => (
          <p key={i}>
            <strong>
              {m.role === "user" ? "You" : "Assistant"}:
            </strong>{" "}
            {m.role === "assistant"
              ? aiPlainText(m.content)
              : m.content}
          </p>
        ))}
      </div>
      {loading && <p role="status">Thinking…</p>}
      {error && <p role="alert">{error}</p>}
    </Drawer>}
  </>;
}
