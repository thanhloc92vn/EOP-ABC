-- ============================================================
-- 016_project_locations.sql — Module "Vị trí dự án" (bản đồ dự án/gói thầu)
--
-- Danh sách DỰ ÁN lấy từ bảng `departments` (type='bdh') — mỗi Ban Điều Hành
-- (BĐH) là một dự án, đúng nguồn mà "Danh sách nhân viên" đang dùng. Bảng này
-- CHỈ lưu phần định vị/chi tiết cho mỗi BĐH (toạ độ, chủ đầu tư, link KML...),
-- khoá theo `bdh_name`. Một BĐH có 1 dòng ở đây (khi đã có toạ độ); BĐH chưa
-- định vị thì chưa có dòng -> map hiển thị trong danh sách "Chưa định vị".
--
-- KHÔNG chứa PII. Đọc: mọi nhân sự nội bộ đã đăng nhập. Ghi: chỉ Admin.
-- Cách chạy: dán toàn bộ file này vào Supabase SQL Editor và Run.
-- ============================================================

create table if not exists public.project_locations (
  id               uuid primary key default gen_random_uuid(),
  bdh_name         text not null unique,          -- khoá liên kết -> departments.name (type='bdh')
  name             text,                          -- tên dự án đầy đủ (tuỳ chọn; mặc định = bdh_name)
  package          text,                          -- tên gói thầu
  investor         text,                          -- chủ đầu tư
  progress         text,                          -- tiến độ (mô tả tự do)
  status           text default 'active',         -- active | completed | planning | paused
  project_type     text,                          -- loại dự án (hạ tầng, cầu đường...)
  province         text,                          -- tỉnh/thành (dùng lọc)
  lat              double precision not null,
  lng              double precision not null,
  kml_url          text,                          -- link KML/KMZ gốc từ Google Earth
  google_earth_url text,                          -- link chia sẻ Google Earth
  drawings         jsonb default '[]'::jsonb,     -- [{name, url, type}] bản vẽ kỹ thuật (Lát 2)
  note             text,
  created_by       text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists idx_project_locations_bdh      on public.project_locations (bdh_name);
create index if not exists idx_project_locations_province on public.project_locations (province);
create index if not exists idx_project_locations_status   on public.project_locations (status);

-- updated_at tự cập nhật
create or replace function public.set_project_locations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_project_locations_updated_at on public.project_locations;
create trigger trg_project_locations_updated_at
  before update on public.project_locations
  for each row execute function public.set_project_locations_updated_at();

-- ─── RLS ───
alter table public.project_locations enable row level security;

-- Chặn anon tuyệt đối (khớp bài học hardening: đo lại bằng anon key sau khi chạy).
revoke all on public.project_locations from anon;

-- Xoá sạch policy cũ (nếu chạy lại) rồi mới tạo mới — tránh trùng tên.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'project_locations'
  loop
    execute format('drop policy if exists %I on public.project_locations', pol.policyname);
  end loop;
end $$;

-- Đọc: mọi nhân sự nội bộ đã đăng nhập (không có PII nên mở toàn bộ hàng).
create policy "pl_select_authenticated" on public.project_locations
  for select to authenticated
  using (true);

-- Ghi (insert/update/delete): chỉ Admin trong allowed_users.
create policy "pl_write_admin" on public.project_locations
  for all to authenticated
  using (
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(auth.jwt() ->> 'email')
        and au.role = 'Admin'
    )
  )
  with check (
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(auth.jwt() ->> 'email')
        and au.role = 'Admin'
    )
  );
