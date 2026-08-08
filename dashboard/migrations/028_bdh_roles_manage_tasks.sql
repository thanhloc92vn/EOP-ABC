-- ============================================================
-- 028 — CHO CHỈ HUY TRƯỞNG / CHỈ HUY PHÓ QUYỀN QUẢN LÝ CÔNG VIỆC
--
-- VẤN ĐỀ:
-- Hai khối trong công ty đối xứng nhau về cấp quản lý:
--     Khối Văn phòng : Trưởng phòng  / Phó phòng   / Tổ trưởng
--     Khối Dự án     : Chỉ huy trưởng / Chỉ huy phó / Tổ trưởng
-- Nhưng hàm `caller_can_manage_tasks()` (migration 010) chỉ liệt kê chức danh
-- khối Văn phòng. Hậu quả: Chỉ huy trưởng một Ban điều hành dự án KHÔNG xoá
-- được công việc của chính ban mình — policy DELETE trên `tasks` chặn ở tầng
-- CSDL, dù giao diện có hiện nút.
--
-- `Tổ trưởng` đã có sẵn trong danh sách nên các tổ thuộc BĐH không bị ảnh hưởng;
-- chỉ thiếu đúng hai chức danh chỉ huy.
--
-- PHẠM VI: chỉ THÊM 2 dòng nhận diện chức danh. Không đụng policy, không đổi
-- cách hoạt động của bất kỳ luồng nào khác — mọi thứ đang chạy giữ nguyên.
--
-- ĐỒNG BỘ VỚI GIAO DIỆN: danh sách này phải khớp `canManageTasks` và
-- `isDeptManagerRole` trong dashboard/app/tasks/page.tsx. Sửa một bên mà quên
-- bên kia thì sinh ra cảnh nút bấm được nhưng lệnh bị CSDL từ chối (hoặc ngược
-- lại, giao diện ẩn nút nhưng gọi thẳng API vẫn xoá được).
--
-- LƯU Ý còn lệch (CỐ Ý, không sửa ở đây): `isManagerRole` trong
-- lib/approvers.ts còn nhận thêm "Kế toán trưởng" và "Trưởng bộ phận" cho luồng
-- DUYỆT nghỉ phép/công tác. Hai chức danh đó không có quyền quản lý công việc ở
-- cả giao diện lẫn CSDL — hiện đang nhất quán giữa hai nơi, đừng thêm một bên.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Dựng lại hàm với 2 chức danh bổ sung ───
-- Dùng `create or replace` nên mọi policy đang tham chiếu hàm này vẫn giữ nguyên,
-- không cần dựng lại policy.
create or replace function public.caller_can_manage_tasks()
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
    -- (b) Chức danh quản lý cấp đơn vị — HAI KHỐI NGANG QUYỀN NHAU
    or exists (
      select 1 from public.employees e
      where coalesce(auth.jwt() ->> 'email', '') <> ''
        and position(lower(auth.jwt() ->> 'email') in lower(coalesce(e.email, ''))) > 0
        and (
             lower(coalesce(e.role, '')) = 'admin'
          -- Khối Văn phòng
          or lower(coalesce(e.role, '')) like '%trưởng phòng%'
          or lower(coalesce(e.role, '')) like '%truong phong%'
          or lower(coalesce(e.role, '')) like '%phó phòng%'
          or lower(coalesce(e.role, '')) like '%pho phong%'
          -- Khối Dự án (THÊM MỚI ở migration 028)
          or lower(coalesce(e.role, '')) like '%chỉ huy trưởng%'
          or lower(coalesce(e.role, '')) like '%chi huy truong%'
          or lower(coalesce(e.role, '')) like '%chỉ huy phó%'
          or lower(coalesce(e.role, '')) like '%chi huy pho%'
          -- Dùng chung cho cả hai khối
          or lower(coalesce(e.role, '')) like '%tổ trưởng%'
          or lower(coalesce(e.role, '')) like '%to truong%'
          or lower(coalesce(e.role, '')) like '%giám đốc%'
          or lower(coalesce(e.role, '')) like '%giam doc%'
          or lower(coalesce(e.role, '')) like '%leader%'
        )
    )
    -- (c) Cờ cấp qua giao diện Cờ quyền người dùng
    or exists (
      select 1 from public.approval_permissions p
      where coalesce(auth.jwt() ->> 'email', '') <> ''
        and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
        and (p.can_view_all_tasks = true or p.can_manage_vpp = true)
    );
$$;

comment on function public.caller_can_manage_tasks() is
  'Người gọi có quyền quản lý công việc không. Gồm Admin, cờ can_view_all_tasks/can_manage_vpp, và chức danh quản lý cấp đơn vị của CẢ HAI khối: Trưởng/Phó phòng (Văn phòng) và Chỉ huy trưởng/phó (Dự án), cộng Tổ trưởng, Giám đốc, Leader. Phải khớp canManageTasks trong app/tasks/page.tsx.';

-- ─── 2. KIỂM TRA ───
-- 2a. Định nghĩa hàm phải chứa đủ 4 dòng chỉ huy (2 có dấu + 2 không dấu).
select
  (select count(*) from regexp_matches(
     pg_get_functiondef('public.caller_can_manage_tasks()'::regprocedure),
     'chỉ huy trưởng|chi huy truong|chỉ huy phó|chi huy pho', 'g')) as so_dong_chi_huy_phai_bang_4;

-- 2b. Ai trong danh sách nhân viên sẽ được thêm quyền sau migration này.
--     Chạy trước/sau đều ra cùng danh sách — đây là để BIẾT ai bị ảnh hưởng.
select name, role, department, email
from public.employees
where lower(coalesce(role, '')) like '%chỉ huy%'
   or lower(coalesce(role, '')) like '%chi huy%'
order by department, name;

-- 2c. Policy trên `tasks` vẫn còn nguyên (create or replace không đụng policy).
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'tasks'
order by cmd, policyname;
