-- ============================================================
-- 007 — KHOÁ QUYỀN GHI BẢNG `employees`
--
-- VẤN ĐỀ ĐANG CÓ:
-- 4 policy trên `employees` đều là template mặc định của Supabase Dashboard
-- ("Enable read access for all users", "Enable insert/update/delete for
-- authenticated") với điều kiện `true`. Nghĩa là BẤT KỲ nhân viên nào đăng
-- nhập được đều có thể UPDATE / DELETE mọi hồ sơ nhân sự bằng cách gọi thẳng
-- PostgREST, bỏ qua hoàn toàn giao diện.
--
-- Hậu quả cụ thể:
--   • Tự gỡ trạng thái "NV Nghỉ việc" của mình -> vô hiệu hoá tính năng
--     "Bàn giao & Khoá tài khoản"
--   • Đặt đồng nghiệp thành "NV Nghỉ việc" -> khoá người khác ra khỏi hệ thống
--   • Sửa/xoá hồ sơ, CCCD, địa chỉ của bất kỳ ai
--
-- CÁCH SỬA:
-- Chuyển cờ `can_manage_employees` từ "tấm rèm che giao diện" thành "ổ khoá
-- thật ở tầng CSDL". Sau migration này, tắt cờ của ai là người đó MẤT quyền
-- ghi ở mọi đường vào, không chỉ trên màn hình.
--
-- KHỚP VỚI CODE HIỆN TẠI:
-- Toàn bộ lệnh ghi vào `employees` nằm gọn trong đúng 1 file
-- (app/employees/page.tsx), và đã gate sẵn bằng `perms.canManageEmployees`
-- (xem canEdit/canDelete/isOnlyAdmin quanh dòng 664-677). Policy dưới đây tái
-- hiện đúng điều kiện đó ở tầng CSDL -> KHÔNG luồng nào đang chạy bị gãy.
--
-- KHÔNG ĐỘNG VÀO QUYỀN ĐỌC:
-- Policy SELECT giữ nguyên. Việc che PII (cccd, date_of_birth,
-- permanent_address, emergency_contact_*) là giai đoạn 2, cần refactor code
-- nên tách riêng.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Hàm kiểm tra: người gọi có quyền quản lý hồ sơ nhân sự không ───
-- Khớp email kiểu "chứa" giống hệt code (lib/approvers.ts dùng
-- `row.email.includes(loginEmail)`), vì cột email lưu 2 địa chỉ trong 1 ô:
-- "mail công ty, gmail" — mail công ty để gửi/nhận thư, gmail để đăng nhập
-- Google. Người dùng đăng nhập bằng địa chỉ nào cũng phải khớp.
create or replace function public.can_manage_employees_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- (a) Admin trong allowed_users
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and au.role = 'Admin'
    )
    -- (b) hoặc có cờ can_manage_employees
    or exists (
      select 1 from public.approval_permissions p
      where p.can_manage_employees = true
        and coalesce(auth.jwt() ->> 'email', '') <> ''
        and position(
              lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))
            ) > 0
    );
$$;

-- ─── 2. Gỡ các policy ghi kiểu "ai đăng nhập cũng được" ───
-- CHỈ gỡ policy KHÔNG phải SELECT — quyền đọc giữ nguyên tuyệt đối.
do $$
declare pol record;
begin
  for pol in
    select policyname, cmd from pg_policies
    where schemaname = 'public' and tablename = 'employees' and cmd <> 'SELECT'
  loop
    execute format('drop policy if exists %I on public.employees', pol.policyname);
    raise notice 'Đã gỡ policy ghi cũ: % (%)', pol.policyname, pol.cmd;
  end loop;
end $$;

-- ─── 3. Cấp lại quyền ghi theo cờ ───
create policy "employees insert by manager"
  on public.employees
  for insert
  to authenticated
  with check (public.can_manage_employees_caller());

create policy "employees update by manager"
  on public.employees
  for update
  to authenticated
  using (public.can_manage_employees_caller())
  with check (public.can_manage_employees_caller());

create policy "employees delete by manager"
  on public.employees
  for delete
  to authenticated
  using (public.can_manage_employees_caller());

-- ─── 4. KIỂM TRA KẾT QUẢ ───
-- Mong đợi: 1 policy SELECT (giữ nguyên) + 3 policy ghi mới.
select policyname, cmd, coalesce(qual, '—') as dieu_kien_using
from pg_policies
where schemaname = 'public' and tablename = 'employees'
order by cmd, policyname;
