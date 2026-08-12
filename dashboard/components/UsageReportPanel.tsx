"use client";

// ============================================================
// UsageReportPanel — tab "Đo lường sử dụng" trong Cài đặt hệ thống.
//
// Trả lời câu hỏi: tài khoản nào THỰC SỰ dùng phần mềm, không phải đăng nhập
// rồi treo đó. Gộp 2 nguồn:
//   1. admin_activity_summary — nhật ký mở module, đếm từ ngày bật tracker.
//   2. admin_activity_actions — hành động ghi dữ liệu, HỒI TỐ từ các bảng
//      nghiệp vụ có sẵn (phiếu thanh toán, phúc lợi, kho VPP, tin tức...).
//
// CHỈ ADMIN. Khoá 2 tầng: ẩn ở đây theo `user.isAdmin`, và cả 2 hàm RPC đều tự
// chặn ở tầng DB — không tin mỗi giao diện.
//
// Tách khỏi settings/page.tsx (đã 1900+ dòng) để trang đó chỉ phải thêm vài
// dòng gọi, không phải chèn thêm mấy trăm dòng vào giữa file đang chạy tốt.
// ============================================================

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  BarChart3, RefreshCw, ShieldAlert, Users, CalendarDays,
  MousePointerClick, PenLine, Loader2, Award, Moon,
} from "lucide-react";

// ─── Cách tính điểm ───
// Cố ý cho "số ngày hoạt động" nặng nhất và CHẶN TRẦN phần lượt mở: nếu để lượt
// mở tính đầy đủ thì người ngồi F5 cả ngày sẽ đứng đầu bảng — đúng thứ cần tránh.
const W_DAY = 4;      // mỗi ngày có hoạt động
const W_MODULE = 2;   // mỗi module khác nhau đã dùng
const W_ACTION = 2;   // mỗi hành động ghi dữ liệu
const OPENS_PER_POINT = 5;   // 5 lượt mở = 1 điểm
const OPENS_POINT_CAP = 20;  // ...nhưng tối đa 20 điểm từ lượt mở

