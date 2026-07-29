-- ============================================================
-- 019 — Tách quyền Văn thư: XEM (can_view_documents) vs SỬA/XOÁ (can_manage_documents)
--
-- VẤN ĐỀ: cờ can_view_documents đang gộp cả hai. Ai được đặc cách XEM là:
--   - Giao diện: thấy nguyên cột "Thao tác" (Sửa/Xoá) + nút "Lưu công văn mới".
--   - CSDL: policy INSERT/UPDATE/DELETE của clerical_documents cũng chỉ đòi cờ XEM,
--     nên gọi thẳng Supabase API vẫn sửa/xoá được công văn dù có ẩn nút ở UI.
--
-- SAU MIGRATION:
--   can_view_documents   -> SELECT (xem nhật ký công văn, tải file đính kèm)
--   can_manage_documents -> INSERT/UPDATE/DELETE (nhân viên văn thư)
--   Admin  -> full như cũ.
--
-- ⚠ KHÔNG tự bật cờ mới cho ai (kể cả người đang có cờ XEM) — làm vậy là tái lập
--   đúng lỗ hổng cần vá. Sau khi chạy, vào Cài đặt hệ thống > User Permissions và
--   tick "Văn thư — Sửa / Xoá" cho ĐÚNG nhân viên văn thư. Bước 4 liệt kê sẵn
--   những ai đang có cờ XEM để bạn đối chiếu.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Thêm cột cờ mới ───
alter table public.approval_permissions
  add column if not exists can_manage_documents boolean not null default false;

-- ─── 2. Xoá TOÀN BỘ policy cũ trên clerical_documents ───
-- (quét động pg_policies — không đoán tên policy cũ để tránh sót)
alter table public.clerical_documents enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'clerical_documents'
  loop
    execute format('drop policy if exists %I on public.clerical_documents;', pol.policyname);
  end loop;
end $$;

-- ─── 3. Dựng lại policy theo 2 cấp quyền ───
-- 3a. XEM: Admin hoặc cờ can_view_documents (giữ nguyên hành vi cũ)
create policy "clerical_documents_select_authorized"
  on public.clerical_documents for select
  to authenticated
  using (
    exists (select 1 from public.allowed_users au where au.role = 'Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap where ap.can_view_documents = true and ap.email ilike '%' || auth.email() || '%')
  );

-- 3b. THÊM: Admin hoặc cờ can_manage_documents
create policy "clerical_documents_insert_manage"
  on public.clerical_documents for insert
  to authenticated
  with check (
    exists (select 1 from public.allowed_users au where au.role = 'Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap where ap.can_manage_documents = true and ap.email ilike '%' || auth.email() || '%')
  );

-- 3c. SỬA: Admin hoặc cờ can_manage_documents
create policy "clerical_documents_update_manage"
  on public.clerical_documents for update
  to authenticated
  using (
    exists (select 1 from public.allowed_users au where au.role = 'Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap where ap.can_manage_documents = true and ap.email ilike '%' || auth.email() || '%')
  )
  with check (
    exists (select 1 from public.allowed_users au where au.role = 'Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap where ap.can_manage_documents = true and ap.email ilike '%' || auth.email() || '%')
  );

-- 3d. XOÁ: Admin hoặc cờ can_manage_documents
create policy "clerical_documents_delete_manage"
  on public.clerical_documents for delete
  to authenticated
  using (
    exists (select 1 from public.allowed_users au where au.role = 'Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap where ap.can_manage_documents = true and ap.email ilike '%' || auth.email() || '%')
  );

-- ─── 4. KIỂM TRA ───
-- 4a. Policy trên bảng: phải đúng 4 dòng (select / insert / update / delete)
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'clerical_documents'
order by cmd;

-- 4b. Ai đang XEM được Văn thư, ai đã được cấp quyền SỬA/XOÁ.
--     Dòng nào "chỉ xem" mà đúng ra phải sửa được -> tick cờ trong User Permissions.
select name, email, can_view_documents, can_manage_documents
from public.approval_permissions
where can_view_documents = true or can_manage_documents = true
order by can_manage_documents desc, name;
