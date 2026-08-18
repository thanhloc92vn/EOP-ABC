"use client";

// ============================================================
// TaskCommentPanel — khối "Ý kiến trao đổi" nằm CUỐI modal "Chỉnh sửa công việc".
//
// Mục đích: chỗ chat nhanh giữa người giao việc và người nhận việc, thay cho
// Zalo. Mỗi ý kiến là một dòng trong `task_comments` (migration 057), hiện kèm
// HỌ TÊN người viết (chức danh vẫn lưu xuống CSDL nhưng không hiện ra).
//
// ─── VÌ SAO ĐẶT NGOÀI THẺ <form> CỦA MODAL ───
// Modal sửa việc là một <form> có nút submit "Lưu thay đổi". Nhét ô nhập ý kiến
// VÀO TRONG form thì nút gửi lỡ quên type="button" là submit nhầm cả form việc,
// và người dùng gõ xong bấm Enter cũng lưu việc thay vì gửi ý kiến. Khối này
// render SAU thẻ </form>, hoàn toàn tách khỏi luồng lưu việc.
//
// KHÔNG SỬA, KHÔNG XOÁ — khớp với 057: bảng cố ý không có policy UPDATE/DELETE,
// nên giao diện cũng không mời người dùng bấm rồi mới bị CSDL chặn.
//
// Realtime: hai người mở cùng một việc thì thấy ý kiến của nhau ngay, không F5.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MessageSquare, Send, Loader2 } from "lucide-react";

export type TaskComment = {
  id: string;
  task_id: string;
  body: string;
  author_email: string;
  author_name: string | null;
  author_role: string | null;
  created_at: string;
};

type Props = {
  taskId: string;
  /** Danh tính người đang đăng nhập (từ useCurrentUser). */
  me: { email: string; name: string; role: string } | null;
  /** Báo về trang cha để cập nhật số bình luận trên thẻ Kanban. */
  onCountChange?: (taskId: string, count: number) => void;
};

// Màu avatar suy ra từ tên -> mỗi người một màu ổn định, không đổi giữa các lần
// mở. Dùng tổng mã ký tự cho gọn, không cần hàm băm thật.
const AVATAR_COLORS = [
  "bg-orange-500", "bg-blue-500", "bg-emerald-500", "bg-violet-500",
  "bg-rose-500", "bg-cyan-600", "bg-amber-600", "bg-indigo-500",
];

function avatarColor(name: string) {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // Chữ cái đầu của TỪ CUỐI — người Việt gọi nhau bằng tên, không phải họ.
  return parts[parts.length - 1][0].toUpperCase();
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  } catch {
    return "";
  }
}

