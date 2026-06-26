"use client";

import { useState, useEffect, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  Users,
  UserPlus,
  BadgeCheck,
  Hourglass,
  Wallet,
  Building2,
  Briefcase,
  ChevronRight,
  Loader2,
} from "lucide-react";

const CHART_COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#06B6D4", "#EC4899", "#34D399", "#A78BFA", "#F472B6"];
const PLACEHOLDER_COLOR = "#E2E8F0";

const formatMoney = (n: number) => new Intl.NumberFormat("vi-VN").format(n || 0);

// ─── Department helpers (aligned with recruitment page) ───────────────────────
const normalizeDepartment = (dept: string): string => {
  if (!dept) return "Chưa xác định";
  const trim = dept.trim();
  const lower = trim.toLowerCase();
  if (lower.includes("atlđ") || lower.includes("atld") || lower.includes("an toàn")) return "ATLĐ";
  if (lower.includes("kỹ thuật")) return "Kỹ thuật";
  if (lower.includes("hành chính") || lower.includes("nhân sự") || lower === "hcns") return "HCNS";
  if (lower.includes("vật tư") || lower.includes("thiết bị")) return "VT-TB";
  if (lower.includes("kế toán") || lower.includes("tài chính")) return "Kế toán";
  if (lower.includes("kế hoạch")) return "Kế hoạch";
  if (lower.includes("đấu thầu")) return "Đấu thầu";
  if (lower.includes("thị trường")) return "Thị trường";
  if (lower.includes("qlda") || lower.includes("quản lí dự án") || lower.includes("quản lý dự án")) return "Phòng QLDA";
  return trim.charAt(0).toUpperCase() + trim.slice(1);
};

const isProjectBlock = (deptName: string): boolean => {
  const name = (deptName || "").trim().toUpperCase();
  if (
    name.startsWith("DA.") || name.startsWith("DA ") || name.startsWith("DỰ ÁN") || name.startsWith("DA") ||
    name.includes("DỰ ÁN") || name.includes("CÔNG TRƯỜNG") || name.includes("BAN ĐIỀU HÀNH") || name.includes("BDH")
  ) return true;
  const projectKeywords = ["VÀM LẼO", "RXT", "RẠCH XUYÊN TÂM", "MÃ ĐÀ", "TRÀ VINH", "THƯỜNG PHƯỚC", "TỈNH LỘ", "CHỐNG HẠN", "TÂY NINH", "ĐMT"];
  return projectKeywords.some((k) => name.includes(k));
};

