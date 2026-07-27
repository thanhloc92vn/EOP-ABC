-- ============================================================
-- 017 — Cờ `can_manage_project_locations` (quản lý vị trí dự án)
--
-- Mặc định chỉ Admin thấy nút "Quản lý vị trí" và ghi được bảng project_locations.
-- Cờ này cho phép cấp riêng cho tài khoản KHÔNG phải Admin (VD phòng Kỹ thuật /
-- Truyền thông phụ trách cập nhật toạ độ) — cấp/thu hồi tại Cài đặt > Cờ quyền.
--
-- QUAN TRỌNG: phải cập nhật CẢ RLS ghi của project_locations, nếu không người có
-- cờ sẽ thấy nút nhưng Lưu sẽ bị chặn (chỉ Admin ghi được như migration 016).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Thêm cột cờ ───
alter table public.approval_permissions
  add column if not exists can_manage_project_locations boolean not null default false;

-- ─── 2. Cập nhật RLS GHI của project_locations: Admin HOẶC người có cờ ───
drop policy if exists "pl_write_admin" on public.project_locations;
drop policy if exists "pl_write_manage" on public.project_locations;

create policy "pl_write_manage" on public.project_locations
  for all to authenticated
  using (
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(auth.jwt() ->> 'email')
        and au.role = 'Admin'
    )
    or exists (
      select 1 from public.approval_permissions ap
      where lower(coalesce(ap.email, '')) like '%' || lower(auth.jwt() ->> 'email') || '%'
        and ap.can_manage_project_locations = true
    )
  )
  with check (
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(auth.jwt() ->> 'email')
        and au.role = 'Admin'
    )
    or exists (
      select 1 from public.approval_permissions ap
      where lower(coalesce(ap.email, '')) like '%' || lower(auth.jwt() ->> 'email') || '%'
        and ap.can_manage_project_locations = true
    )
  );

-- ─── 3. KIỂM TRA ───
select name, email, can_manage_project_locations
from public.approval_permissions
where can_manage_project_locations = true
order by name;