export default function TaskCommentPanel({ taskId, me, onCountChange }: Props) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  // Khoá bằng ref chứ không dựa vào state `sending`: state cập nhật bất đồng bộ,
  // bấm nhanh hai lần vẫn lọt qua và tạo hai bình luận trùng.
  const sendingRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Giữ callback trong ref để KHÔNG đưa nó vào deps của `load`. Trang cha truyền
  // hàm inline nên mỗi lần cha render lại là một hàm mới; để nó trong deps thì
  // load() đổi -> useEffect chạy lại -> gọi onCountChange -> cha render ->
  // vòng lặp vô tận.
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  const load = useCallback(async () => {
    if (!taskId) return;
    try {
      const { data, error } = await supabase
        .from("task_comments")
        .select("id, task_id, body, author_email, author_name, author_role, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setComments((data as TaskComment[]) || []);
      onCountChangeRef.current?.(taskId, (data || []).length);
    } catch (e) {
      // Chưa chạy migration 057 thì bảng chưa tồn tại — im lặng coi như chưa có
      // ý kiến nào, KHÔNG được để hỏng cả modal sửa việc.
      console.warn("Không tải được ý kiến trao đổi:", e);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // ─── ĐÁNH DẤU ĐÃ ĐỌC ───
  // Mở việc này ra xem = đã đọc mọi ý kiến trong đó -> chuông trên Header tự tắt.
  // Chạy một lần mỗi lần mở modal, không chờ kết quả: hỏng thì cùng lắm chuông
  // còn báo, không ảnh hưởng gì tới việc xem/gửi ý kiến.
  useEffect(() => {
    if (!taskId || !me?.email) return;
    supabase
      .from("task_comment_reads")
      .upsert(
        { user_email: me.email.toLowerCase(), task_id: taskId, last_read_at: new Date().toISOString() },
        { onConflict: "user_email,task_id" }
      )
      .then(({ error }) => {
        if (error) console.warn("Không ghi được dấu đã đọc ý kiến:", error);
      });
  }, [taskId, me?.email]);

  // ─── REALTIME ───
  useEffect(() => {
    if (!taskId) return;
    const channel = supabase
      .channel(`task_comments_${taskId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, load]);

  // Luôn cuộn xuống ý kiến mới nhất — đoạn trao đổi dài thì thứ cần đọc nằm cuối.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sendingRef.current) return;
    if (!me?.email) {
      setErr("Chưa nhận diện được tài khoản — tải lại trang rồi thử lại.");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setErr("");
    try {
      const { error } = await supabase.from("task_comments").insert({
        task_id: taskId,
        body,
        // Phải là ĐÚNG email đăng nhập: policy INSERT của 057 so nó với JWT,
        // lệch một ký tự là bị chặn.
        author_email: me.email.toLowerCase(),
        author_name: me.name || null,
        author_role: me.role || null,
      });
      if (error) throw error;
      setText("");
      await load();
    } catch (e: any) {
      console.error("Gửi ý kiến thất bại:", e);
      setErr(
        String(e?.message || "").includes("row-level security")
          ? "Bạn không có quyền bình luận trong công việc này."
          : "Không gửi được ý kiến. Vui lòng thử lại."
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="mt-5 pt-5 border-t border-slate-100 text-xs">
      {/* Tiêu đề khối */}
      <div className="flex items-center gap-2 text-slate-800">
        <MessageSquare size={15} className="text-slate-500" />
        <h4 className="font-heading font-extrabold uppercase tracking-wide text-[11px]">
          Ý kiến trao đổi &amp; bình luận nội bộ
        </h4>
      </div>

      {/* Danh sách ý kiến */}
      <div ref={listRef} className="mt-4 space-y-3 max-h-64 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 italic py-3">
            <Loader2 size={13} className="animate-spin" /> Đang tải ý kiến...
          </div>
        ) : (
          comments.map((c) => {
            const name = c.author_name || c.author_email;
            return (
              <div key={c.id} className="flex gap-2.5">
                <div className={`w-8 h-8 shrink-0 rounded-full ${avatarColor(name)} text-white flex items-center justify-center font-bold text-[13px]`}>
                  {initials(name)}
                </div>
                <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    {/* CHỈ hiện họ tên, KHÔNG hiện chức danh (user chốt 18/08/2026).
                        Cột author_role vẫn được ghi xuống CSDL để giữ vết ai nói
                        với tư cách gì — chỉ là không phơi ra trên giao diện. */}
                    <span className="font-bold text-slate-800">{name}</span>
                    <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                      {formatDate(c.created_at)}
                    </span>
                  </div>
                  {/* whitespace-pre-wrap: giữ nguyên xuống dòng người ta đã gõ. */}
                  <p className="mt-1 text-slate-700 font-medium leading-relaxed whitespace-pre-wrap break-words">
                    {c.body}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Ô nhập */}
      <div className="mt-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd + Enter để gửi; Enter đơn thuần vẫn là xuống dòng.
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={3}
          placeholder="Nhập ý kiến đóng góp hoặc rủi ro phát hiện tại đây..."
          className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800 placeholder:text-slate-400 resize-y"
        />
        {err && <p className="text-rose-600 font-semibold mt-1">{err}</p>}
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors cursor-pointer shadow-md shadow-blue-500/10 flex items-center gap-1.5 active:scale-95"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Gửi ý kiến
          </button>
        </div>
      </div>
    </div>
  );
}
