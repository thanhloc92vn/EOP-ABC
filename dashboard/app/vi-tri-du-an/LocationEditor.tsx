"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/apiClient";
import { X, MapPin, Loader2, Check, Trash2, Search, AlertCircle, Navigation, Globe, Plus, Camera } from "lucide-react";
import type { ProjectItem } from "./types";
import { VN_PROVINCE_NAMES } from "@/lib/vnProvinces";

// Link Google My Maps (bản đồ tuỳ chỉnh) — có /maps/d/ và mid=, không chứa toạ độ điểm.
function isMyMapsLink(s: string): boolean {
  return /\/maps\/d\//.test(s) && /mid=[A-Za-z0-9_-]+/.test(s);
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Đang thi công" },
  { value: "completed", label: "Hoàn thành" },
  { value: "planning", label: "Chuẩn bị" },
  { value: "paused", label: "Tạm dừng" },
];

// Tách lat,lng từ chuỗi người dùng dán: toạ độ thô, link Google Maps hoặc Google Earth.
// Trả về [lat, lng] hoặc null. Link rút gọn (maps.app.goo.gl) KHÔNG đọc được -> null.
export function parseLatLng(input: string): [number, number] | null {
  const s = (input || "").trim();
  if (!s) return null;

  const check = (la: number, ln: number): [number, number] | null =>
    Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180
      ? [la, ln]
      : null;

  // 1. Toạ độ thô "lat, lng" hoặc "lat lng"
  let m = s.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (m) return check(parseFloat(m[1]), parseFloat(m[2]));

  // 2. Google Maps/Earth "@lat,lng"
  m = s.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (m) return check(parseFloat(m[1]), parseFloat(m[2]));

  // 3. Tham số q= / query= / destination= / ll= = lat,lng
  m = s.match(/[?&](?:q|query|destination|ll)=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (m) return check(parseFloat(m[1]), parseFloat(m[2]));

  // 4. Dạng place URL "!3dlat!4dlng"
  m = s.match(/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (m) return check(parseFloat(m[1]), parseFloat(m[2]));

  return null;
}

type Draft = {
  mapsLink: string; // ô TRÊN: link Google Maps / toạ độ — vị trí BĐH (để chỉ đường)
  earthLink: string; // ô DƯỚI: link Google Earth — xem thiết kế dự án
  panoLink: string; // link ảnh 360 độ của dự án
  status: string;
  investor: string;
  packageName: string;
  province: string;
};

type RowState = "idle" | "saving" | "saved" | "error";

// Khoá riêng cho form "Thêm vị trí mới" — dùng chung rowState/rowMsg với các dòng BĐH.
const NEW_KEY = "__new__";

const EMPTY_DRAFT: Draft = {
  mapsLink: "",
  earthLink: "",
  panoLink: "",
  status: "active",
  investor: "",
  packageName: "",
  province: "",
};

// Bỏ dấu + thường hoá để so tên BĐH không phân biệt dấu/hoa thường (giống hàm
// normalize bên ProjectMap) — tránh tạo trùng "BĐH Vĩnh Long" / "BDH Vinh Long".
function normalizeBdh(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .trim();
}

export default function LocationEditor({
  items,
  email,
  onClose,
  onSaved,
}: {
  items: ProjectItem[];
  email: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});
  // Form "Thêm vị trí mới" — không cần tạo Ban điều hành trong CSDL trước.
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  // 3 cột chỉ có ở form thêm mới: tên đầy đủ hiển thị trên bản đồ, loại dự án, tiến độ.
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectType, setNewProjectType] = useState("");
  const [newProgress, setNewProgress] = useState("");
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY_DRAFT);

  const getDraft = (p: ProjectItem): Draft =>
    drafts[p.bdhName] ?? {
      mapsLink: p.loc ? `${p.loc.lat}, ${p.loc.lng}` : "",
      earthLink: p.loc?.google_earth_url || "",
      panoLink: p.loc?.panorama_url || "",
      status: p.loc?.status || "active",
      investor: p.loc?.investor || "",
      packageName: p.loc?.package || "",
      province: p.loc?.province || "",
    };

  const setDraft = (bdh: string, patch: Partial<Draft>, base: Draft) =>
    setDrafts((d) => ({ ...d, [bdh]: { ...base, ...patch } }));

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (p) => p.bdhName.toLowerCase().includes(q) || (p.loc?.name || "").toLowerCase().includes(q)
    );
  }, [items, query]);

  // Đọc toạ độ từ ô "Vị trí Ban điều hành" — dùng chung cho dòng BĐH sẵn có và form
  // thêm mới. Trả null khi không đọc được (đã tự set trạng thái lỗi cho `key`).
  async function resolveCoords(
    key: string,
    mapsLink: string
  ): Promise<{ coords: [number, number]; kmlUrl: string | null } | null> {
    let coords = parseLatLng(mapsLink);
    let kmlUrl: string | null = null;

    // Link My Maps -> nhờ server lấy tâm toạ độ từ toàn bộ điểm trong bản đồ.
    if (!coords && isMyMapsLink(mapsLink)) {
      setRowState((s) => ({ ...s, [key]: "saving" }));
      setRowMsg((m) => ({ ...m, [key]: "" }));
      try {
        const res = await apiFetch("/api/mymaps-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: mapsLink }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.ok) {
          setRowState((s) => ({ ...s, [key]: "error" }));
          setRowMsg((m) => ({ ...m, [key]: j?.error || "Không lấy được toạ độ từ My Maps." }));
          return null;
        }
        coords = [j.lat, j.lng];
        kmlUrl = mapsLink;
      } catch {
        setRowState((s) => ({ ...s, [key]: "error" }));
        setRowMsg((m) => ({ ...m, [key]: "Lỗi kết nối khi đọc My Maps." }));
        return null;
      }
    }

    if (!coords) {
      setRowState((s) => ({ ...s, [key]: "error" }));
      setRowMsg((m) => ({
        ...m,
        [key]: mapsLink.includes("goo.gl")
          ? "Link rút gọn không đọc được toạ độ. Mở link rồi copy lat,lng."
          : "Chưa nhận ra toạ độ. Dán 'lat, lng', link Google Maps có @lat,lng, hoặc link Google My Maps.",
      }));
      return null;
    }

    return { coords, kmlUrl };
  }

  // Ghi một dòng project_locations. `key` chỉ dùng để hiện trạng thái/lỗi trên UI.
  // `extra` là các cột chỉ form thêm mới điền (name / project_type / progress) —
  // dòng BĐH sẵn có KHÔNG gửi các cột này nên giá trị cũ trong CSDL được giữ nguyên.
  async function upsertLocation(
    key: string,
    bdhName: string,
    draft: Draft,
    extra?: Record<string, unknown>
  ): Promise<boolean> {
    const resolved = await resolveCoords(key, draft.mapsLink);
    if (!resolved) return false;

    setRowState((s) => ({ ...s, [key]: "saving" }));
    const payload: Record<string, unknown> = {
      bdh_name: bdhName,
      lat: resolved.coords[0],
      lng: resolved.coords[1],
      status: draft.status || "active",
      investor: draft.investor || null,
      package: draft.packageName || null,
      province: draft.province || null,
      google_earth_url: draft.earthLink.trim() || null, // link Google Earth (xem thiết kế)
      panorama_url: draft.panoLink.trim() || null, // link ảnh 360 độ
      created_by: email,
      updated_at: new Date().toISOString(),
      ...(extra || {}),
    };
    if (resolved.kmlUrl) payload.kml_url = resolved.kmlUrl; // giữ link My Maps để mở bản đồ chi tiết
    const { error } = await supabase
      .from("project_locations")
      .upsert(payload, { onConflict: "bdh_name" });
    if (error) {
      setRowState((s) => ({ ...s, [key]: "error" }));
      setRowMsg((m) => ({ ...m, [key]: error.message }));
      return false;
    }
    setRowState((s) => ({ ...s, [key]: "saved" }));
    setRowMsg((m) => ({ ...m, [key]: "" }));
    onSaved();
    return true;
  }

  async function saveRow(p: ProjectItem) {
    await upsertLocation(p.bdhName, p.bdhName, getDraft(p));
  }

  // Thêm vị trí mới cho một Ban điều hành CHƯA có trong danh sách phòng ban.
  // Dòng project_locations không cần BĐH tồn tại trước: ProjectMap đã hiển thị cả
  // những bdh_name không khớp phòng ban nào.
  async function saveNew() {
    const name = newName.trim();
    if (!name) {
      setRowState((s) => ({ ...s, [NEW_KEY]: "error" }));
      setRowMsg((m) => ({ ...m, [NEW_KEY]: "Nhập tên Ban điều hành / dự án trước đã." }));
      return;
    }
    if (items.some((p) => normalizeBdh(p.bdhName) === normalizeBdh(name))) {
      setRowState((s) => ({ ...s, [NEW_KEY]: "error" }));
      setRowMsg((m) => ({
        ...m,
        [NEW_KEY]: `"${name}" đã có trong danh sách bên dưới — sửa trực tiếp ở dòng đó.`,
      }));
      return;
    }
    const ok = await upsertLocation(NEW_KEY, name, newDraft, {
      name: newProjectName.trim() || null,
      project_type: newProjectType.trim() || null,
      progress: newProgress.trim() || null,
    });
    if (!ok) return;
    setNewName("");
    setNewProjectName("");
    setNewProjectType("");
    setNewProgress("");
    setNewDraft(EMPTY_DRAFT);
    setRowState((s) => ({ ...s, [NEW_KEY]: "idle" }));
  }

  async function removeRow(p: ProjectItem) {
    if (!p.loc) return;
    setRowState((s) => ({ ...s, [p.bdhName]: "saving" }));
    const { error } = await supabase.from("project_locations").delete().eq("bdh_name", p.bdhName);
    if (error) {
      setRowState((s) => ({ ...s, [p.bdhName]: "error" }));
      setRowMsg((m) => ({ ...m, [p.bdhName]: error.message }));
      return;
    }
    setDrafts((d) => {
      const next = { ...d };
      delete next[p.bdhName];
      return next;
    });
    setRowState((s) => ({ ...s, [p.bdhName]: "idle" }));
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[900] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/25">
            <MapPin size={17} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading font-extrabold text-sm text-slate-800">Quản lý vị trí dự án</h2>
            <p className="text-[11px] text-slate-400 font-medium">
              Dán link Google Maps/Earth hoặc toạ độ cho từng Ban điều hành
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-rose-500 transition-colors"
            title="Đóng (ESC)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tìm nhanh */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
            <Search size={14} className="text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Lọc theo tên BĐH..."
              className="flex-1 bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Thêm vị trí mới — không cần tạo Ban điều hành trong CSDL trước */}
        <div className="px-6 pt-3">
          {!newOpen ? (
            <button
              onClick={() => setNewOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-[#005BAC] border border-dashed border-blue-200 hover:border-[#00AEEF] hover:bg-blue-50/50 rounded-xl py-2.5 transition-all active:scale-[0.99]"
            >
              <Plus size={13} /> Thêm vị trí mới
            </button>
          ) : (
            <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 flex-1">Thêm vị trí mới</span>
                <button
                  onClick={() => {
                    setNewOpen(false);
                    setRowState((s) => ({ ...s, [NEW_KEY]: "idle" }));
                    setRowMsg((m) => ({ ...m, [NEW_KEY]: "" }));
                  }}
                  className="text-slate-400 hover:text-rose-500 transition-colors"
                  title="Đóng form thêm mới"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <MapPin size={11} className="text-[#005BAC]" /> Tên Ban điều hành / dự án
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Vd: BĐH Cầu Rạch Miễu 2"
                  className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF] placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <MapPin size={11} className="text-slate-400" /> Tên dự án đầy đủ — hiện trên bản đồ (tuỳ chọn)
                </label>
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Để trống sẽ lấy tên Ban điều hành ở trên"
                  className="w-full text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF] placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <Navigation size={11} className="text-[#005BAC]" /> Vị trí Ban điều hành — để chỉ đường (Google Maps)
                </label>
                <input
                  value={newDraft.mapsLink}
                  onChange={(e) => setNewDraft((d) => ({ ...d, mapsLink: e.target.value }))}
                  placeholder="Dán link Google Maps / My Maps, hoặc: 10.7769, 106.7009"
                  className="w-full text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF] placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <Globe size={11} className="text-emerald-600" /> Bản thiết kế dự án — xem trên Google Earth (tuỳ chọn)
                </label>
                <input
                  value={newDraft.earthLink}
                  onChange={(e) => setNewDraft((d) => ({ ...d, earthLink: e.target.value }))}
                  placeholder="Dán link Google Earth (earth.google.com/…) hoặc My Maps"
                  className="w-full text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <Camera size={11} className="text-amber-500" /> Hình ảnh 360 độ (tuỳ chọn)
                </label>
                <input
                  value={newDraft.panoLink}
                  onChange={(e) => setNewDraft((d) => ({ ...d, panoLink: e.target.value }))}
                  placeholder="Dán link ảnh 360 (Street View, Kuula, Matterport…)"
                  className="w-full text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 placeholder:text-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newDraft.status}
                  onChange={(e) => setNewDraft((d) => ({ ...d, status: e.target.value }))}
                  className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#00AEEF]"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={newDraft.province}
                  onChange={(e) => setNewDraft((d) => ({ ...d, province: e.target.value }))}
                  className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#00AEEF]"
                >
                  <option value="">-- Tỉnh / Thành --</option>
                  {VN_PROVINCE_NAMES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <input
                  value={newDraft.investor}
                  onChange={(e) => setNewDraft((d) => ({ ...d, investor: e.target.value }))}
                  placeholder="Chủ đầu tư (tuỳ chọn)"
                  className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF] placeholder:text-slate-400"
                />
                <input
                  value={newDraft.packageName}
                  onChange={(e) => setNewDraft((d) => ({ ...d, packageName: e.target.value }))}
                  placeholder="Gói thầu (tuỳ chọn)"
                  className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF] placeholder:text-slate-400"
                />
                <input
                  value={newProjectType}
                  onChange={(e) => setNewProjectType(e.target.value)}
                  placeholder="Loại dự án (tuỳ chọn)"
                  className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF] placeholder:text-slate-400"
                />
                <input
                  value={newProgress}
                  onChange={(e) => setNewProgress(e.target.value)}
                  placeholder="Tiến độ (tuỳ chọn)"
                  className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF] placeholder:text-slate-400"
                />
              </div>

              {rowState[NEW_KEY] === "error" && rowMsg[NEW_KEY] && (
                <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" /> {rowMsg[NEW_KEY]}
                </p>
              )}

              <button
                onClick={saveNew}
                disabled={rowState[NEW_KEY] === "saving"}
                className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-bold px-3.5 py-2 rounded-lg shadow-sm shadow-blue-500/15 transition-all active:scale-[0.98]"
              >
                {rowState[NEW_KEY] === "saving" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Plus size={13} />
                )}
                Thêm vị trí
              </button>
            </div>
          )}
        </div>

        {/* Danh sách BĐH */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {filtered.map((p) => {
            const draft = getDraft(p);
            const st = rowState[p.bdhName] || "idle";
            return (
              <div
                key={p.bdhName}
                className="rounded-xl border border-slate-100 p-3.5 space-y-2.5 hover:border-slate-200 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 flex-1">{p.bdhName}</span>
                  {p.loc ? (
                    <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                      Đã định vị
                    </span>
                  ) : (
                    <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
                      Chưa có
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                    <Navigation size={11} className="text-[#005BAC]" /> Vị trí Ban điều hành — để chỉ đường (Google Maps)
                  </label>
                  <input
                    value={draft.mapsLink}
                    onChange={(e) => setDraft(p.bdhName, { mapsLink: e.target.value }, draft)}
                    placeholder="Dán link Google Maps / My Maps, hoặc: 10.7769, 106.7009"
                    className="w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF] placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                    <Globe size={11} className="text-emerald-600" /> Bản thiết kế dự án — xem trên Google Earth (tuỳ chọn)
                  </label>
                  <input
                    value={draft.earthLink}
                    onChange={(e) => setDraft(p.bdhName, { earthLink: e.target.value }, draft)}
                    placeholder="Dán link Google Earth (earth.google.com/…) hoặc My Maps"
                    className="w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                    <Camera size={11} className="text-amber-500" /> Hình ảnh 360 độ (tuỳ chọn)
                  </label>
                  <input
                    value={draft.panoLink}
                    onChange={(e) => setDraft(p.bdhName, { panoLink: e.target.value }, draft)}
                    placeholder="Dán link ảnh 360 (Street View, Kuula, Matterport…)"
                    className="w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 placeholder:text-slate-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft(p.bdhName, { status: e.target.value }, draft)}
                    className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#00AEEF]"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={draft.province}
                    onChange={(e) => setDraft(p.bdhName, { province: e.target.value }, draft)}
                    className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#00AEEF]"
                  >
                    <option value="">-- Tỉnh / Thành --</option>
                    {VN_PROVINCE_NAMES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                    {draft.province && !VN_PROVINCE_NAMES.includes(draft.province) && (
                      <option value={draft.province}>{draft.province} (cũ)</option>
                    )}
                  </select>
                  <input
                    value={draft.investor}
                    onChange={(e) => setDraft(p.bdhName, { investor: e.target.value }, draft)}
                    placeholder="Chủ đầu tư (tuỳ chọn)"
                    className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF] placeholder:text-slate-400"
                  />
                  <input
                    value={draft.packageName}
                    onChange={(e) => setDraft(p.bdhName, { packageName: e.target.value }, draft)}
                    placeholder="Gói thầu (tuỳ chọn)"
                    className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF] placeholder:text-slate-400"
                  />
                </div>

                {st === "error" && rowMsg[p.bdhName] && (
                  <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" /> {rowMsg[p.bdhName]}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={() => saveRow(p)}
                    disabled={st === "saving"}
                    className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-bold px-3.5 py-2 rounded-lg shadow-sm shadow-blue-500/15 transition-all active:scale-[0.98]"
                  >
                    {st === "saving" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : st === "saved" ? (
                      <Check size={13} />
                    ) : null}
                    {st === "saved" ? "Đã lưu" : "Lưu vị trí"}
                  </button>
                  {p.loc && (
                    <button
                      onClick={() => removeRow(p)}
                      disabled={st === "saving"}
                      className="flex items-center gap-1.5 text-slate-400 hover:text-rose-500 text-[11px] font-bold px-2.5 py-2 rounded-lg hover:bg-rose-50 transition-all"
                      title="Xoá vị trí"
                    >
                      <Trash2 size={13} /> Xoá
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-slate-400 text-xs italic text-center py-8">Không có BĐH phù hợp</p>
          )}
        </div>
      </div>
    </div>
  );
}
