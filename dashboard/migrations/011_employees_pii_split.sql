-- ============================================================
-- 011 — CHE PII TRONG BẢNG `employees` (giai đoạn 2)
--
-- VẤN ĐỀ:
-- Policy SELECT trên `employees` là `true` cho mọi tài khoản đăng nhập, mà
-- bảng chứa: cccd, cccd_date, cccd_place, permanent_address,
-- temporary_address, emergency_contact_*, notes.
-- => Bất kỳ nhân viên nào cũng đọc được CCCD, địa chỉ nhà và liên hệ khẩn cấp
-- của TOÀN CÔNG TY bằng một lệnh gọi PostgREST. Cờ `can_view_employees` chỉ
-- ẩn màn hình, không chặn được.
--
-- KHÔNG THỂ CHỈ SIẾT RLS:
-- RLS là theo DÒNG, không theo CỘT — không có cách nào vừa cho mọi người tra
-- cứu tên/phòng ban, vừa giấu riêng cột CCCD trên cùng một bảng. Mà cả hệ
-- thống thì thật sự cần tra cứu (Header, Sidebar, chọn người duyệt, gán việc...).
--
-- GIẢI PHÁP — TÁCH ĐÔI:
--   • View `employees_directory`: mọi cột TRỪ nhóm PII. Ai đăng nhập cũng đọc
--     được -> việc tra cứu toàn hệ thống không đổi.
--   • Bảng gốc `employees`: siết SELECT về Admin / can_view_employees /
--     can_manage_employees / can_view_salary / CHÍNH MÌNH.
--
-- RANH GIỚI PII LẤY TỪ ĐÂU:
-- Không tự nghĩ ra — lấy đúng ranh giới mà api/ai-search/route.ts:262-264 đã
-- vạch sẵn (`hasPiiAccess`). Ở đó `date_of_birth` và `phone` được coi là dùng
-- chung (tính năng tra sinh nhật), còn cccd/địa chỉ/notes là PII. Giữ nguyên
-- ranh giới đó để không mâu thuẫn với quyết định sản phẩm đang chạy.
--
-- VÌ SAO VIEW LÀ "SECURITY DEFINER" (mặc định, không đặt security_invoker):
-- Có chủ đích. View phải đọc được bảng gốc BẤT CHẤP RLS vừa siết, nếu không
-- thì người thường query view cũng chỉ thấy dòng của chính mình và toàn bộ
-- tra cứu sẽ chết. An toàn vì view KHÔNG chứa cột PII nào — đó chính là cơ
-- chế lọc cột ta cần. Supabase linter có thể cảnh báo "security definer view";
-- ở đây là cố ý.
--
-- can_view_salary có trong danh sách vì trang C&B (cb/page.tsx:2587) dùng
-- `isAdmin || canViewSalary` làm điều kiện full access — thiếu cờ này C&B gãy.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. View danh bạ: mọi cột TRỪ nhóm PII ───
-- Dựng cột động từ information_schema để không phải liệt kê tay (schema giữa
-- các tenant có thể lệch nhau, và thêm cột mới sau này vẫn tự vào view).
do $$
declare
  cols text;
begin
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

  execute format('create or replace view public.employees_directory as select %s from public.employees', cols);
  raise notice 'employees_directory gồm các cột: %', cols;
end $$;

-- QUAN TRỌNG — thu hồi trước, cấp sau.
-- View KHÔNG có RLS che như bảng: ai được GRANT là đọc được sạch. Mà Supabase
-- cấp sẵn quyền cho vai trò `anon` (và PUBLIC) trên object mới trong schema
-- public. Nếu chỉ `grant ... to authenticated` mà không thu hồi, view sẽ mở
-- cho TOÀN INTERNET qua anon key vốn công khai trong bundle JS — đã kiểm chứng
-- thực tế: 106 dòng trả về cho request không đăng nhập.
revoke all on public.employees_directory from public;
revoke all on public.employees_directory from anon;
grant select on public.employees_directory to authenticated;

-- ─── 2. Ai được đọc BẢNG GỐC (kèm PII) ───
create or replace function public.can_view_employee_pii()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and au.role = 'Admin'
    )
    or exists (
      select 1 from public.approval_permissions p
      where coalesce(auth.jwt() ->> 'email', '') <> ''
        and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
        and (
             p.can_view_employees = true
          or p.can_manage_employees = true
          or p.can_view_salary = true   -- trang C&B cần (cb/page.tsx:2587)
        )
    );
$$;

-- ─── 3. Thay policy SELECT của bảng gốc ───
-- CHỈ đụng SELECT. Ba policy ghi do migration 007 tạo giữ nguyên tuyệt đối.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'employees' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.employees', pol.policyname);
    raise notice 'Đã gỡ policy SELECT cũ: %', pol.policyname;
  end loop;
end $$;

create policy "employees select pii or self"
  on public.employees
  for select
  to authenticated
  using (
    public.can_view_employee_pii()
    -- Ai cũng đọc được ĐẦY ĐỦ hồ sơ của CHÍNH MÌNH (trang C&B cá nhân cần)
    or (
      coalesce(auth.jwt() ->> 'email', '') <> ''
      and position(lower(auth.jwt() ->> 'email') in lower(coalesce(email, ''))) > 0
    )
  );

-- ─── 4. KIỂM TRA ───
select 'policy employees' as muc, policyname as ten, cmd as lenh
from pg_policies where schemaname = 'public' and tablename = 'employees'
union all
select 'view', table_name, 'SELECT'
from information_schema.views where table_schema = 'public' and table_name = 'employees_directory'
order by muc, ten;
