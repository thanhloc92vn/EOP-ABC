"use client";

// Modal "User Permissions" — trung tâm phân quyền & luồng duyệt (chỉ Admin), 3 tab:
//   1. Cờ quyền (bảng approval_permissions)   — xanh dương
//   2. Nhóm duyệt riêng (bảng approval_groups) — hổ phách
//   3. Đặc cách nghỉ 1 ngày (bảng leave_exceptions) — hồng
// Tầng DB đã chặn ghi với người không phải Admin (migration 003/004/005).

import { useState, useEffect, useMemo, useRef } from "react";
import { X, ShieldCheck, UserPlus, Trash2, Save, Info, Users, CalendarClock, Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { invalidateApproverCaches, normalizeName } from "@/lib/approvers";

type PermissionRow = {
  id: string;
  email: string;
  name: string | null;
  supervises_name?: string | null;
  [key: string]: any;
};

type GroupRow = {
  id: string;
  name: string;
  leader_name: string;
  member_names: string[];
  active: boolean;
};

type ExceptionRow = {
  id: string;
  approver_name: string;
  assignee_name: string;
  note?: string | null;
  active: boolean;
};

type DirectoryEmployee = { name: string; email: string; department: string; role: string };

export type UserPermissionsTab = "flags" | "groups" | "exceptions";

// Nhãn tiếng Việt cho từng cờ — key khớp đúng tên cột trong DB
const FLAG_GROUPS: { title: string; flags: { key: string; label: string; desc: string }[] }[] = [
  {
    title: "Quyền phê duyệt",
    flags: [
      { key: "can_approve_trip", label: "Duyệt công tác", desc: "Duyệt cuối đơn đi công tác (cấp 2 — HCNS)" },
      { key: "can_approve_leave", label: "Duyệt nghỉ phép", desc: "Duyệt cuối đơn nghỉ phép (cấp 2 — HCNS)" },
      { key: "can_approve_justification", label: "Duyệt giải trình công", desc: "Duyệt giải trình chấm công của nhân sự" },
      { key: "can_approve_booking", label: "Duyệt đăng ký xe / phòng họp", desc: "Duyệt cuối đăng ký xe & phòng họp (HCNS điều phối)" },
      { key: "can_approve_benefit", label: "Duyệt chi phúc lợi", desc: "Duyệt hiếu hỷ, biến cố & thưởng lễ (C&B > Phúc lợi)" },
    ],
  },
  {
    title: "Quyền xem / quản lý dữ liệu",
    flags: [
      { key: "can_view_suggestions", label: "Góp ý & Kiến nghị", desc: "Xem và xử lý mọi góp ý gửi về hệ thống" },
      { key: "can_manage_employees", label: "Quản lý hồ sơ nhân sự", desc: "Sửa / xoá / khoá hồ sơ trong Danh sách nhân viên" },
      { key: "can_view_employees", label: "Xem full danh sách nhân viên", desc: "Không có cờ này: chỉ thấy hồ sơ của chính mình" },
      { key: "can_view_invoices", label: "Xem toàn bộ hồ sơ thanh toán", desc: "Trang Hành chính — không có cờ chỉ thấy phiếu tự tạo" },
      { key: "can_view_documents", label: "Văn thư — Xem", desc: "Chỉ xem nhật ký công văn đi/đến, không sửa được" },
      { key: "can_manage_documents", label: "Văn thư — Sửa / Xoá", desc: "Hiện cột Thao tác + nút lưu công văn mới (nhân viên văn thư)" },
      { key: "can_view_candidates", label: "Tuyển dụng", desc: "Xem và xử lý ứng viên, nhu cầu tuyển dụng" },
      { key: "can_view_salary", label: "Xem lương & HĐLĐ", desc: "C&B + tìm kiếm AI — dữ liệu nhạy cảm, chỉ cấp khi thật cần" },
      { key: "can_view_attendance_imports", label: "Kho bảng công chấm công", desc: "Thư mục lưu trữ bảng công máy chấm công (trang C&B)" },
      { key: "can_view_all_tasks", label: "Xem toàn bộ công việc", desc: "Thấy mọi thẻ Kanban thay vì chỉ việc của mình" },
      { key: "can_manage_vpp", label: "Phụ trách VPP", desc: "Thấy mọi phiếu VPP của tất cả phòng ban" },
      { key: "can_manage_project_locations", label: "Quản lý vị trí dự án", desc: "Thêm/sửa/xoá toạ độ dự án trên bản đồ Vị trí dự án" },
      { key: "can_manage_news", label: "Tin tức — Đăng bài", desc: "Đăng, sửa, xoá tin nội bộ (thông báo, giới thiệu, sự kiện)" },
      { key: "can_view_reports", label: "Báo cáo quản trị", desc: "Kế hoạch thu chi, Sản lượng, Doanh thu — chỉ có tác dụng khi công ty ở gói Enterprise" },
    ],
  },
];

const ALL_FLAG_KEYS = FLAG_GROUPS.flatMap(g => g.flags.map(f => f.key));

// Chuẩn hoá chuỗi nhiều email: bỏ khoảng trắng thừa, bỏ token rỗng, nối lại bằng ", ".
// Dùng khi lưu vào approval_permissions.email — cột này phải chứa MỌI email đăng nhập
// của người dùng (email công ty + gmail…) để khớp đúng lúc đọc cờ (approvers.ts so
// "email đã lưu CHỨA email đăng nhập"). Trước đây chỉ lưu email đầu -> ai đăng nhập
// bằng gmail (không phải email đầu) sẽ không nhận được cờ nào.
const normalizeEmailList = (raw: string | null | undefined) =>
  (raw || "").split(",").map(s => s.trim()).filter(Boolean).join(", ");

// Ô tìm kiếm nhân viên có gợi ý — thay cho <select> dài khó tra. Gõ tên (có/không
// dấu đều khớp nhờ normalizeName) -> hiện danh sách lọc kèm phòng ban, bấm để chọn.
function SearchablePicker({
  options,
  value,
  onChange,
  placeholder,
  accentCls,
}: {
  options: { value: string; label: string; sub?: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  accentCls: string; // màu focus theo tab, VD "focus:border-amber-400"
}) {
  const [query, setQuery] = useState("");
  const [openList, setOpenList] = useState(false);
  const selected = options.find(o => o.value === value) || null;
  const filtered = query
    ? options.filter(o => normalizeName(`${o.label} ${o.sub || ""}`).includes(normalizeName(query)))
    : options;
  return (
    <div className="relative flex-1 min-w-0">
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={openList ? query : (selected?.label ?? value ?? "")}
        onFocus={() => { setOpenList(true); setQuery(""); }}
        onBlur={() => setTimeout(() => setOpenList(false), 150)}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className={`w-full pl-8 pr-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white outline-none transition-all ${accentCls}`}
      />
      {openList && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-slate-400 italic">Không tìm thấy nhân viên phù hợp.</p>
          ) : (
            filtered.map(o => (
              <button
                key={o.value}
                type="button"
                // onMouseDown để chạy trước onBlur của input, tránh dropdown đóng sớm
                onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setOpenList(false); setQuery(""); }}
                className={`w-full text-left px-3 py-2 text-xs font-semibold transition-all cursor-pointer hover:bg-slate-50 ${
                  o.value === value ? "text-[#005BAC] bg-blue-50/60" : "text-slate-700"
                }`}
              >
                {o.label}
                {o.sub && <span className="ml-1.5 text-[10px] text-slate-400 font-medium">({o.sub})</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function UserPermissionsModal({
  open,
  onClose,
  employeeDirectory,
  initialTab = "flags",
}: {
  open: boolean;
  onClose: () => void;
  employeeDirectory: DirectoryEmployee[];
  initialTab?: UserPermissionsTab;
}) {
  const [tab, setTab] = useState<UserPermissionsTab>(initialTab);

  // ─── Tab 1: cờ quyền ───
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const addNameRef = useRef<HTMLInputElement>(null); // ô "Cấp quyền cho nhân sự mới"

  // ─── Tab 2: nhóm duyệt riêng ───
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupLeader, setNewGroupLeader] = useState("");
  const [memberToAdd, setMemberToAdd] = useState<Record<string, string>>({});

  // ─── Tab 3: đặc cách nghỉ 1 ngày ───
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [loadingExceptions, setLoadingExceptions] = useState(false);
  const [newExApprover, setNewExApprover] = useState("");
  const [newExAssignee, setNewExAssignee] = useState("");
  const [newExNote, setNewExNote] = useState("");

  const employeeNames = useMemo(
    () => employeeDirectory.map(e => e.name).filter(Boolean).sort((a, b) => a.localeCompare(b, "vi")),
    [employeeDirectory]
  );

  // Danh sách chọn theo TÊN (kèm phòng ban) cho các ô tìm kiếm nhân viên
  const employeeNameOptions = useMemo(
    () => employeeDirectory
      .filter(e => e.name)
      .sort((a, b) => a.name.localeCompare(b.name, "vi"))
      .map(e => ({ value: e.name, label: e.name, sub: e.department || undefined })),
    [employeeDirectory]
  );

  const fetchRows = async () => {
    try {
      setLoading(true);
      // select("*") để không lỗi khi một cột cờ chưa được migrate ở tenant cũ
      const { data, error } = await supabase
        .from("approval_permissions")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      setRows((data || []) as PermissionRow[]);
    } catch (err) {
      console.error("Error fetching approval_permissions:", err);
      alert("Không tải được danh sách phân quyền!");
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      setLoadingGroups(true);
      const { data, error } = await supabase
        .from("approval_groups")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      setGroups((data || []).map((g: any) => ({
        id: g.id,
        name: g.name || "",
        leader_name: g.leader_name || "",
        member_names: Array.isArray(g.member_names) ? g.member_names : [],
        active: !!g.active,
      })));
    } catch (err) {
      console.error("Error fetching approval_groups:", err);
      alert("Không tải được danh sách nhóm duyệt!");
    } finally {
      setLoadingGroups(false);
    }
  };

  const fetchExceptions = async () => {
    try {
      setLoadingExceptions(true);
      const { data, error } = await supabase
        .from("leave_exceptions")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setExceptions((data || []) as ExceptionRow[]);
    } catch (err) {
      console.error("Error fetching leave_exceptions:", err);
      alert("Không tải được danh sách đặc cách!");
    } finally {
      setLoadingExceptions(false);
    }
  };

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      fetchRows();
      fetchGroups();
      fetchExceptions();
      setSelectedId(null);
      if (addNameRef.current) addNameRef.current.value = "";
      setNewGroupName("");
      setNewGroupLeader("");
      setNewExApprover("");
      setNewExAssignee("");
      setNewExNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);

  const selectedRow = useMemo(() => rows.find(r => r.id === selectedId) || null, [rows, selectedId]);

  // ─── Nguồn cho ô "Cấp quyền cho nhân sự mới" = TOÀN BỘ Danh sách nhân viên ───
  // Gợi ý bằng <datalist> (giống ô "Đặc cách" & "Giám sát công việc" phía dưới):
  // TRÌNH DUYỆT tự lọc theo chữ đang gõ, không qua state React -> gõ tiếng Việt bằng
  // bộ gõ (Unikey/Telex) luôn ra kết quả. Bản cũ tự lọc bằng React nên bộ gõ làm mất
  // chữ trong state -> danh sách không lọc.
  // Không cắt bớt người đã có quyền: gõ "Lộc"/"Nhàn" vẫn ra, bấm Thêm sẽ mở thẳng
  // dòng của họ để sửa thay vì tạo dòng trùng.
  const addEmployeeOptions = useMemo(() => {
    return employeeDirectory
      .filter(e => e.name && (e.email || "").trim())
      .map(e => {
        const first = (e.email || "").split(",")[0].trim();
        const existing = rows.find(r => (r.email || "").toLowerCase().includes(first.toLowerCase()));
        return {
          name: e.name,
          department: e.department || "",
          email: e.email || "",
          existingId: existing?.id as string | undefined,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [employeeDirectory, rows]);

  const countActiveFlags = (row: PermissionRow) =>
    ALL_FLAG_KEYS.reduce((n, k) => n + (row[k] ? 1 : 0), 0);

  const updateSelected = (patch: Partial<PermissionRow>) => {
    if (!selectedId) return;
    setRows(prev => prev.map(r => (r.id === selectedId ? { ...r, ...patch } : r)));
  };

  // ━━━ Tab 1 handlers (cờ quyền) ━━━
  const handleAdd = async () => {
    // Đọc THẲNG chữ trong ô (không qua state) — bộ gõ tiếng Việt có thể làm state
    // lệch với những gì đang hiện trên màn hình.
    const typed = (addNameRef.current?.value || "").trim();
    if (!typed) {
      alert("Hãy gõ hoặc chọn tên nhân viên trong Danh sách nhân viên.");
      return;
    }
    const key = normalizeName(typed);
    const emp =
      addEmployeeOptions.find(o => normalizeName(o.name) === key) ||
      addEmployeeOptions.filter(o => normalizeName(o.name).includes(key))[0];
    if (!emp) {
      alert(`Không tìm thấy "${typed}" trong Danh sách nhân viên.\nGõ một phần tên rồi chọn trong danh sách gợi ý.`);
      return;
    }
    // Đã có dòng phân quyền -> mở thẳng dòng đó để sửa, không tạo dòng trùng
    if (emp.existingId) {
      setSelectedId(emp.existingId);
      if (addNameRef.current) addNameRef.current.value = "";
      return;
    }
    // Lưu TẤT CẢ email của nhân viên (công ty + gmail…), không chỉ email đầu — để
    // khớp được với bất kỳ email nào người đó dùng khi đăng nhập.
    const allEmails = normalizeEmailList(emp.email);
    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("approval_permissions")
        .insert([{ email: allEmails, name: emp.name }])
        .select()
        .single();
      if (error) throw error;
      if (addNameRef.current) addNameRef.current.value = "";
      await fetchRows();
      if (data?.id) setSelectedId(data.id);
    } catch (err: any) {
      console.error("Error adding permission row:", err);
      alert("Không thêm được: " + (err.message || err) + "\n(Chỉ tài khoản Admin mới có quyền này.)");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedRow) return;
    const emailVal = normalizeEmailList(selectedRow.email);
    if (!emailVal) {
      alert("Email không được để trống — đây là khoá khớp với tài khoản đăng nhập.");
      return;
    }
    try {
      setSaving(true);
      // Chỉ gửi các cột thật sự tồn tại trong dòng đã fetch — tránh lỗi khi
      // tenant cũ thiếu cột cờ mới
      const payload: Record<string, any> = {
        name: selectedRow.name || null,
        email: emailVal,
      };
      if ("supervises_name" in selectedRow) {
        payload.supervises_name = (selectedRow.supervises_name || "").trim() || null;
      }
      ALL_FLAG_KEYS.forEach(k => {
        if (k in selectedRow) payload[k] = !!selectedRow[k];
      });
      const { error } = await supabase
        .from("approval_permissions")
        .update(payload)
        .eq("id", selectedRow.id);
      if (error) throw error;
      alert(`Đã lưu phân quyền cho ${selectedRow.name || selectedRow.email}.\nNgười này cần tải lại trang để quyền mới có hiệu lực.`);
      await fetchRows();
    } catch (err: any) {
      console.error("Error saving permission row:", err);
      alert("Không lưu được: " + (err.message || err) + "\n(Chỉ tài khoản Admin mới có quyền này.)");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRow) return;
    if (!confirm(`Thu hồi TOÀN BỘ quyền của ${selectedRow.name || selectedRow.email}?\nDòng phân quyền sẽ bị xoá khỏi bảng.`)) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from("approval_permissions")
        .delete()
        .eq("id", selectedRow.id);
      if (error) throw error;
      setSelectedId(null);
      await fetchRows();
    } catch (err: any) {
      console.error("Error deleting permission row:", err);
      alert("Không xoá được: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  // ━━━ Tab 2 handlers (nhóm duyệt riêng) ━━━
  const updateGroup = (id: string, patch: Partial<GroupRow>) => {
    setGroups(prev => prev.map(g => (g.id === id ? { ...g, ...patch } : g)));
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name || !newGroupLeader) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from("approval_groups")
        .insert([{ name, leader_name: newGroupLeader, member_names: [] }]);
      if (error) throw error;
      invalidateApproverCaches();
      setNewGroupName("");
      setNewGroupLeader("");
      await fetchGroups();
    } catch (err: any) {
      console.error("Error creating approval group:", err);
      alert("Không tạo được nhóm: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGroup = async (g: GroupRow) => {
    if (!g.name.trim() || !g.leader_name.trim()) {
      alert("Nhóm phải có tên và tổ trưởng!");
      return;
    }
    try {
      setSaving(true);
      const { error } = await supabase
        .from("approval_groups")
        .update({
          name: g.name.trim(),
          leader_name: g.leader_name.trim(),
          member_names: g.member_names,
          active: g.active,
        })
        .eq("id", g.id);
      if (error) throw error;
      invalidateApproverCaches();
      alert(`Đã lưu nhóm "${g.name.trim()}".`);
      await fetchGroups();
    } catch (err: any) {
      console.error("Error saving approval group:", err);
      alert("Không lưu được nhóm: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (g: GroupRow) => {
    if (!confirm(`Xoá nhóm duyệt "${g.name}"?\nThành viên nhóm sẽ quay lại luồng duyệt thường (Trưởng phòng ban duyệt cấp 1).`)) return;
    try {
      setSaving(true);
      const { error } = await supabase.from("approval_groups").delete().eq("id", g.id);
      if (error) throw error;
      invalidateApproverCaches();
      await fetchGroups();
    } catch (err: any) {
      console.error("Error deleting approval group:", err);
      alert("Không xoá được nhóm: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  // ━━━ Tab 3 handlers (đặc cách nghỉ 1 ngày) ━━━
  const updateException = (id: string, patch: Partial<ExceptionRow>) => {
    setExceptions(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
  };

  const handleCreateException = async () => {
    const approver = newExApprover.trim();
    const assignee = newExAssignee.trim();
    if (!approver || !assignee) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from("leave_exceptions")
        .insert([{ approver_name: approver, assignee_name: assignee, note: newExNote.trim() || null }]);
      if (error) throw error;
      invalidateApproverCaches();
      setNewExApprover("");
      setNewExAssignee("");
      setNewExNote("");
      await fetchExceptions();
    } catch (err: any) {
      console.error("Error creating leave exception:", err);
      alert("Không thêm được đặc cách: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveException = async (e: ExceptionRow) => {
    if (!e.approver_name.trim() || !e.assignee_name.trim()) {
      alert("Đặc cách phải có đủ tên người duyệt và người được duyệt!");
      return;
    }
    try {
      setSaving(true);
      const { error } = await supabase
        .from("leave_exceptions")
        .update({
          approver_name: e.approver_name.trim(),
          assignee_name: e.assignee_name.trim(),
          note: (e.note || "").trim() || null,
          active: e.active,
        })
        .eq("id", e.id);
      if (error) throw error;
      invalidateApproverCaches();
      await fetchExceptions();
    } catch (err: any) {
      console.error("Error saving leave exception:", err);
      alert("Không lưu được đặc cách: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteException = async (e: ExceptionRow) => {
    if (!confirm(`Xoá đặc cách "${e.approver_name} duyệt ${e.assignee_name}"?`)) return;
    try {
      setSaving(true);
      const { error } = await supabase.from("leave_exceptions").delete().eq("id", e.id);
      if (error) throw error;
      invalidateApproverCaches();
      await fetchExceptions();
    } catch (err: any) {
      console.error("Error deleting leave exception:", err);
      alert("Không xoá được đặc cách: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const TABS: { key: UserPermissionsTab; label: string; icon: any; activeCls: string }[] = [
    { key: "flags", label: "Cờ quyền người dùng", icon: ShieldCheck, activeCls: "bg-white text-blue-600 shadow-sm" },
    { key: "groups", label: "Nhóm duyệt riêng", icon: Users, activeCls: "bg-white text-amber-600 shadow-sm" },
    { key: "exceptions", label: "Đặc cách nghỉ 1 ngày", icon: CalendarClock, activeCls: "bg-white text-rose-600 shadow-sm" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-premium border border-slate-100 overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#005BAC] text-white shrink-0">
          <h3 className="font-heading font-black text-sm flex items-center gap-2">
            <ShieldCheck size={16} /> User Permissions — Phân quyền &amp; Luồng duyệt
          </h3>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-all cursor-pointer p-1 rounded-lg hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab bar — mỗi cụm một màu để dễ phân biệt */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="bg-slate-100 p-0.5 rounded-xl inline-flex gap-1 border border-slate-200 text-[11px] font-bold">
            {TABS.map(t => {
              const IconCmp = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${
                    tab === t.key ? t.activeCls : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <IconCmp size={13} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Datalist tên nhân viên dùng chung cho các ô nhập tên */}
        <datalist id="up-employee-names">
          {employeeNames.map(n => <option key={n} value={n} />)}
        </datalist>

        {/* ━━━━━━━━━━ TAB 1: CỜ QUYỀN ━━━━━━━━━━ */}
        {tab === "flags" && (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3">
          {/* ─── Cột trái: danh sách người đã được cấp quyền ─── */}
          <div className="border-r border-slate-100 flex flex-col min-h-0">
            <div className="p-4 border-b border-slate-100 space-y-2 shrink-0">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Cấp quyền cho nhân sự mới</label>
              <div className="flex gap-2">
                {/* Ô tìm nhân sự — gợi ý bằng <datalist>: trình duyệt tự lọc theo chữ
                    đang gõ nên gõ tiếng Việt bằng bộ gõ luôn ra kết quả. */}
                <div className="relative flex-1 min-w-0">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    ref={addNameRef}
                    type="text"
                    list="up-add-employee"
                    placeholder="Gõ tên nhân viên..."
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
                    className="w-full pl-8 pr-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] outline-none transition-all"
                  />
                  <datalist id="up-add-employee">
                    {addEmployeeOptions.map(o => (
                      <option
                        key={`${o.name}|${o.email}`}
                        value={o.name}
                        label={[o.department, o.existingId ? "đã có quyền" : ""].filter(Boolean).join(" • ") || undefined}
                      />
                    ))}
                  </datalist>
                </div>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={saving}
                  className="shrink-0 px-3 py-2 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all active:scale-95 cursor-pointer"
                  title="Thêm vào bảng phân quyền"
                >
                  <UserPlus size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-semibold gap-2">
                  <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                  Đang tải...
                </div>
              ) : rows.length === 0 ? (
                <p className="text-center text-slate-400 text-xs italic py-8">Chưa có ai được cấp quyền riêng.</p>
              ) : (
                rows.map(r => {
                  const active = countActiveFlags(r);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all cursor-pointer border ${
                        selectedId === r.id
                          ? "bg-blue-50/70 border-blue-200"
                          : "border-transparent hover:bg-slate-50"
                      }`}
                    >
                      <p className="text-xs font-bold text-slate-800 truncate">{r.name || r.email}</p>
                      <p className="text-[10px] text-slate-400 font-semibold truncate">{r.email}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                        active > 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-100 text-slate-400 border border-slate-200"
                      }`}>
                        {active}/{ALL_FLAG_KEYS.length} quyền
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ─── Cột phải: bảng cờ quyền của người đang chọn ─── */}
          <div className="md:col-span-2 flex flex-col min-h-0">
            {!selectedRow ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-300 p-8">
                <ShieldCheck size={40} />
                <p className="text-xs font-semibold text-slate-400 text-center">
                  Chọn một người bên trái để xem / chỉnh cờ quyền,<br />
                  hoặc thêm nhân sự mới vào bảng phân quyền.
                </p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tên hiển thị</label>
                      <input
                        type="text"
                        value={selectedRow.name || ""}
                        onChange={(e) => updateSelected({ name: e.target.value })}
                        placeholder="Nguyễn Văn A"
                        className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Email (khoá khớp đăng nhập)</label>
                      <input
                        type="text"
                        value={selectedRow.email || ""}
                        onChange={(e) => updateSelected({ email: e.target.value })}
                        placeholder="email@cty.com, email@gmail.com"
                        className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] outline-none transition-all"
                        title="Khoá khớp với tài khoản đăng nhập. Nhập được nhiều email cách nhau dấu phẩy (VD email công ty + gmail dùng để đăng nhập) — cờ sẽ nhận khi đăng nhập bằng bất kỳ email nào ở đây."
                      />
                      <p className="text-[10px] text-slate-400 font-normal leading-snug">
                        Đăng nhập bằng gmail thì phải có gmail ở đây, cách email công ty bằng dấu phẩy.
                      </p>
                    </div>
                  </div>

                  {FLAG_GROUPS.map(group => (
                    <div key={group.title} className="space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">
                        {group.title}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.flags.map(f => {
                          const missing = !(f.key in selectedRow);
                          return (
                            <label
                              key={f.key}
                              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all ${
                                missing
                                  ? "border-slate-100 bg-slate-50/50 opacity-50 cursor-not-allowed"
                                  : selectedRow[f.key]
                                    ? "border-emerald-200 bg-emerald-50/50 cursor-pointer"
                                    : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 cursor-pointer"
                              }`}
                              title={missing ? "Cột này chưa được migrate trong DB — chạy migration 005" : f.desc}
                            >
                              <input
                                type="checkbox"
                                checked={!!selectedRow[f.key]}
                                disabled={missing}
                                onChange={(e) => updateSelected({ [f.key]: e.target.checked })}
                                className="mt-0.5 w-3.5 h-3.5 accent-emerald-600 cursor-pointer shrink-0"
                              />
                              <span className="min-w-0">
                                <span className="block text-xs font-bold text-slate-700">{f.label}</span>
                                <span className="block text-[10px] text-slate-400 font-medium leading-snug">{f.desc}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Giám sát công việc của (tuỳ chọn)</label>
                    <input
                      type="text"
                      value={selectedRow.supervises_name || ""}
                      onChange={(e) => updateSelected({ supervises_name: e.target.value })}
                      list="up-employee-names"
                      placeholder='VD: "Thanh Hằng" — thấy thêm task của người này trên Kanban'
                      className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] outline-none transition-all"
                    />
                    <p className="text-[10px] text-slate-400 font-normal">
                      Tên hiển thị của người được giám sát (khớp cột người phụ trách trong Quản lý công việc). Để trống nếu không dùng.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/50">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="px-4 py-2 text-xs font-bold text-rose-600 border border-rose-200 hover:bg-rose-50 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> Thu hồi toàn bộ
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer shadow-premium flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {saving ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save size={13} />
                    )}
                    Lưu thay đổi
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        )}

        {/* ━━━━━━━━━━ TAB 2: NHÓM DUYỆT RIÊNG (amber) ━━━━━━━━━━ */}
        {tab === "groups" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-3.5 text-[11px] text-amber-800 leading-relaxed">
            <p className="font-bold flex items-center gap-1.5 mb-0.5"><Users size={13} /> Nhóm duyệt riêng là gì?</p>
            Tổ có luồng duyệt cấp 1 riêng: thành viên gửi <b>bất kỳ đơn gì</b> (nghỉ phép, công tác, đăng ký xe/phòng họp)
            thì <b>tổ trưởng của tổ</b> duyệt cấp 1 thay vì Trưởng phòng ban — sau đó vẫn qua phòng HCNS xác nhận như thường.
            Tên tổ trưởng/thành viên phải khớp đúng tên trong Danh sách nhân viên.
          </div>

          {/* Form tạo nhóm mới */}
          <div className="flex flex-col sm:flex-row gap-2 p-3.5 rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/40">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Tên nhóm mới (VD: Tổ Marketing)"
              className="flex-1 min-w-0 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:border-amber-400 outline-none transition-all"
            />
            <SearchablePicker
              options={employeeNameOptions}
              value={newGroupLeader}
              onChange={setNewGroupLeader}
              placeholder="Tìm tên tổ trưởng..."
              accentCls="focus:border-amber-400"
            />
            <button
              type="button"
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim() || !newGroupLeader || saving}
              className="shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <Plus size={13} /> Tạo nhóm
            </button>
          </div>

          {loadingGroups ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-semibold gap-2">
              <span className="w-4 h-4 border-2 border-slate-300 border-t-amber-500 rounded-full animate-spin" />
              Đang tải...
            </div>
          ) : groups.length === 0 ? (
            <p className="text-center text-slate-400 text-xs italic py-8">Chưa có nhóm duyệt riêng nào — mọi đơn đi luồng Trưởng phòng ban.</p>
          ) : (
            groups.map(g => (
              <div key={g.id} className={`rounded-xl border p-4 space-y-3 transition-all ${g.active ? "border-amber-200 bg-white" : "border-slate-200 bg-slate-50/60 opacity-75"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={g.name}
                    onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                    className="flex-1 min-w-[140px] px-3 py-2 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-400 outline-none transition-all"
                  />
                  <label className={`flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1.5 rounded-full border cursor-pointer transition-all ${
                    g.active ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"
                  }`}>
                    <input
                      type="checkbox"
                      checked={g.active}
                      onChange={(e) => updateGroup(g.id, { active: e.target.checked })}
                      className="w-3 h-3 accent-emerald-600 cursor-pointer"
                    />
                    {g.active ? "Đang hoạt động" : "Đã tắt"}
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tổ trưởng (duyệt cấp 1)</label>
                    <div className="flex">
                      <SearchablePicker
                        options={employeeNameOptions}
                        value={g.leader_name}
                        onChange={(v) => updateGroup(g.id, { leader_name: v })}
                        placeholder="Tìm tên tổ trưởng..."
                        accentCls="focus:border-amber-400"
                      />
                    </div>
                    {g.leader_name && !employeeNames.includes(g.leader_name) && (
                      <p className="text-[10px] text-rose-500 font-semibold">⚠ Tên không khớp Danh sách nhân viên — kiểm tra lại chính tả/dấu.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Thêm thành viên</label>
                    <div className="flex gap-2">
                      <SearchablePicker
                        options={employeeNameOptions.filter(o => !g.member_names.includes(o.value) && o.value !== g.leader_name)}
                        value={memberToAdd[g.id] || ""}
                        onChange={(v) => setMemberToAdd(prev => ({ ...prev, [g.id]: v }))}
                        placeholder="Tìm tên thành viên..."
                        accentCls="focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const name = memberToAdd[g.id];
                          if (!name) return;
                          updateGroup(g.id, { member_names: [...g.member_names, name] });
                          setMemberToAdd(prev => ({ ...prev, [g.id]: "" }));
                        }}
                        disabled={!memberToAdd[g.id]}
                        className="shrink-0 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all active:scale-95 cursor-pointer"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Thành viên ({g.member_names.length})</label>
                  <div className="flex flex-wrap gap-1.5">
                    {g.member_names.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">Chưa có thành viên.</span>
                    ) : (
                      g.member_names.map(m => (
                        <span key={m} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800">
                          {m}
                          <button
                            type="button"
                            onClick={() => updateGroup(g.id, { member_names: g.member_names.filter(x => x !== m) })}
                            className="text-amber-500 hover:text-rose-600 transition-all cursor-pointer"
                            title="Bỏ khỏi nhóm"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleDeleteGroup(g)}
                    disabled={saving}
                    className="px-3.5 py-1.5 text-[11px] font-bold text-rose-600 border border-rose-200 hover:bg-rose-50 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    <Trash2 size={12} /> Xoá nhóm
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveGroup(g)}
                    disabled={saving}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    <Save size={12} /> Lưu nhóm
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        )}

        {/* ━━━━━━━━━━ TAB 3: ĐẶC CÁCH NGHỈ 1 NGÀY (rose) ━━━━━━━━━━ */}
        {tab === "exceptions" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-3.5 text-[11px] text-rose-800 leading-relaxed">
            <p className="font-bold flex items-center gap-1.5 mb-0.5"><CalendarClock size={13} /> Đặc cách nghỉ 1 ngày là gì?</p>
            Mỗi dòng = một cặp &quot;<b>người duyệt</b> được duyệt cấp 1 <b>đơn nghỉ đúng 1 NGÀY</b> của <b>người được duyệt</b>&quot;
            (đặc cách quy định nội bộ). Chỉ áp dụng cho nghỉ phép 1 ngày — công tác, nghỉ dài ngày vẫn đi luồng thường.
            Tên khớp kiểu &quot;chứa, không phân biệt dấu&quot;: lưu &quot;Quỳnh&quot; khớp cả &quot;Nguyễn Bích Như Quỳnh&quot;.
          </div>

          {/* Form thêm đặc cách */}
          <div className="flex flex-col sm:flex-row gap-2 p-3.5 rounded-xl border-2 border-dashed border-rose-200 bg-rose-50/40">
            <input
              type="text"
              value={newExApprover}
              onChange={(e) => setNewExApprover(e.target.value)}
              list="up-employee-names"
              placeholder="Người duyệt (VD: Quỳnh)"
              className="flex-1 min-w-0 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:border-rose-400 outline-none transition-all"
            />
            <input
              type="text"
              value={newExAssignee}
              onChange={(e) => setNewExAssignee(e.target.value)}
              list="up-employee-names"
              placeholder="Người được duyệt (VD: Hằng)"
              className="flex-1 min-w-0 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:border-rose-400 outline-none transition-all"
            />
            <input
              type="text"
              value={newExNote}
              onChange={(e) => setNewExNote(e.target.value)}
              placeholder="Ghi chú (tuỳ chọn)"
              className="flex-1 min-w-0 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:border-rose-400 outline-none transition-all"
            />
            <button
              type="button"
              onClick={handleCreateException}
              disabled={!newExApprover.trim() || !newExAssignee.trim() || saving}
              className="shrink-0 px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <Plus size={13} /> Thêm
            </button>
          </div>

          {loadingExceptions ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-semibold gap-2">
              <span className="w-4 h-4 border-2 border-slate-300 border-t-rose-500 rounded-full animate-spin" />
              Đang tải...
            </div>
          ) : exceptions.length === 0 ? (
            <p className="text-center text-slate-400 text-xs italic py-8">
              Chưa có đặc cách nào — mọi đơn nghỉ 1 ngày đi luồng Trưởng phòng duyệt như thường.
            </p>
          ) : (
            <div className="space-y-2">
              {exceptions.map(e => (
                <div key={e.id} className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border p-3 transition-all ${
                  e.active ? "border-rose-200 bg-white" : "border-slate-200 bg-slate-50/60 opacity-75"
                }`}>
                  <input
                    type="text"
                    value={e.approver_name}
                    onChange={(ev) => updateException(e.id, { approver_name: ev.target.value })}
                    list="up-employee-names"
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-rose-400 outline-none transition-all"
                    title="Người duyệt"
                  />
                  <span className="shrink-0 text-[10px] font-extrabold text-rose-500 uppercase tracking-wider text-center">duyệt nghỉ 1 ngày của</span>
                  <input
                    type="text"
                    value={e.assignee_name}
                    onChange={(ev) => updateException(e.id, { assignee_name: ev.target.value })}
                    list="up-employee-names"
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-rose-400 outline-none transition-all"
                    title="Người được duyệt"
                  />
                  <label className={`shrink-0 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1.5 rounded-full border cursor-pointer transition-all ${
                    e.active ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"
                  }`}>
                    <input
                      type="checkbox"
                      checked={e.active}
                      onChange={(ev) => updateException(e.id, { active: ev.target.checked })}
                      className="w-3 h-3 accent-emerald-600 cursor-pointer"
                    />
                    {e.active ? "Bật" : "Tắt"}
                  </label>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSaveException(e)}
                      disabled={saving}
                      className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    >
                      <Save size={12} /> Lưu
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteException(e)}
                      disabled={saving}
                      className="p-1.5 text-rose-600 border border-rose-200 hover:bg-rose-50 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                      title="Xoá đặc cách"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        <div className="shrink-0 px-6 py-3 border-t border-slate-100 bg-blue-50/60 text-blue-800 text-[10px] leading-relaxed flex items-start gap-2">
          <Info size={13} className="shrink-0 mt-0.5" />
          <p>
            Cờ quyền có hiệu lực khi người dùng tải lại trang; nhóm duyệt &amp; đặc cách áp dụng ngay cho lượt duyệt kế tiếp.
            Admin luôn có toàn quyền. Tầng DB (RLS) chỉ cho tài khoản Admin thêm/sửa/xoá — người khác dù mở được modal cũng không ghi được.
          </p>
        </div>
      </div>
    </div>
  );
}
