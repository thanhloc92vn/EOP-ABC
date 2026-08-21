"use client";

// ============================================================
// JdTemplateModal — "Cấu hình JD": thư viện mô tả công việc theo vị trí
// (bảng `jd_templates`, migration 062).
//
// Mở từ nút dưới ô "Mô tả công việc (JD)" ở tab Chấm điểm CV. Lưu một lần bản
// JD của "Nhân viên ATLĐ" thì từ đó mỗi đợt tuyển chỉ cần bấm chọn là nạp thẳng
// vào ô mô tả, không phải mở file ngoài copy nữa.
//
// ⚠ MODAL BẮT BUỘC createPortal ra document.body: nút mở nó nằm trong thẻ
// `.glass` — mà lớp này có `backdrop-filter`, và backdrop-filter tạo containing
// block mới nên phần tử `fixed` sẽ bị nhốt trong thẻ cha thay vì phủ toàn màn
// hình.
//
// PHÂN QUYỀN (migration 063): THÊM / SỬA / XOÁ đòi Admin hoặc cờ
// `can_view_candidates` — đúng bằng nhóm được xem module Tuyển dụng. Người có cờ
// sửa/xoá được MỌI bản JD, không riêng bản mình tạo: JD là tài sản dùng chung
// của cả đợt tuyển, để mỗi người một bản là hỏng việc. Đọc thì mọi tài khoản đã
// đăng nhập đều được (JD là tin đăng tuyển công khai).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  useJdTemplates,
  jdKey,
  findJdByPosition,
  filterJdTemplates,
  type JdTemplate,
} from "@/lib/jdTemplates";
import {
  FileText, Plus, Trash2, Save, X, Search, Loader2, AlertTriangle, Pencil, Download, Lock,
} from "lucide-react";

const inputCls =
  "w-full border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-semibold text-slate-800 text-xs bg-white transition-all";
const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Gọi sau khi thư viện đổi, để danh sách chip ngoài màn hình vẽ lại. */
  onChanged?: () => void;
  /** Bấm "Dùng bản này" -> nạp thẳng vào ô mô tả công việc rồi đóng modal. */
  onPick?: (row: JdTemplate) => void;
  /** Nội dung đang gõ dở ở ô mô tả, để nút "Lưu JD đang gõ" điền sẵn. */
  draftContent?: string;
}

