import type { ReactNode } from "react";
import { MemberFrame } from "@/components/MemberShell";

/** Header điều hướng Member dùng chung cho mọi trang /member: chuyển tab không dựng lại thanh điều hướng. */
export default function MemberLayout({ children }: { children: ReactNode }) {
  return <MemberFrame>{children}</MemberFrame>;
}
