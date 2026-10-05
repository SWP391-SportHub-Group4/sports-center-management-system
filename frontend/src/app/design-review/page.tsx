import type { Metadata } from "next";
import ReviewPage from "@/components/design-review/ReviewPage";

export const metadata: Metadata = {
  title: "SportHub | Review giao diện",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ReviewPage />;
}
