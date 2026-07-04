-- Bảng phân quyền phê duyệt theo từng người dùng.
-- Quản lý trực tiếp trong Supabase Table Editor: thêm dòng để cấp quyền,
-- sửa cột true/false để bật tắt từng loại, xoá dòng để thu hồi — không cần sửa code.

create table if not exists public.approval_permissions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  can_approve_trip boolean not null default false,          -- duyệt công tác
  can_approve_leave boolean not null default false,         -- duyệt nghỉ phép
  can_approve_justification boolean not null default false, -- duyệt giải trình chấm công
  created_at timestamptz not null default now()
);

alter table public.approval_permissions enable row level security;

-- Người dùng đã đăng nhập chỉ được ĐỌC; thêm/sửa/xoá chỉ làm qua Supabase dashboard.
drop policy if exists "Authenticated can read approval permissions" on public.approval_permissions;
create policy "Authenticated can read approval permissions"
  on public.approval_permissions
  for select
  to authenticated
  using (true);

-- Cấp toàn bộ 3 quyền duyệt cho chị Lại Nguyễn Lan Phương (email lấy từ bảng employees)
insert into public.approval_permissions (email, name, can_approve_trip, can_approve_leave, can_approve_justification)
select email, name, true, true, true
from public.employees
where name = 'Lại Nguyễn Lan Phương'
  and not exists (
    select 1 from public.approval_permissions p where p.name = 'Lại Nguyễn Lan Phương'
  );

-- Kiểm tra kết quả
select * from public.approval_permissions;
