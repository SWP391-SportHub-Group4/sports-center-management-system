import { notFound } from "next/navigation";
import { CheckoutScreen } from "@/features/payments/checkout-screen";
import { PublicHeader } from "@/app/public-header";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trang thanh toán dùng chung (A15). Người mua do server xác định từ phiên đăng nhập và quyền sở
 * hữu hóa đơn — route không mang role. `/payments/return` vẫn giữ cho cổng thanh toán quay về.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  if (!UUID.test(invoiceId)) notFound();
  return (
    <CheckoutScreen invoiceId={invoiceId} publicHeader={<PublicHeader />} />
  );
}
