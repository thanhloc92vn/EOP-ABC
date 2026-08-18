"use client";

// ============================================================
// FinancePartnerCatalog — tab "Kế hoạch thu chi" trong module Báo cáo.
//
// Danh mục đối tác thanh toán (migration 048): mỗi Ban điều hành / dự án có sẵn
// nhà thầu nào, số tài khoản + ngân hàng/chi nhánh, số hợp đồng và nội dung
// thanh toán mẫu. Mục đích là lập kế hoạch tài chính tháng bằng cách CHỌN thay
// vì gõ lại — file Excel cũ có 95 cách gõ tên cho 49 đơn vị.
//
// BỐ CỤC: dải KPI -> bộ lọc -> LƯỚI thẻ đối tác. Bản đầu xếp 49 đối tác thành
// dãy ngang full-width, mỗi dòng chỉ có tên + một badge nên màn hình rỗng tuếch
// và phải cuộn rất dài. Lưới 2–3 cột nhét được đủ thông tin ngân hàng ngay trên
// thẻ, đúng nhịp card của design system.
//
// SỬA CHI TIẾT NẰM TRONG MODAL, không mở rộng tại chỗ: 49 thẻ mà cái nào cũng
// bung ra được thì trang nhảy loạn, và form sửa cần nhiều bề ngang hơn 1 cột.
//
// ⚠ MODAL BẮT BUỘC createPortal ra document.body — panel này nằm trong khối
// `.glass` của trang /bao-cao, mà `backdrop-filter` tạo containing block mới nên
// phần tử `fixed` sẽ bị nhốt trong thẻ cha thay vì phủ toàn màn hình.
//
// PHÂN QUYỀN: trang /bao-cao đã chặn 2 lớp trước khi render (gói Enterprise +
// cờ can_view_reports). RLS của 048 siết đúng cờ đó ở tầng CSDL.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  useFinancePartners,
  invalidateFinancePartners,
  foldVi,
  PARTY_TYPE_LABELS,
  type FinancePartner,
  type FinancePartnerContract,
  type PartyType,
} from "@/lib/financePartners";
import { useProjectCatalog } from "@/lib/projectCatalog";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { supabase } from "@/lib/supabase";
import {
  Building2, Plus, Trash2, Save, RefreshCw, Loader2, Search, Landmark,
  Copy, Check, FileText, AlertTriangle, X, Users, Briefcase, HardHat, CreditCard,
} from "lucide-react";

const inputCls =
  "border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-semibold text-slate-800 text-xs bg-white transition-all";

const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";

const PARTY_TYPES = Object.keys(PARTY_TYPE_LABELS) as PartyType[];

// Màu theo loại đối tác — giữ một bảng duy nhất để thẻ, badge và bộ lọc không lệch nhau.
const TYPE_STYLE: Record<PartyType, { chip: string; grad: string }> = {
  nha_thau_phu: { chip: "bg-blue-50 text-blue-700", grad: "from-blue-500 to-cyan-600" },
  nha_cung_cap: { chip: "bg-violet-50 text-violet-700", grad: "from-violet-500 to-purple-600" },
  chu_dau_tu:   { chip: "bg-emerald-50 text-emerald-700", grad: "from-emerald-500 to-teal-600" },
  ca_nhan:      { chip: "bg-amber-50 text-amber-700", grad: "from-amber-500 to-orange-600" },
};

