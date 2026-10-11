"use client";

import { useEffect, useRef, useState } from "react";

import { Drawer } from "@/components/primitives";

import { Feedback, Field } from "@/components/ui";

import { useLanguage } from "@/lib/language";

import {
  activateAiPlan,
  coachAiAdapter,
  saveAiPlanDraft,
  fillExercisePrescription,
  type CoachAiPlanDraft,
} from "./coach-ai.adapter";

function storageKey(memberId: string) {
  return `sporthub:coach-ai-draft:${memberId}`;
}

function readDraft(memberId: string): CoachAiPlanDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey(memberId));

    if (!raw) {
      return null;
    }

    const saved = JSON.parse(raw) as CoachAiPlanDraft;
    return { ...saved, items: saved.items.map(fillExercisePrescription) };
  } catch {
    return null;
  }
}

export function CoachAiDrawer({
  memberId,
  onClose,
  onSaved,
  embedded = false,
}: {
  memberId: string;
  onClose: () => void;
  onSaved: () => void;
  embedded?: boolean;
}) {
  const { language } = useLanguage();

  const isEn = language === "en";

  const [draft, setDraft] = useState<CoachAiPlanDraft | null>(() =>
    readDraft(memberId),
  );

  const [busy, setBusy] = useState(false);
  const [sport, setSport] = useState<"Gym" | "Badminton" | "Basketball">(
    draft?.sport ?? "Gym",
  );

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);

  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!draft) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        storageKey(memberId),
        JSON.stringify(draft),
      );
    } catch {
      // sessionStorage unavailable:
      // keep current React state.
    }
  }, [draft, memberId]);

  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  function clearStoredDraft() {
    try {
      window.sessionStorage.removeItem(storageKey(memberId));
    } catch {
      // Ignore storage failure.
    }
  }

  async function generate() {
    abort.current?.abort();

    const controller = new AbortController();

    abort.current = controller;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await coachAiAdapter.generate(
        {
          memberId,
          sport,
        },
        controller.signal,
      );

      if (controller.signal.aborted) {
        return;
      }

      const next = coachAiAdapter.toDraft(result);

      setDraft(next);
    } catch (cause) {
      if (controller.signal.aborted) {
        return;
      }

      setError(
        cause instanceof Error
          ? cause.message
          : isEn
            ? "Unable to generate an AI suggestion."
            : "Không thể tạo gợi ý AI.",
      );
    } finally {
      if (abort.current === controller) {
        abort.current = null;

        setBusy(false);
      }
    }
  }

  function cancelGenerate() {
    abort.current?.abort();

    abort.current = null;

    setBusy(false);
  }

  function updateDraft(patch: Partial<CoachAiPlanDraft>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            ...patch,
          }
        : current,
    );
  }

  function updateItem(
    index: number,
    patch: Partial<CoachAiPlanDraft["items"][number]>,
  ) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,

        items: current.items.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                ...patch,
              }
            : item,
        ),
      };
    });
  }

  function removeItem(index: number) {
    setDraft((current) => {
      if (!current || current.items.length <= 1) {
        return current;
      }

      return {
        ...current,

        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  }

  function addItem() {
    setDraft((current) =>
      current
        ? {
            ...current,

            items: [
              ...current.items,
              {
                exercise: "",
                sets: "3",
                reps: "10",
                notes: "",
              },
            ],
          }
        : current,
    );
  }

  async function saveDraft() {
    if (!draft) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await saveAiPlanDraft(draft);

      setSuccess(
        isEn
          ? "Training plan saved as draft."
          : "Đã lưu kế hoạch dưới dạng bản nháp.",
      );

      clearStoredDraft();
      setDraft(null);

      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : isEn
            ? "Unable to save the draft."
            : "Không thể lưu bản nháp.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function applyPlan() {
    if (!draft) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const created = await saveAiPlanDraft(draft);

      try {
        await activateAiPlan(created.planId);
      } catch {
        clearStoredDraft();
        setDraft(null);
        onSaved();

        setError(
          isEn
            ? "The plan was saved as a draft, but activation failed. Review the saved draft and activate it manually."
            : "Kế hoạch đã được lưu thành bản nháp nhưng kích hoạt thất bại. Hãy kiểm tra bản nháp đã lưu và kích hoạt thủ công.",
        );

        return;
      }

      clearStoredDraft();
      setDraft(null);

      setSuccess(
        isEn
          ? "Training plan saved and activated."
          : "Đã lưu và áp dụng kế hoạch tập.",
      );

      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : isEn
            ? "Unable to apply the plan."
            : "Không thể áp dụng kế hoạch.",
      );
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="btn-row">
      <button
        type="button"
        className="btn btn--ghost"
        disabled={saving}
        onClick={onClose}
      >
        {isEn ? "Close" : "Đóng"}
      </button>

      {busy ? (
        <button
          type="button"
          className="btn btn--secondary"
          onClick={cancelGenerate}
        >
          {isEn ? "Cancel generation" : "Hủy tạo gợi ý"}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--secondary"
          disabled={saving}
          onClick={() => void generate()}
        >
          {draft
            ? isEn
              ? "Generate again"
              : "Tạo lại gợi ý"
            : isEn
              ? "Generate suggestion"
              : "Tạo gợi ý AI"}
        </button>
      )}

      <button
        type="button"
        className="btn btn--secondary"
        disabled={!draft || busy || saving}
        onClick={() => void saveDraft()}
      >
        {saving
          ? isEn
            ? "Saving..."
            : "Đang lưu..."
          : isEn
            ? "Save draft"
            : "Lưu nháp"}
      </button>

      <button
        type="button"
        className="btn"
        disabled={!draft || busy || saving}
        onClick={() => void applyPlan()}
      >
        {isEn ? "Apply plan" : "Áp dụng"}
      </button>
    </div>
  );
  const content = (
    <div className="stack">
      <Field label={isEn ? "Discipline" : "Bộ môn"}>
        <select
          value={sport}
          disabled={busy || saving}
          onChange={(event) => {
            setSport(event.target.value as typeof sport);
            setDraft(null);
            clearStoredDraft();
            setError(null);
            setSuccess(null);
          }}
        >
          <option value="Gym">Gym / PT</option>
          <option value="Badminton">{isEn ? "Badminton" : "Cầu lông"}</option>
          <option value="Basketball">{isEn ? "Basketball" : "Bóng rổ"}</option>
        </select>
      </Field>
      <p className="muted">
        {isEn
          ? "AI output is a coaching reference. Review exercises, sets and reps before saving."
          : "Kết quả AI chỉ là gợi ý tham khảo. Coach phải kiểm tra bài tập, số hiệp và số lần lặp trước khi lưu."}
      </p>

      {busy && (
        <p role="status">
          {isEn
            ? "Analyzing member profile and the latest 30-day training history..."
            : "Đang phân tích hồ sơ hội viên và lịch sử tập luyện 30 ngày gần nhất..."}
        </p>
      )}

      <Feedback error={error} success={success} />

      {!draft && !busy && (
        <p className="muted">
          {isEn
            ? "No AI suggestion has been generated yet."
            : "Chưa có gợi ý AI. Nhấn “Tạo gợi ý AI” để bắt đầu."}
        </p>
      )}

      {draft && (
        <>
          <div className="card">
            <strong>{draft.memberName}</strong>
          </div>

          <Field label={isEn ? "Goal" : "Mục tiêu"}>
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={draft.goal}
              onChange={(event) =>
                updateDraft({
                  goal: event.target.value,
                })
              }
            />
          </Field>

          <Field label={isEn ? "Level" : "Trình độ"}>
            <input
              required
              maxLength={50}
              value={draft.level}
              onChange={(event) =>
                updateDraft({
                  level: event.target.value,
                })
              }
            />
          </Field>

          <section>
            <h3>{isEn ? "AI rationale" : "Giải thích của AI"}</h3>

            <p>{draft.rationale || "—"}</p>
          </section>

          <section className="stack">
            <h3>{isEn ? "Exercises" : "Bài tập"}</h3>

            {draft.items.map((item, index) => (
              <fieldset key={index}>
                <legend>
                  {isEn ? `Exercise ${index + 1}` : `Bài tập ${index + 1}`}
                </legend>

                <Field label={isEn ? "Exercise" : "Tên bài tập"}>
                  <input
                    required
                    maxLength={200}
                    value={item.exercise}
                    onChange={(event) =>
                      updateItem(index, {
                        exercise: event.target.value,
                      })
                    }
                  />
                </Field>

                <div className="form-grid">
                  <Field label={isEn ? "Sets" : "Hiệp"}>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      step={1}
                      value={item.sets}
                      onChange={(event) =>
                        updateItem(index, {
                          sets: event.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field label={isEn ? "Reps" : "Lần lặp"}>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      step={1}
                      value={item.reps}
                      onChange={(event) =>
                        updateItem(index, {
                          reps: event.target.value,
                        })
                      }
                    />
                  </Field>
                </div>

                {(!item.sets || !item.reps) && (
                  <p className="muted" role="status">
                    {isEn
                      ? "AI did not provide a reliable sets/reps pair. Review and enter these values before saving."
                      : "AI chưa cung cấp số hiệp/lần lặp đủ rõ. Coach cần kiểm tra và nhập trước khi lưu."}
                  </p>
                )}

                <Field label={isEn ? "Notes" : "Ghi chú"}>
                  <input
                    maxLength={500}
                    value={item.notes}
                    onChange={(event) =>
                      updateItem(index, {
                        notes: event.target.value,
                      })
                    }
                  />
                </Field>

                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={draft.items.length === 1}
                  onClick={() => removeItem(index)}
                >
                  {isEn ? "Remove" : "Bỏ bài tập"}
                </button>
              </fieldset>
            ))}

            <button
              type="button"
              className="btn btn--secondary"
              onClick={addItem}
            >
              {isEn ? "Add exercise" : "Thêm bài tập"}
            </button>
          </section>
        </>
      )}
    </div>
  );

  if (embedded) {
    return (
      <section
        className="stack"
        aria-label={
          isEn ? "AI Training Plan Suggestion" : "AI gợi ý kế hoạch tập"
        }
      >
        <h3>
          {isEn ? "AI Training Plan Suggestion" : "AI gợi ý kế hoạch tập"}
        </h3>
        {content}
        {footer}
      </section>
    );
  }
  return (
    <Drawer
      title={isEn ? "AI Training Plan Suggestion" : "AI gợi ý kế hoạch tập"}
      description={
        isEn
          ? "Generate a suggestion, review every field, then save it as a draft or activate it."
          : "Tạo gợi ý, kiểm tra/chỉnh sửa toàn bộ nội dung rồi lưu nháp hoặc áp dụng."
      }
      size="lg"
      nonModalDesktop
      onClose={onClose}
      footer={footer}
    >
      {content}
    </Drawer>
  );
}
