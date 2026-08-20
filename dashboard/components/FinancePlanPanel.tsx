"use client";

// ============================================================
// FinancePlanPanel — tab con "Kế hoạch TC" trong Báo cáo > Kế hoạch thu chi.
//
// Dữ liệu lưu thật ở bảng `finance_plans` (migration 058). Bản đầu chỉ giữ
// trong state trình duyệt để chốt bố cục; nay đã nối CSDL nên tải lại trang
// không mất nữa.
//
// 11 cột bám đúng file Excel kế hoạch tài chính tháng của công ty
// (public/templates/TNEC_ke_hoach_tai_chinh_thang.xlsx). Nút tải xuống gửi dữ
// liệu sang /api/export-finance-plan để ĐIỀN vào chính file mẫu đó.
//
// BỘ LỌC KỲ: hai ô ngày "Từ ngày — Đến ngày", mở màn hình ra là trọn tháng
// hiện tại. Muốn xem mùng 1 đến mùng 10 thì kéo thẳng ô "Đến ngày" — không phải
// đi qua bước chọn phạm vi nào nữa.
//
// Dòng CHƯA điền ngày thanh toán vẫn phải hiện chứ không được biến mất: lấy
// mùng 1 của kỳ kế hoạch (`year` + `month`) làm ngày quy ước để so.
//
// Ô CHỌN ĐỔ TỪ DANH MỤC CÓ SẴN, không gõ tay:
//   - Phòng ban  -> lib/departments (9 phòng chức năng + các Ban ĐH dự án)
//   - Dự án      -> lib/projectCatalog (bảng `projects`, 16 dự án seed ở 048)
//   - Khách hàng -> lib/financePartners (danh mục đối tác thanh toán)
//
// Ô "Khách hàng" dựng theo ĐÚNG khuôn ô "Người nhận" ở trang Giao việc —
// avatar chữ cái, tìm bỏ dấu, chọn xong thành thẻ. Bê nguyên một cách đã chạy
// tốt sẵn trong repo thay vì tự nghĩ ô search mới: ô tự lọc viết ẩu làm bộ gõ
// tiếng Việt bị ngắt giữa chừng.
//
// MÀU TRONG BẢNG CÓ NGHĨA, không phải trang trí: xanh lá = tiền vào, đỏ = tiền
// ra. Bản đầu để cả tên khách hàng lẫn số tiền màu đỏ (bắt chước file Excel) —
// nhìn trên nền tối thì hai cột đỏ cạnh nhau, không còn phân biệt được đâu là
// khoản thu đâu là khoản chi.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus, X, Save, Trash2, Wallet, ArrowDownCircle, ArrowUpCircle,
  Calendar, Download, Loader2, AlertTriangle, Search, Building2, Eye, FileText,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/apiClient";
import { useCurrentUser } from "@/lib/useCurrentUser";
import TransferRequestPreview, {
  exportTransferRequestDocx,
  type TransferRequestData,
} from "@/components/TransferRequestPreview";
import { useDepartments } from "@/lib/departments";
import { useProjectCatalog } from "@/lib/projectCatalog";
import {
  useFinancePartners,
  foldVi,
  PARTY_TYPE_LABELS,
  type FinancePartnerContract,
} from "@/lib/financePartners";

const inputCls =
  "border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-semibold text-slate-800 text-xs bg-white transition-all w-full";
const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
// Nhãn cột trên thanh tiêu đề nền xanh. Nền đặt trên <tr> chứ không trên từng
// <th>: bảng để border-collapse mặc định là `separate` nên nền của hàng phủ liền
// một dải, còn tô từng ô thì chỗ giáp nhau hở ra khe sáng.
const thCls = "px-3 py-3 font-extrabold uppercase tracking-wider text-[10px] text-white";

const COLS =
  "id, department, flow, customer, content, amount, project_code, project_name, " +
  "fund_source, week, month, year, pay_date, sort_order, created_by";

export type PlanFlow = "thu" | "chi";

export type FinancePlanRow = {
  id: string;
  department: string;
  flow: PlanFlow;
  customer: string;
  content: string;
  amount: number;
  project_code: string;
  project_name: string;
  fund_source: string;
  week: string;
  month: string;
  year: string;
  pay_date: string;
  sort_order: number;
  created_by: string;
};

// Ô <input type="date"> nói chuyện bằng yyyy-mm-dd. Lấy "hôm nay" theo giờ
// Việt Nam chứ không qua toISOString() — toISOString đổi sang UTC nên từ 7 giờ
// tối trở đi đã nhảy sang ngày mai.
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Mở màn hình ra là trọn tháng đang sống — kế hoạch tài chính lập theo tháng,
// mặc định một ngày thì gần như lúc nào cũng thấy bảng rỗng.
function monthBounds(iso: string): { from: string; to: string } {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // ngày 0 tháng sau = ngày cuối tháng này
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

// Dòng chưa có ngày thanh toán thì quy ước là mùng 1 của kỳ kế hoạch, để nó
// vẫn nằm trong khoảng lọc thay vì lặng lẽ biến mất khỏi bảng.
function effectiveDate(r: FinancePlanRow): string {
  if (r.pay_date) return r.pay_date;
  if (!r.year || !r.month) return "";
  return `${r.year}-${String(Number(r.month)).padStart(2, "0")}-01`;
}

const emptyRow = (anchor: string): FinancePlanRow => {
  const [y, m] = anchor.split("-");
  return {
    id: "",
    department: "",
    flow: "chi",
    customer: "",
    content: "",
    amount: 0,
    project_code: "",
    project_name: "",
    fund_source: "",
    week: "",
    month: String(Number(m)),
    year: y,
    pay_date: anchor,
    sort_order: 0,
    created_by: "",
  };
};

const fmtMoney = (n: number) => (n ? n.toLocaleString("vi-VN") : "");

// Gõ "2.518.793.307" hay "2518793307" đều ra cùng một số.
const parseMoney = (s: string) => Number(String(s).replace(/[^\d]/g, "")) || 0;

const fmtDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "";
};

