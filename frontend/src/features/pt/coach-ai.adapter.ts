import { api } from "@/lib/apiClient";

import type { WorkoutPlanDto, WorkoutSuggestionDto } from "@/lib/types";

import type { AiDrawerAdapter } from "@/components/ai/ai-drawer.contract";

export interface CoachAiContext {
  memberId: string;
  sport?: "Gym" | "Badminton" | "Basketball";
}

export interface CoachAiExerciseDraft {
  exercise: string;
  sets: string;
  reps: string;
  notes: string;
}

export interface CoachAiPlanDraft {
  sport?: "Gym" | "Badminton" | "Basketball";
  memberId: string;
  memberName: string;
  goal: string;
  level: string;
  rationale: string;
  items: CoachAiExerciseDraft[];
}

export function fillExercisePrescription(
  item: CoachAiExerciseDraft,
): CoachAiExerciseDraft {
  const parsed = parseExercise(
    [item.exercise, item.notes].filter(Boolean).join(" · "),
  );
  return {
    ...item,
    sets: item.sets || parsed.sets,
    reps: item.reps || parsed.reps,
  };
}

function parseExercise(value: string): CoachAiExerciseDraft {
  const raw = value.trim();

  const match = raw.match(/(\d+)\s*[x×]\s*(\d+)/i);

  if (!match) {
    const timed = /phút|giây|minutes?|seconds?|\bmin\b/i.test(raw);
    return {
      exercise: raw,
      sets: timed ? "1" : "3",
      reps: timed ? "1" : "10",
      notes: timed
        ? "Mỗi lần thực hiện đủ thời lượng ghi trong tên bài tập."
        : "Số hiệp/lần lặp gợi ý mặc định cho dữ liệu cũ; coach điều chỉnh trước khi lưu.",
    };
  }

  const sets = match[1];

  const timed = /^\s*(giây|phút|seconds?|minutes?)/i.test(
    raw.slice((match.index ?? 0) + match[0].length),
  );
  const reps = timed ? "1" : match[2];

  const exercise = raw
    .replace(match[0], "")
    .replace(/[-–—·:]+$/, "")
    .trim();

  return {
    exercise: exercise || raw,
    sets,
    reps,
    notes: timed
      ? `Mỗi hiệp thực hiện ${match[2]} ${raw.slice((match.index ?? 0) + match[0].length).trim()}.`
      : "",
  };
}

export const coachAiAdapter: AiDrawerAdapter<
  CoachAiContext,
  WorkoutSuggestionDto,
  CoachAiPlanDraft
> = {
  id: "coach-workout-suggestion",

  generate(context, signal) {
    return api.post<WorkoutSuggestionDto>(
      `/api/ai/workout-suggestions/${context.memberId}`,
      undefined,
      {
        signal,
        query: { sport: context.sport ?? "Gym" },
      },
    );
  },

  toDraft(result) {
    return {
      memberId: result.memberId,
      sport: result.sport,

      memberName: result.memberName,

      goal: result.goal,

      level: result.level,

      rationale: result.rationale,

      items: result.items?.length
        ? result.items.map((item) => ({
            exercise: item.exercise,
            sets: String(item.sets),
            reps: String(item.reps),
            notes: item.notes ?? "",
          }))
        : result.exercises.map(parseExercise),
    };
  },
};

function requirePositiveInteger(value: string, field: string) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${field} must be a positive integer.`);
  }

  return number;
}

export function buildPlanRequest(draft: CoachAiPlanDraft) {
  if (!draft.memberId) {
    throw new Error("Missing member.");
  }

  if (draft.goal.trim().length < 3) {
    throw new Error("Goal must contain at least 3 characters.");
  }

  if (!draft.level.trim()) {
    throw new Error("Level is required.");
  }

  if (!draft.items.length) {
    throw new Error("At least one exercise is required.");
  }

  return {
    memberId: draft.memberId,

    goal: draft.goal.trim(),

    level: draft.level.trim(),

    items: draft.items.map((item, index) => {
      if (!item.exercise.trim()) {
        throw new Error(`Exercise ${index + 1} is required.`);
      }

      const sets = requirePositiveInteger(
        item.sets,
        `Sets for exercise ${index + 1}`,
      );

      const reps = requirePositiveInteger(
        item.reps,
        `Reps for exercise ${index + 1}`,
      );

      if (sets > 50) {
        throw new Error(`Sets for exercise ${index + 1} must not exceed 50.`);
      }

      if (reps > 500) {
        throw new Error(`Reps for exercise ${index + 1} must not exceed 500.`);
      }

      return {
        exercise: item.exercise.trim(),

        sets,

        reps,

        notes: item.notes.trim() || null,
      };
    }),
  };
}

export async function saveAiPlanDraft(draft: CoachAiPlanDraft) {
  return api.post<WorkoutPlanDto>(
    "/api/workout-plans",
    buildPlanRequest(draft),
  );
}

export async function activateAiPlan(planId: string) {
  return api.post<WorkoutPlanDto>(`/api/workout-plans/${planId}/activate`);
}
