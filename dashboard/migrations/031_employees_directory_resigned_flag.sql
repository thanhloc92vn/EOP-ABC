-- ============================================================
-- 031 — THÊM CỜ `is_resigned` VÀO VIEW `employees_directory`
--
-- VÌ SAO CẦN:
-- Trang chủ (app/page.tsx) muốn hiện ô "Nhân sự nghỉ việc" và con số phải
-- KHỚP TUYỆT ĐỐI với module "Danh sách nhân viên".
--
-- Ở employees/page.tsx:557-561 một hồ sơ được coi là nghỉ việc khi:
--     status  chứa "nghỉ việc"   HOẶC
--     notes   chứa "nghỉ việc"
-- (nhiều hồ sơ cũ chỉ đánh dấu ở cột Ghi chú, không đổi Trạng thái).
--
-- Nhưng trang chủ đọc view `employees_directory`, mà view này CỐ Ý loại bỏ
-- cột `notes` (PII — xem migration 011). Nếu trang chủ chỉ đếm theo `status`
-- thì sẽ ĐẾM THIẾU đúng những hồ sơ chỉ ghi ở Ghi chú -> số sai.
--
-- GIẢI PHÁP:
-- Tính sẵn cờ boolean `is_resigned` NGAY TRONG VIEW. Cờ này đọc `notes` ở
-- phía server nhưng KHÔNG trả nội dung `notes` ra ngoài — ranh giới PII của
-- migration 011 giữ nguyên, chỉ lộ thêm đúng 1 bit "đã nghỉ hay chưa", vốn
-- đã lộ sẵn qua cột `status` (status không nằm trong danh sách PII).
--
-- LƯU Ý KHI DỰNG LẠI VIEW:
-- Vẫn dựng động từ information_schema như 011 (mỗi tenant có bộ cột lệch
-- nhau, cột mới thêm sau này tự vào view), rồi nối thêm `is_resigned` ở CUỐI.
-- Phải ở cuối vì `create or replace view` chỉ cho phép THÊM cột vào cuối.
-- ============================================================

do $$
declare
  cols text;
  has_notes boolean;
  resigned_expr text;
begin
  -- Bộ cột "không PII" — giữ nguyên đúng danh sách của migration 011.
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'employees'
    and column_name not in (
      'cccd', 'cccd_date', 'cccd_place',
      'permanent_address', 'temporary_address',
      'emergency_contact_name', 'emergency_contact_relationship',
      'emergency_contact_phone',
      'notes'
    );

  -- Tenant mới có thể chưa có cột `notes` -> chỉ xét `status`.
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'notes'
  ) into has_notes;

  -- unaccent không chắc có sẵn -> so khớp cả bản có dấu lẫn không dấu,
  -- đúng như phía client đang làm (lowercase + includes).
  resigned_expr :=
    '(lower(coalesce(status, '''')) like ''%nghỉ việc%'' or lower(coalesce(status, '''')) like ''%nghi viec%'')';

  if has_notes then
    resigned_expr := resigned_expr ||
      ' or (lower(coalesce(notes, '''')) like ''%nghỉ việc%'' or lower(coalesce(notes, '''')) like ''%nghi viec%'')';
  end if;

  execute format(
    'create or replace view public.employees_directory as select %s, (%s) as is_resigned from public.employees',
    cols, resigned_expr
  );

  raise notice 'employees_directory dựng lại, có notes = %, cột = %', has_notes, cols;
end $$;

-- Thu hồi trước, cấp sau — bẫy GRANT của view (xem 011): view KHÔNG chịu RLS,
-- ai được GRANT là đọc sạch, mà Supabase cấp sẵn cho `anon`/PUBLIC.
-- `create or replace view` giữ nguyên quyền cũ, nhưng lặp lại cho chắc.
revoke all on public.employees_directory from public;
revoke all on public.employees_directory from anon;
grant select on public.employees_directory to authenticated;

-- ─── Kiểm tra sau khi chạy ───────────────────────────────────────────────
-- Chạy riêng ở SQL Editor, đối chiếu với module "Danh sách nhân viên":
--   select count(*) filter (where is_resigned)      as nghi_viec,
--          count(*) filter (where not is_resigned)  as dang_lam,
--          count(*)                                 as tong
--   from public.employees_directory;
