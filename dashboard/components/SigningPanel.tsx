"use client";

// ============================================================
// SigningPanel — danh sách phiếu trình ký + hộp duyệt của từng cấp.
//
// Một màn hình phục vụ 3 vai khác nhau, phân biệt bằng bộ lọc chứ không tách
// trang: người lập (xem phiếu của mình), cấp duyệt (xem việc cần xử lý), và
// người theo dõi (xem toàn bộ). Tách 3 trang thì cùng một dữ liệu phải dựng 3
// lần, mà thực tế một người có thể kiêm nhiều vai.
//
// Luật hiển thị lấy từ lib/signingSubmissions (canActOn / canEdit). Chốt chặn
// thật nằm ở trigger + RLS của migration 050 — ẩn nút chỉ là cho gọn mắt.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/useCurrentUser";
import SigningFormModal from "./SigningFormModal";
import { apiFetch } from "@/lib/apiClient";
import { crumpleToss } from "@/lib/crumpleToss";
import {
  fetchSubmissions, canActOn, canEdit, stagesOf, nextStatus, tinhDeNghi,
  fmtMoney, fmtDateTime, resolveDossierUrl, fetchStageApproverEmails, errText,
  normalizeStatus, pgdOpinionField, downloadSigningForm, docxPayloadFromRow, docxFileName,
  deleteSubmission, duplicateSubmission, appendDossierFiles, removeDossierFile,
  STATUS_META, ACTION_LABEL, EVENT_LABEL, FLOW,
  type SigningSubmission, type SigningStatus,
} from "@/lib/signingSubmissions";
import {
  FileText, Plus, Loader2, RefreshCw, Search, AlertTriangle, X, Check,
  Undo2, Inbox, ClipboardCheck, CircleDot, ExternalLink, Pencil, Send, Download, Trash2,
  CopyPlus, Eye, Upload, FileWarning,
} from "lucide-react";

// Cột "File gốc" chỉ nhận PDF và ảnh, tối đa 4MB. Chặt hơn hẳn ô tải hồ sơ
// trong form soạn phiếu (8 tệp / 25MB, nhận cả Word/Excel) — đây là chỗ đính
// kèm nhanh ngay trên danh sách, không phải nơi nộp cả bộ hồ sơ.
const QUICK_MAX_BYTES = 4 * 1024 * 1024;
const QUICK_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const QUICK_TYPE_RE = /\.(pdf|png|jpe?g|webp)$/i;

const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
// Nhãn cột trên thanh tiêu đề nền xanh — cùng cỡ chữ với labelCls, khác mỗi màu.
const headCls = "text-[10px] font-extrabold text-white uppercase tracking-wider";
const inputCls =
  "border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-semibold text-slate-800 text-xs bg-white transition-all";

type Filter = "can_duyet" | "cua_toi" | "tat_ca";

