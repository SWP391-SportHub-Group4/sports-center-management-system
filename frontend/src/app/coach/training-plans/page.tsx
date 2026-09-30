"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Feedback, Field, Table } from "@/components/ui";
import {
  IconCalendar,
  IconClipboard,
  IconClose,
  IconDumbbell,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconTarget,
  IconUser,
  StickerTrainingEmpty,
} from "@/components/icons";
import { api } from "@/lib/apiClient";
import { formatDateTime, label } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { CoachMemberRelationshipDto, WorkoutPlanDto } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import styles from "../coach.module.css";

interface ItemDraft {
  exercise: string;
  sets: string;
  reps: string;
  notes: string;
}

const EMPTY_ITEM: ItemDraft = {
  exercise: "",
  sets: "3",
  reps: "12",
  notes: "",
};

/**
 * Soạn kế hoạch tập — BR-23: chỉ HLV đang có quan hệ huấn luyện HOẠT ĐỘNG với hội viên mới
 * lập được. Danh sách hội viên ở dropdown lấy đúng từ các quan hệ đó, nên không có đường
 * chọn nhầm người ngoài phạm vi phụ trách.
 */
function CoachPlansPageContent() {
  const initialMemberId = useSearchParams().get("memberId") || "";
  return (
    <CoachPlansContent key={initialMemberId} initialMemberId={initialMemberId} />
  );
}

export default function CoachPlansPage() {
  return (
    <Suspense fallback={<div role="status">Đang tải…</div>}>
      <CoachPlansPageContent />
    </Suspense>
  );
}

