import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthWrapper from "@/components/AuthWrapper";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// Metadata render lúc build (server) nên không đọc được tenant_config trong DB —
// khách deploy riêng đặt 2 biến môi trường này (script provisioning sẽ set),
// thiếu thì fallback giá trị TNEC như cũ.
export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_SYSTEM_TITLE || "PM - HCNS - TNEC",
  description: process.env.NEXT_PUBLIC_SYSTEM_DESCRIPTION || "Phần mềm Quản lý Hành chính Nhân sự - Trung Nam E&C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-gradient-to-br from-white to-[#e6effd] min-h-screen antialiased">
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  );
}
