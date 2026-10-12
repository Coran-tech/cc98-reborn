import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "问号键 Demo | CC98 Reborn",
  description: "独立演示按帖子编号与楼层记录问号计数。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
