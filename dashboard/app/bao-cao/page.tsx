"use client";

// ============================================================
// /bao-cao — Module BÁO CÁO (gói Enterprise)
//
// Ba nhóm báo cáo quản trị: Kế hoạch thu chi, Sản lượng, Doanh thu.
//
// PHÂN QUYỀN (2 lớp, không được bỏ lớp nào):
//  1. AuthWrapper chặn theo đường dẫn — /bao-cao khai ở ROUTE_MIN_PLAN là
//     "enterprise" nên gõ thẳng URL cũng bị màn hình nâng gói chặn lại.
//  2. Trang tự kiểm tra lại bằng user.can("reports") — Admin, phòng đã ở gói
//     Enterprise, hoặc người được cấp riêng cờ can_view_reports (migration 042).
//
// Lớp 2 nhìn có vẻ thừa vì lớp 1 đã chặn, nhưng giữ để trang không phụ thuộc
// hoàn toàn vào layout: nếu sau này ai đó render trang này ngoài AuthWrapper
// (nhúng vào dashboard, mở bằng route khác) thì dữ liệu vẫn không rò ra.
//
// CHƯA CÓ BẢNG SỐ LIỆU: đây là bước dựng khung + phân quyền. Ba tab hiện trạng
// thái rỗng thật, KHÔNG cắm dữ liệu giả — mock từng gây rắc rối ở VPP (3 vật tư
// giả seed thẳng vào DB) nên không lặp lại.
// ============================================================

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import FinancePartnerCatalog from "@/components/FinancePartnerCatalog";
import FinancePlanPanel from "@/components/FinancePlanPanel";
import SigningPanel from "@/components/SigningPanel";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  Wallet,
  HardHat,
  TrendingUp,
  Lock,
  Loader2,
  Database,
} from "lucide-react";

type ReportTab = "thu-chi" | "san-luong" | "doanh-thu";

// Tab "Kế hoạch thu chi" đã gánh 2 việc khác hẳn nhau: danh mục đối tác (dữ liệu
// nền, sửa thưa) và phiếu trình ký (việc hằng ngày, có luồng duyệt). Tách tab con
// thay vì dồn một trang — dồn lại thì mỗi lần vào phải cuộn qua thứ không cần.
type ThuChiTab = "doi-tac" | "trinh-ky" | "ke-hoach";

const THU_CHI_TABS: { id: ThuChiTab; label: string; desc: string }[] = [
  { id: "trinh-ky", label: "Phiếu trình ký", desc: "Lập phiếu, trình duyệt 4 cấp, xuất Word" },
  { id: "ke-hoach", label: "Kế hoạch TC", desc: "Kế hoạch tài chính tháng — thu / chi theo tuần, theo dự án" },
  { id: "doi-tac", label: "Danh mục đối tác", desc: "Nhà thầu, số tài khoản, hợp đồng theo dự án" },
];

const TABS: {
  id: ReportTab;
  label: string;
  icon: typeof Wallet;
  desc: string;
}[] = [
  {
    id: "thu-chi",
    label: "Kế hoạch thu chi",
    icon: Wallet,
    desc: "Dòng tiền vào / ra theo kế hoạch từng tháng",
  },
  {
    id: "san-luong",
    label: "Sản lượng",
    icon: HardHat,
    desc: "Sản lượng thực hiện theo dự án / gói thầu",
  },
  {
    id: "doanh-thu",
    label: "Doanh thu",
    icon: TrendingUp,
    desc: "Doanh thu ghi nhận và luỹ kế theo tháng",
  },
];

