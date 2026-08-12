-- ============================================================
-- 035_activity_actions_fn.sql — THỐNG KÊ "HÀNH ĐỘNG THẬT" TỪ DỮ LIỆU ĐÃ CÓ
--
-- Bổ sung cho 034: nhật ký `activity_events` chỉ đếm được từ ngày bật trở đi.
-- Hàm này moi HỒI TỐ từ các bảng nghiệp vụ vốn đã lưu sẵn "ai tạo, lúc nào",
-- nên có số liệu quá khứ ngay mà không phải chờ tích luỹ.
--
-- Nguồn dữ liệu (đã đối chiếu đúng tên cột trong các migration trước):
--   invoices          .created_by   / .created_at   -> Phiếu thanh toán
--   benefit_claims    .created_by   / .date         -> Đề nghị phúc lợi
--   vpp_stock_entries .created_by   / .created_at   -> Kho VPP
--   project_locations .created_by   / .created_at   -> Vị trí dự án
--   news_posts        .author_email / .created_at   -> Tin tức
--
-- CỐ Ý KHÔNG LẤY:
--   - tasks         : bảng KHÔNG có cột created_by (mọi chỗ insert đều không
--                     lưu người tạo), nên không quy trách nhiệm được cho ai.
--   - calendar_notes: ghi chú cá nhân, riêng tư tuyệt đối — không đưa vào bất
--                     kỳ thống kê nào, kể cả chỉ đếm số lượng.
--   - suggestions   : góp ý qua trang công khai, vốn ẩn danh.
--
-- VÌ SAO LÀ HÀM CHỨ KHÔNG PHẢI VIEW:
--   View trong Postgres mặc định chạy quyền của CHỦ SỞ HỮU và KHÔNG áp RLS của
--   bảng gốc — cấp quyền đọc view là lộ sạch dữ liệu cho mọi người. Hàm này cũng
--   chạy quyền chủ sở hữu (security definer, cần thiết để đếm được toàn bộ), nhưng
--   CHẶN NGAY Ở DÒNG ĐẦU nếu người gọi không phải Admin.
--
-- Cách chạy: dán TOÀN BỘ file này vào Supabase SQL Editor rồi bấm Run.
-- ============================================================

create or replace function public.admin_activity_actions(
  p_from date,
  p_to   date
)
returns table (
  user_email   text,
  module_label text,
  action_count bigint
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Cổng quyền: CHỈ Admin. Không phải Admin thì báo lỗi, không trả bảng rỗng —
  -- để phía giao diện phân biệt được "bị chặn" với "chưa có dữ liệu".
  if not exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.role = 'Admin'
  ) then
    raise exception 'Chỉ Admin mới được xem thống kê hoạt động.';
  end if;

  return query
  with src as (
    select lower(btrim(i.created_by)) as em,
           'Phiếu thanh toán'::text   as lbl,
           i.created_at::date         as d
      from public.invoices i
     where i.created_by is not null and btrim(i.created_by) <> ''

    union all

    -- benefit_claims không có created_at; dùng cột `date` của đơn.
    -- Cột này có thể là kiểu text -> lọc bằng regex trước khi ép sang date để
    -- một dòng dữ liệu bẩn không làm hỏng cả truy vấn.
    select lower(btrim(b.created_by)),
           'Đề nghị phúc lợi',
           substring(b.date::text, 1, 10)::date
      from public.benefit_claims b
     where b.created_by is not null and btrim(b.created_by) <> ''
       and b.date is not null
       and b.date::text ~ '^\d{4}-\d{2}-\d{2}'

    union all

    select lower(btrim(v.created_by)),
           'Kho VPP',
           v.created_at::date
      from public.vpp_stock_entries v
     where btrim(v.created_by) <> ''

    union all

    select lower(btrim(p.created_by)),
           'Vị trí dự án',
           p.created_at::date
      from public.project_locations p
     where p.created_by is not null and btrim(p.created_by) <> ''

    union all

    select lower(btrim(n.author_email)),
           'Tin tức',
           n.created_at::date
      from public.news_posts n
     where n.author_email is not null and btrim(n.author_email) <> ''
  )
  select s.em, s.lbl, count(*)::bigint
    from src s
   where s.d >= p_from
     and s.d <= p_to
   group by s.em, s.lbl;
end
$fn$;

comment on function public.admin_activity_actions(date, date) is
  'Đếm hành động ghi dữ liệu theo người, hồi tố từ các bảng nghiệp vụ. Chỉ Admin gọi được.';

-- Chỉ tài khoản đã đăng nhập mới gọi được (bên trong còn chặn tiếp bằng Admin).
revoke all on function public.admin_activity_actions(date, date) from public;
revoke all on function public.admin_activity_actions(date, date) from anon;
grant execute on function public.admin_activity_actions(date, date) to authenticated;

-- ============================================================
-- KIỂM TRA SAU KHI CHẠY (chạy bằng tài khoản Admin)
-- ============================================================
-- select * from public.admin_activity_actions('2025-01-01', current_date)
--   order by action_count desc;
