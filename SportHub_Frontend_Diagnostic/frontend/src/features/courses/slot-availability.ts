import { api } from "@/lib/apiClient";
import type { Translations } from "@/locales/en";

export interface ClassSlotAvailability {
  available: boolean;
  roomName: string | null;
  coachName: string | null;
  reasons: string[];
}

export function checkClassSlot(
  input: {
    sportId: number;
    roomId: number;
    coachId: string | null;
    capacity: number;
    startUtc: string;
    endUtc: string;
    excludeSessionId?: string;
  },
  signal?: AbortSignal,
) {
  return api.get<ClassSlotAvailability>(
    "/api/manager/class-schedule/availability",
    {
      signal,
      query: { ...input, coachId: input.coachId || undefined },
    },
  );
}

export function availabilityReason(reason: string, t: Translations) {
  const labels = t.managerOperations.availabilityReasons;
  return labels[reason as keyof typeof labels] ?? labels.unknown;
}
