/**
 * CONTRACT — 5 trạng thái của một vùng dữ liệu (Khoa triển khai <StateView>).
 *
 * Quy tắc: mọi vùng lấy dữ liệu phải xử lý đủ 5 trạng thái dưới đây. `AsyncSection` hiện tại
 * (components/ui.tsx) xử lý loading/error/empty; `forbidden` và `conflict` là phần bổ sung.
 */
import type { ReactNode } from "react";
import type { StateKind } from "./table";

export type { StateKind };

export interface StateViewProps {
  kind: Exclude<StateKind, "ready">;
  /** Tiêu đề ngắn gọi tên vấn đề ("Không tải được hóa đơn"). */
  title: string;
  /** Giải thích + cách khắc phục. */
  description?: ReactNode;
  /** Mã lỗi/correlation id hiện nhỏ để hỗ trợ tra log. */
  code?: string;
  /** Hành động chính: loading → không có; empty → tạo mới/đi tới; error → Thử lại; forbidden → Về trang chủ; conflict → Tải lại dữ liệu. */
  action?: ReactNode;
  /** `block` chiếm cả vùng; `inline` thay một thẻ/ô; `page` thay cả trang (có PageHeader). */
  scope?: "inline" | "block" | "page";
}

/**
 * Ý nghĩa từng trạng thái (gắn với HTTP/ApiError):
 *  - loading   : skeleton đúng hình dạng nội dung (không spinner giữa trang); aria-busy.
 *  - empty     : 200 + danh sách rỗng, hoặc lọc không ra kết quả (gợi ý xóa lọc).
 *  - error     : mạng/5xx/validation không phục hồi; luôn có Thử lại nếu thao tác an toàn lặp.
 *  - forbidden : 403 hoặc sai vai trò; KHÔNG lộ tồn tại của tài nguyên (404 giữ nguyên nghĩa).
 *  - conflict  : 409/412 — dữ liệu đã đổi (hết chỗ, revision cũ, hold hết hạn); giải thích đã đổi gì
 *                và dẫn tới bước kế tiếp; tuyệt đối không báo thành công giả.
 */
export function stateKindFromStatus(
  status: number | undefined,
): Exclude<StateKind, "ready" | "loading" | "empty"> {
  if (status === 403) return "forbidden";
  if (status === 409 || status === 412) return "conflict";
  return "error";
}
