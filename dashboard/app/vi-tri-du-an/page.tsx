"use client";

import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Loader2 } from "lucide-react";

// Leaflet đụng `window` -> phải nạp phía client, tắt SSR.
const ProjectMap = dynamic(() => import("./ProjectMap"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
      <Loader2 className="animate-spin text-[#005BAC]" size={36} />
      <p className="text-xs font-semibold">Đang tải bản đồ...</p>
    </div>
  ),
});

export default function ProjectLocationPage() {
  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Vị trí dự án" subtitle="Bản đồ dự án & gói thầu Trung Nam E&C" />
        <main className="flex-1 relative overflow-hidden">
          <ProjectMap />
        </main>
      </div>
    </div>
  );
}