function CoachPlansContent({ initialMemberId }: { initialMemberId: string }) {
  const { language } = useLanguage();
  const isEn = language === "en";

  const [memberId, setMemberId] = useState(initialMemberId);
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [items, setItems] = useState<ItemDraft[]>([{ ...EMPTY_ITEM }]);
  const [searchQuery, setSearchQuery] = useState("");
  const action = useAction();

  const relationships = useApi(
    (signal) =>
      api.get<CoachMemberRelationshipDto[]>("/api/coach-member-relationships", {
        signal,
        query: { activeOnly: true },
      }),
    [],
  );

  const plans = useApi(
    (signal) =>
      api.get<WorkoutPlanDto[]>("/api/coaches/me/workout-plans", {
        signal,
        query: { memberId: memberId || undefined },
      }),
    [memberId],
  );

  const updateItem = (index: number, patch: Partial<ItemDraft>) =>
    setItems((current) =>
      current.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const done = await action.run(
      () =>
        api.post("/api/workout-plans", {
          memberId,
          goal: goal.trim(),
          level,
          items: items
            .filter((item) => item.exercise.trim().length > 0)
            .map((item) => ({
              exercise: item.exercise.trim(),
              sets: Number(item.sets),
              reps: Number(item.reps),
              notes: item.notes.trim() || null,
            })),
        }),
      isEn
        ? "Workout plan saved and activated successfully for member."
        : "Đã lưu kế hoạch tập luyện cho học viên thành công.",
    );

    if (done !== null) {
      setGoal("");
      setItems([{ ...EMPTY_ITEM }]);
      plans.reload();
    }
  };

  const selectedMember = (relationships.data ?? []).find(
    (item) => item.memberId === memberId,
  );

  return (
    <AppShell
      title={isEn ? "Training & Workout Plans" : "Kế hoạch & Giáo án tập luyện"}
      description={
        isEn
          ? "Build personalized workout regimens for your assigned members (BR-23)"
          : "Xây dựng lộ trình tập luyện cá nhân hóa cho học viên bạn đang phụ trách (BR-23)"
      }
      allow={["Coach"]}
      requireCoachCategory="PersonalTrainer"
    >
      <div className={styles.planWorkbench}>
        {/* Left Column: Plan Builder Studio */}
        <div className={styles.planBuilderCard}>
          <div className={styles.planBuilderHead}>
            <div>
              <h2 className={styles.planBuilderTitle}>
                <IconClipboard size={18} />
                <span>{isEn ? "Draft New Workout Routine" : "Soạn giáo án mới"}</span>
              </h2>
              <p className={styles.planBuilderHint}>
                {isEn
                  ? "Only applies to members with active coaching relationships assigned to you."
                  : "Chỉ áp dụng cho học viên đang có quan hệ huấn luyện tích cực với bạn."}
              </p>
            </div>

            {memberId && (
              <Link
                className="btn btn--secondary btn--sm"
                href={`/coach/ai-suggestions?memberId=${memberId}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <IconSparkles size={14} />
                <span>{isEn ? "AI Suggestions" : "Gợi ý AI"}</span>
              </Link>
            )}
          </div>

          <div className={styles.planBuilderBody}>
            <form className="form" onSubmit={submit}>
              <div className={styles.planFormInline}>
                <Field label={isEn ? "Assigned Member" : "Học viên phụ trách"}>
                  <select
                    value={memberId}
                    required
                    onChange={(event) => setMemberId(event.target.value)}
                  >
                    <option value="">{isEn ? "— Select assigned member —" : "— Chọn học viên phụ trách —"}</option>
                    {(relationships.data ?? []).map((item) => (
                      <option key={item.relationshipId} value={item.memberId}>
                        {item.memberName || item.memberEmail} ({item.sourceType === "Personal" ? "PT 1:1" : (isEn ? "Group Class" : "Lớp nhóm")})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={isEn ? "Level / Difficulty" : "Cấp độ / Trình độ"}>
                  <select
                    value={level}
                    onChange={(event) => setLevel(event.target.value)}
                  >
                    {["Beginner", "Intermediate", "Advanced"].map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={isEn ? "Routine Goal / Objective" : "Mục tiêu của kế hoạch"}>
                  <input
                    value={goal}
                    required
                    minLength={3}
                    placeholder={
                      isEn
                        ? "E.g., Increase spinal mobility and posture alignment in 4 weeks"
                        : "Ví dụ: Tăng độ dẻo dai cơ lưng và căn chỉnh tư thế trong 4 tuần"
                    }
                    onChange={(event) => setGoal(event.target.value)}
                  />
                </Field>
              </div>

              {selectedMember && (
                <div
                  style={{
                    background: "var(--ice)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "8px",
                    fontSize: "0.85rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <IconUser size={15} color="var(--navy)" />
                    <strong style={{ color: "var(--navy)" }}>{selectedMember.memberName || selectedMember.memberEmail}</strong>
                    <span className="muted">·</span>
                    <span className={`${styles.disciplineBadge} ${selectedMember.sourceType === "Personal" ? styles["disciplineBadge--pt"] : styles["disciplineBadge--yoga"]}`}>
                      {selectedMember.sourceType === "Personal" ? "Personal Training 1:1" : (isEn ? "Group Class" : "Lớp nhóm")}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Link
                      href={`/coach/members?memberId=${memberId}`}
                      className="btn btn--ghost btn--sm"
                      style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                    >
                      <IconTarget size={13} />
                      <span>{isEn ? "Trainee Profile" : "Hồ sơ thể trạng"}</span>
                    </Link>
                  </div>
                </div>
              )}

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h3 style={{ fontSize: "0.95rem", color: "var(--navy)", margin: 0, fontWeight: 700 }}>
                    {isEn ? "Movement Breakdown & Exercises" : "Danh mục bài tập & Động tác chi tiết"}
                  </h3>
                  <span className="small muted">
                    {items.length} {isEn ? (items.length === 1 ? "movement" : "movements") : "động tác"}
                  </span>
                </div>

                <div className={styles.exerciseDraftList}>
                  {items.map((item, index) => (
                    <div key={index} className={styles.exerciseDraftItem}>
                      <div className={styles.exerciseDraftHeader}>
                        <span className={styles.exerciseIndexBadge}>
                          <IconDumbbell size={12} />
                          <span>{isEn ? `Movement #${index + 1}` : `Động tác #${index + 1}`}</span>
                        </span>

                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={items.length === 1}
                          title={isEn ? "Remove movement" : "Xóa động tác này"}
                          onClick={() =>
                            setItems((current) =>
                              current.filter((_, i) => i !== index),
                            )
                          }
                          style={{ padding: "3px 8px", fontSize: "0.78rem" }}
                        >
                          <IconClose size={13} />
                          <span>{isEn ? "Remove" : "Xóa"}</span>
                        </button>
                      </div>

                      <div className={styles.exerciseDraftInputsGrid}>
                        <div>
                          <label className="small muted" style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
                            {isEn ? "Exercise Name / Movement" : "Tên bài tập / Động tác"}
                          </label>
                          <input
                            value={item.exercise}
                            placeholder={isEn ? "E.g., Barbell Squat, Downward Dog, Plank..." : "Ví dụ: Barbell Squat, Chó Úp Mặt, Plank..."}
                            style={{ width: "100%" }}
                            onChange={(event) =>
                              updateItem(index, { exercise: event.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className="small muted" style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
                            {isEn ? "Sets" : "Hiệp"}
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={item.sets}
                            style={{ textAlign: "center", width: "100%" }}
                            onChange={(event) =>
                              updateItem(index, { sets: event.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className="small muted" style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
                            {isEn ? "Reps" : "Lần"}
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={item.reps}
                            style={{ textAlign: "center", width: "100%" }}
                            onChange={(event) =>
                              updateItem(index, { reps: event.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className={styles.exerciseDraftNotesRow}>
                        <label className="small muted" style={{ fontWeight: 600 }}>
                          {isEn ? "Technical Notes & Breathing Cues" : "Lưu ý kỹ thuật & Nhịp thở"}
                        </label>
                        <input
                          value={item.notes}
                          placeholder={isEn ? "Form cues, joint angles, tempo, breathing rhythm..." : "Lưu ý kỹ thuật, góc khớp, nhịp hít thở..."}
                          onChange={(event) =>
                            updateItem(index, { notes: event.target.value })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() =>
                      setItems((current) => [...current, { ...EMPTY_ITEM }])
                    }
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <IconPlus size={14} />
                    <span>{isEn ? "Add Exercise" : "Thêm động tác mới"}</span>
                  </button>
                </div>
              </div>

              <Feedback error={action.error} success={action.success} />

              <div style={{ marginTop: "16px" }}>
                <button
                  type="submit"
                  className="btn"
                  disabled={
                    action.busy ||
                    !memberId ||
                    items.every((i) => !i.exercise.trim())
                  }
                >
                  {action.busy
                    ? (isEn ? "Saving Routine..." : "Đang lưu giáo án...")
                    : (isEn ? "Save & Activate Routine" : "Lưu & Kích hoạt giáo án")}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Active Member Plans Sidebar */}
        <div className={styles.planSidebar}>
          <div className={styles.planSidebarHead}>
            <h2 className={styles.planSidebarTitle}>
              <IconClipboard size={18} />
              <span>{isEn ? "Configured Workout Plans" : "Danh sách giáo án đã thiết lập"}</span>
            </h2>
            <span className={styles.planSidebarBadge}>
              {(plans.data ?? []).length} {isEn ? "plans" : "giáo án"}
            </span>
          </div>

          {(plans.data ?? []).length > 2 && (
            <div className={styles.searchBarWrapper} style={{ maxWidth: "100%", width: "100%", marginBottom: 4 }}>
              <IconSearch size={14} className={styles.searchBarIcon} />
              <input
                type="search"
                className={styles.searchBarInput}
                placeholder={isEn ? "Filter by member or goal..." : "Lọc theo học viên hoặc mục tiêu..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          <AsyncSection
            state={plans}
            emptyMessage={
              <div className={styles.emptyPlaceholder}>
                <StickerTrainingEmpty size={68} />
                <div className={styles.emptyPlaceholderTitle}>
                  {isEn ? "No workout plans created yet" : "Chưa có giáo án nào được thiết lập"}
                </div>
                <p className={styles.emptyPlaceholderDesc}>
                  {isEn
                    ? "Select a member and define a routine goal in the studio on the left to draft and activate a specialized workout plan (BR-23)."
                    : "Chọn học viên và điền mục tiêu ở khung biểu mẫu bên trái để bắt đầu soạn và kích hoạt giáo án tập luyện chuyên biệt (BR-23)."}
                </p>
              </div>
            }
            isEmpty={(data) => data.length === 0}
          >
            {(data) => {
              const filtered = data.filter((plan) => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return (
                  plan.memberName?.toLowerCase().includes(q) ||
                  plan.goal?.toLowerCase().includes(q)
                );
              });

              if (filtered.length === 0) {
                return (
                  <div className={styles.emptyPlaceholder} style={{ padding: "28px 16px" }}>
                    <p className="muted small">
                      {isEn ? "No workout plans match your search." : "Không tìm thấy giáo án nào phù hợp."}
                    </p>
                  </div>
                );
              }

              return (
                <div className="stack" style={{ gap: "14px" }}>
                  {filtered.map((plan) => {
                    const levelBadgeStyle =
                      plan.level === "Advanced"
                        ? styles["disciplineBadge--groupx"]
                        : plan.level === "Intermediate"
                          ? styles["disciplineBadge--pt"]
                          : styles["disciplineBadge--yoga"];

                    return (
                      <div key={plan.planId} className={styles.planCard}>
                        <div className={styles.planCardHead}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <strong style={{ fontSize: "0.98rem", color: "var(--navy)" }}>
                                {plan.memberName}
                              </strong>
                              <span className={`${styles.disciplineBadge} ${levelBadgeStyle}`}>
                                <IconDumbbell size={11} /> {label(plan.level)}
                              </span>
                              <span className={styles.planItemCountBadge}>
                                {plan.items.length} {isEn ? "items" : "bài"}
                              </span>
                            </div>
                            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--navy)", marginTop: 4 }}>
                              {plan.goal}
                            </div>
                            <div className="small muted" style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "3px" }}>
                              <IconCalendar size={12} />
                              <span>{isEn ? "Created" : "Khởi tạo"}: {formatDateTime(plan.createdAt)}</span>
                            </div>
                          </div>

                          <Link
                            className="btn btn--sm btn--ghost"
                            href={`/coach/ai-suggestions?memberId=${plan.memberId}`}
                            title={isEn ? "AI Routine Suggestions" : "Gợi ý AI"}
                            style={{ padding: "4px 8px" }}
                          >
                            <IconSparkles size={13} />
                            <span>{isEn ? "AI" : "AI"}</span>
                          </Link>
                        </div>

                        <div style={{ padding: "10px 14px" }}>
                          <Table
                            headers={[
                              isEn ? "Movement" : "Động tác",
                              { text: isEn ? "Sets" : "Hiệp", numeric: true },
                              { text: isEn ? "Reps" : "Lần", numeric: true },
                            ]}
                          >
                            {plan.items.map((item) => (
                              <tr key={item.itemId}>
                                <td style={{ fontWeight: 600, fontSize: "0.84rem" }}>
                                  <div>{item.exercise}</div>
                                  {item.notes && (
                                    <div className="small muted" style={{ fontWeight: 400, marginTop: 2, fontSize: "0.78rem" }}>
                                      {item.notes}
                                    </div>
                                  )}
                                </td>
                                <td className="num" style={{ fontSize: "0.84rem" }}>{item.sets}</td>
                                <td className="num" style={{ fontSize: "0.84rem" }}>{item.reps}</td>
                              </tr>
                            ))}
                          </Table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          </AsyncSection>
        </div>
      </div>
    </AppShell>
  );
}
