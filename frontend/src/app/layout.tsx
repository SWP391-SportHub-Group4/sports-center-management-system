import type { Metadata, Viewport } from "next";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/vietnamese-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/vietnamese-700.css";
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/latin-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/latin-700.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/vietnamese-500.css";
// Thứ tự bắt buộc: tokens → globals/member (legacy) → foundation (primitives + shell trên token).
import "@/styles/tokens.css";
import "./globals.css";
import "./member.css";
import "@/styles/foundation.css";
import { AuthProvider } from "@/lib/auth";
import { LanguageProvider } from "@/lib/language";
import { SiteFooter } from "@/components/SiteFooter";

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
        {/* AuthProvider and LanguageProvider wrap the entire application */}
        <LanguageProvider>
          <AuthProvider>
            {children}
            <SiteFooter />
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
