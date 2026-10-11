/**
 * CONTRACT — Table / FilterBar / StatusChip (An chốt, Khoa triển khai).
 *
 * Chỉ là KIỂU. Component thật nằm ở components/data/* (Khoa) và PHẢI khớp các props này.
 * Mục tiêu: một bảng, một thanh lọc, một chip cho cả 6 portal; trang không tự dựng `<table>`.
 * Component `Table`/`StatusChip` đang có trong components/ui.tsx tiếp tục chạy cho tới khi
 * trang cuối cùng chuyển sang bản mới.
 */
import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";

export interface TableColumn<Row> {
  /** Khóa ổn định, dùng cho sort/aria — không dùng text hiển thị. */
  id: string;
  header: string;
  /** Hiển thị ô; mặc định `String(row[id])`. */
  cell?: (row: Row) => ReactNode;
  /** Số/tiền/điểm: căn phải + tabular-nums. */
  numeric?: boolean;
  /** Cột có thể sắp xếp — sắp xếp do server (props `sort`), bảng không tự sort dữ liệu phân trang. */
  sortable?: boolean;
  /** Ẩn dưới breakpoint này (mobile chuyển sang thẻ, xem `mobile`). */
  hideBelow?: "sm" | "md" | "lg";
  /** Cột định danh của dòng (đọc đầu tiên bởi trình đọc màn hình). */
  rowHeader?: boolean;
}

export interface TablePagination {
  page: number;
  pageSize: number;
  totalCount: number;
  onChange: (page: number) => void;
}

export interface TableProps<Row> {
  /** Mô tả bảng cho trình đọc màn hình (caption ẩn). */
  caption: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  /** Khóa dòng ổn định (id nghiệp vụ). Không dùng index. */
  getRowId: (row: Row) => string;
  sort?: { columnId: string; direction: SortDirection };
  onSortChange?: (sort: { columnId: string; direction: SortDirection }) => void;
  pagination?: TablePagination;
  /** Hành động cuối dòng; tối đa 2 nút + menu "Khác" khi nhiều hơn. */
  rowActions?: (row: Row) => ReactNode;
  /** Bấm cả dòng mở chi tiết (Drawer/trang). Phải có cách tương đương bằng bàn phím. */
  onRowOpen?: (row: Row) => void;
  /** Trạng thái dữ liệu — dùng StateView, không để trang tự vẽ. */
  status?: StateKind;
  /** Nội dung trạng thái rỗng dạy người dùng bước kế tiếp, không chỉ "Không có dữ liệu". */
  empty?: { title: string; hint?: string; action?: ReactNode };
  /** Mobile: "scroll" giữ bảng cuộn ngang; "cards" chuyển thành thẻ (mặc định cho danh sách hành động). */
  mobile?: "scroll" | "cards";
  density?: "comfortable" | "compact";
}

export type StateKind =
  "ready" | "loading" | "empty" | "error" | "forbidden" | "conflict";

export interface FilterField {
  id: string;
  label: string;
  kind: "search" | "select" | "date" | "dateRange" | "toggle";
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface FilterBarProps {
  fields: FilterField[];
  /** Giá trị hiện tại — nguồn sự thật là URL query để reload/chia sẻ link giữ nguyên bộ lọc. */
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onReset?: () => void;
  /** Số bộ lọc đang bật, hiện cạnh nút "Xóa lọc". */
  activeCount?: number;
  /** Thanh hành động bên phải (xuất file, tạo mới). */
  actions?: ReactNode;
}

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface StatusChipProps {
  /** Giá trị wire UPPER_SNAKE_CASE từ API (vd. `PAID_AFTER_RECONCILIATION`). */
  value: string | null | undefined;
  /** Ghi đè tông khi nghiệp vụ trang cần (hiếm). Mặc định lấy từ `chipTone` ở lib/format. */
  tone?: StatusTone;
  /** Nhãn do i18n cấp; mặc định `t.wireStatus[value]`. */
  label?: string;
}
