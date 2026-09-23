"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Feedback, Field, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime, label } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { CoachMemberRelationshipDto, WorkoutPlanDto } from "@/lib/types";

interface ItemDraft {
  exercise: string;
  sets: string;
  reps: string;
  notes: string;
}

const EMPTY_ITEM: ItemDraft = { exercise: "", sets: "3", reps: "12", notes: "" };

/**
 * Soạn kế hoạch tập — BR-23: chỉ HLV đang có quan hệ huấn luyện HOẠT ĐỘNG với hội viên mới
 * lập được. Danh sách hội viên ở dropdown lấy đúng từ các quan hệ đó, nên không có đường
 * chọn nhầm người ngoài phạm vi phụ trách.
 */
export default function CoachPlansPage() {
  const [memberId, setMemberId] = useState("");
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [items, setItems] = useState<ItemDraft[]>([{ ...EMPTY_ITEM }]);
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
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
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
      "Đã tạo kế hoạch tập cho hội viên.",
    );

    if (done !== null) {
      setGoal("");
      setItems([{ ...EMPTY_ITEM }]);
      plans.reload();
    }
  };

  return (
    <AppShell
      title="Kế hoạch tập luyện"
      description="Soạn giáo án cho hội viên bạn đang phụ trách (BR-23)"
      allow={["Coach"]}
    >
      <Card title="Tạo kế hoạch mới">
        <form className="form" onSubmit={submit}>
          <div className="form form--inline">
            <Field label="Hội viên">
              <select
                value={memberId}
                required
                onChange={(event) => setMemberId(event.target.value)}
              >
                <option value="">— Chọn hội viên —</option>
                {(relationships.data ?? []).map((item) => (
                  <option key={item.relationshipId} value={item.memberId}>
                    {item.memberName || item.memberEmail}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Trình độ">
              <select value={level} onChange={(event) => setLevel(event.target.value)}>
                {["Beginner", "Intermediate", "Advanced"].map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Mục tiêu của kế hoạch">
            <input
              value={goal}
              required
              minLength={3}
              placeholder="Ví dụ: tăng sức bền nền trong 6 tuần"
              onChange={(event) => setGoal(event.target.value)}
            />
          </Field>

          <div>
            <h3>Bài tập</h3>
            <Table
              headers={[
                "Bài tập",
                { text: "Hiệp", numeric: true },
                { text: "Số lần", numeric: true },
                "Ghi chú",
                "",
              ]}
            >
              {items.map((item, index) => (
                <tr key={index}>
                  <td>
                    <input
                      value={item.exercise}
                      placeholder="Tên bài tập"
                      onChange={(event) =>
                        updateItem(index, { exercise: event.target.value })
                      }
                    />
                  </td>
                  <td className="num" style={{ width: 90 }}>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={item.sets}
                      onChange={(event) => updateItem(index, { sets: event.target.value })}
                    />
                  </td>
                  <td className="num" style={{ width: 100 }}>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={item.reps}
                      onChange={(event) => updateItem(index, { reps: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={item.notes}
                      onChange={(event) => updateItem(index, { notes: event.target.value })}
                    />
                  </td>
                  <td className="right">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={items.length === 1}
                      onClick={() =>
                        setItems((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </Table>

            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}
              >
                Thêm bài tập
              </button>
            </div>
          </div>

          <Feedback error={action.error} success={action.success} />

          <div>
            <button
              type="submit"
              className="btn"
              disabled={action.busy || !memberId || items.every((i) => !i.exercise.trim())}
            >
              {action.busy ? "Đang lưu…" : "Tạo kế hoạch"}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Kế hoạch đã lập">
        <AsyncSection
          state={plans}
          emptyMessage="Bạn chưa lập kế hoạch nào."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <div className="stack">
              {data.map((plan) => (
                <div key={plan.planId} className="card">
                  <div className="card__head">
                    <div>
                      <h3>
                        {plan.memberName} — {plan.goal}
                      </h3>
                      <p className="card__hint">
                        Trình độ {label(plan.level)} · lập {formatDateTime(plan.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Table
                    headers={[
                      "Bài tập",
                      { text: "Hiệp", numeric: true },
                      { text: "Số lần", numeric: true },
                      "Ghi chú",
                    ]}
                  >
                    {plan.items.map((item) => (
                      <tr key={item.itemId}>
                        <td>{item.exercise}</td>
                        <td className="num">{item.sets}</td>
                        <td className="num">{item.reps}</td>
                        <td className="small muted">{item.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              ))}
            </div>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}
