-- ============================================================
-- 027 — GHI CHÚ LỊCH CÁ NHÂN (`calendar_notes`)
--
-- MỤC ĐÍCH:
-- Trên trang Lịch công việc, nhấn đúp vào một ô ngày để tự ghi chú cho mình:
-- "họp giao ban", "bận đi công trường", "nhắc nộp báo cáo"... Đây là sổ tay
-- riêng, KHÔNG phải công việc được giao và KHÔNG đi qua luồng duyệt nào.
--
-- VÌ SAO LÀ BẢNG RIÊNG, KHÔNG NHÉT VÀO `tasks`:
--   1. `tasks` là nguồn của luồng duyệt nghỉ phép / công tác (approval_stage,
--      reject_reason, manager_approved_by...). Thêm ghi chú cá nhân vào đó sẽ
--      lẫn vào hàng chờ duyệt và vào nhóm "Danh sách đã duyệt" bên trang Duyệt
--      yêu cầu.
--   2. `tasks` hiện cho quản lý đọc rộng. Ghi chú cá nhân phải kín tuyệt đối,
--      hai mức riêng tư khác nhau không nên nằm chung một bảng.
--   3. Kanban / báo cáo / thống kê đang đếm trên `tasks` — thêm dòng ghi chú
--      vào sẽ làm sai mọi con số đó.
--
-- RIÊNG TƯ TUYỆT ĐỐI: khoá theo email ĐĂNG NHẬP. Policy bên dưới chặn ngay ở
-- tầng CSDL — người khác không đọc được kể cả khi gọi thẳng API bỏ qua giao
-- diện, và KỂ CẢ ADMIN. Đây là dữ liệu cá nhân, không phải cấu hình hệ thống.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Bảng ───
create table if not exists public.calendar_notes (
  id           uuid primary key default gen_random_uuid(),
  owner_email  text        not null,
  note_date    date        not null,
  content      text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.calendar_notes is
  'Ghi chú lịch cá nhân, khoá theo email đăng nhập. Mỗi người chỉ đọc và ghi được dòng của chính mình — kể cả Admin cũng không xem được của người khác.';

-- Email luôn lưu chữ thường để so khớp với auth.jwt() không lệch hoa/thường.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calendar_notes_owner_lower_check'
  ) then
    alter table public.calendar_notes
      add constraint calendar_notes_owner_lower_check
      check (owner_email = lower(btrim(owner_email)) and owner_email <> '');
  end if;
end $$;

-- Chặn ghi chú rỗng và ghi chú dài bất thường (giao diện giới hạn 500 ký tự).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calendar_notes_content_check'
  ) then
    alter table public.calendar_notes
      add constraint calendar_notes_content_check
      check (btrim(content) <> '' and length(content) <= 500);
  end if;
end $$;

-- Lịch luôn đọc theo "ghi chú của tôi trong khoảng ngày này".
create index if not exists calendar_notes_owner_date_idx
  on public.calendar_notes (owner_email, note_date);

-- ─── 2. Tự cập nhật updated_at ───
create or replace function public.calendar_notes_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists calendar_notes_touch_trg on public.calendar_notes;
create trigger calendar_notes_touch_trg
  before update on public.calendar_notes
  for each row execute function public.calendar_notes_touch();

-- ─── 3. RLS ───
alter table public.calendar_notes enable row level security;

-- Xoá TOÀN BỘ policy cũ (quét động — không đoán tên) trước khi dựng lại.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'calendar_notes'
  loop
    execute format('drop policy if exists %I on public.calendar_notes;', pol.policyname);
  end loop;
end $$;

revoke all on public.calendar_notes from anon;
revoke all on public.calendar_notes from public;
grant select, insert, update, delete on public.calendar_notes to authenticated;

-- 3a. ĐỌC: CHỈ dòng của chính mình. Khác hẳn user_avatars (ảnh mở cho mọi
-- người xem) — ở đây nội dung là ghi chú riêng nên đóng luôn từ khâu đọc.
create policy "calendar_notes_select_self"
  on public.calendar_notes for select
  to authenticated
  using (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and owner_email = lower(auth.jwt() ->> 'email')
  );

create policy "calendar_notes_insert_self"
  on public.calendar_notes for insert
  to authenticated
  with check (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and owner_email = lower(auth.jwt() ->> 'email')
  );

create policy "calendar_notes_update_self"
  on public.calendar_notes for update
  to authenticated
  using (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and owner_email = lower(auth.jwt() ->> 'email')
  )
  with check (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and owner_email = lower(auth.jwt() ->> 'email')
  );

create policy "calendar_notes_delete_self"
  on public.calendar_notes for delete
  to authenticated
  using (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and owner_email = lower(auth.jwt() ->> 'email')
  );

-- ─── 4. KIỂM TRA ───
-- 4a. Policy: phải đúng 4 dòng (select / insert / update / delete)
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'calendar_notes'
order by cmd;

-- 4b. Xác nhận anon KHÔNG còn quyền nào trên bảng (phải trả về 0 dòng).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'calendar_notes'
  and grantee in ('anon', 'PUBLIC');

-- 4c. Số ghi chú hiện có theo từng người (chạy bằng service_role mới thấy hết).
select owner_email, count(*) as so_ghi_chu
from public.calendar_notes
group by owner_email
order by so_ghi_chu desc;
