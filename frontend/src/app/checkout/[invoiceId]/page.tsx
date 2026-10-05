import { notFound } from "next/navigation";
import { PublicHeader } from "../../public-header";
import { PaymentReturn } from "@/features/payments/payment-return";

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
    <>
      <PublicHeader />
      <PaymentReturn invoiceId={invoiceId} />
    </>
  );
}