type Row = {
  email: string;
  name: string;
  department: string;
  opens: number;
  days: number;
  modules: number;
  actions: number;
  lastSeen: string | null;
  score: number;
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 12 tháng gần nhất + tuỳ chọn xem toàn bộ thời gian. */
function buildMonthOptions() {
  const out: { value: string; label: string }[] = [{ value: "all", label: "Toàn bộ thời gian" }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` });
  }
  return out;
}

/** Đổi lựa chọn tháng thành khoảng ngày [từ, đến] để truyền cho RPC. */
function rangeOf(month: string): { from: string; to: string } {
  if (month === "all") return { from: "2020-01-01", to: ymd(new Date()) };
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0); // ngày 0 của tháng sau = ngày cuối tháng này
  return { from: ymd(first), to: ymd(last) };
}

export default function UsageReportPanel() {
  const user = useCurrentUser();
  const monthOptions = useMemo(buildMonthOptions, []);
  const [month, setMonth] = useState<string>(monthOptions[1]?.value || "all");

  const [rows, setRows] = useState<Row[]>([]);
  const [idle, setIdle] = useState<{ name: string; department: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user.isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = rangeOf(month);

      const [sumRes, actRes, empRes] = await Promise.all([
        supabase.rpc("admin_activity_summary", { p_from: from, p_to: to }),
        supabase.rpc("admin_activity_actions", { p_from: from, p_to: to }),
        supabase.from("employees_directory").select("name, email, department, status"),
      ]);

      if (sumRes.error) throw sumRes.error;
      if (actRes.error) throw actRes.error;

      const employees = (empRes.data || []) as any[];

      // Danh bạ lưu email dạng "CHỨA" (một người có thể có nhiều email), nên tra
      // ngược bằng includes — giống cách các trang khác trong hệ thống đang làm.
      const lookup = (email: string) => {
        const hit = employees.find(
          (e) => (e.email || "").toLowerCase().includes(email) && email !== ""
        );
        return { name: hit?.name || email, department: hit?.department || "—" };
      };

      const map = new Map<string, Row>();
      const ensure = (rawEmail: string): Row => {
        const email = (rawEmail || "").toLowerCase().trim();
        let r = map.get(email);
        if (!r) {
          const { name, department } = lookup(email);
          r = { email, name, department, opens: 0, days: 0, modules: 0, actions: 0, lastSeen: null, score: 0 };
          map.set(email, r);
        }
        return r;
      };

      for (const s of (sumRes.data || []) as any[]) {
        const r = ensure(s.user_email);
        r.opens = Number(s.open_count) || 0;
        r.days = Number(s.active_days) || 0;
        r.modules = Number(s.module_count) || 0;
        r.lastSeen = s.last_seen || null;
      }
      for (const a of (actRes.data || []) as any[]) {
        const r = ensure(a.user_email);
        r.actions += Number(a.action_count) || 0;
      }

      const list = Array.from(map.values()).filter((r) => r.email);
      for (const r of list) {
        r.score =
          r.days * W_DAY +
          r.modules * W_MODULE +
          r.actions * W_ACTION +
          Math.min(Math.floor(r.opens / OPENS_PER_POINT), OPENS_POINT_CAP);
      }
      list.sort((a, b) => b.score - a.score || b.days - a.days || b.actions - a.actions);
      setRows(list);

      // Ai đang làm việc mà kỳ này không có dấu vết nào trong hệ thống.
      const activeEmails = list.map((r) => r.email).filter(Boolean);
      const stillWorking = employees.filter((e) => {
        const st = (e.status || "").toLowerCase();
        return !st.includes("nghỉ việc") && !st.includes("nghi viec");
      });
      setIdle(
        stillWorking
          .filter((e) => !activeEmails.some((ae) => (e.email || "").toLowerCase().includes(ae)))
          .map((e) => ({ name: e.name || "—", department: e.department || "—" }))
          .sort((a, b) => a.department.localeCompare(b.department, "vi"))
      );
    } catch (err: any) {
      setError(err?.message || String(err));
      setRows([]);
      setIdle([]);
    } finally {
      setLoading(false);
    }
  }, [month, user.isAdmin]);

  useEffect(() => { load(); }, [load]);

  // ─── Chặn tầng giao diện (tầng DB vẫn chặn độc lập) ───
  if (user.loading) {
    return (
      <div className="glass bg-white rounded-2xl p-10 border border-slate-200/50 shadow-premium flex items-center justify-center gap-3 text-slate-400">
        <Loader2 className="animate-spin" size={20} />
        <span className="text-xs font-semibold">Đang kiểm tra quyền truy cập...</span>
      </div>
    );
  }
  if (!user.isAdmin) {
    return (
      <div className="glass bg-white rounded-2xl p-10 border border-slate-200/50 shadow-premium flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 ring-4 ring-rose-100/50">
          <ShieldAlert size={28} />
        </div>
        <h2 className="font-heading font-extrabold text-slate-800 text-sm">Chỉ dành cho Quản trị viên</h2>
        <p className="text-slate-500 text-xs font-medium max-w-md leading-relaxed">
          Số liệu hoạt động của từng tài khoản là dữ liệu cá nhân, chỉ tài khoản Admin mới được xem.
        </p>
      </div>
    );
  }

  const totalOpens = rows.reduce((s, r) => s + r.opens, 0);
  const totalActions = rows.reduce((s, r) => s + r.actions, 0);
  const avgDays = rows.length ? (rows.reduce((s, r) => s + r.days, 0) / rows.length).toFixed(1) : "0";

  const stats = [
    { icon: Users, label: "Tài khoản có hoạt động", value: rows.length, color: "text-blue-600", bg: "bg-blue-50" },
    { icon: CalendarDays, label: "Ngày hoạt động TB / người", value: avgDays, color: "text-emerald-600", bg: "bg-emerald-50" },
    { icon: PenLine, label: "Hành động ghi dữ liệu", value: totalActions, color: "text-indigo-600", bg: "bg-indigo-50" },
    { icon: MousePointerClick, label: "Lượt mở module", value: totalOpens, color: "text-slate-600", bg: "bg-slate-100" },
  ];

  return (
    <div className="space-y-6">
      {/* ─── Thanh tiêu đề + bộ lọc ─── */}
      <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
              <BarChart3 size={18} className="text-blue-600" /> Đo lường sử dụng
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">
              Xếp hạng mức độ dùng phần mềm thật sự. Không tính đăng nhập rồi treo tab.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-blue-400 cursor-pointer"
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Tải lại
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl px-5 py-4 text-xs font-semibold">
          Không tải được số liệu: {error}
        </div>
      )}

      {/* ─── 4 ô số tổng ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-premium">
            <div className={`w-10 h-10 rounded-xl ${s.bg} ${s.color} flex items-center justify-center mb-3`}>
              <s.icon size={20} />
            </div>
            <p className="font-heading font-extrabold text-slate-800 text-xl leading-none mb-1.5">{s.value}</p>
            <p className="text-[11px] text-slate-400 font-semibold leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ─── Bảng xếp hạng ─── */}
      <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
        <h3 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Award size={17} className="text-amber-500" /> Bảng xếp hạng hoạt động
        </h3>

        {loading ? (
          <div className="py-12 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-xs font-semibold">Đang tổng hợp...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs font-semibold">
            Chưa có dữ liệu trong kỳ này.
            <br />
            <span className="text-slate-300 font-medium">
              Nhật ký mở module chỉ tính từ ngày bật tính năng — cần vài ngày để tích luỹ.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="text-slate-400 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
                  <th className="text-left py-2.5 pr-3 w-10">#</th>
                  <th className="text-left py-2.5 pr-3">Nhân sự</th>
                  <th className="text-left py-2.5 pr-3">Phòng ban</th>
                  <th className="text-right py-2.5 px-3">Ngày HĐ</th>
                  <th className="text-right py-2.5 px-3">Module</th>
                  <th className="text-right py-2.5 px-3">Hành động</th>
                  <th className="text-right py-2.5 px-3">Lượt mở</th>
                  <th className="text-right py-2.5 pl-3">Điểm</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.email} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-extrabold text-[10px] ${
                        i === 0 ? "bg-amber-100 text-amber-700"
                        : i === 1 ? "bg-slate-200 text-slate-600"
                        : i === 2 ? "bg-orange-100 text-orange-700"
                        : "text-slate-400"
                      }`}>{i + 1}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="font-bold text-slate-700 truncate max-w-[180px]" title={r.email}>{r.name}</div>
                      <div className="text-[10px] text-slate-400 font-medium truncate max-w-[180px]">{r.email}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500 font-semibold truncate max-w-[150px]">{r.department}</td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-emerald-600">{r.days}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-600">{r.modules}</td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-indigo-600">{r.actions}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-400">{r.opens}</td>
                    <td className="py-2.5 pl-3 text-right">
                      <span className="font-heading font-extrabold text-slate-800 text-sm">{r.score}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-slate-400 font-medium mt-4 pt-3 border-t border-slate-100 leading-relaxed">
          <strong className="text-slate-500">Cách tính điểm:</strong> (ngày hoạt động × {W_DAY}) + (module × {W_MODULE}) +
          (hành động ghi × {W_ACTION}) + (lượt mở ÷ {OPENS_PER_POINT}, tối đa {OPENS_POINT_CAP} điểm).
          Phần lượt mở bị chặn trần cố ý — để người mở đi mở lại nhiều lần không thể leo lên đầu bảng.
          Cột <strong className="text-slate-500">Hành động</strong> có số liệu hồi tố từ trước; cột{" "}
          <strong className="text-slate-500">Ngày HĐ / Module / Lượt mở</strong> chỉ tính từ ngày bật tính năng.
        </p>
      </div>

      {/* ─── Chưa dùng trong kỳ ─── */}
      <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
        <h3 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
          <Moon size={17} className="text-slate-400" /> Không có hoạt động trong kỳ
          <span className="text-[10px] font-extrabold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{idle.length}</span>
        </h3>
        <p className="text-[11px] text-slate-400 font-medium mb-4">
          Nhân sự đang làm việc nhưng không để lại dấu vết nào trong kỳ — thường là chỗ cần đào tạo lại.
        </p>
        {idle.length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold py-4 text-center">Không có ai — cả công ty đều có hoạt động.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {idle.map((p, i) => (
              <span key={`${p.name}-${i}`} className="text-[11px] font-semibold bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-xl">
                {p.name} <span className="text-slate-400 font-medium">· {p.department}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
