"use client";

// ============================================================
// ProjectCatalogPanel — tab "Danh mục công việc" trong Cài đặt hệ thống.
//
// Ba danh mục nuôi form tạo/sửa task ở trang Quản lý công việc:
//   1. Dự án (mã + tên)   -> chọn tên là tự điền mã
//   2. Nhóm công việc
//   3. Nguồn công việc
//
// CHỈ ADMIN. Khoá 2 tầng: ẩn ở đây theo `user.isAdmin`, và RLS của migration
// 037 cũng chỉ cho Admin ghi — không tin mỗi giao diện.
//
// Tách file riêng thay vì chèn vào settings/page.tsx (đã 1900+ dòng), cùng lối
// với UsageReportPanel.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { invalidateProjectCatalog, type CatalogKind } from "@/lib/projectCatalog";
import { useDialogs } from "@/components/ConfirmDialog";
import {
  FolderKanban, ShieldAlert, Loader2, Plus, Trash2, Save, RefreshCw, Tags,
} from "lucide-react";

type ProjectRow = { id: string; code: string; name: string; active: boolean; sort_order: number };
type CatalogRow = { id: string; kind: CatalogKind; name: string; active: boolean; sort_order: number };

export default function ProjectCatalogPanel() {
  // Hộp xác nhận căn giữa, đồng bộ giao diện (thay window.confirm)
  const { confirm, dialogsNode } = useDialogs();
  const currentUser = useCurrentUser();
  const isAdmin = !!currentUser?.isAdmin;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [newSource, setNewSource] = useState("");

  // Panel quản trị đọc CẢ dòng đã tắt (active=false) — khác hook
  // useProjectCatalog vốn chỉ lấy dòng đang bật để đổ vào form task.
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const [p, c] = await Promise.all([
        supabase.from("projects").select("*").order("sort_order").order("code"),
        supabase.from("task_catalog").select("*").order("kind").order("sort_order"),
      ]);
      if (p.error) throw p.error;
      if (c.error) throw c.error;
      setProjects((p.data || []) as ProjectRow[]);
      setCatalog((c.data || []) as CatalogRow[]);
    } catch (e: any) {
      // Lỗi hay gặp nhất: chưa chạy migration 037 nên bảng chưa tồn tại.
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Mọi thao tác ghi đều đi qua đây: chạy xong thì xoá cache danh mục để form
  // task đọc dữ liệu mới mà không cần F5, rồi nạp lại bảng.
  const runWrite = async (fn: () => Promise<{ error: unknown }>, failMsg: string) => {
    try {
      setSaving(true);
      setErr("");
      const { error } = await fn();
      if (error) throw error;
      invalidateProjectCatalog();
      await fetchAll();
    } catch (e: any) {
      setErr(`${failMsg}: ${e?.message || String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const addProject = () => {
    const code = newCode.trim();
    const name = newName.trim();
    if (!code || !name) { setErr("Nhập đủ cả Mã dự án và Tên dự án."); return; }
    runWrite(
      async () => supabase.from("projects").insert([{ code, name }]),
      "Không thêm được dự án"
    ).then(() => { setNewCode(""); setNewName(""); });
  };

  const saveProject = (r: ProjectRow) =>
    runWrite(
      async () => supabase.from("projects")
        .update({ code: r.code.trim(), name: r.name.trim(), active: r.active })
        .eq("id", r.id),
      "Không lưu được dự án"
    );

  const removeProject = async (r: ProjectRow) => {
    if (!(await confirm({
      title: `Xoá dự án "${r.code} — ${r.name}"?`,
      message: "Các task ĐÃ tạo vẫn giữ nguyên mã và tên dự án đã ghi, không bị mất.",
      confirmLabel: "Xoá",
    }))) return;
    runWrite(async () => supabase.from("projects").delete().eq("id", r.id), "Không xoá được dự án");
  };

  const addCatalog = (kind: CatalogKind, name: string, reset: () => void) => {
    const v = name.trim();
    if (!v) return;
    runWrite(
      async () => supabase.from("task_catalog").insert([{ kind, name: v }]),
      "Không thêm được mục"
    ).then(reset);
  };

  const saveCatalog = (r: CatalogRow) =>
    runWrite(
      async () => supabase.from("task_catalog")
        .update({ name: r.name.trim(), active: r.active })
        .eq("id", r.id),
      "Không lưu được mục"
    );

  const removeCatalog = async (r: CatalogRow) => {
    if (!(await confirm({
      title: `Xoá "${r.name}" khỏi danh mục?`,
      message: "Các task đã chọn giá trị này vẫn giữ nguyên.",
      confirmLabel: "Xoá",
    }))) return;
    runWrite(async () => supabase.from("task_catalog").delete().eq("id", r.id), "Không xoá được mục");
  };

  if (!isAdmin) {
    return (
      <div className="glass bg-white rounded-2xl p-8 border border-slate-200/50 shadow-premium flex items-center gap-4">
        <ShieldAlert size={28} className="text-amber-500 shrink-0" />
        <div>
          <h2 className="font-heading font-bold text-slate-800 text-sm">Chỉ Admin xem được mục này</h2>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Danh mục dự án và nhóm/nguồn công việc do quản trị hệ thống cấu hình.
          </p>
        </div>
      </div>
    );
  }

  const groups = catalog.filter(c => c.kind === "work_group");
  const sources = catalog.filter(c => c.kind === "work_source");

  const inputCls = "border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold text-slate-800 text-xs bg-white";

  const renderCatalogSection = (
    title: string,
    hint: string,
    kind: CatalogKind,
    rows: CatalogRow[],
    draft: string,
    setDraft: (v: string) => void,
  ) => (
    <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
      <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
        <Tags size={18} className="text-blue-600" /> {title}
      </h2>
      <p className="text-[11px] text-slate-400 font-medium mb-4">{hint}</p>

      <div className="flex gap-2 mb-4">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCatalog(kind, draft, () => setDraft("")); } }}
          placeholder="Tên mục mới..."
          className={`${inputCls} flex-1`}
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => addCatalog(kind, draft, () => setDraft(""))}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
        >
          <Plus size={13} /> Thêm
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-400 font-medium italic py-3">Chưa có mục nào.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2">
              <input
                value={r.name}
                onChange={(e) => {
                  const v = e.target.value;
                  setCatalog(prev => prev.map(x => (x.id === r.id ? { ...x, name: v } : x)));
                }}
                className={`${inputCls} flex-1`}
              />
              <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={r.active}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setCatalog(prev => prev.map(x => (x.id === r.id ? { ...x, active: v } : x)));
                  }}
                />
                Bật
              </label>
              <button type="button" disabled={saving} onClick={() => saveCatalog(r)}
                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer disabled:opacity-50" title="Lưu">
                <Save size={14} />
              </button>
              <button type="button" disabled={saving} onClick={() => removeCatalog(r)}
                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer disabled:opacity-50" title="Xoá">
                <Trash2 size={14} />
              </button>
              <span className="text-[9px] text-slate-300 font-bold w-5 text-right shrink-0">{i + 1}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {err && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-[11px] font-bold text-rose-700">
          {err}
          <p className="font-medium text-rose-600 mt-1">
            Nếu báo bảng không tồn tại: hãy chạy <code className="bg-white px-1 rounded">037_project_catalog.sql</code> trong Supabase SQL Editor trước.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold p-8">
          <Loader2 size={16} className="animate-spin" /> Đang tải danh mục...
        </div>
      ) : (
        <>
          {/* ─── DANH SÁCH DỰ ÁN ─── */}
          <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
                <FolderKanban size={18} className="text-blue-600" /> Danh sách dự án triển khai
              </h2>
              <button type="button" onClick={fetchAll} disabled={saving}
                className="text-slate-400 hover:text-blue-600 p-1 rounded-lg cursor-pointer disabled:opacity-50" title="Tải lại">
                <RefreshCw size={14} />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mb-4">
              Mã và tên dự án dùng cho form giao việc — chọn tên dự án là mã tự điền theo.
              Đây là danh mục riêng, không dính tới cơ cấu Ban Điều Hành trong Danh sách nhân viên.
            </p>

            <div className="flex gap-2 mb-4">
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Mã dự án (VD: TN-VL-01)"
                className={`${inputCls} w-52`}
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProject(); } }}
                placeholder="Tên dự án đầy đủ..."
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                disabled={saving}
                onClick={addProject}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus size={13} /> Thêm dự án
              </button>
            </div>

            {projects.length === 0 ? (
              <p className="text-[11px] text-slate-400 font-medium italic py-3">
                Chưa có dự án nào. Thêm dòng đầu tiên ở ô phía trên.
              </p>
            ) : (
              <div className="space-y-2">
                {projects.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <input
                      value={r.code}
                      onChange={(e) => {
                        const v = e.target.value;
                        setProjects(prev => prev.map(x => (x.id === r.id ? { ...x, code: v } : x)));
                      }}
                      className={`${inputCls} w-52 font-mono`}
                    />
                    <input
                      value={r.name}
                      onChange={(e) => {
                        const v = e.target.value;
                        setProjects(prev => prev.map(x => (x.id === r.id ? { ...x, name: v } : x)));
                      }}
                      className={`${inputCls} flex-1`}
                    />
                    <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setProjects(prev => prev.map(x => (x.id === r.id ? { ...x, active: v } : x)));
                        }}
                      />
                      Đang triển khai
                    </label>
                    <button type="button" disabled={saving} onClick={() => saveProject(r)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer disabled:opacity-50" title="Lưu">
                      <Save size={14} />
                    </button>
                    <button type="button" disabled={saving} onClick={() => removeProject(r)}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer disabled:opacity-50" title="Xoá">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {renderCatalogSection(
              "Nhóm công việc",
              "Phân loại việc theo mảng chuyên môn (thi công, kỹ thuật, hồ sơ...).",
              "work_group", groups, newGroup, setNewGroup
            )}
            {renderCatalogSection(
              "Nguồn công việc",
              "Việc này đến từ đâu (chủ đầu tư, ban lãnh đạo, phát sinh hiện trường...).",
              "work_source", sources, newSource, setNewSource
            )}
          </div>

          <p className="text-[11px] text-slate-400 font-medium">
            Bỏ tick <span className="font-bold">Bật</span> / <span className="font-bold">Đang triển khai</span> để ẩn một mục khỏi form giao việc
            mà vẫn giữ lại dữ liệu cũ — cách này an toàn hơn xoá hẳn.
          </p>
        </>
      )}
      {dialogsNode}
    </div>
  );
}
