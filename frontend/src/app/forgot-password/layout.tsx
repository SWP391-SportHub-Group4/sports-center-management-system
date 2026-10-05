import { EnglishOnly } from "@/lib/language";

/** Trang xác thực dùng chung: luôn tiếng Anh (xem EnglishOnly). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <EnglishOnly>{children}</EnglishOnly>;
}
