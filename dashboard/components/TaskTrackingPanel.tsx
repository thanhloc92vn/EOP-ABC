"use client";

// ============================================================
// TaskTrackingPanel — bảng "Danh sách việc theo dõi", nằm DƯỚI bảng Kanban.
//
// Nguồn dữ liệu: các task ở trạng thái `tracking` (cột "Update thông tin") +
// bảng lịch sử `task_updates` (migration 038).
//
// VÌ SAO Ô CẬP NHẬT NẰM Ở ĐÂY, KHÔNG NẰM TRONG THẺ KANBAN:
// thẻ Kanban cao cố định h-40, đã chật, lại còn kéo-thả được — nhét ô nhập vào
// đó thì vỡ bố cục và bấm vào là kéo nhầm thẻ. Ở đây có cả chiều ngang trống
// nên bấm một dòng là mở bung ngay tại chỗ, không phải mở thêm cửa sổ nào.
//
// QUYỀN VIẾT: cấp quản lý HOẶC người đang được tag trong chính việc đó — khớp
// đúng policy RLS của 038, để giao diện không mời người ta bấm rồi DB mới chặn.
// ============================================================

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/apiClient";
import {
  ListChecks, ChevronDown, ChevronRight, Loader2, Send, UserCheck, CalendarClock,
  Search, X,
} from "lucide-react";

export type TrackingTask = {
  id: string;
  title: string;
  assignee: string;
  project_code?: string | null;
  project_name?: string | null;
  /** 'active' = đang triển khai, 'done' = đã xong (migration 039). */
  tracking_status?: string | null;
};

export type TaskUpdate = {
  id: string;
  task_id: string;
  content: string;
  tagged_name: string | null;
  next_due_date: string | null;
  created_by: string | null;
  created_at: string;
};

type Props = {
  tasks: TrackingTask[];
  /** Danh sách nhân sự cho ô chọn người phụ trách tiếp. Cần `email` để gửi thư báo. */
  employees: { id: string; name: string; department?: string | null; email?: string | null }[];
  canManage: boolean;
  currentUserName: string;
  /** Nhận HÀM chứ không nhận sẵn object: cấu hình SMTP nằm trong localStorage,
   *  đọc đúng lúc gửi mới chắc lấy được giá trị mới nhất. Truyền từ trang cha
   *  để không phải tạo bản sao thứ ba của readSmtpConfig. */
  readSmtpConfig: () => Record<string, unknown>;
  /** Gọi sau khi đổi trạng thái theo dõi, để trang cha nạp lại danh sách task. */
  onChanged: () => void;
};

const dayKey = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

