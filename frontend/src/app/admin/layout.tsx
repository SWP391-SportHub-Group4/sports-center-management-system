import type { ReactNode } from "react";
import { AppFrame } from "@/components/AppShell";

/** Thanh điều hướng quản trị dùng chung cho mọi trang trong nhánh: chuyển trang không dựng lại. */
export default function Layout({ children }: { children: ReactNode }) {
  return <AppFrame allow={["SystemAdministrator"]}>{children}</AppFrame>;
}