const Dash = () => <span className="text-slate-300">—</span>;

export default function FinancePlanPanel() {
  const user = useCurrentUser();
  const [rows, setRows] = useState<FinancePlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FinancePlanRow | null>(null);
  // Khoảng lọc — mở màn hình ra là trọn tháng chứa ngày hôm nay.
  const [from, setFrom] = useState(() => monthBounds(todayISO()).from);
  const [to, setTo] = useState(() => monthBounds(todayISO()).to);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState("");
  const [deleting, setDeleting] = useState("");
  const [err, setErr] = useState("");
  // Lỗi thao tác KHÔNG dùng chung state với lỗi tải: `err` có early-return che
  // sạch panel, một lần bấm hụt là mất cả bảng đang xem.
  const [opErr, setOpErr] = useState("");

  // Kỳ ghi lên file Excel lấy theo ngày ĐẦU khoảng lọc.
  const [anchorY, anchorM] = useMemo(() => {
    const [y, m] = from.split("-");
    return [y, String(Number(m))];
  }, [from]);

  // Dòng mới mặc định rơi vào hôm nay nếu hôm nay nằm trong khoảng đang xem,
  // không thì lấy ngày đầu khoảng — tạo xong phải thấy nó ngay trong bảng.
  const newRowDate = useMemo(() => {
    const t = todayISO();
    return t >= from && t <= to ? t : from;
  }, [from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("finance_plans")
        .select(COLS)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      // Bảng này chưa có trong bộ kiểu sinh sẵn của Supabase nên `data` về dạng
      // lỗi chung — ép về mảng bản ghi thô rồi ánh xạ tay từng cột.
      const raw = (data || []) as unknown as Record<string, unknown>[];
      setRows(
        raw.map(r => ({
          id: String(r.id),
          department: (r.department as string) || "",
          flow: (r.flow as PlanFlow) || "chi",
          customer: (r.customer as string) || "",
          content: (r.content as string) || "",
          amount: Number(r.amount) || 0,
          project_code: (r.project_code as string) || "",
          project_name: (r.project_name as string) || "",
          fund_source: (r.fund_source as string) || "",
          week: r.week == null ? "" : String(r.week),
          month: r.month == null ? "" : String(r.month),
          year: r.year == null ? "" : String(r.year),
          pay_date: (r.pay_date as string) || "",
          sort_order: Number(r.sort_order) || 0,
          created_by: (r.created_by as string) || "",
        }))
      );
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // So sánh chuỗi yyyy-mm-dd trực tiếp: định dạng này xếp theo thứ tự chữ cái
  // đúng bằng thứ tự thời gian, không cần dựng Date (và không dính lệch múi giờ).
  // Lọc theo khoảng ngày TRƯỚC, rồi mới lọc theo từ khoá. `foldVi` bỏ dấu hai
  // đầu nên gõ "minh khang" ra "MINH KHANG", "vam leo" ra "Vàm Lẽo".
  //
  // Số tiền cũng nằm trong diện tìm, so trên chuỗi đã bỏ dấu chấm: gõ "2149"
  // hay "2.149.008.744" đều ra đúng dòng đó.
  const visible = useMemo(() => {
    const inRange = rows.filter(r => {
      const d = effectiveDate(r);
      return !!d && d >= from && d <= to;
    });
    const q = foldVi(search);
    if (!q) return inRange;
    const qDigits = q.replace(/\D/g, "");
    return inRange.filter(r =>
      foldVi(r.customer).includes(q) ||
      foldVi(r.content).includes(q) ||
      foldVi(r.project_name).includes(q) ||
      foldVi(r.project_code).includes(q) ||
      foldVi(r.department).includes(q) ||
      foldVi(r.fund_source).includes(q) ||
      (!!qDigits && String(r.amount).includes(qDigits))
    );
  }, [rows, from, to, search]);

  const tong = useMemo(() => {
    let thu = 0, chi = 0;
    for (const r of visible) {
      if (r.flow === "thu") thu += r.amount;
      else chi += r.amount;
    }
    return { thu, chi };
  }, [visible]);

  const periodLabel = `${fmtDate(from)} – ${fmtDate(to)}`;

  // Ai sửa/xoá được dòng nào — khớp đúng RLS ở migration 058. Ẩn nút chỉ cho
  // gọn mắt, chốt chặn thật nằm ở CSDL.
  const canEdit = (r: FinancePlanRow) =>
    user.isAdmin || (!!r.created_by && r.created_by === user.email);

  const save = async (row: FinancePlanRow) => {
    setOpErr("");
    const payload = {
      department: row.department || null,
      flow: row.flow,
      customer: row.customer || null,
      content: row.content || null,
      amount: row.amount,
      project_code: row.project_code || null,
      project_name: row.project_name || null,
      fund_source: row.fund_source || null,
      week: row.week ? Number(row.week) : null,
      month: Number(row.month),
      year: Number(row.year),
      pay_date: row.pay_date || null,
    };
    try {
      if (row.id) {
        const { error } = await supabase.from("finance_plans").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        // Xếp xuống cuối kỳ đang xem, giữ đúng thứ tự người lập đã nhập.
        const sameKy = rows.filter(r => r.year === row.year && r.month === row.month);
        const nextSort = sameKy.reduce((mx, r) => Math.max(mx, r.sort_order), 0) + 10;
        const { error } = await supabase
          .from("finance_plans")
          .insert([{ ...payload, sort_order: nextSort }]);
        if (error) throw error;
      }
      setEditing(null);
      await load();
    } catch (e) {
      setOpErr(errText(e));
    }
  };

  const remove = async (r: FinancePlanRow) => {
    if (deleting) return;
    setDeleting(r.id);
    setOpErr("");
    try {
      const { error } = await supabase.from("finance_plans").delete().eq("id", r.id);
      if (error) throw error;
      setRows(prev => prev.filter(x => x.id !== r.id));
    } catch (e) {
      setOpErr(errText(e));
    } finally {
      setDeleting("");
    }
  };

  // ─── Tải Excel ───
  // Gửi lên máy chủ chứ không dựng file ở trình duyệt: file mẫu nằm trong
  // public/templates, muốn giữ nguyên định dạng thì phải mở chính nó ra điền.
  const exportExcel = async (list: FinancePlanRow[], key: string, fileHint: string) => {
    if (list.length === 0 || exporting) return;
    setExporting(key);
    setOpErr("");
    try {
      const res = await apiFetch("/api/export-finance-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: list, month: anchorM, year: anchorY }),
      });
      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        throw new Error(
          info?.error === "template_not_found"
            ? "Không tìm thấy file mẫu TNEC_ke_hoach_tai_chinh_thang.xlsx trong public/templates."
            : info?.message || "Máy chủ không xuất được file."
        );
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileHint;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setOpErr("Không tải được Excel: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting("");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
        <Loader2 className="animate-spin text-[#005BAC]" size={32} />
        <p className="text-xs font-semibold">Đang tải kế hoạch tài chính…</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-3">
        <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] font-bold text-rose-700">{err}</p>
          <p className="font-medium text-rose-600 text-[11px] mt-1.5">
            Nếu báo bảng không tồn tại: chạy{" "}
            <code className="bg-white px-1 rounded">058_finance_plans.sql</code>{" "}
            trong Supabase SQL Editor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {opErr && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="flex-1 min-w-0 text-[11px] font-bold text-rose-700 break-words">{opErr}</p>
          <button type="button" onClick={() => setOpErr("")}
            className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tổng thu / chi của kỳ đang xem */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label="Tổng thu" value={tong.thu} icon={ArrowDownCircle}
          grad="from-emerald-500 to-teal-600" tone="text-emerald-600" />
        <Kpi label="Tổng chi" value={tong.chi} icon={ArrowUpCircle}
          grad="from-rose-500 to-pink-600" tone="text-rose-600" />
        <Kpi label="Chênh lệch" value={tong.thu - tong.chi} icon={Wallet}
          grad="from-blue-500 to-cyan-600"
          tone={tong.thu - tong.chi < 0 ? "text-rose-600" : "text-slate-800"} />
      </div>

      {/* Thanh công cụ */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className={labelCls}>Kế hoạch tài chính</h3>
          <p className="text-[11px] text-slate-400 font-medium mt-1">
            Hiện <strong className="text-slate-600">{visible.length}</strong> dòng · {periodLabel}
            {search.trim() && <> · lọc theo &ldquo;{search.trim()}&rdquo;</>}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Khoảng ngày — kéo "Đến ngày" về mùng 10 là ra ngay tuần đầu tháng.
              Hai ô nằm chung một khung để đọc ra là một khoảng, không phải hai
              bộ lọc rời. `max` / `min` chéo nhau chặn luôn khoảng ngược đời. */}
          <div className="flex items-center gap-1.5 bg-slate-100/50 border border-slate-200/60 rounded-xl px-2.5 py-1.5">
            <Calendar size={14} className="text-slate-400 shrink-0" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Từ</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={e => setFrom(e.target.value || monthBounds(todayISO()).from)}
              className="bg-transparent border-0 text-xs font-bold text-slate-700 outline-none cursor-pointer p-0"
            />
            <span className="text-slate-300 font-bold">–</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đến</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={e => setTo(e.target.value || monthBounds(todayISO()).to)}
              className="bg-transparent border-0 text-xs font-bold text-slate-700 outline-none cursor-pointer p-0"
            />
          </div>

          <button
            type="button"
            disabled={visible.length === 0 || !!exporting}
            onClick={() => exportExcel(
              visible,
              "all",
              `Ke_hoach_tai_chinh_T${anchorM}_${anchorY}.xlsx`
            )}
            title="Xuất toàn bộ bảng ra file Excel theo mẫu của công ty"
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-500/10 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {exporting === "all"
              ? <Loader2 size={14} className="animate-spin" />
              : <Download size={14} />}
            Tải Excel
          </button>
          <button
            type="button"
            onClick={() => setEditing(emptyRow(newRowDate))}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/10 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
          >
            <Plus size={14} /> Tạo mới
          </button>
        </div>
      </div>

      {/* Ô tìm kiếm — để riêng một hàng, không nhét chung hàng với ô ngày và hai
          nút: hàng đó đã chật, thêm nữa là xuống dòng lộn xộn ở màn hình hẹp. */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm theo khách hàng, nội dung, dự án, phòng ban, nguồn tiền hoặc số tiền…"
          className="w-full pl-9 pr-9 py-2 bg-slate-100/50 hover:bg-slate-100 focus:bg-white text-xs font-semibold text-slate-700 placeholder:text-slate-400 placeholder:font-medium border border-slate-200/60 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")}
            title="Xoá từ khoá"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all cursor-pointer">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Bảng */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 space-y-3 bg-white rounded-2xl border border-slate-200/60 shadow-premium">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 ring-4 ring-slate-100/50">
            <Wallet size={26} />
          </div>
          <p className="font-heading font-extrabold text-slate-700 text-xs">
            {search.trim()
              ? `Không có dòng nào khớp “${search.trim()}” trong ${periodLabel}`
              : `Chưa có dòng kế hoạch nào trong ${periodLabel}`}
          </p>
          <button
            type="button"
            onClick={() => setEditing(emptyRow(newRowDate))}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/10 transition-all cursor-pointer"
          >
            <Plus size={14} /> Tạo kế hoạch tài chính
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-premium overflow-hidden">
          {/* Bảng rộng 11 cột — cuộn ngang trong khung, không đẩy cả trang lệch */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gradient-to-r from-[#005BAC] to-blue-500 shadow-sm">
                  <th className={`${thCls} text-center w-12`}>STT</th>
                  <th className={`${thCls} text-left`}>Phòng ban</th>
                  <th className={`${thCls} text-center`}>Loại</th>
                  <th className={`${thCls} text-left`}>Khách hàng</th>
                  <th className={`${thCls} text-left`}>Nội dung</th>
                  <th className={`${thCls} text-right`}>Số tiền thanh toán</th>
                  <th className={`${thCls} text-left`}>Dự án</th>
                  <th className={`${thCls} text-left`}>Nguồn tiền</th>
                  <th className={`${thCls} text-center`}>Tuần</th>
                  <th className={`${thCls} text-center`}>Tháng</th>
                  <th className={`${thCls} text-center`}>Ngày thanh toán</th>
                  <th className={`${thCls} text-right w-20`}>Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r, i) => {
                  const mine = canEdit(r);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => mine && setEditing(r)}
                      title={mine ? "" : `Dòng do ${r.created_by || "người khác"} lập — bạn chỉ xem`}
                      // Nền dòng nói luôn chiều tiền: xanh = thu, đỏ = chi.
                      //
                      // KHÔNG dùng kẻ sọc xen kẽ `even:bg-slate-50/40` như bản
                      // trước: lớp đó KHÔNG có trong bảng remap dark mode ở
                      // globals.css nên trên nền tối nó giữ nguyên trắng nhạt,
                      // thành một dải sáng chói cách dòng.
                      //
                      // Dùng màu ĐẶC pha 25% (`-500/25`) chứ không phải sắc
                      // pastel `-50`: màu trong suốt phủ lên nền nào cũng ra
                      // đúng tông của nền đó, nên chạy được cả sáng lẫn tối mà
                      // KHÔNG cần thêm dòng nào vào bảng remap — tức là không
                      // bao giờ dính lại đúng lỗi vừa sửa.
                      className={`transition-colors group ${
                        r.flow === "thu" ? "bg-emerald-500/25" : "bg-rose-500/25"
                      } ${mine ? "hover:bg-blue-50/40 cursor-pointer" : "cursor-default"}`}
                    >
                      <td className="px-3 py-3 font-bold text-slate-400 text-center tabular-nums">{i + 1}</td>
                      <td className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">
                        {r.department || <Dash />}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg font-bold text-[10px] ${
                          r.flow === "thu"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-rose-50 text-rose-600"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            r.flow === "thu" ? "bg-emerald-500" : "bg-rose-500"
                          }`} />
                          {r.flow === "thu" ? "Thu" : "Chi"}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-bold text-slate-800 max-w-[220px] truncate" title={r.customer}>
                        {r.customer || <Dash />}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-500 max-w-[300px] truncate" title={r.content}>
                        {r.content || <Dash />}
                      </td>
                      {/* Màu số tiền theo chiều tiền: vào xanh, ra đỏ */}
                      <td className={`px-3 py-3 font-mono font-extrabold text-right tabular-nums whitespace-nowrap ${
                        r.flow === "thu" ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {r.amount ? fmtMoney(r.amount) : <Dash />}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {r.project_name
                          ? <span className="inline-block px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-bold text-[10px]">
                              {r.project_name}
                            </span>
                          : <Dash />}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-600 whitespace-nowrap">
                        {r.fund_source || <Dash />}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-600 text-center tabular-nums">
                        {r.week || <Dash />}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-600 text-center tabular-nums whitespace-nowrap">
                        {r.month ? `${r.month}/${r.year}` : <Dash />}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-600 text-center tabular-nums whitespace-nowrap">
                        {r.pay_date ? fmtDate(r.pay_date) : <Dash />}
                      </td>
                      {/* Nút hiện mờ, rõ hẳn khi rê chuột vào dòng — bảng đỡ rối */}
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            disabled={!!exporting}
                            onClick={e => {
                              e.stopPropagation();
                              exportExcel([r], r.id, `Ke_hoach_tai_chinh_dong_${i + 1}.xlsx`);
                            }}
                            title="Tải riêng dòng này ra Excel theo mẫu"
                            className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/60 rounded-lg transition-all cursor-pointer disabled:opacity-40"
                          >
                            {exporting === r.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Download size={13} />}
                          </button>
                          {mine && (
                            <button
                              type="button"
                              disabled={!!deleting}
                              onClick={e => { e.stopPropagation(); remove(r); }}
                              title="Xoá dòng"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer disabled:opacity-40"
                            >
                              {deleting === r.id
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Trash2 size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Cộng cuối bảng — số tiền là thứ người xem tìm đầu tiên */}
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200/60">
                  <td colSpan={5} className="px-3 py-3 text-right font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                    Tổng cộng {visible.length} dòng
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-extrabold tabular-nums whitespace-nowrap">
                    <span className="text-emerald-600">+{fmtMoney(tong.thu) || "0"}</span>
                    <span className="text-slate-300 mx-1.5">/</span>
                    <span className="text-rose-600">-{fmtMoney(tong.chi) || "0"}</span>
                  </td>
                  <td colSpan={6} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <PlanRowModal
          row={editing}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// Lỗi Supabase không phải Error thật — `e.message` rỗng thì hiện cả object còn
// hơn hiện chuỗi "[object Object]" rồi không lần ra nguyên nhân.
function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as { message?: string; details?: string; hint?: string };
    return o.message || o.details || o.hint || JSON.stringify(e);
  }
  return String(e);
}

function Kpi({ label, value, icon: Icon, grad, tone }: {
  label: string;
  value: number;
  icon: typeof Wallet;
  grad: string;
  tone: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-premium flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white shrink-0 shadow-sm`}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={`font-heading font-extrabold text-sm mt-0.5 font-mono tabular-nums truncate ${tone}`}>
          {value ? value.toLocaleString("vi-VN") : "0"}
        </p>
      </div>
    </div>
  );
}

// ─── Modal nhập một dòng kế hoạch ───
// createPortal ra body: modal `fixed` đặt trong khối có backdrop-filter sẽ bị
// khối đó nhốt lại, không ra được giữa màn hình.
function PlanRowModal({ row, onSave, onClose }: {
  row: FinancePlanRow;
  onSave: (r: FinancePlanRow) => Promise<void>;
  onClose: () => void;
}) {
  const departments = useDepartments();
  const { projects } = useProjectCatalog();
  const { partners, contracts, accounts, contractAccounts } = useFinancePartners();
  const me = useCurrentUser();

  const [d, setD] = useState<FinancePlanRow>(row);
  const [amountText, setAmountText] = useState(fmtMoney(row.amount));
  const [saving, setSaving] = useState(false);
  // Hợp đồng đang lấy nội dung — chỉ để tô đậm ô đang chọn, không lưu xuống CSDL.
  const [contractId, setContractId] = useState("");
  const [filled, setFilled] = useState("");
  // Ô chọn nhà thầu — dựng theo ĐÚNG ô "Người nhận" ở trang Giao việc: gõ để
  // tìm, danh sách xổ xuống có avatar chữ cái, chọn xong thành thẻ có nút gỡ.
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferErr, setTransferErr] = useState("");
  const [custSearch, setCustSearch] = useState("");
  const [showCust, setShowCust] = useState(false);
  const custRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (custRef.current && !custRef.current.contains(e.target as Node)) {
        setShowCust(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Đối tác khớp ĐÚNG TÊN với ô "Khách hàng". Gõ tay một tên chưa có trong danh
  // mục thì không khớp ai — vẫn nhập bình thường, chỉ là không có gì để điền hộ.
  const partner = useMemo(() => {
    const q = d.customer.trim().toLowerCase();
    if (!q) return null;
    return partners.find(p => p.name.trim().toLowerCase() === q) || null;
  }, [partners, d.customer]);

  const partnerContracts = useMemo(
    () => (partner ? contracts.filter(c => c.partner_id === partner.id) : []),
    [contracts, partner]
  );

  // `foldVi` bỏ dấu hai đầu nên gõ "minh khang" ra "MINH KHANG", gõ "yen phuc"
  // ra "Yên Phúc". Cắt 30 dòng: danh mục có thể lên hàng trăm đơn vị, đổ hết ra
  // thì danh sách xổ xuống dài lê thê mà 25 dòng cuối không ai đọc.
  const custResults = useMemo(() => {
    const q = foldVi(custSearch);
    return partners
      .filter(p => !q || foldVi(p.name).includes(q) || foldVi(p.short_name || "").includes(q))
      .slice(0, 30);
  }, [partners, custSearch]);

  // Tài khoản nhận tiền cho giấy đề nghị chuyển tiền (migration 059).
  // Ưu tiên tài khoản gắn với ĐÚNG hợp đồng đang chọn; không chọn hợp đồng thì
  // lấy tài khoản mặc định của nhà thầu (truy vấn đã xếp mặc định lên đầu).
  const payAccount = useMemo(() => {
    if (!partner) return null;
    const mine = accounts.filter(a => a.partner_id === partner.id);
    if (mine.length === 0) return null;
    if (contractId) {
      const ids = contractAccounts
        .filter(l => l.contract_id === contractId)
        .map(l => l.account_id);
      const hit = mine.find(a => ids.includes(a.id));
      if (hit) return hit;
    }
    return mine.find(a => a.is_default) || mine[0];
  }, [partner, accounts, contractAccounts, contractId]);

  const transferData = useMemo<TransferRequestData>(() => ({
    // Họ tên + phòng ban BÁM THEO TÀI KHOẢN ĐĂNG NHẬP, không cho gõ tay: giấy
    // này đem trình ký, người đề nghị phải là người đang thao tác.
    employeeName: me.name,
    employeeDept: me.department,
    reason: d.content,
    projectName: d.project_name,
    supplierName: d.customer,
    bankAccount: payAccount?.bank_account || "",
    bankNameBranch: [payAccount?.bank_name, payAccount?.bank_branch].filter(Boolean).join(" - "),
    amount: parseMoney(amountText),
  }), [me.name, me.department, d.content, d.project_name, d.customer, payAccount, amountText]);

  // Đủ dữ liệu tối thiểu mới cho bấm — xuất tờ giấy trống tên đơn vị thụ hưởng
  // hoặc trống số tiền thì in ra cũng phải bỏ.
  const canMakeTransfer = !!d.customer.trim() && parseMoney(amountText) > 0;

  // Điền hộ từ một dòng hợp đồng trong danh mục.
  //
  // `overwrite` = false khi hệ thống TỰ điền (đối tác chỉ có đúng 1 hợp đồng):
  // chỉ đổ vào những ô còn trống, không đè lên thứ người dùng đã gõ. Bấm chọn
  // hợp đồng trong ô "Lấy theo hợp đồng" thì `overwrite` = true — đó là thao tác
  // cố ý, đè lên nội dung cũ mới đúng ý.
  const applyContract = (c: FinancePartnerContract, overwrite: boolean) => {
    const proj = projects.find(x => x.code === c.project_code);
    setD(prev => ({
      ...prev,
      project_code: overwrite || !prev.project_code ? (c.project_code || prev.project_code) : prev.project_code,
      project_name: overwrite || !prev.project_name
        ? (proj?.name || c.project_name || prev.project_name)
        : prev.project_name,
      flow: overwrite ? c.flow : prev.flow,
      department: overwrite || !prev.department ? (c.department || prev.department) : prev.department,
      content: overwrite || !prev.content ? (c.default_content || prev.content) : prev.content,
    }));
    setContractId(c.id);
    setFilled(c.default_content ? "Đã điền nội dung thanh toán từ danh mục đối tác." : "");
  };

  // Chọn khách hàng xong thì tự lấy hợp đồng của họ.
  // Nhiều hợp đồng thì KHÔNG đoán bừa — hiện ô chọn để người lập tự quyết.
  const pickCustomer = (name: string) => {
    setD(prev => ({ ...prev, customer: name }));
    setContractId("");
    setFilled("");
    const q = name.trim().toLowerCase();
    const pn = partners.find(x => x.name.trim().toLowerCase() === q);
    if (!pn) return;
    const list = contracts.filter(c => c.partner_id === pn.id);
    // Đã chọn dự án từ trước thì ưu tiên hợp đồng của đúng dự án đó.
    const byProject = d.project_code ? list.filter(c => c.project_code === d.project_code) : [];
    const auto = byProject.length === 1 ? byProject[0] : list.length === 1 ? list[0] : null;
    if (auto) applyContract(auto, false);
  };

  const set = <K extends keyof FinancePlanRow>(k: K, v: FinancePlanRow[K]) =>
    setD(prev => ({ ...prev, [k]: v }));

  const pickProject = (code: string) => {
    const p = projects.find(x => x.code === code);
    setD(prev => ({ ...prev, project_code: code, project_name: p?.name || "" }));
  };

  // Đổi ngày thanh toán thì kéo luôn kỳ kế hoạch theo — gõ ngày xong còn phải
  // nhớ chỉnh hai ô tháng/năm cho khớp là chỗ dễ sai nhất của cả biểu mẫu.
  const pickPayDate = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    setD(prev => ({
      ...prev,
      pay_date: iso,
      month: m ? String(Number(m[2])) : prev.month,
      year: m ? m[1] : prev.year,
    }));
  };

  const exportTransfer = async () => {
    if (transferBusy) return;
    setTransferBusy(true);
    setTransferErr("");
    try {
      await exportTransferRequestDocx(transferData);
    } catch (e) {
      setTransferErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTransferBusy(false);
    }
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    await onSave({ ...d, amount: parseMoney(amountText) });
    setSaving(false);
  };

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => String(thisYear - 2 + i));

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[5vh] p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200/60 bg-slate-50/70 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-sm shrink-0">
            <Wallet size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-heading font-extrabold text-slate-800 text-xs leading-tight truncate">
              {row.id ? "Sửa dòng kế hoạch" : "Thêm dòng kế hoạch tài chính"}
            </h4>
            <p className="text-[10px] text-slate-400 font-semibold truncate">
              Chọn từ danh mục có sẵn, hạn chế gõ tay
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all cursor-pointer disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Hàng 1: Phòng ban · Loại · Dự án */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Phòng ban</span>
              <select value={d.department} onChange={e => set("department", e.target.value)}
                className={`${inputCls} cursor-pointer`}>
                <option value="">— Chọn phòng ban —</option>
                {departments.all.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Loại</span>
              <select value={d.flow} onChange={e => set("flow", e.target.value as PlanFlow)}
                className={`${inputCls} cursor-pointer`}>
                <option value="chi">Chi — tiền ra</option>
                <option value="thu">Thu — tiền vào</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Dự án</span>
              <select value={d.project_code} onChange={e => pickProject(e.target.value)}
                className={`${inputCls} cursor-pointer`}>
                <option value="">— Chọn dự án —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.code}>{p.name}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Khách hàng — cùng khuôn ô "Người nhận" ở trang Giao việc.
              Bản đầu dùng <datalist> cho trình duyệt tự lọc, tránh bẫy bộ gõ
              tiếng Việt bị ngắt giữa chừng ở ô search tự lọc bằng React. Ô này
              cũng lọc bằng React nhưng KHÔNG dính bẫy đó, vì bê nguyên cách đã
              chạy tốt sẵn trong repo: một <input> có kiểm soát, lọc trong useMemo,
              không đụng gì tới giá trị người dùng đang gõ. */}
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>Khách hàng</span>
            <div className="relative" ref={custRef}>
              {d.customer ? (
                // Đã chọn: hiện thành thẻ, bấm X để chọn lại người khác.
                <div className="w-full min-h-[38px] px-3 py-2 border border-slate-200 rounded-xl flex items-center gap-2 bg-white">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                    {d.customer.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-slate-800 truncate">{d.customer}</span>
                    <span className="block text-[10px] font-semibold text-slate-400 truncate">
                      {partner
                        ? `${PARTY_TYPE_LABELS[partner.party_type]}${partner.short_name ? ` • ${partner.short_name}` : ""}`
                        : "Tên gõ tay — chưa có trong danh mục đối tác"}
                    </span>
                  </span>
                  <button type="button"
                    onClick={() => { pickCustomer(""); setCustSearch(""); setShowCust(true); }}
                    title="Chọn khách hàng khác"
                    className="p-1 text-slate-300 hover:text-rose-500 rounded-lg transition-colors cursor-pointer shrink-0">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div className="w-full min-h-[38px] px-3 py-2 border border-slate-200 rounded-xl flex items-center gap-1.5 bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400">
                  <Search size={12} className="text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={custSearch}
                    onChange={e => { setCustSearch(e.target.value); setShowCust(true); }}
                    onFocus={() => setShowCust(true)}
                    placeholder="Tìm nhà thầu hoặc bấm để chọn nhanh..."
                    className="flex-1 min-w-0 py-0.5 outline-none text-xs font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 bg-transparent"
                  />
                </div>
              )}

              {showCust && !d.customer && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-premium z-20 max-h-56 overflow-y-auto animate-in fade-in duration-150">
                  {custResults.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { pickCustomer(p.name); setCustSearch(""); setShowCust(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer">
                      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                        {p.name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-slate-700 truncate">{p.name}</span>
                        <span className="block text-[10px] text-slate-400 font-semibold truncate">
                          {PARTY_TYPE_LABELS[p.party_type]}
                          {p.short_name ? ` • ${p.short_name}` : ""}
                        </span>
                      </span>
                    </button>
                  ))}

                  {/* Vẫn phải nhận được tên NGOÀI danh mục: kế hoạch có khi ghi
                      một đơn vị chưa kịp đưa vào danh mục đối tác. */}
                  {custSearch.trim() && !custResults.some(p => foldVi(p.name) === foldVi(custSearch)) && (
                    <button type="button"
                      onClick={() => { pickCustomer(custSearch.trim()); setCustSearch(""); setShowCust(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-blue-50 border-t border-slate-100 transition-colors text-left cursor-pointer">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                        <Building2 size={12} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-blue-700 truncate">
                          Dùng tên &ldquo;{custSearch.trim()}&rdquo;
                        </span>
                        <span className="block text-[10px] text-slate-400 font-semibold">
                          Không có trong danh mục — sẽ không tự điền được nội dung thanh toán
                        </span>
                      </span>
                    </button>
                  )}

                  {custResults.length === 0 && !custSearch.trim() && (
                    <p className="text-center text-slate-400 text-[11px] italic py-4">
                      Danh mục đối tác đang rỗng — thêm ở tab &ldquo;Danh mục đối tác&rdquo;.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Lấy sẵn nội dung thanh toán từ danh mục đối tác.
              Chỉ hiện khi tên khách hàng khớp đúng một đơn vị TRONG danh mục và
              đơn vị đó có hợp đồng — gõ tên lạ thì khối này không chiếm chỗ. */}
          {partnerContracts.length > 0 && (
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Lấy theo hợp đồng</span>
              <select
                value={contractId}
                onChange={e => {
                  const c = partnerContracts.find(x => x.id === e.target.value);
                  if (c) applyContract(c, true);
                  else { setContractId(""); setFilled(""); }
                }}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="">
                  {partnerContracts.length === 1
                    ? "— Không lấy, tự gõ nội dung —"
                    : `— Chọn 1 trong ${partnerContracts.length} hợp đồng —`}
                </option>
                {partnerContracts.map(c => (
                  <option key={c.id} value={c.id}>
                    {[c.project_name || c.project_code, c.contract_no].filter(Boolean).join(" · ") ||
                      "(hợp đồng chưa có số)"}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-semibold text-slate-400">
                {filled || "Chọn hợp đồng để tự điền nội dung, dự án, loại thu/chi và phòng ban."}
              </span>
            </label>
          )}

          {/* Nội dung */}
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Nội dung</span>
            <textarea
              value={d.content}
              onChange={e => set("content", e.target.value)}
              rows={2}
              placeholder="VD: Thanh toán HSTT Đợt 5 - 0812/HĐTP/TNE&C-DAINAM ngày 08/12/2025"
              className={`${inputCls} resize-none leading-relaxed`}
            />
          </label>

          {/* Hàng 3: Số tiền · Nguồn tiền */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Số tiền thanh toán (VNĐ)</span>
              <input
                value={amountText}
                onChange={e => setAmountText(e.target.value)}
                onBlur={() => setAmountText(fmtMoney(parseMoney(amountText)))}
                inputMode="numeric"
                placeholder="0"
                className={`${inputCls} font-mono tabular-nums text-right ${
                  d.flow === "thu" ? "text-emerald-600" : "text-rose-600"
                }`}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Nguồn tiền</span>
              <input
                value={d.fund_source}
                onChange={e => set("fund_source", e.target.value)}
                placeholder="Nguồn chi trả khoản này"
                className={inputCls}
              />
            </label>
          </div>

          {/* Hàng 4: Ngày thanh toán · Tuần · Tháng · Năm */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Ngày thanh toán</span>
              <input type="date" value={d.pay_date} onChange={e => pickPayDate(e.target.value)}
                className={`${inputCls} cursor-pointer`} />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Tuần</span>
              <select value={d.week} onChange={e => set("week", e.target.value)}
                className={`${inputCls} cursor-pointer`}>
                <option value="">— Chọn —</option>
                {["1", "2", "3", "4", "5"].map(w => <option key={w} value={w}>Tuần {w}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Tháng</span>
              <select value={d.month} onChange={e => set("month", e.target.value)}
                className={`${inputCls} cursor-pointer`}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(m => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Năm</span>
              <select value={d.year} onChange={e => set("year", e.target.value)}
                className={`${inputCls} cursor-pointer`}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* Chân modal — hai nút giấy đề nghị chuyển tiền nằm bên TRÁI, tách khỏi
            Huỷ/Lưu bên phải: chúng không lưu gì cả, chỉ đọc dữ liệu đang có trên
            form. Chạy được cả với dòng chưa lưu. */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-t border-slate-200/60 bg-slate-50/70 shrink-0 flex-wrap">
          <button type="button" onClick={() => setShowTransfer(true)} disabled={!canMakeTransfer}
            title={canMakeTransfer ? "Xem trước giấy đề nghị chuyển tiền" : "Cần có khách hàng và số tiền"}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[#005BAC] font-bold rounded-xl text-[11px] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            <Eye size={13} /> Xem trước
          </button>
          <button type="button" onClick={exportTransfer} disabled={!canMakeTransfer || transferBusy}
            title={canMakeTransfer ? "Xuất giấy đề nghị chuyển tiền (Word)" : "Cần có khách hàng và số tiền"}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[11px] shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            {transferBusy
              ? <><Loader2 size={13} className="animate-spin" /> Đang tạo…</>
              : <><FileText size={13} /> Xuất đề nghị chuyển tiền</>}
          </button>

          {/* Nói TRƯỚC là giấy sẽ trống ô số tài khoản, đừng để in ra mới thấy. */}
          {canMakeTransfer && !payAccount && (
            <span className="text-[10px] font-bold text-amber-600 max-w-[220px] leading-tight">
              Chưa có số tài khoản của đơn vị này — giấy sẽ để trống ô đó.
            </span>
          )}
          {transferErr && (
            <span className="text-[10px] font-bold text-rose-600 max-w-[240px] leading-tight break-words">
              {transferErr}
            </span>
          )}

          <span className="flex-1" />

          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 font-bold rounded-xl text-[11px] transition-all cursor-pointer disabled:opacity-40">
            Huỷ
          </button>
          <button type="button" onClick={submit} disabled={saving}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-[11px] shadow-md shadow-blue-500/10 transition-all cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Đang lưu…" : "Lưu dòng"}
          </button>
        </div>
      </div>
      {showTransfer && (
        <TransferRequestPreview data={transferData} onClose={() => setShowTransfer(false)} />
      )}
    </div>,
    document.body
  );
}
