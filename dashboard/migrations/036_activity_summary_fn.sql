-- ============================================================
-- 036_activity_summary_fn.sql — GOM SỐ LIỆU NHẬT KÝ SỬ DỤNG (cho tab báo cáo)
--
-- Vì sao cần hàm này thay vì để giao diện tự đếm:
--   Nhật ký sinh khoảng 16.500 dòng/tháng. Nếu trang web kéo hết dòng thô về
--   rồi đếm bằng JavaScript thì (a) chậm, (b) dễ dính trần số dòng của
--   PostgREST và ÂM THẦM đếm thiếu — loại sai số nguy hiểm nhất vì không báo lỗi.
--   Gom sẵn ở DB thì mỗi người chỉ trả về đúng 1 dòng.
--
-- Cùng cơ chế bảo vệ như 035: security definer + chặn ngay nếu không phải Admin.
--
-- Cách chạy: dán TOÀN BỘ file này vào Supabase SQL Editor rồi bấm Run.
-- ============================================================

create or replace function public.admin_activity_summary(
  p_from date,
  p_to   date
)
returns table (
  user_email   text,
  open_count   bigint,  -- số lượt mở module (đã khử trùng 30 phút ở client)
  active_days  bigint,  -- số NGÀY khác nhau có hoạt động — chỉ số chống thổi số liệu tốt nhất
  module_count bigint,  -- số module khác nhau đã chạm
  last_seen    timestamptz
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(auth.jwt() ->> 'email')
      and au.role = 'Admin'
  ) then
    raise exception 'Chỉ Admin mới được xem thống kê hoạt động.';
  end if;

  return query
  select e.email,
         count(*)::bigint,
         count(distinct (e.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date)::bigint,
         count(distinct e.module)::bigint,
         max(e.occurred_at)
    from public.activity_events e
   where (e.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from
     and (e.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to
   group by e.email;
end
$fn$;

comment on function public.admin_activity_summary(date, date) is
  'Gom nhật ký activity_events theo người trong khoảng ngày. Ngày tính theo giờ VN. Chỉ Admin gọi được.';

revoke all on function public.admin_activity_summary(date, date) from public;
revoke all on function public.admin_activity_summary(date, date) from anon;
grant execute on function public.admin_activity_summary(date, date) to authenticated;

-- ============================================================
-- KIỂM TRA SAU KHI CHẠY (bằng tài khoản Admin)
-- ============================================================
-- select * from public.admin_activity_summary(date_trunc('month', current_date)::date, current_date)
--   order by active_days desc, open_count desc;