export default function SigningPanel() {
  const user = useCurrentUser();
  const [rows, setRows] = useState<SigningSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<Filter>("can_duyet");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SigningSubmission | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<SigningSubmission | null>(null);
  const [mailWarn, setMailWarn] = useState("");
  // id phiếu đang xoá — khoá riêng từng dòng để không chặn cả bảng, và để bấm
  // trùng vào cùng một nút không bắn hai lệnh delete.
  const [deleting, setDeleting] = useState<string | null>(null);
  // Lỗi khi xoá KHÔNG dùng chung state `err`: `err` có early-return che sạch
  // panel, một lần bấm hụt là mất cả danh sách.
  const [delErr, setDelErr] = useState("");
  // Nhân đôi / đính kèm nhanh — khoá theo TỪNG dòng để bấm ở dòng này không làm
  // đơ nút của dòng khác, và bấm trùng vào cùng một nút không bắn hai lệnh.
  const [dupId, setDupId] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const quickFileRef = useRef<HTMLInputElement>(null);
  const quickTargetRef = useRef<SigningSubmission | null>(null);
  // Phiếu đang mở cửa sổ xem tệp. Giữ CẢ DÒNG chứ không giữ mỗi đường dẫn: phiếu
  // có nhiều tệp thì cửa sổ còn cho lật qua lại giữa chúng.
  const [previewRow, setPreviewRow] = useState<SigningSubmission | null>(null);

  const duplicateRow = async (r: SigningSubmission) => {
    if (dupId) return;
    setDupId(r.id);
    setDelErr("");
    try {
      const copy = await duplicateSubmission(r, user.email, user.name);
      await load();
      // Mở luôn bản sao ra sửa — nhân đôi bao giờ cũng là để sửa thành phiếu
      // khác, bắt người dùng tự đi tìm dòng mới trong danh sách là thừa một bước.
      setEditing(copy);
    } catch (e) {
      setDelErr(`Không nhân đôi được phiếu: ${errText(e)}`);
    } finally {
      setDupId(null);
    }
  };

  const pickQuickFile = (r: SigningSubmission) => {
    quickTargetRef.current = r;
    quickFileRef.current?.click();
  };

  const uploadQuickFiles = async (picked: File[]) => {
    const r = quickTargetRef.current;
    if (!r || picked.length === 0) return;
    // Kiểm ở client TRƯỚC khi gửi: để kho tự từ chối thì người dùng chờ hết cả
    // lượt tải rồi mới nhận lỗi, mà thông báo của kho lại bằng tiếng Anh.
    const sai = picked.find(f => !QUICK_TYPE_RE.test(f.name));
    if (sai) {
      setDelErr(`"${sai.name}" không phải PDF hay ảnh — cột File gốc chỉ nhận PDF, PNG, JPG, WEBP.`);
      return;
    }
    const to = picked.find(f => f.size > QUICK_MAX_BYTES);
    if (to) {
      setDelErr(`"${to.name}" nặng ${(to.size / 1024 / 1024).toFixed(1)}MB — vượt mức 4MB.`);
      return;
    }
    setUploadId(r.id);
    setDelErr("");
    try {
      await appendDossierFiles(r, picked);
      await load();
    } catch (e) {
      setDelErr(`Không tải lên được tệp: ${errText(e)}`);
    } finally {
      setUploadId(null);
      quickTargetRef.current = null;
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      setRows(await fetchSubmissions());
    } catch (e) {
      setErr(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Xoá phiếu — CHỈ Admin thấy nút này (RLS migration 050 chặn lần hai ở DB).
  // Xoá xong nạp lại cả bảng thay vì gỡ dòng khỏi state: KPI phía trên đếm từ
  // `rows`, gỡ tay thì phải nhớ trừ đúng ô KPI tương ứng, nạp lại là chắc.
  const removeRow = async (r: SigningSubmission, rowEl: HTMLElement | null, btn: HTMLElement | null) => {
    if (deleting) return;
    if (!confirm(
      `Xoá phiếu "${r.ma_phieu || "(chưa có mã)"}"?

` +
      `Hợp đồng: ${r.hop_dong_so || "—"}
` +
      `Toàn bộ lịch sử duyệt của phiếu cũng mất theo. Không khôi phục được.`
    )) return;
    setDeleting(r.id);
    setDelErr("");
    // Vò dòng ném vào sọt NGAY khi bấm, không đợi server: phản hồi tức thì là
    // điểm chính của hiệu ứng. Xoá hỏng thì toss.cancel() bung dòng trở lại.
    const toss = crumpleToss(rowEl, { origin: btn });
    try {
      await deleteSubmission(r.id);
      toss.done(`Đã xoá phiếu ${r.ma_phieu || "trình ký"}`);
      await load();
    } catch (e) {
      toss.cancel();
      setDelErr(errText(e));
    } finally {
      setDeleting(null);
    }
  };

  const myStages = useMemo(() => stagesOf(user.perms), [user.perms]);
  const canCreate = user.isAdmin || user.perms.canCreateSigning;

  // Mặc định mở đúng cái người dùng cần: cấp duyệt thấy hộp việc, người lập
  // thấy phiếu của mình. Chỉ chạy một lần sau khi biết danh tính.
  const [pickedDefault, setPickedDefault] = useState(false);
  useEffect(() => {
    if (user.loading || pickedDefault) return;
    setFilter(myStages.length > 0 ? "can_duyet" : canCreate ? "cua_toi" : "tat_ca");
    setPickedDefault(true);
  }, [user.loading, myStages.length, canCreate, pickedDefault]);

  const canDuyet = useMemo(
    () => rows.filter((r) => canActOn(r, user.perms, user.isAdmin) && !["hoan_tat", "nhap", "tra_lai"].includes(r.status)),
    [rows, user.perms, user.isAdmin]
  );
  const cuaToi = useMemo(
    () => rows.filter((r) => r.created_by.toLowerCase() === user.email.toLowerCase()),
    [rows, user.email]
  );

  const visible = useMemo(() => {
    const base = filter === "can_duyet" ? canDuyet : filter === "cua_toi" ? cuaToi : rows;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      [r.ma_phieu, r.hop_dong_so, r.chu_dau_tu, r.du_an, r.goi_thau]
        .some((x) => (x || "").toLowerCase().includes(q))
    );
  }, [filter, canDuyet, cuaToi, rows, search]);

  const stats = useMemo(() => ({
    canXuLy: canDuyet.length,
    dangChay: rows.filter((r) => FLOW.includes(normalizeStatus(r.status)) && r.status !== "hoan_tat").length,
    traLai: rows.filter((r) => r.status === "tra_lai").length,
    hoanTat: rows.filter((r) => r.status === "hoan_tat").length,
  }), [rows, canDuyet]);

  if (user.loading || loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
        <Loader2 className="animate-spin text-[#005BAC]" size={32} />
        <p className="text-xs font-semibold">Đang tải phiếu trình ký…</p>
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
            <code className="bg-white px-1 rounded">050_signing_submissions.sql</code> rồi{" "}
            <code className="bg-white px-1 rounded">051_signing_dossier_bucket.sql</code>{" "}
            trong Supabase SQL Editor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {mailWarn && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-amber-800">
              Phiếu ĐÃ chuyển bước, nhưng email thông báo không gửi được.
            </p>
            <p className="text-[11px] font-medium text-amber-700 mt-0.5 break-words">{mailWarn}</p>
          </div>
          <button type="button" onClick={() => setMailWarn("")}
            className="p-1 text-amber-400 hover:text-amber-600 hover:bg-amber-100 rounded-lg cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {delErr && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="flex-1 min-w-0 text-[11px] font-bold text-rose-700 break-words">{delErr}</p>
          <button type="button" onClick={() => setDelErr("")}
            className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi label="Cần tôi xử lý" value={stats.canXuLy} icon={Inbox} grad="from-amber-500 to-orange-600" />
        <Kpi label="Đang luân chuyển" value={stats.dangChay} icon={CircleDot} grad="from-blue-500 to-cyan-600" />
        <Kpi label="Bị trả lại" value={stats.traLai} icon={Undo2} grad="from-rose-500 to-pink-600" />
        <Kpi label="Hoàn tất" value={stats.hoanTat} icon={ClipboardCheck} grad="from-emerald-500 to-teal-600" />
      </div>

      {/* Thanh công cụ */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className={labelCls}>Phiếu trình ký hồ sơ / văn bản</h3>
          <p className="text-[11px] text-slate-400 font-medium mt-1">
            Hiện <strong className="text-slate-600">{visible.length}</strong> phiếu
          </p>
        </div>
        {canCreate && (
          <button type="button" onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/10 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer">
            <Plus size={14} /> Lập phiếu
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex bg-slate-100/70 rounded-xl p-1 gap-1">
          {([
            ["can_duyet", `Cần tôi duyệt (${canDuyet.length})`],
            ["cua_toi", `Phiếu của tôi (${cuaToi.length})`],
            ["tat_ca", `Tất cả (${rows.length})`],
          ] as [Filter, string][]).map(([k, lb]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                filter === k ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              {lb}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã phiếu, số hợp đồng, chủ đầu tư, dự án…"
            className="w-full pl-9 pr-4 py-2 bg-slate-100/50 hover:bg-slate-100 focus:bg-white text-xs font-semibold text-slate-700 placeholder:text-slate-400 placeholder:font-medium border border-slate-200/60 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" />
        </div>
        <button type="button" onClick={load}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all cursor-pointer">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Danh sách */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 space-y-3 bg-white rounded-2xl border border-slate-200/60 shadow-premium">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 ring-4 ring-slate-100/50">
            <FileText size={26} />
          </div>
          <p className="font-heading font-extrabold text-slate-700 text-xs">
            {filter === "can_duyet" ? "Không có phiếu nào chờ bạn duyệt"
              : filter === "cua_toi" ? "Bạn chưa lập phiếu nào"
              : "Chưa có phiếu trình ký nào"}
          </p>
          {canCreate && filter !== "can_duyet" && (
            <button type="button" onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/10 transition-all cursor-pointer">
              <Plus size={14} /> Lập phiếu đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-premium overflow-hidden">
          <div className="max-h-[560px] overflow-y-auto">
            {/* Thanh tiêu đề nền xanh, chữ trắng. Bản trước dùng nền xám nhạt
                + chữ slate-400 nên chìm nghỉm vào dòng dữ liệu, nhìn lướt không
                thấy đâu là tiêu đề cột. Màu đặc nên hiện đúng ở cả nền sáng lẫn
                nền tối, không phải nhờ bảng remap dark mode. */}
            <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#005BAC] to-blue-500 shadow-sm">
              <span className={`${headCls} w-24 shrink-0`}>Mã phiếu</span>
              <span className={`${headCls} flex-1 min-w-0`}>Hợp đồng / Dự án</span>
              <span className={`${headCls} w-14 shrink-0 text-center hidden sm:block`}>Đợt</span>
              {/* pr-6: số tiền căn phải, chip trạng thái căn trái — không chừa lề
                  thì hai cột dính vào nhau thành một khối chữ. */}
              <span className={`${headCls} w-36 shrink-0 text-right pr-6 hidden md:block`}>Đề nghị TT</span>
              <span className={`${headCls} w-20 shrink-0 text-center hidden md:block`}>File gốc</span>
              <span className={`${headCls} w-32 shrink-0 hidden lg:block`}>Trạng thái</span>
              {(user.isAdmin || canCreate) && (
                <span className={`${headCls} w-20 shrink-0 text-center`}>Thao tác</span>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {visible.map((r) => {
                const meta = STATUS_META[r.status];
                const mine = canActOn(r, user.perms, user.isAdmin) &&
                  !["hoan_tat", "nhap", "tra_lai"].includes(r.status);
                return (
                  // Dòng là <div role="button"> chứ không phải <button>: bên trong
                  // có nút Xoá riêng, mà <button> lồng <button> là HTML sai và
                  // trình duyệt sẽ nuốt cú bấm của nút con.
                  <div key={r.id} role="button" tabIndex={0} data-toss-row
                    onClick={() => setViewing(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewing(r); }
                    }}
                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/80 transition-colors cursor-pointer">
                    <span className="w-24 shrink-0 font-mono font-bold text-[11px] text-slate-500 truncate">
                      {r.ma_phieu || "—"}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-slate-800 text-xs truncate leading-tight">
                        {r.hop_dong_so || "(chưa có số HĐ)"}
                      </span>
                      <span className="block text-[10px] font-medium text-slate-400 truncate mt-0.5">
                        {r.chu_dau_tu || r.du_an || "—"}
                      </span>
                    </span>
                    <span className="w-14 shrink-0 text-center text-[11px] font-bold text-slate-500 hidden sm:block">
                      {r.dot_so ?? "—"}
                    </span>
                    <span className="w-36 shrink-0 text-right pr-6 font-mono font-bold text-[11px] text-slate-700 hidden md:block">
                      {fmtMoney(r.de_nghi_thanh_toan ?? tinhDeNghi(r))}
                    </span>
                    {/* File gốc — xem tệp đã có và đính kèm thêm ngay tại dòng */}
                    <span className="w-20 shrink-0 hidden md:flex items-center justify-center gap-0.5">
                      {r.files.length > 0 && (
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); setPreviewRow(r); }}
                          title={`Xem ${r.files.length} tệp:\n${r.files.map(f => f.name).join("\n")}`}
                          className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-bold text-blue-600 hover:bg-blue-50 transition-all cursor-pointer">
                          <Eye size={13} />
                          {r.files.length}
                        </button>
                      )}
                      {canEdit(r, user.email, user.isAdmin) && (
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); pickQuickFile(r); }}
                          disabled={uploadId === r.id}
                          title="Đính kèm PDF hoặc ảnh (tối đa 4MB)"
                          className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer disabled:opacity-40">
                          {uploadId === r.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Upload size={13} />}
                        </button>
                      )}
                      {r.files.length === 0 && !canEdit(r, user.email, user.isAdmin) && (
                        <span className="text-[10px] font-bold text-slate-300">—</span>
                      )}
                    </span>
                    <span className="w-32 shrink-0 hidden lg:flex items-center gap-1.5">
                      <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${meta.chip}`}>
                        {meta.short}
                      </span>
                      {mine && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Chờ bạn xử lý" />}
                    </span>
                    {(user.isAdmin || canCreate) && (
                      <span className="w-20 shrink-0 flex items-center justify-center gap-0.5">
                        {canCreate && (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); duplicateRow(r); }}
                            disabled={dupId === r.id}
                            title="Nhân đôi phiếu này thành bản nháp mới"
                            className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                            {dupId === r.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <CopyPlus size={14} />}
                          </button>
                        )}
                        {user.isAdmin && (
                          <button type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Lấy dòng ngay trong handler: sau await thì React đã
                              // dựng lại bảng, không còn tìm được node này nữa.
                              removeRow(r, e.currentTarget.closest("[data-toss-row]") as HTMLElement | null, e.currentTarget);
                            }}
                            disabled={deleting === r.id}
                            title={`Xoá phiếu ${r.ma_phieu || ""}`.trim()}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                            {deleting === r.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Trash2 size={14} />}
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Một ô chọn tệp dùng chung cho mọi dòng — dựng 1 ô cho mỗi dòng thì
          danh sách 50 phiếu sẽ có 50 input thừa trong DOM. */}
      <input
        ref={quickFileRef}
        type="file"
        multiple
        hidden
        accept={QUICK_ACCEPT}
        onChange={(e) => {
          const picked = Array.from(e.target.files || []);
          uploadQuickFiles(picked);
          // Xoá giá trị để lần sau chọn LẠI ĐÚNG tệp đó vẫn kích hoạt onChange.
          e.target.value = "";
        }}
      />

      {previewRow && (
        <FilePreviewModal
          row={previewRow}
          canDelete={canEdit(previewRow, user.email, user.isAdmin)}
          onChanged={load}
          onClose={() => setPreviewRow(null)}
        />
      )}

      {(creating || editing) && (
        <SigningFormModal
          existing={editing}
          currentEmail={user.email}
          currentName={user.name}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={load}
        />
      )}

      {viewing && (
        <DetailModal
          row={viewing}
          user={user}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null); }}
          onDone={() => { setViewing(null); load(); }}
          onMailWarn={setMailWarn}
        />
      )}
    </div>
  );
}

// ─── Cửa sổ xem tệp hồ sơ ───
// Mở ngay giữa màn hình thay vì bật tab mới: người duyệt đang dò danh sách,
// nhảy tab rồi quay lại là mất chỗ đang xem và mất cả bộ lọc đang đặt.
//
// ⚠ createPortal ra document.body — panel này nằm trong khối `.glass` của trang
// /bao-cao, mà `backdrop-filter` tạo containing block mới nên phần tử `fixed` sẽ
// bị nhốt trong thẻ cha thay vì phủ toàn màn hình.
function FilePreviewModal({ row, canDelete, onChanged, onClose }: {
  row: SigningSubmission;
  canDelete: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  // Danh sách tệp giữ ngay trong cửa sổ: xoá xong phải thấy mất ngay, không đợi
  // tải lại cả bảng rồi mới cập nhật.
  const [files, setFiles] = useState(row.files);
  const [busy, setBusy] = useState(false);
  const [delErr, setDelErr] = useState("");
  // Giữ CẢ đường dẫn đã giải trong state, không tách thành url/loading/err rời.
  // Nhờ vậy "đang tải" được SUY RA từ việc kết quả có khớp tệp đang xem hay
  // không, thay vì phải dọn 3 ô state ngay đầu effect — dọn kiểu đó là gọi
  // setState thẳng trong thân effect, React cảnh báo và dễ sinh render thừa.
  const [resolved, setResolved] = useState<{ path: string; url: string; err: string } | null>(null);

  const file = files[idx];
  const isPdf = /\.pdf$/i.test(file?.name || "");

  const ready = !!file && resolved?.path === file.path;
  const loading = !ready;
  const url = ready ? resolved.url : "";
  const err = ready ? resolved.err : "";

  // Đường dẫn kho là loại có hạn dùng, phải xin lại mỗi lần đổi tệp — không
  // dựng sẵn một lượt cho cả bộ rồi dùng dần, hết hạn giữa chừng là ảnh trắng.
  useEffect(() => {
    if (!file) return;
    let mounted = true;
    resolveDossierUrl(file.path)
      .then(u => {
        if (!mounted) return;
        setResolved({
          path: file.path,
          url: u || "",
          err: u ? "" : `Không mở được "${file.name}" — tệp đã bị xoá hoặc tài khoản hết quyền.`,
        });
      })
      .catch(e => {
        if (mounted) setResolved({ path: file.path, url: "", err: errText(e) });
      });
    return () => { mounted = false; };
  }, [file]);

  const removeCurrent = async () => {
    if (!file || busy) return;
    if (!confirm(
      `Gỡ "${file.name}" khỏi phiếu ${row.ma_phieu || ""}?\n\n` +
      `Tệp vẫn còn trong kho, chỉ là phiếu này không trỏ tới nữa.`
    )) return;
    setBusy(true);
    setDelErr("");
    try {
      const next = await removeDossierFile(row.id, files, file.path);
      setFiles(next);
      // Lùi con trỏ nếu vừa xoá tệp cuối; hết tệp thì đóng luôn cửa sổ.
      setIdx(i => Math.max(0, Math.min(i, next.length - 1)));
      onChanged();
      if (next.length === 0) onClose();
    } catch (e) {
      setDelErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  // Esc để đóng — cửa sổ chiếm gần hết màn hình, với chuột thì phải rê lên tận
  // góc trên bên phải mới bấm được nút X.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-5xl h-[88vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Đầu cửa sổ */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200/60 bg-slate-50/70 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#005BAC] to-blue-500 flex items-center justify-center shadow-sm shrink-0">
            <Eye size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-heading font-extrabold text-slate-800 text-xs leading-tight truncate">
              {file?.name || "Tệp hồ sơ"}
            </h4>
            <p className="text-[10px] text-slate-400 font-semibold truncate">
              Phiếu {row.ma_phieu || "—"} · tệp {idx + 1}/{files.length}
            </p>
          </div>
          {canDelete && file && (
            <button type="button" onClick={removeCurrent} disabled={busy}
              title={`Gỡ "${file.name}" khỏi phiếu`}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer disabled:opacity-40">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          )}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Mở ở tab mới"
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer">
              <ExternalLink size={15} />
            </a>
          )}
          <button type="button" onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all cursor-pointer">
            <X size={15} />
          </button>
        </div>

        {/* Thanh lật tệp — chỉ hiện khi phiếu có nhiều hơn một tệp */}
        {files.length > 1 && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 bg-white overflow-x-auto shrink-0">
            {files.map((f, i) => (
              <button key={f.path} type="button" onClick={() => setIdx(i)}
                title={f.name}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                  i === idx
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-500 hover:text-slate-700"
                }`}>
                {i + 1}. {f.name.length > 22 ? `${f.name.slice(0, 20)}…` : f.name}
              </button>
            ))}
          </div>
        )}

        {delErr && (
          <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-200 flex items-start gap-2 shrink-0">
            <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="flex-1 min-w-0 text-[11px] font-bold text-rose-700 break-words">{delErr}</p>
            <button type="button" onClick={() => setDelErr("")}
              className="p-0.5 text-rose-400 hover:text-rose-600 cursor-pointer"><X size={13} /></button>
          </div>
        )}

        {/* Thân — nền xám để ảnh nền trắng còn thấy được mép */}
        <div className="flex-1 min-h-0 bg-slate-100 flex items-center justify-center overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Loader2 size={28} className="animate-spin text-[#005BAC]" />
              <p className="text-xs font-semibold">Đang mở tệp…</p>
            </div>
          ) : err ? (
            <div className="flex flex-col items-center gap-2 text-center px-8">
              <FileWarning size={30} className="text-rose-400" />
              <p className="text-[11px] font-bold text-rose-600 max-w-sm">{err}</p>
            </div>
          ) : isPdf ? (
            // PDF nhờ trình xem sẵn có của trình duyệt, không nạp thêm thư viện.
            <iframe src={url} title={file?.name || "PDF"} className="w-full h-full border-0" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file?.name || "Ảnh hồ sơ"}
              className="max-w-full max-h-full object-contain" />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Kpi({ label, value, icon: Icon, grad }: {
  label: string; value: number; icon: typeof Inbox; grad: string;
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

// ─── Modal chi tiết + thao tác duyệt ───
function DetailModal({ row, user, onClose, onEdit, onDone, onMailWarn }: {
  row: SigningSubmission;
  user: ReturnType<typeof useCurrentUser>;
  onClose: () => void;
  onEdit: () => void;
  onDone: () => void;
  // Modal đóng ngay sau khi duyệt, nên cảnh báo email phải nổi ở PANEL CHA —
  // để trong modal thì nó biến mất cùng modal, không ai kịp đọc.
  onMailWarn: (msg: string) => void;
}) {
  const setMailWarn = onMailWarn;
  const [ykien, setYkien] = useState("");
  const [lyDo, setLyDo] = useState("");
  const [showReturn, setShowReturn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState("");

  const exportDocx = async () => {
    setExporting(true); setErr("");
    try {
      await downloadSigningForm(docxPayloadFromRow(row), docxFileName(row));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setExporting(false);
    }
  };

  const actable = canActOn(row, user.perms, user.isAdmin) &&
    !["hoan_tat", "nhap", "tra_lai"].includes(row.status);
  const editable = canEdit(row, user.email, user.isAdmin);
  // Người lập trình phiếu đi — từ nháp hoặc sau khi bị trả lại. Nút này trước
  // chỉ nằm trong form soạn thảo, nên mở phiếu ra xem lại thì không thấy đâu.
  const submittable =
    (row.status === "nhap" || row.status === "tra_lai") &&
    (user.isAdmin || row.created_by.toLowerCase() === user.email.toLowerCase());

  // Gửi email báo luồng. KHÔNG chặn thao tác nếu email hỏng: phiếu đã chuyển
  // bước trong CSDL rồi, bắt người dùng làm lại chỉ vì SMTP lỗi là sai.
  const notify = async (
    event: "trinh" | "duyet" | "tra_lai",
    fromStatus: SigningStatus,
    toStatus: SigningStatus,
    extra: { ykien?: string; lyDo?: string }
  ) => {
    try {
      const nextEmails =
        event === "tra_lai" || toStatus === "hoan_tat"
          ? []
          : await fetchStageApproverEmails(toStatus);
      const res = await apiFetch("/api/send-signing-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maPhieu: row.ma_phieu,
          hopDongSo: row.hop_dong_so,
          duAn: row.du_an,
          chuDauTu: row.chu_dau_tu,
          dotSo: row.dot_so,
          soTien: row.de_nghi_thanh_toan ?? tinhDeNghi(row),
          event,
          eventLabel: event === "duyet" ? EVENT_LABEL[fromStatus] : undefined,
          nextLabel: STATUS_META[toStatus]?.label,
          actorName: user.name || user.email,
          ykien: extra.ykien,
          lyDo: extra.lyDo,
          creatorEmail: row.created_by,
          creatorName: row.created_by_name,
          nextApproverEmails: nextEmails,
          siteUrl: window.location.origin,
        }),
      });
      const j = await res.json().catch(() => ({}));
      // Email hỏng KHÔNG chặn thao tác (phiếu đã chuyển bước rồi), nhưng phải
      // NÓI RA. Nuốt im lặng thì người dùng tưởng đã báo cho cấp sau, thực tế
      // không ai nhận được gì — đúng tình huống "hình như chưa nhận được mail"
      // mà không ai biết vì sao.
      if (!res.ok) setMailWarn(j.error || `Không gửi được email (${res.status}).`);
      else if (j.failed?.length) setMailWarn(`Gửi email lỗi: ${j.failed.join("; ")}`);
      else if (!j.sent?.length) setMailWarn("Không có địa chỉ email nào để gửi thông báo.");
    } catch (e) {
      setMailWarn(`Không gửi được email: ${errText(e)}`);
    }
  };

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const { error } = await supabase
        .from("signing_submissions")
        .update({ status: "cho_pho_giam_doc" })
        .eq("id", row.id);
      if (error) throw error;
      await notify("trinh", row.status, "cho_pho_giam_doc", {});
      onDone();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  // Ghi ý kiến vào đúng cột của cấp đang giữ phiếu, rồi đẩy sang bước kế tiếp.
  const approve = async () => {
    const nxt = nextStatus(row.status);
    if (!nxt) return;
    setBusy(true); setErr("");
    try {
      const now = new Date().toISOString();
      const who = user.name || user.email;
      const patch: Record<string, unknown> = { status: nxt };
      const cur = normalizeStatus(row.status);
      if (cur === "cho_pho_giam_doc") {
        // Ghi vào ô của ĐÚNG vị Phó Giám đốc đang ký — tờ phiếu có hai ô riêng
        // (mục 3 P.QLDA, mục 4 P.KHĐT), ô của vị không ký để trắng.
        if (pgdOpinionField(user.perms) === "qlda") {
          Object.assign(patch, { ykien_qlda: ykien || null, qlda_by: who, qlda_at: now });
        } else {
          Object.assign(patch, { ykien_khdt: ykien || null, khdt_by: who, khdt_at: now });
        }
      }
      if (cur === "cho_giam_doc") Object.assign(patch, { ykien_giam_doc: ykien || null, giam_doc_by: who, giam_doc_at: now });
      if (cur === "cho_ke_toan") Object.assign(patch, { ke_toan_by: who, ke_toan_at: now, ngay_chi: now.slice(0, 10) });

      const { error } = await supabase.from("signing_submissions").update(patch).eq("id", row.id);
      if (error) throw error;
      await notify("duyet", row.status, nxt, { ykien });
      onDone();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const sendBack = async () => {
    if (!lyDo.trim()) { setErr("Phải ghi lý do khi trả lại."); return; }
    setBusy(true); setErr("");
    try {
      const { error } = await supabase.from("signing_submissions").update({
        status: "tra_lai",
        tra_lai_tu: row.status,
        tra_lai_boi: user.name || user.email,
        tra_lai_luc: new Date().toISOString(),
        tra_lai_ly_do: lyDo.trim(),
      }).eq("id", row.id);
      if (error) throw error;
      await notify("tra_lai", row.status, "tra_lai", { lyDo: lyDo.trim() });
      onDone();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (path: string, name: string) => {
    const url = await resolveDossierUrl(path);
    if (url) window.open(url, "_blank", "noopener");
    else setErr(`Không mở được "${name}".`);
  };

  const meta = STATUS_META[row.status];
  const rowInfo: [string, string][] = [
    ["Chủ đầu tư", row.chu_dau_tu || "—"],
    ["Dự án", row.du_an || "—"],
    ["Hợp đồng số", [row.hop_dong_so, row.ngay_ky_hop_dong ? `ký ngày ${row.ngay_ky_hop_dong}` : ""].filter(Boolean).join(" ") || "—"],
    ["Gói thầu", row.goi_thau || "—"],
    ["Giá trị HĐ", `${fmtMoney(row.gia_tri_hd)} đồng`],
    [`Giá trị nghiệm thu đợt ${row.dot_so ?? ""}`, `${fmtMoney(row.gia_tri_nghiem_thu)} đồng (A)`],
    ["Giữ bảo hành", `${fmtMoney(row.giu_bao_hanh)} đồng (B)`],
    ["Giữ lại từng lần", `${fmtMoney(row.giu_lai_tung_lan)} đồng (C)${row.ty_le_giu_lai ? ` (${row.ty_le_giu_lai}%)` : ""}`],
    ["Khấu trừ tạm ứng", `${fmtMoney(row.khau_tru_tam_ung)} đồng (D)${row.ty_le_thu_hoi ? ` (thu hồi ~${row.ty_le_thu_hoi}%)` : ""}`],
    ["Luỹ kế đã thanh toán", `${fmtMoney(row.luy_ke_da_thanh_toan)} đồng`],
    ["Tạm ứng còn lại", `${fmtMoney(row.tam_ung_con_lai)} đồng`],
  ];

  // Chặng Phó Giám đốc gộp làm một dòng: chỉ cần MỘT trong hai vị xem xét.
  // Lấy vết của vị nào đã ký (QLDA hoặc KHĐT), kèm nhãn để biết ai ký.
  const pgdBy = row.qlda_by || row.khdt_by;
  const pgdAt = row.qlda_at || row.khdt_at;
  const pgdYk = row.qlda_at ? row.ykien_qlda : row.khdt_at ? row.ykien_khdt : null;
  const pgdName = row.qlda_at ? "Phó Giám đốc (P.QLDA)"
    : row.khdt_at ? "Phó Giám đốc (P.KHĐT)"
    : "Phó Giám đốc (QLDA hoặc KHĐT)";

  const steps: [SigningStatus, string, string | null, string | null, string | null][] = [
    ["cho_pho_giam_doc", pgdName, pgdBy, pgdAt, pgdYk],
    ["cho_giam_doc", "Giám đốc", row.giam_doc_by, row.giam_doc_at, row.ykien_giam_doc],
    ["cho_ke_toan", "Kế toán", row.ke_toan_by, row.ke_toan_at, null],
  ];

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[5vh] p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200/60 bg-slate-50/70 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-sm shrink-0">
            <FileText size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-heading font-extrabold text-slate-800 text-xs leading-tight truncate">
              {row.ma_phieu} · Đợt {row.dot_so ?? "—"}
            </h4>
            <p className="text-[10px] text-slate-400 font-semibold truncate">
              {row.created_by_name || row.created_by} lập {fmtDateTime(row.created_at)}
            </p>
          </div>
          <span className={`text-[9px] font-extrabold uppercase px-2 py-1 rounded-full shrink-0 ${meta.chip}`}>
            {meta.label}
          </span>
          <button type="button" onClick={onClose} disabled={busy}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all cursor-pointer disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {err && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-[11px] font-bold text-rose-700">{err}</div>
          )}

          {row.status === "tra_lai" && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              <p className="text-[11px] font-extrabold text-rose-800">
                Bị trả lại từ bước {STATUS_META[(row.tra_lai_tu as SigningStatus) || "cho_pho_giam_doc"]?.label || row.tra_lai_tu}
                {row.tra_lai_boi ? ` bởi ${row.tra_lai_boi}` : ""} · {fmtDateTime(row.tra_lai_luc)}
              </p>
              <p className="text-[11px] font-medium text-rose-700 mt-1">{row.tra_lai_ly_do}</p>
            </div>
          )}

          {/* Số liệu */}
          <section className="space-y-2">
            <h5 className={labelCls}>Nội dung trình</h5>
            {row.ve_viec && <p className="text-xs font-semibold text-slate-700">{row.ve_viec}</p>}
            <div className="bg-slate-50/70 border border-slate-200/60 rounded-xl divide-y divide-slate-200">
              {rowInfo.map(([k, v]) => (
                <div key={k} className="flex gap-3 px-3.5 py-2">
                  <span className="text-[11px] font-semibold text-slate-500 w-52 shrink-0">{k}</span>
                  <span className="text-[11px] font-bold text-slate-800 flex-1 min-w-0">{v}</span>
                </div>
              ))}
              <div className="flex gap-3 px-3.5 py-2.5 bg-blue-50/70">
                <span className="text-[11px] font-extrabold text-blue-900 w-52 shrink-0">
                  Đề nghị thanh toán (A−B−C−D)
                </span>
                <span className="text-xs font-extrabold text-blue-900 flex-1">
                  {fmtMoney(row.de_nghi_thanh_toan ?? tinhDeNghi(row))} đồng
                </span>
              </div>
            </div>
          </section>

          {/* Hồ sơ gốc */}
          {row.files.length > 0 && (
            <section className="space-y-2">
              <h5 className={labelCls}>Hồ sơ gốc ({row.files.length})</h5>
              <div className="space-y-1.5">
                {row.files.map((f) => (
                  <button key={f.path} type="button" onClick={() => openFile(f.path, f.name)}
                    className="w-full flex items-center gap-2 bg-slate-50 hover:bg-slate-100 rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer">
                    <FileText size={12} className="text-slate-400 shrink-0" />
                    <span className="flex-1 min-w-0 text-left text-[11px] font-semibold text-slate-700 truncate">{f.name}</span>
                    <ExternalLink size={11} className="text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Tiến trình */}
          <section className="space-y-2">
            <h5 className={labelCls}>Tiến trình duyệt</h5>
            <div className="space-y-2">
              {steps.map(([st, name, by, at, yk]) => {
                const done = !!at;
                const here = normalizeStatus(row.status) === st;
                return (
                  <div key={st} className={`flex gap-3 rounded-xl px-3.5 py-2.5 border ${
                    done ? "bg-emerald-50/60 border-emerald-200"
                    : here ? "bg-amber-50/70 border-amber-200"
                    : "bg-slate-50/50 border-slate-200/60"
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      done ? "bg-emerald-500" : here ? "bg-amber-500" : "bg-slate-300"
                    }`}>
                      {done ? <Check size={12} className="text-white" />
                        : <span className="text-white text-[9px] font-extrabold">{FLOW.indexOf(st) + 1}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-extrabold text-slate-700">
                        {name}
                        {done && by ? ` · ${by}` : here ? " · đang chờ" : ""}
                      </p>
                      {at && <p className="text-[10px] font-semibold text-slate-400">{fmtDateTime(at)}</p>}
                      {yk && <p className="text-[11px] font-medium text-slate-600 mt-1 whitespace-pre-wrap">{yk}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Ô thao tác của cấp đang giữ phiếu */}
          {actable && (
            <section className="space-y-2.5 pt-1">
              <h5 className={labelCls}>
                {row.status === "cho_ke_toan" ? "Xác nhận đã chi" : "Ý kiến chỉ đạo của bạn"}
              </h5>
              {row.status !== "cho_ke_toan" && (
                <textarea value={ykien} onChange={(e) => setYkien(e.target.value)} rows={3}
                  placeholder="Ý kiến sẽ được in vào phiếu Word ở mục tương ứng. Để trống nếu chỉ duyệt."
                  className={`${inputCls} w-full resize-y leading-relaxed`} />
              )}
              {showReturn && (
                <textarea value={lyDo} onChange={(e) => setLyDo(e.target.value)} rows={2} autoFocus
                  placeholder="Lý do trả lại (bắt buộc) — người lập sẽ đọc để sửa…"
                  className={`${inputCls} w-full resize-y leading-relaxed border-rose-300 focus:ring-rose-500/20`} />
              )}
            </section>
          )}
        </div>

        <div className="border-t border-slate-200/60 bg-slate-50/70 px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
          {editable && (
            <button type="button" onClick={onEdit} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 text-slate-600 hover:bg-slate-200/60 font-bold rounded-xl text-[11px] transition-all cursor-pointer disabled:opacity-50">
              <Pencil size={13} /> Sửa phiếu
            </button>
          )}
          {/* Xuất bản phiếu ĐÃ CÓ ý kiến 3 cấp — đây mới là bản đem đi lưu hồ sơ.
              mr-auto đẩy cả cụm trái sang mép, tách khỏi nhóm nút hành động. */}
          <button type="button" onClick={exportDocx} disabled={busy || exporting}
            className="mr-auto flex items-center gap-1.5 px-3 py-2 text-slate-600 hover:bg-slate-200/60 font-bold rounded-xl text-[11px] transition-all cursor-pointer disabled:opacity-50">
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Xuất phiếu trình
          </button>
          <button type="button" onClick={onClose} disabled={busy}
            className="px-4 py-2 text-slate-500 hover:bg-slate-200/60 font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50">
            Đóng
          </button>
          {submittable && (
            <button type="button" onClick={submit} disabled={busy}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-blue-500/10 transition-all cursor-pointer">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {row.status === "tra_lai" ? "Trình lại Phó Giám đốc" : "Trình Phó Giám đốc"}
            </button>
          )}
          {actable && (
            <>
              <button type="button"
                onClick={() => (showReturn ? sendBack() : setShowReturn(true))}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50">
                {busy && showReturn ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                {showReturn ? "Xác nhận trả lại" : "Trả lại"}
              </button>
              {!showReturn && (
                <button type="button" onClick={approve} disabled={busy}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-blue-500/10 transition-all cursor-pointer">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {ACTION_LABEL[row.status] || "Duyệt & chuyển tiếp"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
