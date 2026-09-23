import type { Metadata } from "next";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/vietnamese-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/vietnamese-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/vietnamese-700.css";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "SportHub | Quản lý trung tâm thể thao",
  description: "Không gian quản lý và luyện tập SportHub.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        {/* AuthProvider bọc toàn bộ app: phiên đăng nhập và handler 401 dùng chung cho mọi trang. */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