export default function JdTemplateModal({ open, onClose, onChanged, onPick, draftContent }: Props) {
  const user = useCurrentUser();
  // Component luôn nằm trong cây (trả null khi đóng) nên hook vẫn chạy — truyền
  // `open` để chỉ gọi mạng lúc modal thật sự mở.
  const { rows, loading, error, reload } = useJdTemplates(open);

  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [content, setContent] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [writeErr, setWriteErr] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const resetForm = () => {
    setPosition("");
    setDepartment("");
    setContent("");
    setNote("");
    setEditId(null);
    setWriteErr("");
  };

  // Mỗi lần mở: xoá trạng thái của lần mở trước, tránh đang sửa dở dòng A rồi
  // đóng lại, mở ra vẫn thấy chữ của A mà tưởng là thêm mới.
  useEffect(() => {
    if (!open) return;
    resetForm();
    setSearch("");
  }, [open]);

  // Đóng bằng phím Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => filterJdTemplates(rows, search), [rows, search]);

  // Quyền GHI là của người, không phải của dòng (migration 063): có cờ thì sửa
  // /xoá được mọi bản JD.
  const canWrite = user.isAdmin || !!user.perms.canViewCandidates;

  /** Dòng đang trùng tên vị trí với ô đang nhập — lưu tiếp là GHI ĐÈ nó. */
  const duplicate = useMemo(() => {
    if (!position.trim()) return null;
    const hit = findJdByPosition(rows, position);
    return hit && hit.id !== editId ? hit : null;
  }, [rows, position, editId]);

  const startEdit = (r: JdTemplate) => {
    setEditId(r.id);
    setPosition(r.position);
    setDepartment(r.department || "");
    setContent(r.content);
    setNote(r.note || "");
    setWriteErr("");
  };

  const handleSave = async () => {
    const p = position.trim();
    const c = content.trim();
    if (!p) return setWriteErr("Chưa nhập tên vị trí tuyển dụng.");
    if (!c) return setWriteErr("Chưa nhập nội dung JD.");

    if (!canWrite) {
      return setWriteErr("Bạn không có quyền thêm/sửa thư viện JD (cần Admin hoặc cờ quyền Tuyển dụng).");
    }

    // Trùng tên vị trí thì SỬA dòng cũ, không đẻ dòng thứ hai (xem migration 062).
    const target = editId ? rows.find((r) => r.id === editId) || null : duplicate;

    try {
      setSaving(true);
      setWriteErr("");

      if (target) {
        const { data, error: e } = await supabase
          .from("jd_templates")
          .update({
            position: p,
            norm_position: jdKey(p),
            department: department.trim() || null,
            content: c,
            note: note.trim() || null,
          })
          .eq("id", target.id)
          .select("id");
        if (e) throw e;
        // RLS chặn UPDATE thì Postgres KHÔNG báo lỗi — nó sửa 0 dòng rồi trả về
        // sạch sẽ. Phải đếm dòng thật sự đổi, không thì người dùng thấy màn hình
        // im lặng và tưởng đã lưu xong.
        if (!data || data.length === 0)
          throw new Error("Không có quyền sửa thư viện JD (cần Admin hoặc cờ quyền Tuyển dụng).");
      } else {
        const { error: e } = await supabase.from("jd_templates").insert({
          position: p,
          norm_position: jdKey(p),
          department: department.trim() || null,
          content: c,
          note: note.trim() || null,
          created_by: user.email.toLowerCase(),
        });
        if (e) throw e;
      }

      resetForm();
      await reload();
      onChanged?.();
    } catch (e) {
      setWriteErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: JdTemplate) => {
    if (!canWrite) return;
    if (!confirm(`Xoá bản JD "${r.position}" khỏi thư viện?`)) return;
    try {
      setSaving(true);
      setWriteErr("");
      const { data, error: e } = await supabase
        .from("jd_templates")
        .delete()
        .eq("id", r.id)
        .select("id");
      if (e) throw e;
      if (!data || data.length === 0)
        throw new Error("Không có quyền xoá thư viện JD (cần Admin hoặc cờ quyền Tuyển dụng).");
      if (editId === r.id) resetForm();
      await reload();
      onChanged?.();
    } catch (e) {
      setWriteErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in-50 zoom-in-95 duration-150">

        {/* Tiêu đề */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 sm:px-6 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-sm">
              <FileText size={16} className="text-white" />
            </span>
            <div>
              <h3 className="font-heading font-extrabold text-sm text-slate-800">Cấu hình JD</h3>
              <p className="text-[10px] text-slate-400 font-semibold">
                Lưu sẵn mô tả công việc theo vị trí — lần sau chỉ cần bấm chọn.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-6 py-4 space-y-4 text-xs">

          {/* Ô nhập / sửa — chỉ hiện với Admin hoặc người có cờ quyền Tuyển
              dụng (migration 063). Người khác vào chỉ để XEM và bấm chọn JD. */}
          {canWrite ? (
            <div className={`rounded-xl border p-3.5 space-y-3 ${
              editId ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-slate-50/60"
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-extrabold text-[11px] uppercase tracking-wider text-slate-500">
                  <Plus size={13} className="text-blue-600" />
                  {editId ? "Sửa bản JD" : "Thêm bản JD"}
                </div>
                {/* Lối tắt hay dùng nhất: vừa gõ/dán JD ở ngoài, muốn cất luôn vào
                    thư viện mà không phải dán lại lần nữa. */}
                {!editId && (draftContent || "").trim() && content !== draftContent && (
                  <button
                    type="button"
                    onClick={() => setContent(draftContent || "")}
                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700"
                  >
                    <Download size={11} /> Lấy nội dung đang gõ ở ngoài
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label className={labelCls}>Vị trí tuyển dụng *</label>
                  <input
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="VD: Nhân viên ATLĐ"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Phòng / bộ phận</label>
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="VD: Ban An toàn"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Ghi chú</label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="VD: bản 2026"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className={labelCls}>Nội dung JD *</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={7}
                  placeholder="Dán toàn bộ mô tả công việc vào đây: mô tả, yêu cầu, quyền lợi…"
                  className={`${inputCls} resize-none font-medium leading-relaxed`}
                />
                <p className="text-[10px] text-slate-400 font-semibold">{content.trim().length} ký tự</p>
              </div>

              {/* Cảnh báo trùng tên vị trí: lưu tiếp là ghi đè bản cũ. */}
              {duplicate && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-800">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    Đã có bản JD cho vị trí <b>{duplicate.position}</b>. Bấm lưu sẽ <b>cập nhật đè</b> bản
                    cũ. Muốn giữ cả hai thì đặt tên khác (VD: &quot;{duplicate.position} – công trường&quot;).
                  </span>
                </div>
              )}

              {writeErr && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>{writeErr}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all active:scale-95 shadow-sm"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {editId || duplicate ? "Cập nhật" : "Lưu vào thư viện"}
                </button>
                {(editId || position || content) && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-slate-400 hover:text-slate-600 font-bold px-3 py-2 text-xs"
                  >
                    Huỷ
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-[11px] font-semibold text-slate-500">
              <Lock size={13} className="mt-0.5 shrink-0 text-slate-400" />
              <span>
                Bạn chỉ xem và chọn được JD có sẵn. Thêm/sửa/xoá thư viện cần quyền Admin
                hoặc cờ quyền Tuyển dụng — liên hệ Hành chính Nhân sự để được cấp.
              </span>
            </div>
          )}

          {/* Ô tìm kiếm */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo vị trí, phòng ban, nội dung…"
              className={`${inputCls} pl-8`}
            />
          </div>

          {/* Danh sách đã lưu */}
          {loading && rows.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400 font-semibold">
              <Loader2 size={14} className="animate-spin" /> Đang tải thư viện JD…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>Không đọc được thư viện JD: {error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-slate-400 font-semibold italic">
              {rows.length === 0 ? "Thư viện còn trống — thêm bản JD đầu tiên ở trên." : "Không có bản JD nào khớp."}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-slate-200 hover:border-blue-300 bg-white p-3 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-extrabold text-slate-800 text-xs truncate">{r.position}</p>
                      <p className="text-[10px] text-slate-400 font-semibold truncate">
                        {[r.department, r.note].filter(Boolean).join(" · ") || "—"}
                        {" · "}{r.content.trim().length} ký tự
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onPick && (
                        <button
                          type="button"
                          onClick={() => { onPick(r); onClose(); }}
                          className="text-[10px] font-bold text-white bg-[#005BAC] hover:bg-blue-700 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
                        >
                          Dùng bản này
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        disabled={!canWrite}
                        title={canWrite ? "Sửa" : "Cần Admin hoặc cờ quyền Tuyển dụng"}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        disabled={!canWrite}
                        title={canWrite ? "Xoá" : "Cần Admin hoặc cờ quyền Tuyển dụng"}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500 font-medium line-clamp-2 leading-relaxed">
                    {r.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
