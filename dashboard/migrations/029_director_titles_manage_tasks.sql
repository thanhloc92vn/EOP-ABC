-- ============================================================
-- 029 — ĐỒNG BỘ DANH SÁCH CHỨC DANH LÃNH ĐẠO VỚI GIAO DIỆN
--
-- BỐI CẢNH:
-- Giao diện Kanban (app/tasks/page.tsx) nay dùng `currentUser.isDirector`, tức
-- hàm `isDirectorRole()` trong lib/access.ts, để cho cấp lãnh đạo xoá việc và
-- kết luận "Đã hoàn thành". Hàm đó nhận 4 nhóm chữ:
--       giám đốc  |  ban lãnh đạo  |  chủ tịch  |  chairman
--
-- Trong khi `caller_can_manage_tasks()` (migration 010) mới chỉ có "giám đốc".
--
-- HẬU QUẢ NẾU KHÔNG CHẠY MIGRATION NÀY:
-- Người mang chức danh "Ban lãnh đạo" / "Chủ tịch" sẽ THẤY nút xoá nhưng bấm vào
-- bị RLS từ chối — đúng kiểu lỗi khó hiểu "nút bấm được mà không chạy".
-- Giám đốc và Phó Giám đốc KHÔNG bị ảnh hưởng: chuỗi '%giám đốc%' đã khớp sẵn cả
-- hai (kể cả "Phó Giám đốc"), nên hai chức danh đó chạy được ngay không cần
-- migration này. Chỉ chạy nếu công ty có người mang 2 chức danh còn lại.
--
-- PHẠM VI: chỉ THÊM dòng nhận diện chức danh. Không đụng policy, không đổi hành
-- vi của bất kỳ luồng nào khác.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

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
    -- (b) Chức danh quản lý — phải khớp canManageTasks trong app/tasks/page.tsx
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
          -- Khối Dự án (migration 028)
          or lower(coalesce(e.role, '')) like '%chỉ huy trưởng%'
          or lower(coalesce(e.role, '')) like '%chi huy truong%'
          or lower(coalesce(e.role, '')) like '%chỉ huy phó%'
          or lower(coalesce(e.role, '')) like '%chi huy pho%'
          -- Dùng chung cho cả hai khối
          or lower(coalesce(e.role, '')) like '%tổ trưởng%'
          or lower(coalesce(e.role, '')) like '%to truong%'
          or lower(coalesce(e.role, '')) like '%leader%'
          -- Lãnh đạo cấp cao — khớp đúng isDirectorRole() trong lib/access.ts.
          -- '%giám đốc%' phủ luôn "Phó Giám đốc" và "Tổng Giám đốc".
          or lower(coalesce(e.role, '')) like '%giám đốc%'
          or lower(coalesce(e.role, '')) like '%giam doc%'
          or lower(coalesce(e.role, '')) like '%ban lãnh đạo%'   -- THÊM Ở 029
          or lower(coalesce(e.role, '')) like '%ban lanh dao%'   -- THÊM Ở 029
          or lower(coalesce(e.role, '')) like '%chủ tịch%'       -- THÊM Ở 029
          or lower(coalesce(e.role, '')) like '%chu tich%'       -- THÊM Ở 029
          or lower(coalesce(e.role, '')) like '%chairman%'       -- THÊM Ở 029
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
  'Người gọi có quyền quản lý công việc không. Gồm Admin, cờ can_view_all_tasks/can_manage_vpp, chức danh quản lý cấp đơn vị của CẢ HAI khối (Trưởng/Phó phòng, Chỉ huy trưởng/phó, Tổ trưởng, Leader) và lãnh đạo cấp cao (Giám đốc, Ban lãnh đạo, Chủ tịch). Phải khớp canManageTasks trong app/tasks/page.tsx và isDirectorRole trong lib/access.ts.';

-- ─── KIỂM TRA ───
-- 1. Đủ 5 nhóm chữ lãnh đạo trong định nghĩa hàm (giám đốc / ban lãnh đạo /
--    chủ tịch / chairman, cả có dấu lẫn không dấu) -> phải trả về 7.
select
  (select count(*) from regexp_matches(
     pg_get_functiondef('public.caller_can_manage_tasks()'::regprocedure),
     'giám đốc|giam doc|ban lãnh đạo|ban lanh dao|chủ tịch|chu tich|chairman', 'g')) as so_dong_lanh_dao_phai_bang_7;

-- 2. Ai trong danh sách nhân viên thuộc diện lãnh đạo cấp cao.
select name, role, department, email
from public.employees
where lower(coalesce(role, '')) ~ 'giám đốc|giam doc|ban lãnh đạo|ban lanh dao|chủ tịch|chu tich|chairman'
order by department, name;

-- 3. Policy trên `tasks` còn nguyên.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'tasks'
order by cmd, policyname;
