import { EnglishOnly } from "@/lib/language";
import { AuthCinemaShell } from "@/components/auth/AuthCinemaShell";

/** Trang xác thực dùng chung: luôn tiếng Anh (xem EnglishOnly). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <EnglishOnly>
      <AuthCinemaShell>{children}</AuthCinemaShell>
    </EnglishOnly>
  );
}
