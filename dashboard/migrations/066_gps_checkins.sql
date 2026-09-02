-- ============================================================
-- 066_gps_checkins.sql — CHẤM CÔNG GPS cho khối Ban Điều hành dự án (BĐH)
--
-- Nhân sự BĐH đứng tại công trường bấm check-in trên điện thoại: hệ thống lấy
-- toạ độ GPS của máy + chụp ảnh minh chứng, so với toạ độ đã ghim của BĐH
-- (bảng project_locations, migration 016). Trong bán kính cho phép mới hợp lệ.
--
-- NGUYÊN TẮC CHỐNG GIAN LẬN (không tin client):
--   • Giờ chính thức = giờ SERVER (now()), trigger tự ghi đè captured_at.
--   • Khoảng cách & cờ hợp lệ tính LẠI phía server bằng Haversine trong trigger,
--     không nhận is_valid/distance do client gửi lên.
--   • Định vị rác (accuracy quá lớn = wifi/IP giả) -> đánh không hợp lệ.
--   • Mỗi người chỉ MỘT lần hợp lệ cho mỗi buổi (vào/ra) mỗi ngày (unique index).
--
-- QUYỀN:
--   • Nhân sự đã đăng nhập: chỉ INSERT & xem CHÍNH bản ghi của mình.
--   • Admin hoặc người có cờ can_view_attendance_imports (đầu mối HCNS): xem/sửa/
--     xoá tất cả — khớp đúng quyền đang dùng cho thư mục bảng công máy chấm công.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run. Chạy lại nhiều
-- lần an toàn (idempotent).
-- ============================================================

-- ─── 1. BỔ SUNG CẤU HÌNH CHO project_locations ───
-- radius_m: bán kính cho phép check-in (mặc định 50m). shift_in/shift_out: ca
-- chuẩn để về sau tính Trễ/Sớm/Tăng ca cho khớp khuôn bảng công văn phòng.
alter table public.project_locations
  add column if not exists radius_m  integer default 50,
  add column if not exists shift_in  text    default '08:00',
  add column if not exists shift_out text    default '17:00';

