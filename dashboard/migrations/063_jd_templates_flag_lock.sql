-- ============================================================
-- 063 — SIẾT QUYỀN GHI THƯ VIỆN JD: chỉ Admin hoặc người được cấp cờ
--        `can_view_candidates` (thay luật "chủ dòng hoặc Admin" của 062)
--
-- VÌ SAO ĐỔI:
-- Migration 062 để quyền theo kiểu "ai cũng thêm được, chủ dòng thì sửa/xoá
-- được dòng của mình" — giống danh mục cung đường công tác. Với thư viện JD thì
-- luật đó sai: JD là tài sản dùng chung của cả đợt tuyển, ai cũng sửa được bản
-- của mình nghĩa là mỗi người một bản, và người đúng nghiệp vụ tuyển dụng lại
-- KHÔNG dọn được bản sai do người khác tạo.
--
-- LUẬT MỚI: THÊM / SỬA / XOÁ đều đòi Admin hoặc cờ `can_view_candidates` —
-- đúng bằng nhóm người được XEM module Tuyển dụng trên giao diện. Quyền sở hữu
-- dòng không còn ý nghĩa: người có cờ sửa/xoá được MỌI bản JD.
--
-- ĐỌC: giữ nguyên "mọi tài khoản đã đăng nhập" như 062. JD là bản mô tả công
-- việc đăng tuyển công khai lên TopCV/VietnamWorks, không phải hồ sơ ứng viên.
--
-- CỘT `created_by` GIỮ LẠI để biết ai đặt bản JD đó, dù không còn dùng để phân
-- quyền — bỏ cột đi là mất dấu vết, mà cột vẫn có ích khi cần hỏi lại người viết.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ file -> Run.
-- An toàn chạy lại nhiều lần. PHẢI chạy 062 trước.
-- ============================================================

-- ─── 1. HAI HÀM KIỂM QUYỀN ───
--
-- Khai lại `is_admin_caller` cho chắc: chạy file này trên một Supabase mới dựng
-- cho khách khác mà chưa chạy đủ migration cũ thì policy bên dưới lỗi "function
-- does not exist" giữa chừng, và vì SQL Editor chạy trong MỘT transaction nên
-- toàn bộ file rollback sạch, rất khó lần ra nguyên nhân.
-- Lệnh idempotent, chạy trên TNEC là no-op.
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

-- Cờ can_view_candidates. Khớp kiểu "email đã lưu CHỨA email đăng nhập" giống
-- toàn bộ hệ cờ quyền hiện có (một người có thể khai nhiều email trong một ô).
--
-- ⚠ BẮT BUỘC có điều kiện "email đăng nhập KHÁC RỖNG".
-- position('' in bất_kỳ_chuỗi_nào) = 1, nên thiếu điều kiện này thì một phiên
-- KHÔNG có danh tính sẽ khớp MỌI dòng và được coi là có quyền. Đã dính đúng bẫy
-- này ở migration 018 — kiểm chứng bằng cách chạy hàm trong SQL Editor (nơi
-- không có JWT): phải trả về false.
create or replace function public.can_view_candidates_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') <> ''
     and exists (
       select 1 from public.approval_permissions p
       where p.can_view_candidates = true
         and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
     );
$$;

-- ─── 2. DỰNG LẠI POLICY ───
alter table public.jd_templates enable row level security;

-- Xoá TOÀN BỘ policy cũ bằng vòng lặp thay vì đoán tên — kể cả 4 policy do 062
-- tạo, và chạy lại file này nhiều lần vẫn sạch.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'jd_templates'
  loop
    execute format('drop policy %I on public.jd_templates', p.policyname);
  end loop;
end $$;

-- ĐỌC: mọi tài khoản đã đăng nhập (giữ nguyên như 062).
create policy "auth_read_jd_templates" on public.jd_templates
  for select to authenticated
  using (true);

-- THÊM: Admin hoặc cờ can_view_candidates, và phải tự đứng tên.
-- Ràng buộc created_by giữ lại thuần để ghi dấu vết: nó chặn việc gán bản JD
-- cho email người khác ngay từ lúc tạo.
create policy "flag_insert_jd_templates" on public.jd_templates
  for insert to authenticated
  with check (
    (public.is_admin_caller() or public.can_view_candidates_caller())
    and lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- SỬA: Admin hoặc cờ can_view_candidates — sửa được MỌI bản, không riêng bản
-- của mình. `with check` lặp lại đúng điều kiện để không ai sửa xong rồi đẩy
-- dòng sang trạng thái mình không còn quyền đụng tới.
create policy "flag_update_jd_templates" on public.jd_templates
  for update to authenticated
  using (public.is_admin_caller() or public.can_view_candidates_caller())
  with check (public.is_admin_caller() or public.can_view_candidates_caller());

-- XOÁ: Admin hoặc cờ can_view_candidates.
create policy "flag_delete_jd_templates" on public.jd_templates
  for delete to authenticated
  using (public.is_admin_caller() or public.can_view_candidates_caller());

-- ─── 3. KIỂM TRA NHANH SAU KHI CHẠY ───
-- Chạy trong SQL Editor (không có JWT) -> cả hai phải trả về false:
--   select public.is_admin_caller(), public.can_view_candidates_caller();
--
-- Xem lại danh sách policy đang áp:
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'jd_templates' order by cmd;
