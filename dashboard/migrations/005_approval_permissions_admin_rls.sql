-- ============================================================
-- 005 — Cho phép ADMIN quản lý bảng approval_permissions từ giao diện
-- (Cài đặt hệ thống -> nút "User Permissions").
--
-- Trước đây: bảng chỉ cho ĐỌC (authenticated), thêm/sửa/xoá phải vào
-- Supabase Table Editor. Sau migration này: Admin (allowed_users.role
-- = 'Admin') được thêm/sửa/xoá ngay trong app; người khác vẫn chỉ đọc.
--
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Bổ sung đầy đủ cột cờ nếu thiếu (idempotent — hữu ích khi
--        provisioning tenant mới, tránh lệch schema giữa các khách) ───
alter table public.approval_permissions add column if not exists name text;
alter table public.approval_permissions add column if not exists can_approve_trip boolean not null default false;
alter table public.approval_permissions add column if not exists can_approve_leave boolean not null default false;
alter table public.approval_permissions add column if not exists can_approve_justification boolean not null default false;
alter table public.approval_permissions add column if not exists can_approve_booking boolean not null default false;
alter table public.approval_permissions add column if not exists can_view_suggestions boolean not null default false;
alter table public.approval_permissions add column if not exists can_manage_employees boolean not null default false;
alter table public.approval_permissions add column if not exists can_view_invoices boolean not null default false;
alter table public.approval_permissions add column if not exists can_view_documents boolean not null default false;
alter table public.approval_permissions add column if not exists can_view_candidates boolean not null default false;
alter table public.approval_permissions add column if not exists can_view_employees boolean not null default false;
alter table public.approval_permissions add column if not exists can_view_salary boolean not null default false;
alter table public.approval_permissions add column if not exists can_view_attendance_imports boolean not null default false;
alter table public.approval_permissions add column if not exists can_view_all_tasks boolean not null default false;
alter table public.approval_permissions add column if not exists supervises_name text;

-- ─── 2. Xoá TOÀN BỘ policy cũ (không đoán tên) rồi tạo lại whitelist ───
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'approval_permissions'
  loop
    execute format('drop policy if exists %I on public.approval_permissions', pol.policyname);
  end loop;
end $$;

alter table public.approval_permissions enable row level security;

-- Mọi người đăng nhập vẫn ĐỌC được — toàn hệ thống dựa vào bảng này để
-- gate UI (Header, Sidebar, các trang), không được siết SELECT.
create policy "approval_permissions select authenticated"
  on public.approval_permissions
  for select
  to authenticated
  using (true);

-- Chỉ Admin được thêm dòng (cấp quyền cho người mới)
create policy "approval_permissions insert admin only"
  on public.approval_permissions
  for insert
  to authenticated
  with check (
    exists (select 1 from public.allowed_users au where au.role = 'Admin' and au.email ilike auth.email())
  );

-- Chỉ Admin được bật/tắt cờ quyền
create policy "approval_permissions update admin only"
  on public.approval_permissions
  for update
  to authenticated
  using (
    exists (select 1 from public.allowed_users au where au.role = 'Admin' and au.email ilike auth.email())
  )
  with check (
    exists (select 1 from public.allowed_users au where au.role = 'Admin' and au.email ilike auth.email())
  );

-- Chỉ Admin được thu hồi (xoá dòng)
create policy "approval_permissions delete admin only"
  on public.approval_permissions
  for delete
  to authenticated
  using (
    exists (select 1 from public.allowed_users au where au.role = 'Admin' and au.email ilike auth.email())
  );

-- ─── 3. KIỂM TRA KẾT QUẢ: phải thấy đúng 4 policy vừa tạo ───
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'approval_permissions'
order by cmd;
