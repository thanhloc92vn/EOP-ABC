"use client";

// ============================================================
// TripDistanceModal — "Cấu hình vị trí": danh mục cung đường + số km
// (bảng `trip_distances`, migration 061).
//
// Mở từ nút cạnh tiêu đề form "Đăng ký lịch đi công tác". Lưu một lần
// "TPHCM – Tây Ninh 104km" thì từ đó ai gõ hai địa danh đó vào chặng đi đều
// được điền sẵn số km, không ai phải nhớ nữa.
//
// ⚠ MODAL BẮT BUỘC createPortal ra document.body: nó được gọi từ BÊN TRONG lớp
// phủ của modal công tác — mà lớp phủ đó có `backdrop-blur`, và
// `backdrop-filter` tạo containing block mới nên phần tử `fixed` sẽ bị nhốt
// trong thẻ cha thay vì phủ toàn màn hình.
//
// PHÂN QUYỀN (migration 061): ai đã đăng nhập cũng ĐỌC và THÊM được — không thì
// người đi công tác phải chờ Hành chính nhập hộ mới khai được đơn. Sửa/xoá chỉ
// chủ dòng hoặc Admin.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useDialogs } from "@/components/ConfirmDialog";
import {
  useTripDistances,
  locationKey,
  findExactDistance,
  type TripDistance,
} from "@/lib/tripDistances";
import {
  MapPin, Plus, Trash2, Save, X, Search, Loader2, AlertTriangle, Route, Pencil,
} from "lucide-react";

const inputCls =
  "w-full border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-semibold text-slate-800 text-xs bg-white transition-all";
const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Gọi sau khi danh mục đổi, để form công tác tính lại ô km đang mở. */
  onChanged?: () => void;
  /** Điền sẵn cặp điểm khi mở từ nút "thêm cung đường này" ở chặng đi. */
  initialFrom?: string;
  initialTo?: string;
}

