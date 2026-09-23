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
import type { Metadata } from "next";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/vietnamese-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/vietnamese-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/vietnamese-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SportHub | Chuyển động theo cách của bạn",
  description:
    "Khám phá trung tâm thể thao SportHub, các hoạt động tập luyện và thông tin sự kiện dành cho mọi người.",
  icons: {
    icon: "/sporthub/brand.svg",
  },
};
