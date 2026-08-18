-- ============================================================
-- 056 — ĐƯA `annual_leave_override` VÀO VIEW `employees_directory`
--
-- VÌ SAO CẦN:
-- Trang Lịch (đăng ký nghỉ phép) nay phải biết nhân sự còn bao nhiêu phép năm
-- để chặn đăng ký vượt hạn mức. Trang này đọc view `employees_directory` chứ
-- KHÔNG đọc bảng `employees` (bảng gốc đã siết RLS chỉ cho Admin /
-- can_view_salary / can_view_employees — nhân viên thường không đọc được).
--
-- View đang thiếu cột `annual_leave_override` (migration 054 thêm sau khi view
-- được dựng lần cuối ở migration 032). Thiếu nó thì trang Lịch không thấy số
-- Admin nhập tay -> chặn theo số tự tính, lệch với bảng C&B.
--
-- VÌ SAO PHẢI DROP CHỨ KHÔNG `CREATE OR REPLACE`:
-- `create or replace view` chỉ cho THÊM cột vào CUỐI. Cột mới của bảng
-- `employees` sẽ chen vào TRƯỚC hai cột tính sẵn `is_resigned` /
-- `is_excluded_from_benefits`, nên replace sẽ báo lỗi đổi tên cột. Phải drop
-- rồi dựng lại.
--
-- GIỮ NGUYÊN mọi thứ khác: vẫn bỏ đúng bộ cột PII của migration 011, vẫn có
-- `is_resigned` (031) và `is_excluded_from_benefits` (032), biểu thức y hệt.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

drop view if exists public.employees_directory;

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

  -- ── is_excluded_from_benefits: giữ nguyên y hệt migration 032 ──
  excluded_expr := format(
    'lower(concat_ws('' '', %s, coalesce(status, ''''))) ~ ''(kiêm nhiệm|kiem nhiem|nghỉ việc|nghi viec)''',
    case when has_notes then 'coalesce(notes, '''')' else '''''' end
  );

  execute format(
    'create view public.employees_directory as
       select %s,
              (%s) as is_resigned,
              (%s) as is_excluded_from_benefits
       from public.employees',
    cols, resigned_expr, excluded_expr
  );

  raise notice 'employees_directory dựng lại, cột = %', cols;
end $$;

-- Thu hồi TRƯỚC, cấp SAU — bẫy GRANT của view (xem 011): view KHÔNG chịu RLS,
-- ai được GRANT là đọc sạch, mà Supabase cấp sẵn quyền cho `anon`/PUBLIC trên
-- object mới trong schema public. Đây là view vừa DROP rồi tạo mới nên bước này
-- BẮT BUỘC, không phải chép cho có.
revoke all on public.employees_directory from public;
revoke all on public.employees_directory from anon;
grant select on public.employees_directory to authenticated;

-- ─── KIỂM TRA ───
-- 1) Cột mới đã có trong view chưa (mong đợi: 1 dòng)
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'employees_directory'
  and column_name = 'annual_leave_override';

-- 2) anon KHÔNG được đọc, authenticated ĐƯỢC đọc (mong đợi đúng 1 dòng: authenticated)
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'employees_directory'
order by grantee;