-- ─── 2. HÀM KHOẢNG CÁCH HAVERSINE (mét) ───
create or replace function public.gps_distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ─── 3. BẢNG gps_checkins ───
create table if not exists public.gps_checkins (
  id             uuid primary key default gen_random_uuid(),
  user_email     text not null,                 -- email đăng nhập (gắn cứng danh tính)
  employee_code  text,
  employee_name  text,
  bdh_name       text not null,                 -- = departments.name (type='bdh') / project_locations.bdh_name
  kind           text not null check (kind in ('in','out')),  -- 'in' = vào/sáng, 'out' = ra/chiều
  captured_at    timestamptz not null default now(),          -- GIỜ SERVER (trigger ghi đè)
  lat            double precision not null,
  lng            double precision not null,
  accuracy_m     double precision,              -- độ chính xác GPS máy báo (m)
  distance_m     double precision,              -- khoảng cách tới BĐH (server tính)
  radius_m       integer,                       -- bán kính áp dụng lúc chấm (snapshot)
  is_valid       boolean not null default false,-- server quyết: trong bán kính & accuracy ổn
  photo_path     text,                          -- đường dẫn ảnh trong bucket gps-checkins
  device         text,                          -- user agent (tham khảo)
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_gps_checkins_email on public.gps_checkins (user_email);
create index if not exists idx_gps_checkins_bdh   on public.gps_checkins (bdh_name);
create index if not exists idx_gps_checkins_time  on public.gps_checkins (captured_at desc);

-- Chặn chấm trùng: mỗi người chỉ 1 lần HỢP LỆ cho mỗi buổi (vào/ra) mỗi ngày.
-- Dùng ngày theo giờ VN để đúng ranh giới ngày; chỉ ràng buộc dòng hợp lệ nên
-- các lần thử ngoài vùng (is_valid=false) vẫn ghi log được để đối soát.
create unique index if not exists uq_gps_checkins_valid_per_day
  on public.gps_checkins (
    user_email, kind, ((timezone('Asia/Ho_Chi_Minh', captured_at))::date)
  )
  where is_valid;

-- ─── 4. TRIGGER: giờ server + tính khoảng cách + cờ hợp lệ (server-side) ───
create or replace function public.gps_checkins_validate()
returns trigger language plpgsql as $$
declare
  pl record;
begin
  -- Giờ chính thức luôn là giờ server, bỏ qua mọi giá trị client gửi.
  new.captured_at := now();

  select lat, lng, coalesce(radius_m, 50) as radius_m
    into pl
  from public.project_locations
  where bdh_name = new.bdh_name
  limit 1;

  if not found then
    -- BĐH chưa được ghim toạ độ -> không đủ căn cứ -> không hợp lệ.
    new.distance_m := null;
    new.radius_m   := coalesce(new.radius_m, 50);
    new.is_valid   := false;
    return new;
  end if;

  new.radius_m   := pl.radius_m;
  new.distance_m := public.gps_distance_m(new.lat, new.lng, pl.lat, pl.lng);
  new.is_valid   := (new.distance_m <= pl.radius_m)
                    and (new.accuracy_m is null or new.accuracy_m <= 100);
  return new;
end;
$$;

drop trigger if exists trg_gps_checkins_validate on public.gps_checkins;
create trigger trg_gps_checkins_validate
  before insert on public.gps_checkins
  for each row execute function public.gps_checkins_validate();

-- ─── 5. RLS ───
alter table public.gps_checkins enable row level security;
revoke all on public.gps_checkins from anon;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'gps_checkins'
  loop
    execute format('drop policy if exists %I on public.gps_checkins', pol.policyname);
  end loop;
end $$;

-- INSERT: chỉ tạo được bản ghi cho CHÍNH mình.
create policy "gps_insert_self" on public.gps_checkins
  for insert to authenticated
  with check (user_email ilike auth.email());

-- SELECT: bản ghi của mình, hoặc Admin / đầu mối HCNS xem tất cả.
create policy "gps_select_self_or_hr" on public.gps_checkins
  for select to authenticated
  using (
    user_email ilike auth.email()
    or exists (select 1 from public.allowed_users au
               where au.role = 'Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports = true
                 and ap.email ilike '%' || auth.email() || '%')
  );

-- UPDATE/DELETE: chỉ Admin / đầu mối HCNS (đối soát, sửa ghi chú, gỡ bản rác).
create policy "gps_update_hr" on public.gps_checkins
  for update to authenticated
  using (
    exists (select 1 from public.allowed_users au
            where au.role = 'Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports = true
                 and ap.email ilike '%' || auth.email() || '%')
  );

create policy "gps_delete_hr" on public.gps_checkins
  for delete to authenticated
  using (
    exists (select 1 from public.allowed_users au
            where au.role = 'Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports = true
                 and ap.email ilike '%' || auth.email() || '%')
  );

-- ─── 6. BUCKET ẢNH MINH CHỨNG (private) ───
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'gps-checkins', 'gps-checkins', false,
    5242880, -- 5MB/ảnh là dư (client đã nén ~100KB)
    array['image/jpeg','image/png','image/webp']
  )
  on conflict (id) do update set
    public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
  raise notice 'Bucket gps-checkins da san sang (private, 5MB).';
exception
  when insufficient_privilege or others then
    raise warning 'KHONG tao duoc bucket (%). Vao Supabase > Storage > New bucket ten "gps-checkins", BO TICK Public.', sqlerrm;
end $$;

do $$
begin
  execute 'drop policy if exists "gps photo insert self" on storage.objects';
  execute 'drop policy if exists "gps photo select self or hr" on storage.objects';
  execute 'drop policy if exists "gps photo delete hr" on storage.objects';

  -- Người dùng tự tải ảnh của mình lên (thư mục đầu = email của họ).
  execute $p$
    create policy "gps photo insert self"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'gps-checkins')
  $p$;

  -- Xem ảnh: chủ ảnh, hoặc Admin / đầu mối HCNS.
  execute $p$
    create policy "gps photo select self or hr"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'gps-checkins'
        and (
          owner = auth.uid()
          or exists (select 1 from public.allowed_users au
                     where au.role = 'Admin' and au.email ilike auth.email())
          or exists (select 1 from public.approval_permissions ap
                     where ap.can_view_attendance_imports = true
                       and ap.email ilike '%' || auth.email() || '%')
        )
      )
  $p$;

  -- Xoá ảnh: chỉ Admin / đầu mối HCNS.
  execute $p$
    create policy "gps photo delete hr"
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'gps-checkins'
        and (
          exists (select 1 from public.allowed_users au
                  where au.role = 'Admin' and au.email ilike auth.email())
          or exists (select 1 from public.approval_permissions ap
                     where ap.can_view_attendance_imports = true
                       and ap.email ilike '%' || auth.email() || '%')
        )
      )
  $p$;

  raise notice 'Da dat policy cho bucket gps-checkins.';
exception
  when insufficient_privilege or others then
    raise warning 'KHONG dat duoc policy storage (%). Tao tay trong Supabase > Storage > gps-checkins > Policies.', sqlerrm;
end $$;

-- ─── 7. KIỂM TRA NHANH ───
select id, public, file_size_limit from storage.buckets where id = 'gps-checkins';
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'gps_checkins' order by policyname;
