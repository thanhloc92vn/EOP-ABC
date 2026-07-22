-- ============================================================
-- 014 — BẬT REALTIME CHO benefit_claims
-- Để chuông thông báo trên Header nảy ngay khi có phiếu chi phúc lợi
-- mới, không phải chờ người duyệt F5 lại trang.
--
-- (Các bảng tasks / attendance_justifications / resource_bookings
-- trước đây được bật tay trong Supabase Dashboard > Database >
-- Replication. Migration này làm điều tương đương bằng SQL.)
--
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'benefit_claims'
  ) then
    alter publication supabase_realtime add table public.benefit_claims;
  end if;
end $$;

-- ─── KIỂM TRA KẾT QUẢ: phải thấy benefit_claims trong danh sách ───
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
