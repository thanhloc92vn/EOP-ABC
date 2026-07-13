-- ============================================================
-- 002 — BƯỚC 4: SEED CỜ QUYỀN cho những người đang có quyền theo
-- TÊN hardcode trong code (cb, employees, calendar).
--
-- Chiến lược an toàn: code hiện chạy SONG SONG (cờ trong bảng
-- approval_permissions là nguồn chính, check tên là fallback).
-- Chạy file này để cờ có dữ liệu thật -> theo dõi 1-2 tuần không ai
-- mất quyền -> khi đó mới xoá check tên trong code.
--
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Bổ sung cột cờ nếu thiếu (idempotent) ───
alter table approval_permissions add column if not exists can_approve_trip boolean not null default false;
alter table approval_permissions add column if not exists can_approve_leave boolean not null default false;
alter table approval_permissions add column if not exists can_approve_justification boolean not null default false;
alter table approval_permissions add column if not exists can_approve_booking boolean not null default false;
alter table approval_permissions add column if not exists can_view_suggestions boolean not null default false;
alter table approval_permissions add column if not exists can_manage_employees boolean not null default false;
alter table approval_permissions add column if not exists can_view_salary boolean not null default false;
alter table approval_permissions add column if not exists can_view_attendance_imports boolean not null default false;
alter table approval_permissions add column if not exists can_view_all_tasks boolean not null default false;
alter table approval_permissions add column if not exists supervises_name text;

-- ─── 2. Đảm bảo 5 người có dòng trong approval_permissions ───
-- Email lấy từ hồ sơ employees theo tên (employees.email có thể chứa nhiều
-- email phân cách dấu phẩy -> lấy email đầu tiên).
insert into approval_permissions (email)
select distinct trim(split_part(e.email, ',', 1))
from employees e
where e.name in (
    'Lại Nguyễn Lan Phương',
    'Dương Nhật Hoành Anh',
    'Lê Thị Hoa Đào',
    'Huỳnh Giáp Nhân',
    'Nguyễn Duy Hưng'
  )
  and coalesce(trim(e.email), '') <> ''
  and not exists (
    select 1 from approval_permissions ap
    where position(lower(trim(split_part(e.email, ',', 1))) in lower(coalesce(ap.email, ''))) > 0
  );

-- ─── 3. Set cờ theo đúng quyền mỗi người đang có theo tên ───

-- Lại Nguyễn Lan Phương (HR staff) + Lê Thị Hoa Đào (TP. HCNS):
-- toàn quyền C&B + quản lý hồ sơ + xem kho bảng công / xoá lịch công tác
update approval_permissions ap
set can_manage_employees = true,
    can_view_salary = true,
    can_view_attendance_imports = true
from employees e
where e.name in ('Lại Nguyễn Lan Phương', 'Lê Thị Hoa Đào')
  and position(lower(trim(split_part(e.email, ',', 1))) in lower(coalesce(ap.email, ''))) > 0;

-- Dương Nhật Hoành Anh (Tổ trưởng Nhân sự): toàn quyền C&B + quản lý hồ sơ
update approval_permissions ap
set can_manage_employees = true,
    can_view_salary = true
from employees e
where e.name = 'Dương Nhật Hoành Anh'
  and position(lower(trim(split_part(e.email, ',', 1))) in lower(coalesce(ap.email, ''))) > 0;

-- Huỳnh Giáp Nhân + Nguyễn Duy Hưng (Ban giám đốc): xem toàn bộ C&B/lương
update approval_permissions ap
set can_view_salary = true
from employees e
where e.name in ('Huỳnh Giáp Nhân', 'Nguyễn Duy Hưng')
  and position(lower(trim(split_part(e.email, ',', 1))) in lower(coalesce(ap.email, ''))) > 0;

-- ─── 4. KIỂM TRA KẾT QUẢ ───
-- 4a. Cờ đã seed cho 5 người (mỗi người phải có ít nhất 1 dòng, cờ đúng như trên)
select e.name, e.role, e.department,
       ap.email as perm_email,
       ap.can_manage_employees, ap.can_view_salary, ap.can_view_attendance_imports
from employees e
left join approval_permissions ap
  on position(lower(trim(split_part(e.email, ',', 1))) in lower(coalesce(ap.email, ''))) > 0
where e.name in (
  'Lại Nguyễn Lan Phương', 'Dương Nhật Hoành Anh', 'Lê Thị Hoa Đào',
  'Huỳnh Giáp Nhân', 'Nguyễn Duy Hưng'
)
order by e.name;

-- 4b. QUAN TRỌNG — kiểm tra cột role của 2 sếp: các check role-based
-- ("giám đốc") trong code chỉ chạy khi employees.role có chữ "Giám đốc".
-- Nếu cột role của Huỳnh Giáp Nhân / Nguyễn Duy Hưng đang trống hoặc sai,
-- hãy sửa trực tiếp trong Table Editor (VD: 'Tổng Giám đốc', 'Phó Giám đốc').
