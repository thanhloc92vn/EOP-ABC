-- ============================================================
-- 003 — BẢNG NHÓM DUYỆT (approval_groups)
-- Thay hằng số MARKETING_TEAM_LEADER / MARKETING_TEAM_MEMBERS
-- trong lib/approvers.ts. Nhóm = tổ có luồng duyệt cấp 1 riêng:
-- thành viên gửi đơn/đăng ký -> tổ trưởng nhóm duyệt (không phải
-- trưởng phòng ban), sau đó vẫn qua HCNS duyệt cuối như thường.
--
-- Thêm/bớt thành viên, đổi tổ trưởng, thêm nhóm mới: sửa bảng này,
-- không cần sửa code. Chạy trong Supabase SQL Editor, idempotent.
-- ============================================================

create table if not exists approval_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  leader_name text not null,          -- tên tổ trưởng (khớp employees.name)
  member_names text[] not null default '{}',  -- tên các thành viên (khớp employees.name)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed đúng hiện trạng đang hardcode
insert into approval_groups (name, leader_name, member_names) values
  ('Tổ Marketing', 'Phạm Thành Lộc', array['Võ Thị Thanh Nhàn', 'Trịnh An Thuận'])
on conflict (name) do nothing;

-- RLS: người đăng nhập đọc, Admin sửa
alter table approval_groups enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'approval_groups'
  loop
    execute format('drop policy %I on approval_groups', p.policyname);
  end loop;
end $$;

create policy "authenticated_read_approval_groups" on approval_groups
  for select to authenticated using (active = true);

create policy "admin_write_approval_groups" on approval_groups
  for all to authenticated
  using (exists (
    select 1 from allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  ));

-- Kiểm tra
select name, leader_name, member_names, active from approval_groups;