export default function TripDistanceModal({ open, onClose, onChanged, initialFrom, initialTo }: Props) {
  // Hộp xác nhận căn giữa, đồng bộ giao diện (thay window.confirm)
  const { confirm, dialogsNode } = useDialogs();
  const user = useCurrentUser();
  // Component này luôn nằm trong cây (trả null khi đóng) nên hook vẫn chạy —
  // truyền `open` để chỉ gọi mạng lúc modal thật sự mở.
  const { rows, loading, error, reload } = useTripDistances(open);

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [km, setKm] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [writeErr, setWriteErr] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  // Mỗi lần mở: nạp lại cặp điểm đang khai dở bên form công tác (nếu có), để
  // người dùng chỉ phải gõ mỗi số km.
  useEffect(() => {
    if (!open) return;
    setFrom(initialFrom || "");
    setTo(initialTo || "");
    setKm("");
    setNote("");
    setEditId(null);
    setWriteErr("");
  }, [open, initialFrom, initialTo]);

  // Đóng bằng phím Esc — modal này nằm trên một modal khác nên bấm ra ngoài dễ
  // nhầm sang lớp phủ của form công tác.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const resetForm = () => {
    setFrom("");
    setTo("");
    setKm("");
    setNote("");
    setEditId(null);
    setWriteErr("");
  };

  const filtered = useMemo(() => {
    const q = locationKey(search);
    if (!q) return rows;
    return rows.filter(
      (r) => r.norm_from.includes(q) || r.norm_to.includes(q)
    );
  }, [rows, search]);

  const canEditRow = (r: TripDistance) =>
    user.isAdmin || (r.created_by || "").toLowerCase() === user.email.toLowerCase();

  /**
   * Dòng đang trùng cặp điểm với ô đang nhập (kể cả nhập ngược chiều).
   *
   * Dùng bản so khớp TRÙNG KHÍT, không phải bản nới theo từ khoá của form công
   * tác: ở đây khớp nhầm là GHI ĐÈ số km của dòng người khác, chứ không chỉ là
   * điền hụt một ô. Thêm "Tây Ninh – TPHCM" khi đã có "BĐH Tây Ninh – TPHCM"
   * thì đó là hai dòng riêng, người dùng tự dọn nếu muốn.
   */
  const duplicate = useMemo(() => {
    if (!from.trim() || !to.trim()) return null;
    const hit = findExactDistance(rows, from, to);
    return hit && hit.id !== editId ? hit : null;
  }, [rows, from, to, editId]);

  const startEdit = (r: TripDistance) => {
    setEditId(r.id);
    setFrom(r.from_location);
    setTo(r.to_location);
    setKm(String(r.distance_km));
    setNote(r.note || "");
    setWriteErr("");
  };

  const handleSave = async () => {
    const f = from.trim();
    const t = to.trim();
    const distance = Number(String(km).replace(",", "."));

    if (!f || !t) return setWriteErr("Nhập đủ nơi đi và nơi đến.");
    if (locationKey(f) === locationKey(t))
      return setWriteErr("Nơi đi và nơi đến đang là cùng một địa điểm.");
    if (!Number.isFinite(distance) || distance <= 0)
      return setWriteErr("Số km phải là số lớn hơn 0.");
    if (!user.email) return setWriteErr("Chưa xác định được tài khoản đăng nhập.");

    // Trùng cặp thì SỬA dòng cũ chứ không đẻ dòng thứ hai — hai con số khác nhau
    // cho cùng cung đường là mất luôn ý nghĩa của danh mục. Chỉ số km và ghi chú
    // được ghi đè; tên địa danh giữ nguyên bản đã lưu để khỏi đổi chiều dòng cũ.
    const target = editId
      ? rows.find((r) => r.id === editId) || null
      : duplicate;

    if (target && !canEditRow(target)) {
      return setWriteErr(
        `Cung đường này do ${target.created_by || "người khác"} tạo — chỉ người đó hoặc Admin sửa được.`
      );
    }

    try {
      setSaving(true);
      setWriteErr("");

      if (target) {
        const { data, error: e } = await supabase
          .from("trip_distances")
          .update({ distance_km: distance, note: note.trim() || null })
          .eq("id", target.id)
          .select("id");
        if (e) throw e;
        // RLS chặn UPDATE thì Postgres KHÔNG báo lỗi — nó sửa 0 dòng rồi trả về
        // sạch sẽ. Phải đếm dòng thật sự đổi, không thì người dùng thấy màn hình
        // im lặng và tưởng đã lưu xong.
        if (!data || data.length === 0)
          throw new Error("Không có quyền sửa dòng này (chủ dòng hoặc Admin mới sửa được).");
      } else {
        const { error: e } = await supabase.from("trip_distances").insert({
          from_location: f,
          to_location: t,
          norm_from: locationKey(f),
          norm_to: locationKey(t),
          distance_km: distance,
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

  const handleDelete = async (r: TripDistance) => {
    if (!(await confirm({
      title: "Xoá cung đường này?",
      message: `Cung đường "${r.from_location} – ${r.to_location}" (${r.distance_km} km) sẽ bị xoá khỏi danh mục.`,
      confirmLabel: "Xoá",
    }))) return;
    try {
      setSaving(true);
      setWriteErr("");
      const { data, error: e } = await supabase
        .from("trip_distances")
        .delete()
        .eq("id", r.id)
        .select("id");
      if (e) throw e;
      if (!data || data.length === 0)
        throw new Error("Không có quyền xoá dòng này (chủ dòng hoặc Admin mới xoá được).");
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
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in-50 zoom-in-95 duration-150">

        {/* Tiêu đề */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 sm:px-6 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-sm">
              <MapPin size={16} className="text-white" />
            </span>
            <h3 className="font-heading font-extrabold text-sm text-slate-800">Cấu hình vị trí</h3>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-6 py-4 space-y-4 text-xs">

          {/* Ô nhập / sửa */}
          <div className={`rounded-xl border p-3.5 space-y-3 ${
            editId ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-slate-50/60"
          }`}>
            <div className="flex items-center gap-1.5 font-extrabold text-[11px] uppercase tracking-wider text-slate-500">
              <Route size={13} className="text-blue-600" />
              {editId ? "Sửa cung đường" : "Thêm cung đường"}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div className="space-y-1 sm:col-span-1">
                <label className={labelCls}>Nơi đi</label>
                <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="TPHCM" className={inputCls} />
              </div>
              <div className="space-y-1 sm:col-span-1">
                <label className={labelCls}>Nơi đến</label>
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Tây Ninh" className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Số km</label>
                <input
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  inputMode="decimal"
                  placeholder="104"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Ghi chú</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: đi cao tốc" className={inputCls} />
              </div>
            </div>

            {duplicate && !editId && (
              <p className="flex items-start gap-1.5 text-[11px] font-bold text-amber-700">
                <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Cung đường này đã có: <strong>{duplicate.from_location} – {duplicate.to_location}</strong>{" "}
                  ({duplicate.distance_km} km). Bấm Lưu sẽ ghi đè số km của dòng đó.
                </span>
              </p>
            )}

            {writeErr && (
              <p className="flex items-start gap-1.5 text-[11px] font-bold text-rose-600">
                <AlertTriangle size={12} className="text-rose-500 shrink-0 mt-0.5" />
                <span>{writeErr}</span>
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              {editId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer text-[11px]"
                >
                  Huỷ sửa
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60 text-white font-bold shadow-md shadow-blue-500/10 transition-all active:scale-95 cursor-pointer text-[11px] flex items-center gap-1.5"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : editId ? <Save size={13} /> : <Plus size={13} />}
                {editId ? "Lưu thay đổi" : "Thêm vào danh mục"}
              </button>
            </div>
          </div>

          {/* Tìm kiếm */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm địa điểm trong danh mục..."
              className={`${inputCls} pl-8`}
            />
          </div>

          {/* Danh sách */}
          {loading ? (
            <p className="text-center text-slate-400 italic py-6 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Đang tải danh mục...
            </p>
          ) : error ? (
            <p className="flex items-start gap-1.5 text-[11px] font-bold text-rose-600 bg-rose-50/60 border border-rose-200 rounded-xl p-3">
              <AlertTriangle size={12} className="text-rose-500 shrink-0 mt-0.5" />
              <span>Không đọc được danh mục: {error}</span>
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-slate-400 italic py-6">
              {rows.length === 0 ? "Danh mục còn trống — thêm cung đường đầu tiên ở trên." : "Không có cung đường nào khớp."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/60">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-[#005BAC] to-blue-500 text-white font-extrabold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Nơi đi</th>
                    <th className="py-2.5 px-3">Nơi đến</th>
                    <th className="py-2.5 px-3 text-right">Số km</th>
                    <th className="py-2.5 px-3">Ghi chú</th>
                    <th className="py-2.5 px-3 text-center w-20">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                  {filtered.map((r) => (
                    <tr key={r.id} className={`hover:bg-slate-50/50 transition-colors ${editId === r.id ? "bg-amber-50/50" : ""}`}>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{r.from_location}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{r.to_location}</td>
                      <td className="py-2.5 px-3 text-right font-black text-blue-700 whitespace-nowrap">{r.distance_km} km</td>
                      <td className="py-2.5 px-3 text-slate-450 font-normal max-w-[160px] truncate" title={r.note || ""}>{r.note}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            disabled={!canEditRow(r)}
                            title={canEditRow(r) ? "Sửa" : `Do ${r.created_by || "người khác"} tạo`}
                            className="text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-400 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            disabled={!canEditRow(r) || saving}
                            title={canEditRow(r) ? "Xoá" : `Do ${r.created_by || "người khác"} tạo`}
                            className="text-rose-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-rose-400 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>

        <div className="border-t border-slate-100 px-5 sm:px-6 py-3 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer text-[11px]"
          >
            Đóng
          </button>
        </div>
      </div>
      {dialogsNode}
    </div>,
    document.body
  );
}
