-- ============================================================
-- 055 — CẤM NHÂN VIÊN TỰ XOÁ ĐƠN NGHỈ PHÉP ĐÃ DUYỆT
--
-- VẤN ĐỀ:
-- Đơn nghỉ phép là một dòng trong bảng `tasks` (title chứa "Nghỉ phép").
-- Policy DELETE hiện tại (migration 010) cho phép "chủ dòng" tự xoá:
--     caller_can_manage_tasks() OR caller_owns_task(assignee)
-- Nghĩa là nhân viên xoá được đơn phép ĐÃ DUYỆT của chính mình. Hậu quả đúng
-- vào tiền: cột "Đã nghỉ" tụt xuống -> quota phép năm còn lại tự phình ra, và
-- ngày đó trong bảng công mất dấu "P".
--
-- (Trước đây nút xoá trên giao diện C&B chỉ xoá trong bộ nhớ trình duyệt nên
--  lỗ này chưa ai chạm tới. Nay nút xoá đã ghi thật xuống CSDL.)
--
-- CÁCH SỬA:
-- Giữ nguyên policy cũ, chỉ CẮT ĐÚNG MỘT TRƯỜNG HỢP khỏi nhánh "chủ dòng":
-- đơn nghỉ phép đã duyệt (title chứa "Nghỉ phép" VÀ status = 'completed').
-- Admin/HCNS đi theo nhánh caller_can_manage_tasks() nên KHÔNG bị ảnh hưởng.
--
-- KHÔNG ĐỘNG TỚI:
--   • Task công việc thường — điều kiện chỉ bắt dòng có chữ "Nghỉ phép"
--   • Đơn nghỉ phép còn chờ duyệt / bị từ chối — nhân viên vẫn tự rút được
--   • SELECT / INSERT / UPDATE trên `tasks` — giữ nguyên tuyệt đối
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Đơn nghỉ phép đã duyệt hay không ───
-- 'Đã duyệt' trên giao diện = tasks.status 'completed' (xem parseTaskToLeave
-- trong app/cb/page.tsx). Khớp title kiểu "chứa", không phân biệt hoa thường.
create or replace function public.is_approved_leave_task(p_title text, p_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_title, '') ilike '%nghỉ phép%'
     and lower(coalesce(p_status, '')) = 'completed';
$$;

-- ─── 2. Thay policy DELETE ───
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and cmd = 'DELETE'
  loop
    execute format('drop policy if exists %I on public.tasks', pol.policyname);
    raise notice 'Đã gỡ policy DELETE cũ: %', pol.policyname;
  end loop;
end $$;

create policy "tasks delete by manager or owner"
  on public.tasks
  for delete
  to authenticated
  using (
    public.caller_can_manage_tasks()
    or (
      public.caller_owns_task(assignee)
      and not public.is_approved_leave_task(title, status)
    )
  );

-- ─── 3. KIỂM TRA ───
-- Mong đợi: policy DELETE có thêm vế "is_approved_leave_task".
select policyname, cmd, coalesce(qual, '—') as dieu_kien_using
from pg_policies
where schemaname = 'public' and tablename = 'tasks' and cmd = 'DELETE';
