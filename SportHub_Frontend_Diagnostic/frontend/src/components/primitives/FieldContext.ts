"use client";

import { createContext, useContext } from "react";

/**
 * Ngữ cảnh do <Field> cấp cho Input / Select / Textarea bên trong.
 * Nhờ đó nhãn, mô tả lỗi và trạng thái invalid được nối vào control bằng ARIA mà trang dùng
 * không phải tự truyền id.
 */
export interface FieldContextValue {
  labelId: string;
  /** id các phần tử mô tả (hint hoặc lỗi) — để rỗng nếu không có. */
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}