// Parse a date string (dd/mm/yyyy or yyyy-mm-dd) → Date | null
const parseDate = (s: string): Date | null => {
  if (!s) return null;
  if (s.includes("-")) {
    const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
    if (y && m) return new Date(y, m - 1, d || 1);
  }
  if (s.includes("/")) {
    const p = s.split("/").map((x) => parseInt(x, 10));
    if (p.length === 3) {
      const [a, b, c] = p;
      if (String(p[2]).length === 4 || c > 31) return new Date(c, b - 1, a);
      return new Date(a, b - 1, c);
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const isThisMonth = (s: string): boolean => {
  const d = parseDate(s);
  if (!d) return false;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};

// ─── Recruitment block (office / project) reused on dashboard ──────────────────
function RecruitBlock({
  title,
  subtitle,
  toRecruit,
  totalHired,
  entries,
}: {
  title: string;
  subtitle: string;
  toRecruit: number;
  totalHired: number;
  entries: [string, { total: number; hired: number }][];
}) {
  const chartData = entries.filter(([, v]) => v.hired > 0).map(([name, v]) => ({ name, value: v.hired }));
  const pieData = chartData.length > 0 ? chartData : [{ name: "Chưa có nhân sự", value: 1 }];
  return (
    <div className="glass bg-white/80 rounded-2xl p-6 shadow border border-slate-100 space-y-4">
      <div>
        <h3 className="font-heading font-black text-slate-800 text-sm">{title}</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="flex items-center gap-4 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-150 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] shrink-0 select-none">
          <div className={`w-24 h-24 rounded-full flex flex-col items-center justify-center shadow-lg shrink-0 border-2 ${
            toRecruit > 0
              ? "bg-gradient-to-br from-rose-500 via-red-500 to-red-600 text-white shadow-red-500/25 border-red-400 ring-4 ring-red-500/10"
              : "bg-gradient-to-br from-emerald-500 via-emerald-500 to-teal-600 text-white shadow-emerald-500/25 border-emerald-400 ring-4 ring-emerald-500/10"
          }`}>
            <span className="text-3xl font-black font-heading leading-none">{toRecruit}</span>
            <span className="text-[9px] font-black tracking-wider uppercase mt-1">Tuyển thêm</span>
          </div>
          <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={40} paddingAngle={totalHired > 0 ? 2 : 0} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={totalHired > 0 ? CHART_COLORS[index % CHART_COLORS.length] : PLACEHOLDER_COLOR} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-slate-800 leading-none">{totalHired}</span>
              <span className="text-[8px] font-black text-slate-400 mt-0.5 uppercase tracking-wider">Đã tuyển</span>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-2.5 w-full pr-1">
          {entries.map(([dept, stats]) => {
            const hasHired = stats.hired > 0;
            const mappedIndex = chartData.findIndex((x) => x.name === dept);
            const color = hasHired ? CHART_COLORS[mappedIndex % CHART_COLORS.length] : "#94A3B8";
            return (
              <div key={dept} className="flex items-center justify-between text-sm font-semibold">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-slate-700 break-words leading-tight">{dept}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${hasHired ? "text-emerald-600 bg-emerald-50" : "text-slate-400 bg-slate-50"}`}>
                    {stats.hired} đã tuyển
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">({stats.total} HS)</span>
                </div>
              </div>
            );
          })}
          {entries.length === 0 && <p className="text-slate-400 text-xs italic text-center py-8">Không có dữ liệu</p>}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [reportRows, setReportRows] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [officeNeeds, setOfficeNeeds] = useState<Record<string, number>>({});
  const [projectNeeds, setProjectNeeds] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const [empRes, candRes, reportRes, needsRes, contractRes] = await Promise.all([
          supabase.from("employees").select("*"),
          supabase.from("candidates").select("*"),
          supabase.from("admin_monthly_reports").select("*"),
          supabase.from("recruitment_needs").select("id, data"),
          supabase.from("contracts").select("type"),
        ]);
        if (empRes.data) setEmployees(empRes.data);
        if (candRes.data) setCandidates(candRes.data);
        if (reportRes.data) setReportRows(reportRes.data);
        if (contractRes.data) setContracts(contractRes.data);
        if (needsRes.data) {
          const office = needsRes.data.find((r: any) => r.id === "office_manual_needs");
          const project = needsRes.data.find((r: any) => r.id === "project_manual_needs");
          if (office?.data) setOfficeNeeds(office.data);
          if (project?.data) setProjectNeeds(project.data);
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // ─── Admin cost totals (2 blocks) ───────────────────────────────────────────
  const cost = useMemo(() => {
    const sumRows = (rows: any[]) => {
      let total = 0;
      for (let i = 1; i <= 12; i++) total += rows.reduce((s, r) => s + (Number(r[`m${i}`]) || 0), 0);
      return total;
    };
    const officeRows = reportRows.filter((r) => r.category_type === "office");
    const projectRows = reportRows.filter((r) => r.category_type === "project" && !String(r.stt || "").includes("."));
    const office = sumRows(officeRows);
    const project = sumRows(projectRows);
    return { office, project, grand: office + project };
  }, [reportRows]);

  // ─── Recruitment stats by block ─────────────────────────────────────────────
  const recruit = useMemo(() => {
    const byDept: Record<string, { total: number; hired: number }> = {};
    candidates.forEach((c) => {
      const dept = normalizeDepartment(c.department);
      if (!byDept[dept]) byDept[dept] = { total: 0, hired: 0 };
      byDept[dept].total++;
      if (c.v2_result === "ĐẠT") byDept[dept].hired++;
    });
    const deptEntries = Object.entries(byDept).sort((a, b) => b[1].total - a[1].total) as [string, { total: number; hired: number }][];
    const officeEntries = deptEntries.filter(([d]) => !isProjectBlock(d));
    const projectEntries = deptEntries.filter(([d]) => isProjectBlock(d));
    const officeHired = officeEntries.reduce((s, [, v]) => s + v.hired, 0);
    const projectHired = projectEntries.reduce((s, [, v]) => s + v.hired, 0);
    const officeNeed = Object.values(officeNeeds).reduce((a, b) => a + b, 0);
    const projectNeed = Object.values(projectNeeds).reduce((a, b) => a + b, 0);
    const probationThisMonth = candidates.filter((c) => c.v2_result === "ĐẠT" && (isThisMonth(c.onboard_date) || isThisMonth(c.v2_date))).length;
    const acceptedHires = candidates.filter((c) => (c.probation_result || "").toUpperCase().includes("NHẬN")).length;
    return {
      officeEntries,
      projectEntries,
      officeHired,
      projectHired,
      officeToRecruit: Math.max(0, officeNeed - officeHired),
      projectToRecruit: Math.max(0, projectNeed - projectHired),
      probationThisMonth,
      acceptedHires,
    };
  }, [candidates, officeNeeds, projectNeeds]);

  // ─── HR stats ───────────────────────────────────────────────────────────────
  // Headcount từ danh sách nhân viên; HĐ chính thức / thử việc lấy từ bảng hợp đồng (loại HĐLĐ)
  const hr = useMemo(() => {
    const headcount = employees.length;
    const probation = contracts.filter((c) => (c.type || "").trim() === "Thử việc").length;
    const official = contracts.filter((c) => {
      const t = (c.type || "").trim();
      return t !== "" && t !== "Thử việc";
    }).length;
    return { headcount, official, probation };
  }, [employees, contracts]);

  const hrCards = [
    { label: "Nhân sự hiện tại", value: hr.headcount, icon: Users, grad: "from-indigo-500 to-blue-600" },
    { label: "Nhân sự mới vào (nhận việc)", value: recruit.acceptedHires, icon: UserPlus, grad: "from-emerald-500 to-teal-600" },
    { label: "HĐ lao động chính thức", value: hr.official, icon: BadgeCheck, grad: "from-blue-500 to-cyan-600" },
    { label: "Đang thử việc", value: hr.probation, icon: Hourglass, grad: "from-amber-500 to-orange-600" },
  ];

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Dashboard Hành chính Nhân sự" subtitle="Hệ thống quản trị Hành chính Nhân sự Trung Nam E&C" />

        <main className="flex-1 p-8 space-y-8 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[500px] text-slate-400 gap-2">
              <Loader2 className="animate-spin text-[#005BAC]" size={36} />
              <p className="text-xs font-semibold">Đang đồng bộ dữ liệu từ Supabase...</p>
            </div>
          ) : (
            <>
              {/* ── Chi phí hành chính tổng hợp 2 khối ── */}
              <section className="space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Chi phí hành chính tổng hợp</h2>
                  <a href="/administration" className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                    Xem chi tiết <ChevronRight size={12} />
                  </a>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {[
                    { label: "Khối Văn Phòng", value: cost.office, icon: Building2, grad: "linear-gradient(135deg,#f59e0b,#d97706)" },
                    { label: "Khối Dự Án", value: cost.project, icon: Briefcase, grad: "linear-gradient(135deg,#2563eb,#1d4ed8)" },
                    { label: "Tổng cộng CPQL phát sinh", value: cost.grand, icon: Wallet, grad: "linear-gradient(135deg,#059669,#047857)" },
                  ].map((c) => {
                    const Icon = c.icon;
                    return (
                      <div key={c.label} style={{ background: c.grad }} className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold opacity-80 uppercase tracking-wider">{c.label}</p>
                          <Icon size={18} className="opacity-70" />
                        </div>
                        <p className="font-heading font-extrabold text-3xl mt-2 leading-none">{formatMoney(c.value)}</p>
                        <p className="text-[10px] opacity-70 mt-1.5">VNĐ · Lũy kế năm</p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* ── Tuyển dụng nhân sự 2 khối ── */}
              <section className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tuyển dụng nhân sự</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                      Ứng viên thử việc trong tháng: {recruit.probationThisMonth}
                    </span>
                    <a href="/recruitment" className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                      Xem chi tiết <ChevronRight size={12} />
                    </a>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <RecruitBlock
                    title="Khối Văn Phòng"
                    subtitle="Số lượng nhân sự đã tuyển và tuyển thêm"
                    toRecruit={recruit.officeToRecruit}
                    totalHired={recruit.officeHired}
                    entries={recruit.officeEntries}
                  />
                  <RecruitBlock
                    title="Khối Dự Án"
                    subtitle="Số lượng nhân sự đã tuyển và tuyển thêm tại các dự án"
                    toRecruit={recruit.projectToRecruit}
                    totalHired={recruit.projectHired}
                    entries={recruit.projectEntries}
                  />
                </div>
              </section>

              {/* ── Nhân sự & Phúc lợi ── */}
              <section className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nhân sự &amp; Phúc lợi</h2>
                  <a href="/cb" className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                    Lương &amp; Phúc lợi (C&amp;B) <ChevronRight size={12} />
                  </a>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                  {hrCards.map((c) => {
                    const Icon = c.icon;
                    return (
                      <div key={c.label} className="glass rounded-2xl p-5 bg-white/80 hover-elevate flex items-center justify-between border border-slate-100">
                        <div className="space-y-1">
                          <p className="text-slate-500 text-xs font-semibold">{c.label}</p>
                          <p className="font-heading font-extrabold text-3xl text-slate-800">{c.value}</p>
                        </div>
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.grad} flex items-center justify-center shadow-md`}>
                          <Icon className="text-white" size={20} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
