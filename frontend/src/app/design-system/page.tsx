import { notFound } from "next/navigation";
import { DesignSystemGallery } from "./gallery";

export const metadata = { title: "SportHub | Design system" };

/**
 * Trang ví dụ cho cả nhóm (Button/Field/Select/Dialog/Drawer/PageHeader/Table/State/Checkout).
 * Chỉ mở ở dev hoặc khi build với NEXT_PUBLIC_DESIGN_SYSTEM=1; production demo trả 404.
 */
export default function DesignSystemPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_DESIGN_SYSTEM !== "1"
  ) {
    notFound();
  }

  return <DesignSystemGallery />;
}