export default function FinancePartnerCatalog() {
  const { partners, contracts, loading, error, reload } = useFinancePartners();
  const { projects } = useProjectCatalog();

  const [saving, setSaving] = useState(false);
  const [writeErr, setWriteErr] = useState("");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | PartyType>("");
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Xoá đối tác CHỈ Admin (migration 052 chặn lần hai ở DB). Ẩn nút chỉ là cho
  // gọn mắt — người có cờ Báo cáo vẫn thêm/sửa bình thường, chỉ mất quyền xoá.
  const user = useCurrentUser();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const runWrite = useCallback(
    async (fn: () => Promise<{ error: unknown }>, failMsg: string) => {
      try {
        setSaving(true);
        setWriteErr("");
        const { error: e } = await fn();
        if (e) throw e;
        invalidateFinancePartners();
        await reload();
        return true;
      } catch (e) {
        setWriteErr(`${failMsg}: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [reload]
  );

  /**
   * Xoá đối tác từ ngoài danh sách.
   *
   * KHÔNG dùng `runWrite`: hàm đó chỉ bắt `error`, mà RLS chặn DELETE thì
   * Postgres không báo lỗi — nó xoá 0 dòng rồi trả về sạch sẽ. Phải đòi
   * `select("id")` để đếm dòng thật sự bị xoá, nếu không người dùng thấy màn
   * hình im lặng và tưởng đã xoá xong.
   */
  const removePartner = useCallback(
    async (p: FinancePartner, contractCount: number) => {
      if (deletingId) return;
      if (!confirm(
        `Xoá đối tác "${p.name}"?

` +
        (contractCount ? `${contractCount} dòng hợp đồng kèm theo cũng bị xoá.

` : "") +
        `Nếu chỉ muốn ẩn khỏi danh sách chọn thì mở đối tác ra, bỏ tick "Đang dùng" rồi Lưu — cách đó giữ lại dữ liệu.`
      )) return;
      setDeletingId(p.id);
      setWriteErr("");
      try {
        const { data, error: e } = await supabase
          .from("finance_partners")
          .delete()
          .eq("id", p.id)
          .select("id");
        if (e) throw e;
        if (!data || data.length === 0) {
          throw new Error("tài khoản của bạn không đủ quyền xoá đối tác.");
        }
        invalidateFinancePartners();
        await reload();
      } catch (e) {
        setWriteErr(`Không xoá được đối tác: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, reload]
  );

  // Gom hợp đồng theo đối tác một lần, thay vì filter lại trong mỗi thẻ.
  const contractsByPartner = useMemo(() => {
    const m = new Map<string, FinancePartnerContract[]>();
    for (const c of contracts) {
      const arr = m.get(c.partner_id);
      if (arr) arr.push(c);
      else m.set(c.partner_id, [c]);
    }
    return m;
  }, [contracts]);

  const visible = useMemo(() => {
    const q = foldVi(search);
    return partners.filter(p => {
      if (typeFilter && p.party_type !== typeFilter) return false;
      if (projectFilter) {
        const list = contractsByPartner.get(p.id) || [];
        if (!list.some(c => c.project_code === projectFilter)) return false;
      }
      if (!q) return true;
      return (
        foldVi(p.name).includes(q) ||
        foldVi(p.short_name || "").includes(q) ||
        (contractsByPartner.get(p.id) || []).some(c => foldVi(c.contract_no || "").includes(q))
      );
    });
  }, [partners, contractsByPartner, search, projectFilter, typeFilter]);

  const stats = useMemo(() => ({
    total: partners.length,
    thau: partners.filter(p => p.party_type === "nha_thau_phu").length,
    cdt: partners.filter(p => p.party_type === "chu_dau_tu").length,
    noBank: partners.filter(p => !p.bank_account).length,
  }), [partners]);

  const editing = editId ? partners.find(p => p.id === editId) || null : null;

  // ─── Bảng chưa tạo / không đọc được ───
  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-[11px] font-bold text-rose-700 flex items-start gap-3">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <div>
          {error}
          <p className="font-medium text-rose-600 mt-1.5">
            Nếu báo bảng không tồn tại: chạy{" "}
            <code className="bg-white px-1 rounded">048_finance_partner_catalog.sql</code>{" "}
            trong Supabase SQL Editor trước.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
        <Loader2 className="animate-spin text-[#005BAC]" size={32} />
        <p className="text-xs font-semibold">Đang tải danh mục đối tác...</p>
      </div>
    );
  }

  return (
    /* Giới hạn bề ngang: màn hình 2000px mà để tràn thì cột tên đối tác giãn ra
       vài trăm pixel trống, mắt phải quét ngang rất xa mới tới cột dự án. */
    <div className="space-y-6 max-w-6xl animate-in fade-in duration-300">
      {writeErr && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-center gap-3 animate-in fade-in duration-200">
          <AlertTriangle size={15} className="text-rose-500 shrink-0" />
          <p className="text-[11px] font-bold text-rose-700 flex-1">{writeErr}</p>
          <button
            type="button"
            onClick={() => setWriteErr("")}
            className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-all cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── Dải KPI ─── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Tổng đối tác" value={stats.total} icon={Users} grad="from-blue-500 to-cyan-600" />
        <KpiCard label="Nhà thầu phụ" value={stats.thau} icon={HardHat} grad="from-indigo-500 to-blue-600" />
        <KpiCard label="Chủ đầu tư" value={stats.cdt} icon={Briefcase} grad="from-emerald-500 to-teal-600" />
        <KpiCard label="Chưa có số TK" value={stats.noBank} icon={CreditCard} grad="from-amber-500 to-orange-600" />
      </div>

      {/* ─── Section header + nút thêm ─── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className={labelCls}>Danh mục đối tác thanh toán</h3>
          <p className="text-[11px] text-slate-400 font-medium mt-1">
            Hiện <strong className="text-slate-600">{visible.length}</strong>/{partners.length} đối tác
            {projectFilter && ` · dự án ${projects.find(p => p.code === projectFilter)?.name || projectFilter}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
        >
          <Plus size={14} /> Thêm đối tác
        </button>
      </div>

      {/* ─── Bộ lọc ─── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên đối tác, tên gọi tắt hoặc số hợp đồng..."
            className="w-full pl-9 pr-4 py-2 bg-slate-100/50 hover:bg-slate-100 focus:bg-white text-xs font-semibold text-slate-700 placeholder:text-slate-400 placeholder:font-medium border border-slate-200/60 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
        </div>

        {/* <select> chứ không phải ô tự lọc bằng React: ô search tự lọc chết bộ
            gõ tiếng Việt (đã vấp trong repo này). */}
        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className={`${inputCls} min-w-[180px] cursor-pointer`}
        >
          <option value="">Tất cả dự án</option>
          {projects.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
        </select>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as "" | PartyType)}
          className={`${inputCls} min-w-[150px] cursor-pointer`}
        >
          <option value="">Mọi loại đối tác</option>
          {PARTY_TYPES.map(t => <option key={t} value={t}>{PARTY_TYPE_LABELS[t]}</option>)}
        </select>

        <button
          type="button"
          onClick={reload}
          disabled={saving}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all cursor-pointer disabled:opacity-50"
          title="Tải lại"
        >
          <RefreshCw size={16} className={saving ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ─── Danh sách đối tác: MỘT CỘT DỌC, khung cuộn riêng ───
          Trước là lưới 3 cột thẻ to, dàn hết bề ngang màn hình mà mỗi thẻ chỉ có
          vài dòng chữ -> trông trống và phải quét mắt zíc-zắc. Xếp dọc theo cột
          căn thẳng hàng thì so số tài khoản / dự án giữa các đối tác nhanh hơn
          nhiều, và khung cuộn giữ cho trang không dài vô tận vì 49 dòng. */}
      {partners.length === 0 ? (
        /* Danh mục RỖNG THẬT khác với lọc không ra gì — báo "không khớp bộ lọc"
           lúc bảng chưa có dòng nào sẽ khiến người dùng đi chỉnh bộ lọc mãi
           không hiểu sao vẫn trống. */
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 space-y-3 bg-white rounded-2xl border border-slate-200/60 shadow-premium">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 ring-4 ring-slate-100/50">
            <Building2 size={26} />
          </div>
          <p className="font-heading font-extrabold text-slate-700 text-xs">
            Danh mục đối tác đang trống
          </p>
          <p className="text-slate-400 text-[11px] font-medium max-w-sm leading-relaxed">
            Bấm <strong className="text-slate-600">Thêm đối tác</strong> để nhập nhà thầu
            phụ đầu tiên — kèm số tài khoản, ngân hàng, dự án và nội dung thanh toán mẫu.
            Nhập một lần, các tháng sau chỉ việc chọn lại.
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/10 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
          >
            <Plus size={14} /> Thêm đối tác đầu tiên
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-slate-400 text-xs italic text-center py-12">
          Không có đối tác nào khớp bộ lọc.
        </p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-premium overflow-hidden">
          <div className="max-h-[560px] overflow-y-auto">
            {/* Header dính để cuộn xuống vẫn biết cột nào là cột nào */}
            <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <span className="w-7 shrink-0" />
              <span className={`${labelCls} flex-1 min-w-0`}>Đối tác</span>
              <span className={`${labelCls} w-28 shrink-0 hidden lg:block`}>Loại</span>
              <span className={`${labelCls} w-32 shrink-0 hidden md:block`}>Số tài khoản</span>
              <span className={`${labelCls} w-44 shrink-0 hidden xl:block`}>Ngân hàng · Chi nhánh</span>
              <span className={`${labelCls} w-16 shrink-0 text-center hidden sm:block`}>HĐ</span>
              <span className={`${labelCls} w-36 shrink-0 hidden lg:block`}>Dự án</span>
              {user.isAdmin && (
                <span className={`${labelCls} w-14 shrink-0 text-center`}>Thao tác</span>
              )}
            </div>

            <div className="divide-y divide-slate-100">
              {visible.map(p => (
                <PartnerRow
                  key={p.id}
                  partner={p}
                  contracts={contractsByPartner.get(p.id) || []}
                  onOpen={() => setEditId(p.id)}
                  canDelete={user.isAdmin}
                  deleting={deletingId === p.id}
                  onDelete={removePartner}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <PartnerModal
          partner={editing}
          contracts={contractsByPartner.get(editing.id) || []}
          projects={projects}
          saving={saving}
          canDelete={user.isAdmin}
          runWrite={runWrite}
          onClose={() => setEditId(null)}
        />
      )}

      {adding && (
        <AddPartnerModal
          saving={saving}
          nextSort={(partners.at(-1)?.sort_order ?? 0) + 10}
          projects={projects}
          defaultProjectCode={projectFilter}
          runWrite={runWrite}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

// ─── KPI ───
function KpiCard({ label, value, icon: Icon, grad }: {
  label: string; value: number; icon: typeof Users; grad: string;
}) {
  return (
    <div className="glass bg-white/80 rounded-2xl p-5 border border-slate-100 shadow-premium hover-elevate flex items-center justify-between gap-3">
      <div className="space-y-1 min-w-0">
        <p className="text-slate-500 text-[11px] font-semibold truncate">{label}</p>
        <p className="font-heading font-extrabold text-3xl text-slate-800 leading-none">{value}</p>
      </div>
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center shadow-md shrink-0`}>
        <Icon className="text-white" size={20} />
      </div>
    </div>
  );
}

// ─── Một dòng đối tác ───
// Các cột dùng CHUNG bề rộng cố định với header dính ở trên (w-28/w-32/w-44/
// w-16/w-36) — đổi số ở đây phải đổi cả trên đó, nếu không cột lệch khỏi tiêu đề.
// Cột phụ tự ẩn dần theo bề ngang màn hình, cột tên đối tác luôn còn.
function PartnerRow({ partner: p, contracts, onOpen, canDelete, deleting, onDelete }: {
  partner: FinancePartner;
  contracts: FinancePartnerContract[];
  onOpen: () => void;
  canDelete: boolean;
  deleting: boolean;
  onDelete: (p: FinancePartner, contractCount: number) => void;
}) {
  const st = TYPE_STYLE[p.party_type];
  const projectNames = Array.from(
    new Set(contracts.map(c => c.project_name).filter(Boolean))
  ) as string[];
  const bankLine = [p.bank_name, p.bank_branch].filter(Boolean).join(" · ");

  return (
    // <div role="button"> chứ không phải <button>: dòng có nút Xoá lồng bên
    // trong, mà <button> lồng <button> là HTML sai — trình duyệt sẽ nuốt cú bấm
    // của nút con.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
      }}
      className={`w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/80 transition-colors cursor-pointer ${
        p.active ? "" : "opacity-55"
      }`}
    >
      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${st.grad} flex items-center justify-center shadow-sm shrink-0`}>
        <Building2 className="text-white" size={14} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-xs truncate leading-tight">{p.name}</p>
        {p.short_name && (
          <p className="text-[10px] font-medium text-slate-400 truncate mt-0.5">{p.short_name}</p>
        )}
      </div>

      <span className="w-28 shrink-0 hidden lg:block">
        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${st.chip}`}>
          {PARTY_TYPE_LABELS[p.party_type]}
        </span>
      </span>

      <span className="w-32 shrink-0 hidden md:block">
        {p.bank_account ? (
          <span className="flex items-center gap-1 font-mono font-bold text-slate-700 text-[11px] truncate">
            <Landmark size={11} className="text-emerald-600 shrink-0" />
            {p.bank_account}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
            <CreditCard size={11} className="shrink-0" /> Chưa có
          </span>
        )}
      </span>

      <span className="w-44 shrink-0 hidden xl:block text-[10px] font-medium text-slate-400 truncate">
        {bankLine || "—"}
      </span>

      <span className="w-16 shrink-0 hidden sm:flex items-center justify-center gap-1 text-[10px] font-bold text-slate-400">
        <FileText size={11} /> {contracts.length}
      </span>

      <span className="w-36 shrink-0 hidden lg:block text-[10px] font-semibold text-slate-400 truncate">
        {projectNames.slice(0, 2).join(", ")}
        {projectNames.length > 2 ? ` +${projectNames.length - 2}` : ""}
        {projectNames.length === 0 && "—"}
      </span>

      {canDelete && (
        <span className="w-14 shrink-0 flex items-center justify-center">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(p, contracts.length); }}
            disabled={deleting}
            title={`Xoá đối tác ${p.name}`}
            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </span>
      )}
    </div>
  );
}

// ─── Khung modal dùng chung ───
function ModalShell({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle: string; onClose: () => void;
  children: React.ReactNode; footer: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // createPortal: khối `.glass` cha có backdrop-filter sẽ nhốt phần tử `fixed`.
  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[8vh] p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200/60 bg-slate-50/70 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-sm shrink-0">
            <Building2 size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-heading font-extrabold text-slate-800 text-xs leading-tight truncate">{title}</h4>
            <p className="text-[10px] text-slate-400 font-semibold truncate">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">{children}</div>

        <div className="border-t border-slate-200/60 bg-slate-50/70 px-5 py-3 flex justify-end gap-2 shrink-0">
          {footer}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Modal thêm đối tác ───
// Gắn LUÔN một dòng hợp đồng đầu tiên (dự án + số HĐ + nội dung) ngay khi thêm.
// Bản đầu chỉ tạo đơn vị rồi bắt mở lại modal sửa mới chọn được dự án — thừa
// một bước, mà trong thực tế thêm nhà thầu bao giờ cũng là "thêm cho dự án nào".
// Dự án đổ từ danh mục `projects` (Cài đặt > Danh mục công việc > Danh sách dự
// án triển khai), hiển thị kèm MÃ để đối chiếu với hồ sơ giấy.
function AddPartnerModal({ saving, nextSort, projects, defaultProjectCode, runWrite, onClose }: {
  saving: boolean; nextSort: number;
  projects: { id: string; code: string; name: string }[];
  defaultProjectCode: string;
  runWrite: (fn: () => Promise<{ error: unknown }>, msg: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [type, setType] = useState<PartyType>("nha_thau_phu");
  const [account, setAccount] = useState("");
  const [bank, setBank] = useState("");
  const [branch, setBranch] = useState("");
  // Đang lọc theo dự án nào thì mặc định thêm cho dự án đó.
  const [projectCode, setProjectCode] = useState(defaultProjectCode);
  const [contractNo, setContractNo] = useState("");
  const [flow, setFlow] = useState<"thu" | "chi">("chi");
  const [department, setDepartment] = useState("");
  const [content, setContent] = useState("");

  const project = projects.find(p => p.code === projectCode);

  const submit = async () => {
    if (!name.trim()) return;
    const ok = await runWrite(
      async () => {
        // Hai bước, không phải một transaction: Supabase JS không cho gộp.
        // Tạo đơn vị trước, lấy id rồi mới gắn hợp đồng.
        const { data, error } = await supabase
          .from("finance_partners")
          .insert([{
            name: name.trim(),
            short_name: short.trim() || null,
            party_type: type,
            bank_account: account.trim() || null,
            bank_name: bank.trim() || null,
            bank_branch: branch.trim() || null,
            sort_order: nextSort,
          }])
          .select("id")
          .single();
        if (error) return { error };

        // Không chọn dự án thì thôi — đơn vị vẫn được tạo, gắn hợp đồng sau.
        if (!projectCode && !contractNo.trim() && !content.trim()) return { error: null };

        const res = await supabase.from("finance_partner_contracts").insert([{
          partner_id: data.id,
          project_code: projectCode || null,
          project_name: project?.name || null,
          contract_no: contractNo.trim() || null,
          default_content: content.trim() || null,
          flow,
          department: department.trim() || null,
        }]);
        // Đơn vị ĐÃ tạo xong ở bước trên rồi, nên nếu hỏng ở đây thì nói đúng
        // chuyện đang hỏng — báo "không thêm được đối tác" sẽ khiến người dùng
        // thêm lại lần nữa và dính lỗi trùng tên.
        if (res.error) {
          const m = res.error instanceof Error ? res.error.message : String(res.error);
          return { error: new Error(`đã tạo "${name.trim()}" nhưng chưa gắn được hợp đồng (${m}). Mở đối tác đó ra thêm hợp đồng thủ công.`) };
        }
        return { error: null };
      },
      "Không thêm được đối tác"
    );
    if (ok) onClose();
  };

  return (
    <ModalShell
      title="Thêm đối tác mới"
      subtitle="Nhà thầu phụ, nhà cung cấp hoặc chủ đầu tư"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-slate-500 hover:bg-slate-200/60 font-bold rounded-xl text-xs transition-all cursor-pointer">
            Huỷ
          </button>
          <button type="button" onClick={submit} disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-blue-500/10 transition-all cursor-pointer">
            <Plus size={14} /> Thêm đối tác
          </button>
        </>
      }
    >
      {/* Thông tin đơn vị */}
      <div className="space-y-3">
        <h5 className={labelCls}>Thông tin đơn vị</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className={labelCls}>Tên đầy đủ *</span>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              placeholder="VD Công ty TNHH Xây dựng và Thương mại Yên Phúc" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Tên gọi tắt</span>
            <input value={short} onChange={e => setShort(e.target.value)}
              placeholder="VD Yên Phúc" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Loại đối tác</span>
            <select value={type} onChange={e => setType(e.target.value as PartyType)}
              className={`${inputCls} cursor-pointer`}>
              {PARTY_TYPES.map(t => <option key={t} value={t}>{PARTY_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Dự án + hợp đồng đầu tiên */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h5 className={labelCls}>Dự án &amp; hợp đồng</h5>
          <span className="text-[10px] text-slate-400 font-medium">
            Danh sách lấy từ Cài đặt → Danh mục công việc → Dự án triển khai
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Dự án</span>
            <select value={projectCode} onChange={e => setProjectCode(e.target.value)}
              className={`${inputCls} cursor-pointer`}>
              <option value="">— Chưa gắn dự án —</option>
              {projects.map(p => (
                <option key={p.id} value={p.code}>{p.code} — {p.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Mã dự án</span>
            {/* Chỉ đọc, tự điền theo dự án đã chọn — cùng lối form giao việc:
                chọn tên là mã tự theo, không cho gõ tay để khỏi lệch. */}
            <input value={project?.code || ""} readOnly
              placeholder="Tự điền theo dự án"
              className={`${inputCls} font-mono bg-slate-50 text-slate-500 cursor-not-allowed`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Số hợp đồng</span>
            <input value={contractNo} onChange={e => setContractNo(e.target.value)}
              placeholder="VD 1011/2025/HĐNT/TNE&C-YP" className={`${inputCls} font-mono`} />
          </label>
          <div className="grid grid-cols-2 gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Thu / Chi</span>
              <select value={flow} onChange={e => setFlow(e.target.value as "thu" | "chi")}
                className={`${inputCls} cursor-pointer`}>
                <option value="chi">Chi</option>
                <option value="thu">Thu</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Phòng ban</span>
              <input value={department} onChange={e => setDepartment(e.target.value)}
                placeholder="VD PKHĐT" className={inputCls} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className={labelCls}>Nội dung thanh toán mẫu</span>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={2}
              placeholder="VD Thanh toán đợt 1 HĐ số ... — dán thẳng sang phiếu đề nghị chuyển tiền"
              className={`${inputCls} resize-y leading-relaxed`} />
          </label>
        </div>
      </div>

      {/* Ngân hàng */}
      <div className="space-y-3">
        <h5 className={labelCls}>Tài khoản nhận tiền</h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Số tài khoản</span>
            <input value={account} onChange={e => setAccount(e.target.value)}
              placeholder="VD 0942870512" className={`${inputCls} font-mono`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Ngân hàng</span>
            <input value={bank} onChange={e => setBank(e.target.value)}
              placeholder="VD Ngân hàng ACB" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Chi nhánh / PGD</span>
            <input value={branch} onChange={e => setBranch(e.target.value)}
              placeholder="VD CN Tân Bình" className={inputCls} />
          </label>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 font-medium">
        Chưa có thông tin ngân hàng hoặc chưa ký hợp đồng thì cứ để trống — thêm đối tác
        trước, bổ sung sau. Một đối tác chạy nhiều dự án thì thêm tiếp hợp đồng trong màn hình sửa.
      </p>
    </ModalShell>
  );
}

// ─── Modal sửa đối tác + hợp đồng ───
function PartnerModal({ partner: p, contracts, projects, saving, canDelete, runWrite, onClose }: {
  partner: FinancePartner;
  contracts: FinancePartnerContract[];
  projects: { id: string; code: string; name: string }[];
  saving: boolean;
  // Cùng một luật với icon thùng rác ngoài danh sách: chỉ Admin. Hai chỗ cùng
  // đọc `user.isAdmin` ở component cha nên không thể lệch nhau.
  canDelete: boolean;
  runWrite: (fn: () => Promise<{ error: unknown }>, msg: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [d, setD] = useState<Partial<FinancePartner>>({});
  const [cd, setCd] = useState<Record<string, Partial<FinancePartnerContract>>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const dirty = Object.keys(d).length > 0;
  const set = (k: keyof FinancePartner, v: unknown) => setD(prev => ({ ...prev, [k]: v }));
  const val = <K extends keyof FinancePartner>(k: K) => (d[k] ?? p[k] ?? "") as string;

  const savePartner = async () => {
    const ok = await runWrite(
      async () => supabase.from("finance_partners").update({
        name: (d.name ?? p.name).trim(),
        short_name: (d.short_name ?? p.short_name)?.trim() || null,
        party_type: d.party_type ?? p.party_type,
        tax_code: (d.tax_code ?? p.tax_code)?.trim() || null,
        bank_account: (d.bank_account ?? p.bank_account)?.trim() || null,
        bank_name: (d.bank_name ?? p.bank_name)?.trim() || null,
        bank_branch: (d.bank_branch ?? p.bank_branch)?.trim() || null,
        note: (d.note ?? p.note)?.trim() || null,
        active: d.active ?? p.active,
      }).eq("id", p.id),
      "Không lưu được đối tác"
    );
    if (ok) setD({});
  };

  const removePartner = async () => {
    if (!confirm(
      `Xoá đối tác "${p.name}"?\n\n` +
      (contracts.length ? `${contracts.length} dòng hợp đồng kèm theo cũng bị xoá.\n\n` : "") +
      `Nếu chỉ muốn ẩn khỏi danh sách chọn thì bỏ tick "Đang dùng" rồi Lưu — cách đó giữ lại dữ liệu.`
    )) return;
    const ok = await runWrite(
      async () => supabase.from("finance_partners").delete().eq("id", p.id),
      "Không xoá được đối tác"
    );
    if (ok) onClose();
  };

  const addContract = () =>
    runWrite(
      async () => supabase.from("finance_partner_contracts")
        .insert([{ partner_id: p.id, flow: "chi" }]),
      "Không thêm được dòng hợp đồng"
    );

  const saveContract = async (c: FinancePartnerContract) => {
    const x = cd[c.id];
    if (!x) return;
    const code = x.project_code ?? c.project_code;
    const found = projects.find(pr => pr.code === code);
    // Tên dự án bám theo MÃ vừa chọn. Mã không có trong danh mục đang bật (dự án
    // đã tắt) thì chỉ giữ tên cũ khi mã KHÔNG đổi — đổi sang mã lạ mà bê nguyên
    // tên cũ sẽ tạo dòng mã một đằng tên một nẻo.
    const projectName = found ? found.name : (code === c.project_code ? c.project_name : null);
    const ok = await runWrite(
      async () => supabase.from("finance_partner_contracts").update({
        project_code: code || null,
        project_name: projectName,
        contract_no: (x.contract_no ?? c.contract_no)?.trim() || null,
        default_content: (x.default_content ?? c.default_content)?.trim() || null,
        flow: x.flow ?? c.flow,
        department: (x.department ?? c.department)?.trim() || null,
      }).eq("id", c.id),
      "Không lưu được dòng hợp đồng"
    );
    if (ok) setCd(prev => { const n = { ...prev }; delete n[c.id]; return n; });
  };

  const removeContract = (c: FinancePartnerContract) => {
    if (!confirm(`Xoá dòng hợp đồng "${c.contract_no || "(chưa có số)"}"?`)) return;
    runWrite(
      async () => supabase.from("finance_partner_contracts").delete().eq("id", c.id),
      "Không xoá được dòng hợp đồng"
    );
  };

  const copyContent = async (c: FinancePartnerContract) => {
    if (!c.default_content) return;
    try {
      await navigator.clipboard.writeText(c.default_content);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(cur => (cur === c.id ? null : cur)), 1500);
    } catch { /* trình duyệt chặn — người dùng bôi đen Ctrl+C */ }
  };

  return (
    <ModalShell
      title={p.name}
      subtitle={`${PARTY_TYPE_LABELS[p.party_type]} · ${contracts.length} hợp đồng`}
      onClose={onClose}
      footer={
        <>
          {canDelete && (
            <button type="button" onClick={removePartner} disabled={saving}
              className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 text-[11px] text-rose-500 hover:bg-rose-50 font-bold rounded-xl border border-transparent hover:border-rose-100 transition-all cursor-pointer disabled:opacity-50">
              <Trash2 size={13} /> Xoá đối tác
            </button>
          )}
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-slate-500 hover:bg-slate-200/60 font-bold rounded-xl text-xs transition-all cursor-pointer">
            Đóng
          </button>
          <button type="button" onClick={savePartner} disabled={saving || !dirty}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-blue-500/10 transition-all cursor-pointer">
            <Save size={14} /> Lưu thay đổi
          </button>
        </>
      }
    >
      {/* Thông tin đơn vị */}
      <div className="space-y-3">
        <h5 className={labelCls}>Thông tin đơn vị</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className={labelCls}>Tên đầy đủ</span>
            <input value={val("name")} onChange={e => set("name", e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Tên gọi tắt</span>
            <input value={val("short_name")} onChange={e => set("short_name", e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Loại đối tác</span>
            <select value={(d.party_type ?? p.party_type) as string}
              onChange={e => set("party_type", e.target.value)} className={`${inputCls} cursor-pointer`}>
              {PARTY_TYPES.map(t => <option key={t} value={t}>{PARTY_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Ngân hàng */}
      <div className="space-y-3">
        <h5 className={labelCls}>Tài khoản nhận tiền</h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Số tài khoản</span>
            <input value={val("bank_account")} onChange={e => set("bank_account", e.target.value)}
              placeholder="VD 0942870512" className={`${inputCls} font-mono`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Ngân hàng</span>
            <input value={val("bank_name")} onChange={e => set("bank_name", e.target.value)}
              placeholder="VD Ngân hàng ACB" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Chi nhánh / PGD</span>
            <input value={val("bank_branch")} onChange={e => set("bank_branch", e.target.value)}
              placeholder="VD CN Tân Bình" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Mã số thuế</span>
            <input value={val("tax_code")} onChange={e => set("tax_code", e.target.value)} className={`${inputCls} font-mono`} />
          </label>
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className={labelCls}>Ghi chú</span>
            <input value={val("note")} onChange={e => set("note", e.target.value)} className={inputCls} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 cursor-pointer">
          <input type="checkbox" checked={(d.active ?? p.active) as boolean}
            onChange={e => set("active", e.target.checked)} />
          Đang dùng (bỏ tick để ẩn khỏi danh sách chọn mà vẫn giữ dữ liệu)
        </label>
      </div>

      {/* Hợp đồng */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h5 className={labelCls}>Hợp đồng &amp; nội dung thanh toán</h5>
          <button type="button" onClick={addContract} disabled={saving}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 text-slate-600 font-bold rounded-lg text-[10px] transition-all cursor-pointer disabled:opacity-50">
            <Plus size={12} /> Thêm hợp đồng
          </button>
        </div>

        {contracts.length === 0 ? (
          <p className="text-slate-400 text-xs italic text-center py-6">Chưa có hợp đồng nào.</p>
        ) : (
          <div className="space-y-2.5">
            {contracts.map(c => {
              const x = cd[c.id] || {};
              const cDirty = Object.keys(x).length > 0;
              const cSet = (k: keyof FinancePartnerContract, v: unknown) =>
                setCd(prev => ({ ...prev, [c.id]: { ...prev[c.id], [k]: v } }));
              const cVal = <K extends keyof FinancePartnerContract>(k: K) => (x[k] ?? c[k] ?? "") as string;
              const code = cVal("project_code");

              return (
                <div key={c.id}
                  className={`bg-slate-50/60 border rounded-xl p-3 space-y-2.5 transition-all ${
                    cDirty ? "border-blue-300 bg-blue-50/30" : "border-slate-200/70"
                  }`}>
                  <div className="flex flex-wrap gap-2">
                    <select value={code} onChange={e => cSet("project_code", e.target.value)}
                      className={`${inputCls} min-w-[210px] cursor-pointer`}>
                      <option value="">— Chọn dự án —</option>
                      {/* Dự án đã tắt vẫn phải hiện, nếu không ô này trông như bỏ
                          trống và người dùng tưởng hợp đồng bị mất dự án. */}
                      {code && !projects.some(pr => pr.code === code) && (
                        <option value={code}>{code} — {c.project_name || "(đã tắt)"}</option>
                      )}
                      {projects.map(pr => (
                        <option key={pr.id} value={pr.code}>{pr.code} — {pr.name}</option>
                      ))}
                    </select>
                    {code && (
                      <span className="inline-flex items-center px-2.5 rounded-xl bg-slate-100 border border-slate-200 font-mono font-bold text-[10px] text-slate-500 shrink-0">
                        {code}
                      </span>
                    )}
                    <input value={cVal("contract_no")} onChange={e => cSet("contract_no", e.target.value)}
                      placeholder="Số hợp đồng" className={`${inputCls} flex-1 min-w-[180px] font-mono`} />
                    <select value={cVal("flow")} onChange={e => cSet("flow", e.target.value)}
                      className={`${inputCls} w-[76px] cursor-pointer`}>
                      <option value="chi">Chi</option>
                      <option value="thu">Thu</option>
                    </select>
                    <input value={cVal("department")} onChange={e => cSet("department", e.target.value)}
                      placeholder="Phòng ban" className={`${inputCls} w-36`} />
                  </div>

                  <div className="flex gap-2 items-start">
                    <textarea value={cVal("default_content")}
                      onChange={e => cSet("default_content", e.target.value)}
                      placeholder="Nội dung thanh toán mẫu — dán thẳng sang phiếu đề nghị chuyển tiền"
                      rows={2}
                      className={`${inputCls} flex-1 resize-y leading-relaxed`} />
                    <div className="flex flex-col gap-1 shrink-0">
                      <button type="button" onClick={() => copyContent(c)} disabled={!c.default_content}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer disabled:opacity-30"
                        title="Sao chép nội dung thanh toán">
                        {copiedId === c.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                      <button type="button" onClick={() => saveContract(c)} disabled={saving || !cDirty}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer disabled:opacity-30"
                        title="Lưu dòng hợp đồng">
                        <Save size={14} />
                      </button>
                      <button type="button" onClick={() => removeContract(c)} disabled={saving}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                        title="Xoá dòng hợp đồng">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
