-- ============================================================
-- 034_activity_events.sql — NHẬT KÝ SỬ DỤNG (đo mức độ hoạt động của tài khoản)
--
-- Mục tiêu: biết tài khoản nào THỰC SỰ dùng phần mềm, chứ không phải đăng nhập
-- rồi treo đó. Mỗi lần một người MỞ một module (và ở lại đủ lâu) thì ghi 1 dòng.
--
-- Chống thổi phồng số liệu — 3 chốt nằm ở phía client (ActivityTracker.tsx):
--   1. Chỉ ghi khi tab đang hiển thị (tab chạy nền không tính).
--   2. Phải ở lại trang >= 5 giây (bấm nhầm rồi thoát ngay không tính).
--   3. Cùng (người, module) chỉ ghi lại sau 30 phút (F5 liên tục vẫn 1 lượt).
--
-- QUYỀN — cố ý bất đối xứng:
--   - INSERT : mọi tài khoản đã đăng nhập, NHƯNG chỉ ghi được dòng mang đúng
--              email của chính mình (không giả mạo người khác được).
--   - SELECT : CHỈ Admin trong allowed_users. Đây là dữ liệu hành vi cá nhân,
--              để nhân viên đọc được của nhau là sự cố quyền riêng tư.
--   - UPDATE/DELETE : KHÔNG cấp cho ai. Nhật ký bất biến; muốn dọn thì Admin
--              chạy tay trong SQL Editor (xem mục "DỌN DỮ LIỆU CŨ" ở cuối file).
--
-- Bảng này ĐỘC LẬP: không module nào khác đọc/ghi, không ràng buộc khoá ngoại
-- tới bảng nào. Hỏng nó cũng không ảnh hưởng nghiệp vụ đang chạy.
--
-- Cách chạy: dán TOÀN BỘ file này vào Supabase SQL Editor rồi bấm Run.
-- ============================================================

create table if not exists public.activity_events (
  id          bigserial primary key,
  -- Email người dùng, luôn viết thường (ràng buộc bên dưới ép chuẩn hoá).
  email       text        not null,
  -- Khoá module = đoạn đầu của đường dẫn, vd 'tasks', 'cb', 'administration'.
  -- Trang chủ quy ước là 'dashboard'.
  module      text        not null,
  -- Đường dẫn đầy đủ, giữ lại để soi chi tiết khi số liệu trông bất thường.
  path        text        not null,
  occurred_at timestamptz not null default now()
);

comment on table public.activity_events is
  'Nhật ký mở module — đo mức độ sử dụng thực tế. Chỉ Admin đọc được. Đã khử trùng 30 phút ở phía client.';

-- Ép email luôn ở dạng thường + không rỗng, để gom nhóm thống kê không bị lệch
-- giữa "A@x.com" và "a@x.com".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'activity_events_email_lower_chk'
  ) then
    alter table public.activity_events
      add constraint activity_events_email_lower_chk
      check (email = lower(btrim(email)) and email <> '');
  end if;
end $$;

-- Truy vấn chính là "lọc theo khoảng thời gian rồi gom theo người".
create index if not exists activity_events_occurred_idx
  on public.activity_events (occurred_at desc);
create index if not exists activity_events_email_occurred_idx
  on public.activity_events (email, occurred_at desc);

-- ─── RLS ───
alter table public.activity_events enable row level security;

-- Chặn anon tuyệt đối (bài học cũ: nhớ đo lại bằng anon key sau khi chạy).
revoke all on public.activity_events from anon;
revoke all on sequence public.activity_events_id_seq from anon;
grant usage on sequence public.activity_events_id_seq to authenticated;

-- Xoá sạch policy cũ (quét động, không đoán tên) trước khi dựng lại.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'activity_events'
  loop
    execute format('drop policy if exists %I on public.activity_events', pol.policyname);
  end loop;
end $$;

-- GHI: ai đã đăng nhập cũng ghi được, nhưng chỉ dòng của chính mình.
create policy "activity_events_insert_self" on public.activity_events
  for insert to authenticated
  with check (email = lower(btrim(auth.jwt() ->> 'email')));

-- ĐỌC: chỉ Admin. Trưởng phòng HCNS cũng KHÔNG thấy (theo yêu cầu).
create policy "activity_events_select_admin" on public.activity_events
  for select to authenticated
  using (
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(auth.jwt() ->> 'email')
        and au.role = 'Admin'
    )
  );

-- Cố ý KHÔNG có policy cho update/delete -> không ai sửa được nhật ký qua ứng dụng.

-- ============================================================
-- KIỂM TRA SAU KHI CHẠY (chạy riêng, không bắt buộc)
-- ============================================================
-- select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'activity_events' order by cmd;
--
-- Số lượt theo người trong 30 ngày gần nhất:
-- select email, count(*) as luot, count(distinct occurred_at::date) as so_ngay
--   from public.activity_events
--   where occurred_at >= now() - interval '30 days'
--   group by email order by so_ngay desc, luot desc;

-- ============================================================
-- DỌN DỮ LIỆU CŨ — chạy tay định kỳ (khoảng mỗi năm một lần)
-- Ước tính ~50 người x ~15 lượt/ngày x 22 ngày ~ 16.500 dòng/tháng.
-- ============================================================
-- delete from public.activity_events where occurred_at < now() - interval '12 months';
