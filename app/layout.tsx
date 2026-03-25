import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "安全问卷自动答卷 Demo",
  description: "Security Questionnaire Auto-Response System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
