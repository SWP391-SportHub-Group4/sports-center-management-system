import type { Metadata, Viewport } from "next";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/vietnamese-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/vietnamese-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/vietnamese-700.css";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "SportHub | Sports Center Management",
  description: "Your space to train and manage activities at SportHub.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* AuthProvider bọc toàn bộ app: phiên đăng nhập và handler 401 dùng chung cho mọi trang. */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
