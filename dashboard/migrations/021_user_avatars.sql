-- ============================================================
-- 021 — ẢNH ĐẠI DIỆN NGƯỜI DÙNG (`user_avatars`)
--
-- MỤC ĐÍCH:
-- Cho phép MỌI tài khoản tự tải ảnh đại diện trong Cài đặt hệ thống. Ảnh hiện
-- ngay cạnh họ tên ở góc phải Header (thay 2 chữ viết tắt).
--
-- VÌ SAO LÀ BẢNG RIÊNG, KHÔNG THÊM CỘT VÀO `employees`:
--   1. Cột `employees.avatar` đã tồn tại nhưng lưu HAI CHỮ VIẾT TẮT ("NH", "PT")
--      và đang được employees/calendar/cb dùng để vẽ ô tròn chữ cái. Đổi ý nghĩa
--      cột đó sẽ vỡ 3 trang.
--   2. `employees` đã tách PII qua view `employees_directory` (migration 011).
--      Thêm cột vào đó sẽ phải dựng lại view — không cần thiết.
--   3. Khoá theo email ĐĂNG NHẬP, nên tài khoản chưa có hồ sơ trong `employees`
--      (vd Admin hệ thống) vẫn đặt được ảnh.
--
-- ẢNH LƯU THẲNG TRONG DB (theo yêu cầu), dạng data URL base64. Giao diện đã
-- ép ảnh về tối đa 300×300 và nén JPEG trước khi gửi (~25-40 KB), nên cột text
-- này không phình. Ràng buộc bên dưới là chốt chặn tầng CSDL, phòng trường hợp
-- ai đó gọi thẳng API bỏ qua giao diện.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Bảng ───
create table if not exists public.user_avatars (
  email      text primary key,
  image_data text not null,
  updated_at timestamptz not null default now()
);

comment on table public.user_avatars is
  'Ảnh đại diện người dùng, khoá theo email đăng nhập. image_data là data URL base64 (JPEG, tối đa 300x300). Mỗi người chỉ ghi được dòng của chính mình.';

-- Chỉ nhận data URL ảnh, và chặn ảnh quá lớn (~400 KB base64).
-- Ảnh 300x300 JPEG chuẩn của giao diện chỉ khoảng 25-40 KB.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatars_image_data_check'
  ) then
    alter table public.user_avatars
      add constraint user_avatars_image_data_check
      check (image_data like 'data:image/%' and length(image_data) <= 400000);
  end if;
end $$;

-- Email luôn lưu chữ thường để so khớp với auth.jwt() không lệch hoa/thường.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_avatars_email_lower_check'
  ) then
    alter table public.user_avatars
      add constraint user_avatars_email_lower_check
      check (email = lower(btrim(email)) and email <> '');
  end if;
end $$;

-- ─── 2. Tự cập nhật updated_at ───
create or replace function public.user_avatars_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_avatars_touch_trg on public.user_avatars;
create trigger user_avatars_touch_trg
  before update on public.user_avatars
  for each row execute function public.user_avatars_touch();

-- ─── 3. RLS ───
alter table public.user_avatars enable row level security;

-- Xoá TOÀN BỘ policy cũ (quét động — không đoán tên) trước khi dựng lại.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_avatars'
  loop
    execute format('drop policy if exists %I on public.user_avatars;', pol.policyname);
  end loop;
end $$;

revoke all on public.user_avatars from anon;
revoke all on public.user_avatars from public;
grant select, insert, update, delete on public.user_avatars to authenticated;

-- 3a. ĐỌC: mọi người đã đăng nhập.
-- Ảnh đại diện không phải dữ liệu nhạy cảm, và mở sẵn để sau này hiện được
-- avatar đồng nghiệp ở Kanban / danh bạ mà không phải sửa lại policy.
create policy "user_avatars_select_authenticated"
  on public.user_avatars for select
  to authenticated
  using (true);

-- 3b/c/d. GHI: CHỈ dòng của chính mình. Không ai đổi được ảnh người khác,
-- kể cả Admin — đây là dữ liệu cá nhân, không phải cấu hình hệ thống.
create policy "user_avatars_insert_self"
  on public.user_avatars for insert
  to authenticated
  with check (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and email = lower(auth.jwt() ->> 'email')
  );

create policy "user_avatars_update_self"
  on public.user_avatars for update
  to authenticated
  using (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and email = lower(auth.jwt() ->> 'email')
  )
  with check (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and email = lower(auth.jwt() ->> 'email')
  );

create policy "user_avatars_delete_self"
  on public.user_avatars for delete
  to authenticated
  using (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and email = lower(auth.jwt() ->> 'email')
  );

-- ─── 4. KIỂM TRA ───
-- 4a. Policy: phải đúng 4 dòng (select / insert / update / delete)
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'user_avatars'
order by cmd;

-- 4b. Ai đã đặt ảnh, ảnh nặng bao nhiêu KB.
select email,
       round(length(image_data) / 1024.0, 1) as kich_thuoc_kb,
       updated_at
from public.user_avatars
order by updated_at desc;
