import type { ReactNode } from "react";
import { AppFrame } from "@/components/AppShell";
import { DeskProvider } from "@/features/receptionist/desk-context";

/** Thanh điều hướng lễ tân + hội viên đang phục vụ dùng chung cho mọi trang trong nhánh. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AppFrame allow={["Receptionist"]}>
      <DeskProvider>{children}</DeskProvider>
    </AppFrame>
  );
}
