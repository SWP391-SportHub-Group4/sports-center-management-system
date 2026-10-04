import type { Paged } from "./types";

/**
 * Lấy danh sách từ phản hồi phân trang một cách an toàn: chấp nhận `{ items }`, `{ Items }`
 * hoặc mảng trần; thiếu dữ liệu thì trả mảng rỗng để màn hình hiện trạng thái trống thay vì sập.
 */
export function pagedItems<T>(
  data: Paged<T> | T[] | null | undefined,
): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const raw = data as unknown as { items?: T[]; Items?: T[] };
  return raw.items ?? raw.Items ?? [];
}