const fmtDate = (v?: string | null) => {
  const d = dayKey(v);
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

const fmtDateTime = (v: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
};

// Khớp tên kiểu "chứa 2 chiều" — giống caller_owns_task trong SQL, vì
// tasks.assignee lúc là tên đầy đủ lúc là tên ngắn.
const nameMatches = (a?: string | null, b?: string | null) => {
  const x = (a || "").trim().toLowerCase();
  const y = (b || "").trim().toLowerCase();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
};

export default function TaskTrackingPanel({
  tasks, employees, canManage, currentUserName, readSmtpConfig, onChanged,
}: Props) {
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState("");
  // Tách khỏi `err`: cập nhật ĐÃ LƯU nhưng thư không đi được. Gộp chung một ô
  // báo lỗi đỏ thì người dùng tưởng mất luôn nội dung vừa gõ và gõ lại lần nữa.
  const [warn, setWarn] = useState("");

  // Nháp của ô cập nhật nhanh, tách theo từng task để mở dòng khác không mất
  // những gì đang gõ dở ở dòng trước.
  const [draftContent, setDraftContent] = useState<Record<string, string>>({});
  const [draftTag, setDraftTag] = useState<Record<string, string>>({});
  const [draftDue, setDraftDue] = useState<Record<string, string>>({});

  // ─── Ô chọn người phụ trách tiếp ───
  // Bê nguyên mẫu ô "Người nhận" ở form giao việc: thẻ tên có nút X, ô tìm kiếm,
  // dropdown kèm avatar + phòng ban. <select> thuần không dùng được với danh sách
  // hơn trăm người — phải cuộn tay tìm tên.
  // CHỈ MỘT bộ state, không tách theo task: mỗi lúc chỉ có đúng một dòng được mở
  // (expandedId) nên trong DOM cũng chỉ có đúng một ô chọn.
  const [tagSearch, setTagSearch] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const tagPickerRef = useRef<HTMLDivElement>(null);

  // Đổi sang dòng khác thì dọn ô tìm kiếm, tránh mang chữ đang gõ dở sang việc khác.
  useEffect(() => {
    setTagSearch("");
    setShowTagDropdown(false);
  }, [expandedId]);

  // Bấm ra ngoài thì đóng dropdown — giống hệt assigneePickerRef ở trang cha.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Việc đang triển khai lên trên, việc đã xong dồn xuống cuối — thứ cần xử lý
  // luôn nằm trong tầm mắt. Giữ nguyên thứ tự tương đối trong mỗi nhóm.
  const sortedTasks = useMemo(() => {
    const rank = (t: TrackingTask) => (t.tracking_status === "done" ? 1 : 0);
    return [...tasks].sort((a, b) => rank(a) - rank(b));
  }, [tasks]);

  const filteredEmployees = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    return employees
      .filter(e => !q || e.name.toLowerCase().includes(q) || (e.department || "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [employees, tagSearch]);

  // Khoá phụ thuộc là chuỗi id đã sắp xếp: mảng `tasks` được tạo mới mỗi lần
  // component cha render, để nguyên nó vào deps là tải lại vô tận.
  const taskIdsKey = useMemo(
    () => tasks.map(t => t.id).sort().join(","),
    [tasks]
  );

  const fetchUpdates = useCallback(async () => {
    const ids = taskIdsKey ? taskIdsKey.split(",") : [];
    if (ids.length === 0) { setUpdates([]); return; }
    try {
      setLoading(true);
      setErr("");
      const { data, error } = await supabase
        .from("task_updates")
        .select("*")
        .in("task_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setUpdates((data || []) as TaskUpdate[]);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [taskIdsKey]);

  useEffect(() => { fetchUpdates(); }, [fetchUpdates]);

  const updatesOf = (taskId: string) => updates.filter(u => u.task_id === taskId);

  // Dòng cập nhật mới nhất quyết định "ai đang phụ trách" và "hạn kế tiếp".
  const latestOf = (taskId: string): TaskUpdate | null => updatesOf(taskId)[0] || null;

  // Được viết khi là cấp quản lý, hoặc từng được tag ở bất kỳ dòng nào của việc
  // này — khớp đúng policy task_updates_insert của migration 038.
  const canPostOn = (taskId: string) =>
    canManage || updatesOf(taskId).some(u => nameMatches(u.tagged_name, currentUserName));

  // Báo thư cho người vừa được giao theo dõi. Gọi SAU khi đã lưu thành công và
  // KHÔNG ném lỗi ra ngoài: dòng cập nhật đã nằm trong CSDL rồi, hỏng thư không
  // được phép làm hỏng thao tác vừa xong.
  const notifyTagged = async (task: TrackingTask, content: string, tagged: string, due: string) => {
    // Tự tag chính mình thì thôi — không ai cần thư báo việc mình vừa tự nhận.
    if (nameMatches(tagged, currentUserName)) return;

    const emp = employees.find(e => nameMatches(e.name, tagged));
    if (!emp?.email) {
      setWarn(
        `Đã lưu cập nhật, nhưng KHÔNG gửi được email báo ${tagged}: nhân sự này chưa có email trong Danh sách nhân viên. ` +
        `Bổ sung email công ty cho họ để lần sau hệ thống gửi được.`
      );
      return;
    }

    try {
      const res = await apiFetch("/api/send-tracking-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpConfig: readSmtpConfig(),
          taskTitle: task.title,
          projectCode: task.project_code || "",
          projectName: task.project_name || "",
          updateContent: content,
          nextDueDate: due || "",
          taggedEmails: emp.email,
          taggedName: emp.name,
          updatedByName: currentUserName,
          siteUrl: typeof window !== "undefined" ? window.location.origin : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.error) {
        setWarn(`Đã lưu cập nhật, nhưng KHÔNG gửi được email báo ${tagged}: ${data.error}`);
      }
    } catch (e: any) {
      setWarn(`Đã lưu cập nhật, nhưng KHÔNG gửi được email báo ${tagged}: ${e?.message || String(e)}`);
    }
  };

  // Đổi trạng thái theo dõi. Chỉ cấp quản lý — giao diện ẩn nút, và trigger
  // guard_task_tracking_status (migration 039) chặn thêm ở tầng CSDL.
  const setTrackingStatus = async (taskId: string, next: "active" | "done") => {
    try {
      setPosting(true);
      setErr("");
      const { error } = await supabase
        .from("tasks")
        .update({ tracking_status: next })
        .eq("id", taskId);
      if (error) throw error;
      onChanged();
    } catch (e: any) {
      setErr(`Không đổi được trạng thái theo dõi: ${e?.message || String(e)}`);
    } finally {
      setPosting(false);
    }
  };

  const postUpdate = async (taskId: string) => {
    const content = (draftContent[taskId] || "").trim();
    if (!content) { setErr("Nhập nội dung cập nhật trước khi gửi."); return; }
    const tagged = draftTag[taskId] || "";
    const due = draftDue[taskId] || "";
    try {
      setPosting(true);
      setErr("");
      setWarn("");
      const { error } = await supabase.from("task_updates").insert([{
        task_id: taskId,
        content,
        tagged_name: tagged || null,
        next_due_date: due || null,
        created_by: currentUserName || null,
      }]);
      if (error) throw error;
      setDraftContent(p => ({ ...p, [taskId]: "" }));
      setDraftTag(p => ({ ...p, [taskId]: "" }));
      setDraftDue(p => ({ ...p, [taskId]: "" }));
      await fetchUpdates();

      if (tagged) {
        const task = tasks.find(t => t.id === taskId);
        if (task) await notifyTagged(task, content, tagged, due);
      }
    } catch (e: any) {
      setErr(`Không gửi được cập nhật: ${e?.message || String(e)}`);
    } finally {
      setPosting(false);
    }
  };

  // Bảng chỉ hiện khi cột "Update thông tin" CÓ dữ liệu — đúng yêu cầu, và
  // tránh chiếm chỗ trống vô ích khi chưa có việc nào cần theo dõi.
  if (tasks.length === 0) return null;

  const fmtKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date();
  const todayK = fmtKey(now);
  // Dựng qua Date rồi format lại, không cộng thẳng vào chuỗi ngày — cộng thẳng
  // là sai ở cuối tháng (31 -> 32) và cuối năm.
  const tomorrowK = fmtKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  type DueLevel = "overdue" | "today" | "tomorrow" | "none";

  // `done` = việc theo dõi đã chốt xong thì THÔI cảnh báo. Để nguyên màu đỏ trên
  // một dòng đã hoàn thành chỉ làm nhiễu, người xem tưởng còn phải xử lý.
  const dueLevel = (d?: string | null, done?: boolean): DueLevel => {
    if (done) return "none";
    const k = dayKey(d);
    if (!k) return "none";
    if (k < todayK) return "overdue";
    if (k === todayK) return "today";
    if (k === tomorrowK) return "tomorrow";
    return "none";
  };

  const dueCls = (d?: string | null, done?: boolean) => {
    const lv = dueLevel(d, done);
    if (lv === "overdue" || lv === "today") return "text-rose-600 font-extrabold";
    if (lv === "tomorrow") return "text-amber-600 font-extrabold";
    return dayKey(d) ? "text-slate-600" : "text-slate-400";
  };

  // Tô CẢ DÒNG chứ không chỉ ô ngày — nhìn lướt bảng là thấy ngay dòng nào gấp.
  // Dùng chung bảng màu với thẻ Kanban: đỏ = đến hạn/quá hạn, vàng = còn 1 ngày.
  const rowTint = (lv: DueLevel) =>
    lv === "overdue" || lv === "today" ? "bg-rose-500/10"
    : lv === "tomorrow" ? "bg-amber-500/10"
    : "";

  // Vạch màu bên trái đặt trên <td> ĐẦU TIÊN, không đặt trên <tr>: bảng chạy ở
  // chế độ border-collapse nên viền khai trên hàng hay bị trình duyệt nuốt.
  const rowAccent = (lv: DueLevel) =>
    lv === "overdue" || lv === "today" ? "border-l-4 border-l-rose-500"
    : lv === "tomorrow" ? "border-l-4 border-l-amber-500"
    : "";

  const dueBadge = (lv: DueLevel) => {
    if (lv === "overdue") return { text: "Quá hạn", cls: "bg-rose-600" };
    if (lv === "today") return { text: "Hôm nay", cls: "bg-rose-600" };
    if (lv === "tomorrow") return { text: "Ngày mai", cls: "bg-amber-600" };
    return null;
  };

  return (
    <div className="glass bg-white rounded-2xl border border-slate-200/50 shadow-premium overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <ListChecks size={18} className="text-amber-500" />
        <h2 className="font-heading font-bold text-slate-800 text-sm">Danh sách việc theo dõi</h2>
        <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          {tasks.length}
        </span>
        {loading && <Loader2 size={13} className="animate-spin text-slate-300" />}
      </div>

      {err && (
        <div className="px-5 py-3 bg-rose-50 border-b border-rose-100 text-[11px] font-bold text-rose-700">
          {err}
          <p className="font-medium text-rose-600 mt-1">
            Nếu báo bảng không tồn tại: chạy <code className="bg-white px-1 rounded">038_task_tracking_updates.sql</code> trong Supabase SQL Editor.
          </p>
        </div>
      )}

      {/* Vàng, không phải đỏ: nội dung ĐÃ lưu an toàn, chỉ mỗi thư không đi được. */}
      {warn && (
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-[11px] font-bold text-amber-800 flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          <span className="font-medium">{warn}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50/70 text-slate-500 font-bold text-[10px] uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left w-8"></th>
              <th className="px-3 py-2.5 text-left">Dự án</th>
              <th className="px-3 py-2.5 text-left">Tên việc</th>
              <th className="px-3 py-2.5 text-left">Cập nhật mới nhất</th>
              <th className="px-3 py-2.5 text-left">Phụ trách tiếp</th>
              <th className="px-3 py-2.5 text-left">Hạn kế tiếp</th>
              <th className="px-3 py-2.5 text-center">Lần CN</th>
              <th className="px-3 py-2.5 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.map((t) => {
              const list = updatesOf(t.id);
              const latest = latestOf(t.id);
              const open = expandedId === t.id;
              const isDone = t.tracking_status === "done";
              // Cảnh báo tính theo HẠN KẾ TIẾP của dòng cập nhật mới nhất —
              // đó mới là mốc đang phải chạy, không phải deadline của task gốc.
              const lv = dueLevel(latest?.next_due_date, isDone);
              const badge = dueBadge(lv);
              return (
                // key phải nằm trên Fragment — nó mới là phần tử của mảng.
                // Đặt key trên <tr> bên trong là React vẫn cảnh báo thiếu key.
                <Fragment key={t.id}>
                  <tr
                    onClick={() => setExpandedId(open ? null : t.id)}
                    className={`border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer transition-colors ${
                      isDone ? "opacity-55" : ""
                    } ${rowTint(lv)}`}
                  >
                    <td className={`px-3 py-2.5 text-slate-400 ${rowAccent(lv)}`}>
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-3 py-2.5">
                      {t.project_code ? (
                        <span className="font-mono font-bold text-[10px] text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                          {t.project_code}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                      {t.project_name && (
                        <div className="text-[10px] text-slate-400 font-semibold mt-0.5 truncate max-w-[160px]">{t.project_name}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-700 max-w-[240px]">
                      <div className="truncate">{t.title}</div>
                      <div className="text-[10px] text-slate-400 font-semibold">{t.assignee}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 font-medium max-w-[280px]">
                      {latest ? (
                        <div className="truncate italic">&ldquo;{latest.content}&rdquo;</div>
                      ) : (
                        <span className="text-slate-300 italic">Chưa có cập nhật nào</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {latest?.tagged_name ? (
                        <span className="inline-flex items-center gap-1 font-bold text-indigo-700">
                          <UserCheck size={12} /> {latest.tagged_name}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 font-semibold whitespace-nowrap ${dueCls(latest?.next_due_date, isDone)}`}>
                      {fmtDate(latest?.next_due_date)}
                      {badge && (
                        <span className={`ml-1.5 ${badge.cls} text-white px-1.5 py-0.5 rounded-full text-[8px] uppercase tracking-wide font-extrabold`}>
                          {badge.text}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-slate-500">{list.length}</td>

                    {/* Thao tác — CHỈ cấp quản lý bấm được. Nhân viên thấy đúng
                        trạng thái hiện tại dạng nhãn tĩnh, không bấm được.
                        stopPropagation để bấm nút không kéo theo việc đóng/mở dòng. */}
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {canManage ? (
                        // Dropdown chỉ hiện ĐÚNG trạng thái đang có, đổi bằng cách
                        // chọn lại — gọn hơn hai nút cạnh nhau, và không còn cảnh
                        // nút kia nằm trơ ra ở dạng mờ.
                        <div className="flex justify-center">
                          <select
                            value={isDone ? "done" : "active"}
                            disabled={posting}
                            onChange={(e) => setTrackingStatus(t.id, e.target.value as "active" | "done")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border outline-none cursor-pointer transition-colors disabled:opacity-60 ${
                              isDone
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400"
                                : "bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400"
                            }`}
                          >
                            <option value="active">Đang triển khai</option>
                            <option value="done">Hoàn thành</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border ${
                            isDone
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {isDone ? "Hoàn thành" : "Đang triển khai"}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>

                  {open && (
                    <tr className="bg-slate-50/40">
                      <td colSpan={8} className="px-5 py-4">
                        {/* ─── DÒNG THỜI GIAN ─── */}
                        {list.length === 0 ? (
                          <p className="text-[11px] text-slate-400 italic mb-4">
                            Chưa có cập nhật nào. Viết dòng đầu tiên ở ô bên dưới.
                          </p>
                        ) : (
                          <div className="space-y-2.5 mb-4">
                            {list.map((u) => (
                              <div key={u.id} className="bg-white rounded-xl border border-slate-200/70 p-3">
                                <p className="text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{u.content}</p>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] font-bold">
                                  <span className="text-slate-400">{u.created_by || "—"} · {fmtDateTime(u.created_at)}</span>
                                  {u.tagged_name && (
                                    <span className="inline-flex items-center gap-1 text-indigo-600">
                                      <UserCheck size={11} /> {u.tagged_name}
                                    </span>
                                  )}
                                  {u.next_due_date && (
                                    <span className={`inline-flex items-center gap-1 ${dueCls(u.next_due_date)}`}>
                                      <CalendarClock size={11} /> {fmtDate(u.next_due_date)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* ─── Ô CẬP NHẬT NHANH ─── */}
                        {canPostOn(t.id) ? (
                          <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
                            <textarea
                              rows={2}
                              value={draftContent[t.id] || ""}
                              onChange={(e) => setDraftContent(p => ({ ...p, [t.id]: e.target.value }))}
                              placeholder="Cập nhật tình hình, yêu cầu tiếp theo..."
                              className="w-full border border-slate-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800 text-xs placeholder:text-slate-400 resize-none bg-white"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="relative min-w-[260px] flex-1 max-w-sm" ref={tagPickerRef}>
                                <div className="w-full min-h-[34px] px-2.5 py-1 border border-slate-200 rounded-lg flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/40 bg-white">
                                  {draftTag[t.id] ? (
                                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-1 text-[10px] font-bold">
                                      {draftTag[t.id]}
                                      <button
                                        type="button"
                                        onClick={() => { setDraftTag(p => ({ ...p, [t.id]: "" })); setTagSearch(""); setShowTagDropdown(true); }}
                                        className="hover:text-rose-500 transition-colors cursor-pointer"
                                      >
                                        <X size={10} />
                                      </button>
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                                      <Search size={12} className="text-slate-400 shrink-0" />
                                      <input
                                        type="text"
                                        value={tagSearch}
                                        onChange={(e) => { setTagSearch(e.target.value); setShowTagDropdown(true); }}
                                        onFocus={() => setShowTagDropdown(true)}
                                        placeholder="Giao theo dõi tiếp cho ai?"
                                        className="flex-1 min-w-0 py-1 outline-none text-xs font-semibold placeholder:font-normal bg-transparent"
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* Mở LÊN TRÊN (bottom-full) chứ không xuống dưới: bảng nằm
                                    trong khung overflow-x-auto, mà CSS ép overflow-y thành
                                    auto theo — thả xuống dưới là danh sách bị cắt cụt. */}
                                {showTagDropdown && !draftTag[t.id] && (
                                  <div className="absolute left-0 right-0 bottom-full mb-1 bg-white border border-slate-200 rounded-xl shadow-premium z-30 max-h-48 overflow-y-auto animate-in fade-in duration-150">
                                    {filteredEmployees.length === 0 ? (
                                      <p className="text-center text-slate-400 text-[11px] italic py-4">Không tìm thấy nhân viên phù hợp.</p>
                                    ) : (
                                      filteredEmployees.map((emp) => (
                                        <button
                                          key={emp.id}
                                          type="button"
                                          onClick={() => { setDraftTag(p => ({ ...p, [t.id]: emp.name })); setTagSearch(""); setShowTagDropdown(false); }}
                                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                                        >
                                          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-blue-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                            {emp.name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                                          </span>
                                          <span className="flex-1 min-w-0">
                                            <span className="block text-xs font-bold text-slate-700 truncate">{emp.name}</span>
                                            <span className="block text-[10px] text-slate-400 font-semibold truncate">{emp.department || "Chưa xếp phòng"}</span>
                                          </span>
                                        </button>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                              <input
                                type="date"
                                value={draftDue[t.id] || ""}
                                onChange={(e) => setDraftDue(p => ({ ...p, [t.id]: e.target.value }))}
                                className="border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold text-slate-800 text-xs bg-white"
                                title="Hạn kế tiếp"
                              />
                              <button
                                type="button"
                                disabled={posting}
                                onClick={() => postUpdate(t.id)}
                                className="ml-auto px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                              >
                                {posting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Gửi cập nhật
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">
                            Chỉ cấp quản lý hoặc người đang được giao theo dõi việc này mới viết được cập nhật.
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
