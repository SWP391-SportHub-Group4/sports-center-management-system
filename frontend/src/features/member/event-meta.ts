import type { SportDto } from "@/lib/types";

/** Nhóm màu theo tên môn; môn lạ rơi về "other". Màu luôn đi kèm nhãn chữ. */
export function sportTone(label: string | null | undefined) {
  const key = (label ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
  if (/gym|fitness|\bpt\b/.test(key)) return "gym";
  if (/cau long|badminton/.test(key)) return "badminton";
  if (/bong ro|basketball/.test(key)) return "basketball";
  return "other";
}

export type EventKind = "class" | "pt" | "rental";

export function eventKind(type: string): EventKind {
  return type === "PT_SESSION"
    ? "pt"
    : type === "COURT_RENTAL"
      ? "rental"
      : "class";
}

/** Thời lượng buổi lớp mặc định của môn (dịch vụ khóa học nhóm), dùng để suy ra giờ kết thúc từ giờ bắt đầu. */
export function sessionMinutes(
  sports: SportDto[] | null | undefined,
  sportId: number,
) {
  return (
    sports
      ?.find((s) => s.sportId === sportId)
      ?.services.find((x) => x.serviceType === "GROUP_COURSE")
      ?.defaultSessionMinutes ?? null
  );
}

function addMinutes(hhmm: string, minutes: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Lịch lặp của lớp, ví dụ "Thứ 2-4-6 · 07:00–09:00". Các thứ cùng giờ được gộp; giờ khác nhau thì liệt kê riêng.
 * dayOfWeek: 1 = Thứ 2 … 7 = Chủ nhật.
 */
export function scheduleSummary(
  rules: { dayOfWeek: number; startTimeLocal: string }[] | undefined,
  minutes: number | null,
  days: string[],
  vi: boolean,
) {
  if (!rules?.length) return null;
  const byTime = new Map<string, number[]>();
  for (const rule of [...rules].sort((a, b) => a.dayOfWeek - b.dayOfWeek)) {
    const time = rule.startTimeLocal.slice(0, 5);
    byTime.set(time, [...(byTime.get(time) ?? []), rule.dayOfWeek]);
  }
  const dayLabel = (list: number[]) => {
    if (!vi) return list.map((d) => days[d]).join(", ");
    const nums = list.filter((d) => d < 7).map((d) => d + 1);
    const parts: string[] = [];
    if (nums.length) parts.push(`Thứ ${nums.join("-")}`);
    if (list.includes(7)) parts.push("CN");
    return parts.join(" và ");
  };
  return [...byTime.entries()]
    .map(([time, list]) => {
      const end = minutes ? `–${addMinutes(time, minutes)}` : "";
      return `${dayLabel(list)} · ${time}${end}`;
    })
    .join(" | ");
}
