import type { ReactNode } from "react";
import { AppFrame } from "@/components/AppShell";

/** Thanh điều hướng huấn luyện viên dùng chung cho mọi trang trong nhánh: chuyển trang không dựng lại. */
export default function Layout({ children }: { children: ReactNode }) {
  return <AppFrame allow={["Coach"]}>{children}</AppFrame>;
}
