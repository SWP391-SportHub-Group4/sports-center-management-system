import type { ReactNode } from "react";
import { MemberLayout } from "@/application/member/layout";
export default function Layout({ children }: { children: ReactNode }) {
  return <MemberLayout>{children}</MemberLayout>;
}
