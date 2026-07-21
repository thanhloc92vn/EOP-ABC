-- ============================================================
-- 010 — KHOÁ QUYỀN XOÁ BẢNG `tasks`
--
-- VẤN ĐỀ:
-- Policy DELETE trên `tasks` là template mặc định của Supabase với điều kiện
-- `true`. Bất kỳ nhân viên nào đăng nhập đều xoá được MỌI dòng qua PostgREST:
-- đơn nghỉ phép/công tác của người khác, task của phòng ban khác, phiếu VPP.
-- Trigger 008 chỉ chặn TỰ DUYỆT, không chặn XOÁ — xoá đơn đã bị từ chối rồi
-- nộp lại vẫn là đường vòng khả thi.
--
-- KHỚP VỚI GIAO DIỆN HIỆN TẠI:
-- Nút xoá trong Kanban (tasks/page.tsx:761) hiện cho phép khi:
--     canManageTasks  HOẶC  tên người dùng khớp `assignee` kiểu "chứa" 2 chiều
-- và `canManageTasks` (dòng 620-632) = Admin / trưởng phòng / phó phòng /
-- tổ trưởng / leader. Lịch công việc (calendar) gate bằng `isManager`.
-- Policy dưới đây tái hiện đúng tập hợp đó, cộng thêm 2 cờ quyền để người
-- được cấp qua giao diện cũng xoá được mà không cần đúng chức danh.
-- => Không luồng nào đang chạy bị gãy; chỉ chặn người gọi thẳng API.
--
-- KHỚP TÊN KIỂU "CHỨA" 2 CHIỀU — có chủ đích:
-- `tasks.assignee` là TEXT và không đồng nhất: đơn nghỉ phép dùng tên đầy đủ
-- ("Nguyễn Bích Như Quỳnh"), kanban VPP dùng tên ngắn ("Như Quỳnh"). Giao diện
-- vốn đã so kiểu includes() cả 2 chiều để phủ được cả hai, nên policy làm
-- giống hệt. Có chặn rỗng để '' không khớp mọi thứ.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Người gọi có vai trò quản lý / cờ quản lý công việc không ───
create or replace function public.caller_can_manage_tasks()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- (a) Admin trong allowed_users
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and au.role = 'Admin'
    )
    -- (b) Chức danh quản lý (giữ đúng danh sách trong tasks/page.tsx:620-632)
    or exists (
      select 1 from public.employees e
      where coalesce(auth.jwt() ->> 'email', '') <> ''
        and position(lower(auth.jwt() ->> 'email') in lower(coalesce(e.email, ''))) > 0
        and (
             lower(coalesce(e.role, '')) = 'admin'
          or lower(coalesce(e.role, '')) like '%trưởng phòng%'
          or lower(coalesce(e.role, '')) like '%truong phong%'
          or lower(coalesce(e.role, '')) like '%phó phòng%'
          or lower(coalesce(e.role, '')) like '%pho phong%'
          or lower(coalesce(e.role, '')) like '%tổ trưởng%'
          or lower(coalesce(e.role, '')) like '%to truong%'
          or lower(coalesce(e.role, '')) like '%giám đốc%'
          or lower(coalesce(e.role, '')) like '%giam doc%'
          or lower(coalesce(e.role, '')) like '%leader%'
        )
    )
    -- (c) Cờ cấp qua giao diện Cờ quyền người dùng
    or exists (
      select 1 from public.approval_permissions p
      where coalesce(auth.jwt() ->> 'email', '') <> ''
        and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
        and (p.can_view_all_tasks = true or p.can_manage_vpp = true)
    );
$$;

-- ─── 2. Người gọi có phải người phụ trách dòng task này không ───
create or replace function public.caller_owns_task(p_assignee text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employees e
    where coalesce(auth.jwt() ->> 'email', '') <> ''
      and position(lower(auth.jwt() ->> 'email') in lower(coalesce(e.email, ''))) > 0
      and coalesce(btrim(p_assignee), '') <> ''
      and coalesce(btrim(e.name), '') <> ''
      and (
           position(lower(btrim(p_assignee)) in lower(btrim(e.name))) > 0
        or position(lower(btrim(e.name)) in lower(btrim(p_assignee))) > 0
      )
  );
$$;

-- ─── 3. Thay policy DELETE ───
-- CHỈ đụng policy DELETE. SELECT / INSERT / UPDATE giữ nguyên tuyệt đối —
-- việc tạo task, kéo thẻ, sửa tiến độ không đổi.
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
    or public.caller_owns_task(assignee)
  );

-- ─── 4. KIỂM TRA ───
select policyname, cmd, coalesce(qual, '—') as dieu_kien_using
from pg_policies
where schemaname = 'public' and tablename = 'tasks'
order by cmd, policyname;
