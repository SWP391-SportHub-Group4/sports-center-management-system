import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tuyến cũ. `?invoiceId=` (link trong thông báo/email) đi thẳng tới chi tiết hóa đơn;
 * `?invoiceItemId=` được chuyển sang tab Hóa đơn để tra hóa đơn chứa item đó.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const pick = (key: string) => {
    const value = query[key];
    return typeof value === "string" ? value : undefined;
  };
  const invoiceId = pick("invoiceId");
  if (invoiceId && UUID.test(invoiceId))
    redirect(`/member/finance?tab=invoices&invoice=${invoiceId}`);
  const item = pick("invoiceItemId");
  redirect(
    item && UUID.test(item)
      ? `/member/finance?tab=invoices&invoiceItemId=${item}`
      : "/member/finance?tab=invoices",
  );
}
