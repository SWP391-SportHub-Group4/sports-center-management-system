"use client";

import { PublicHeader } from "@/app/public-header";
import { MemberShell } from "@/components/MemberShell";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { PaymentReturn } from "./payment-return";

/**
 * Trang thanh toán dùng chung (A15 / quay về từ cổng). Hội viên đang đăng nhập thấy thanh điều hướng Member
 * (không bị đẩy ra khỏi khu Member sau khi thanh toán); người khác giữ header công khai.
 */
export function CheckoutScreen({ invoiceId }: { invoiceId?: string }) {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  if (!loading && user?.role === "Member")
    return (
      <MemberShell title={t.checkout.title}>
        <PaymentReturn invoiceId={invoiceId} embedded />
      </MemberShell>
    );
  return (
    <>
      <PublicHeader />
      <PaymentReturn invoiceId={invoiceId} />
    </>
  );
}
