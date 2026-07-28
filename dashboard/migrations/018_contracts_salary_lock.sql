-- ============================================================
-- 018 — SIẾT BẢNG contracts (HỢP ĐỒNG LAO ĐỘNG + LƯƠNG)
--
-- VẤN ĐỀ: Supabase Security Advisor báo "RLS Policy Always True" cho contracts.
-- Policy hiện tại là `TO authenticated USING (true)` — chặn được người ngoài
-- Internet, NHƯNG bất kỳ nhân viên nào đã đăng nhập cũng đọc được lương toàn
-- công ty qua REST API. Giao diện có ẩn menu C&B theo gói dịch vụ, nhưng đó chỉ
-- là mã chạy trên trình duyệt — không khoá gì ở tầng CSDL.
--
-- CÁCH SIẾT: theo CỜ QUYỀN `can_view_salary` trong approval_permissions, KHÔNG
-- gắn cứng email vào SQL. Nhờ vậy đổi nhân sự không phải sửa SQL:
--   - Thu hồi quyền: bỏ tick trong User Permissions -> DB khoá ngay
--   - Người mới thay: tick vào -> có quyền ngay
-- Admin (allowed_users.role = 'Admin') luôn có quyền.
--
-- Khớp email dùng đúng quy ước toàn hệ thống: "email đã lưu CHỨA email đăng
-- nhập" — vì một người có thể lưu nhiều email (công ty + gmail) ngăn bởi dấu phẩy.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- ⚠ CHẠY BƯỚC 0 TRƯỚC và đối chiếu danh sách, rồi mới chạy phần còn lại.
-- ============================================================


-- ─── BƯỚC 0 — KIỂM TRA TRƯỚC KHI SIẾT (chạy riêng, đọc kết quả) ───
-- Phải thấy ĐỦ: Admin + Trưởng phòng HCNS + nhân viên C&B.
-- THIẾU AI thì vào User Permissions tick cờ "Xem lương & HĐLĐ" cho họ TRƯỚC,
-- nếu không người đó sẽ mất sạch dữ liệu trang C&B ngay khi chạy bước 2.
select
  p.name                                   as ho_ten,
  p.email                                  as email_da_luu,
  p.can_view_salary                        as co_co_xem_luong,
  exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(split_part(p.email, ',', 1)) and au.role = 'Admin'
  )                                        as la_admin
from public.approval_permissions p
where p.can_view_salary = true
order by p.name;

-- Xem thêm danh sách Admin (nhóm này luôn có quyền, không cần cờ):
select email, role from public.allowed_users where role = 'Admin' order by email;


-- ─── BƯỚC 1 — Hàm nhận diện Admin (idempotent) ───
-- Định nghĩa tại đây để không phụ thuộc migration 006 (có thể chưa chạy).
-- `set search_path` để không dính cảnh báo "Function Search Path Mutable".
create or replace function public.is_admin_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  );
$$;

-- Hàm nhận diện người được cấp cờ xem lương.
--
-- ⚠ BẮT BUỘC có điều kiện "email đăng nhập KHÁC RỖNG".
-- position('' in bất_kỳ_chuỗi_nào) = 1, nên nếu bỏ điều kiện này thì một phiên
-- KHÔNG có danh tính (email rỗng) sẽ khớp với MỌI dòng và được coi là có quyền
-- xem lương. Đã dính đúng bẫy này ở bản đầu — kiểm chứng bằng cách chạy hàm
-- trong SQL Editor (nơi không có JWT): phải trả về false.
create or replace function public.can_view_salary_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') <> ''
     and exists (
       select 1 from public.approval_permissions p
       where p.can_view_salary = true
         and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
     );
$$;


-- ─── BƯỚC 2 — Xoá TOÀN BỘ policy cũ rồi dựng lại whitelist ───
-- Xoá bằng vòng lặp động: tên policy cũ do người vận hành đặt tay, không đoán được.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'contracts'
  loop
    execute format('drop policy if exists %I on public.contracts', pol.policyname);
  end loop;
end $$;

alter table public.contracts enable row level security;

-- ĐỌC: chỉ Admin hoặc người có cờ "Xem lương & HĐLĐ"
create policy "contracts select salary team"
  on public.contracts for select to authenticated
  using (public.is_admin_caller() or public.can_view_salary_caller());

-- THÊM / SỬA / XOÁ: cùng nhóm đó (trang C&B nhập & cập nhật hợp đồng)
create policy "contracts insert salary team"
  on public.contracts for insert to authenticated
  with check (public.is_admin_caller() or public.can_view_salary_caller());

create policy "contracts update salary team"
  on public.contracts for update to authenticated
  using (public.is_admin_caller() or public.can_view_salary_caller())
  with check (public.is_admin_caller() or public.can_view_salary_caller());

create policy "contracts delete salary team"
  on public.contracts for delete to authenticated
  using (public.is_admin_caller() or public.can_view_salary_caller());

-- Thu hồi quyền của vai trò ẩn danh cho chắc (RLS không che GRANT cấp bảng).
revoke all on public.contracts from anon;
revoke all on public.contracts from public;
grant select, insert, update, delete on public.contracts to authenticated;


-- ─── BƯỚC 3 — KIỂM CHỨNG SAU KHI CHẠY ───
-- 3a. Phải thấy đúng 4 policy mới, không còn policy "always true" nào:
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'contracts'
order by cmd;

-- 3b. Chạy trong SQL Editor — nơi KHÔNG có danh tính đăng nhập (auth.jwt() rỗng).
--     CẢ HAI PHẢI TRẢ VỀ false. Nếu can_view_salary_caller ra true nghĩa là hàm
--     đang khớp nhầm email rỗng với mọi dòng -> chạy lại BƯỚC 1 bản mới nhất.
select public.is_admin_caller()       as phai_la_false,
       public.can_view_salary_caller() as cung_phai_la_false;

-- 3c. ĐO THẬT: đăng nhập vào app bằng 1 tài khoản NHÂN VIÊN THƯỜNG rồi mở
--     Console trình duyệt, chạy:
--        await supabase.from('contracts').select('*').limit(1)
--     Kết quả PHẢI là 0 dòng. Nếu vẫn ra dữ liệu là chưa siết được.
--     Làm lại với tài khoản C&B -> PHẢI ra dữ liệu bình thường.


-- ─── QUAY LUI (nếu trang C&B gãy) ───
-- Mở khoá tạm về trạng thái cũ, rồi bình tĩnh cấp cờ cho đúng người:
--
-- do $$
-- declare pol record;
-- begin
--   for pol in select policyname from pg_policies
--     where schemaname='public' and tablename='contracts'
--   loop execute format('drop policy if exists %I on public.contracts', pol.policyname); end loop;
-- end $$;
-- create policy "contracts tam mo lai" on public.contracts
--   for all to authenticated using (true) with check (true);
