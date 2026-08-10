-- ============================================================
-- 032 — THÊM CỜ `is_excluded_from_benefits` VÀO `employees_directory`
--
-- VÌ SAO CẦN:
-- Trang chủ thêm khối "Sinh nhật theo tháng" cho Ban lãnh đạo. Danh sách này
-- phải KHỚP với luồng gốc: C&B → Phúc lợi → Sinh nhật (cb/page.tsx:3657
-- `filteredBirthdays`), nơi loại trừ nhân sự bằng `isExcludedFromBenefits`
-- (cb/page.tsx:592):
--
--     notes + status có chứa "kiêm nhiệm" HOẶC "nghỉ việc"  ->  loại
--
-- Trang C&B đọc thẳng bảng `employees` (có `notes`) nhưng bảng đó đã siết RLS
-- chỉ cho Admin / can_view_salary / can_view_employees. Giám đốc không chắc có
-- cờ nào trong số đó -> trang chủ buộc phải đọc view `employees_directory`,
-- mà view này cố ý bỏ cột `notes` (PII, migration 011).
--
-- GIẢI PHÁP: tính sẵn đúng biểu thức đó thành 1 cột boolean trong view — y hệt
-- cách migration 031 làm với `is_resigned`. Không lộ nội dung `notes`.
--
-- LƯU Ý: vẫn dựng động từ information_schema, và cột mới phải nằm SAU
-- `is_resigned` vì `create or replace view` chỉ cho THÊM cột vào cuối.
-- ============================================================

do $$
declare
  cols text;
  has_notes boolean;
  resigned_expr text;
  excluded_expr text;
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

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'notes'
  ) into has_notes;

  -- ── is_resigned: giữ nguyên y hệt migration 031 ──
  resigned_expr :=
    '(lower(coalesce(status, '''')) like ''%nghỉ việc%'' or lower(coalesce(status, '''')) like ''%nghi viec%'')';
  if has_notes then
    resigned_expr := resigned_expr ||
      ' or (lower(coalesce(notes, '''')) like ''%nghỉ việc%'' or lower(coalesce(notes, '''')) like ''%nghi viec%'')';
  end if;

  -- ── is_excluded_from_benefits: nghỉ việc HOẶC kiêm nhiệm ──
  -- Bản gốc nối `notes` và `status` thành một chuỗi rồi mới dò, nên ở đây cũng
  -- dò trên chuỗi ghép để ra đúng cùng kết quả.
  excluded_expr := format(
    'lower(concat_ws('' '', %s, coalesce(status, ''''))) ~ ''(kiêm nhiệm|kiem nhiem|nghỉ việc|nghi viec)''',
    case when has_notes then 'coalesce(notes, '''')' else '''''' end
  );

  execute format(
    'create or replace view public.employees_directory as
       select %s,
              (%s) as is_resigned,
              (%s) as is_excluded_from_benefits
       from public.employees',
    cols, resigned_expr, excluded_expr
  );

  raise notice 'employees_directory dựng lại (is_resigned + is_excluded_from_benefits), có notes = %', has_notes;
end $$;

-- Thu hồi trước, cấp sau — bẫy GRANT của view (xem 011).
revoke all on public.employees_directory from public;
revoke all on public.employees_directory from anon;
grant select on public.employees_directory to authenticated;

-- ─── Kiểm tra sau khi chạy ───────────────────────────────────────────────
-- Đối chiếu với C&B → Phúc lợi → Sinh nhật, đổi số 8 thành tháng đang xem:
--   select count(*)
--   from public.employees_directory
--   where not is_excluded_from_benefits
--     and extract(month from nullif(date_of_birth, '')::date) = 8;
-- (Câu trên chỉ chạy được nếu date_of_birth đúng định dạng ngày; phía app có
--  hàm parseBirthdate chịu được cả "dd/mm/yyyy" lẫn "yyyy-mm-dd".)