export default function BaoCaoPage() {
  const user = useCurrentUser();
  const [activeTab, setActiveTab] = useState<ReportTab>("thu-chi");
  const [thuChiTab, setThuChiTab] = useState<ThuChiTab>("trinh-ky");

  // Đang tra danh tính: KHÔNG hiện gì thuộc về nội dung báo cáo. Nếu render sẵn
  // rồi mới ẩn thì có một nhịp dữ liệu loé ra trước khi quyền kịp tính xong.
  if (user.loading) {
    return (
      <div className="flex min-h-screen bg-[#F7F9FC]">
        <Sidebar />
        <div className="ml-60 flex-1 flex flex-col min-w-0">
          <Header title="Báo cáo" />
          <main className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2.5 text-slate-400 text-xs font-bold">
              <Loader2 size={16} className="animate-spin" />
              Đang kiểm tra quyền truy cập…
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!user.can("reports")) {
    return (
      <div className="flex min-h-screen bg-[#F7F9FC]">
        <Sidebar />
        <div className="ml-60 flex-1 flex flex-col min-w-0">
          <Header title="Báo cáo" />
          <main className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md w-full bg-white border border-slate-200/60 rounded-[2rem] shadow-premium p-10 flex flex-col items-center text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 ring-4 ring-amber-100/50">
                <Lock size={30} />
              </div>
              <div className="space-y-2">
                <h2 className="font-heading font-extrabold text-slate-800 text-base">
                  Bạn chưa được cấp quyền xem Báo cáo
                </h2>
                <p className="text-slate-500 text-xs leading-relaxed font-medium">
                  Module Báo cáo thuộc gói <strong>Enterprise</strong> và chỉ mở cho
                  tài khoản được cấp cờ <strong>Báo cáo quản trị</strong>. Liên hệ
                  Quản trị viên nếu bạn cần truy cập.
                </p>
              </div>
              <a
                href="/"
                className="w-full bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold py-3.5 rounded-2xl transition-all"
              >
                Về trang Dashboard
              </a>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const current = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Báo cáo" />

        <main className="flex-1 p-8 overflow-y-auto space-y-6">
          {/* ─── Thanh chọn nhóm báo cáo ─── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`text-left p-5 rounded-2xl border transition-all flex items-center gap-4 cursor-pointer ${
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-[#005BAC] border-blue-600 text-white shadow-lg shadow-blue-600/15"
                      : "bg-white border-slate-200/60 text-slate-700 hover:border-slate-300 hover:bg-slate-50/40"
                  }`}
                >
                  <div
                    className={`p-2.5 rounded-xl transition-all shrink-0 ${
                      isActive ? "bg-white/15 text-white" : "bg-blue-50 text-[#005BAC]"
                    }`}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`font-heading font-extrabold text-xs leading-tight ${
                        isActive ? "text-white" : "text-slate-800"
                      }`}
                    >
                      {tab.label}
                    </p>
                    <p
                      className={`text-[10px] font-semibold mt-1 leading-snug ${
                        isActive ? "text-blue-100" : "text-slate-400"
                      }`}
                    >
                      {tab.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ─── Nội dung báo cáo ───
              Kế hoạch thu chi: bước 1 là DANH MỤC ĐỐI TÁC (migration 048). Màn
              hình nhập kế hoạch tháng và xuất Excel làm ở bước sau — chốt danh
              mục trước thì lúc đó chỉ việc chọn, không phải gõ lại.

              Tab này render THẲNG ra nền trang, KHÔNG bọc trong khung `.glass`
              như hai tab kia: nội dung của nó đã là các thẻ KPI + lưới card, bọc
              thêm một lớp card nữa thành card-lồng-card, viền chồng viền. */}
          {activeTab === "thu-chi" ? (
            <div className="space-y-5 max-w-6xl">
              {/* Tab con */}
              <div className="flex bg-slate-100/70 rounded-xl p-1 gap-1 w-fit">
                {THU_CHI_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setThuChiTab(t.id)}
                    title={t.desc}
                    className={`px-4 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      thuChiTab === t.id
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {thuChiTab === "trinh-ky" ? (
                <SigningPanel />
              ) : thuChiTab === "ke-hoach" ? (
                <FinancePlanPanel />
              ) : (
                <FinancePartnerCatalog />
              )}
            </div>
          ) : (
            <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="font-heading font-bold text-slate-800 text-sm">
                  {current.label}
                </h3>
                <p className="text-slate-400 text-[10px] font-semibold mt-1">
                  {current.desc}
                </p>
              </div>

              {/* Trạng thái rỗng thật — chưa dựng bảng số liệu cho nhóm báo cáo này */}
              <div className="flex flex-col items-center justify-center text-center py-16 px-6 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 ring-4 ring-slate-100/50">
                  <Database size={26} />
                </div>
                <p className="font-heading font-extrabold text-slate-700 text-xs">
                  Chưa có dữ liệu {current.label.toLowerCase()}
                </p>
                <p className="text-slate-400 text-[11px] font-medium max-w-sm leading-relaxed">
                  Khung báo cáo và phân quyền đã sẵn sàng. Bảng số liệu sẽ được dựng ở
                  bước tiếp theo, sau khi chốt các chỉ tiêu cần theo dõi.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
