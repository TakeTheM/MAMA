import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { AppFrame } from "@/components/ui/app-shell";
import "./globals.css";

const noto = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "MAMA",
  description: "셀러 광고 기획·검수·성과 관리",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${noto.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col"><AppFrame>{children}</AppFrame></body>
    </html>
  );
}
