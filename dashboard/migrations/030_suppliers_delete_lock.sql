-- ============================================================
-- 030 — KHOÁ QUYỀN XOÁ DANH MỤC NHÀ CUNG CẤP (`suppliers`)
--
-- VẤN ĐỀ:
-- Bảng `suppliers` đang mở cả 4 thao tác cho mọi tài khoản đăng nhập
-- (supabase_schema_public_tables_rls_hardening.sql: policy DELETE với điều kiện
-- `true`). Giao diện đã ẩn nút thùng rác với người không phải Admin
-- (administration/page.tsx > canDeleteSupplier), nhưng đó chỉ là lớp che: ai gọi
-- thẳng PostgREST bằng anon key vẫn xoá sạch danh mục. Xoá một nhà cung cấp còn
-- kéo theo các hồ sơ thanh toán đang tham chiếu tới nó.
--
-- PHẠM VI — CHỈ SIẾT DELETE:
-- SELECT / INSERT / UPDATE giữ nguyên như hiện tại (mọi tài khoản đăng nhập),
-- vì cả công ty vẫn tự thêm nhà cung cấp mới — đúng hiện trạng vận hành.
-- Chỉ XOÁ mới thu về Admin, khớp đúng điều kiện canDeleteSupplier ở giao diện.
--
-- VÌ SAO XOÁ SẠCH POLICY CŨ TRƯỚC:
-- Postgres nối các policy PERMISSIVE cùng lệnh bằng OR. Còn sót một policy
-- DELETE cũ nào mang điều kiện `true` (kể cả policy tạo tay ngoài repo, tên
-- khác nên `drop policy if exists "tên"` không bắt được) thì policy chặt bên
-- dưới VÔ NGHĨA. Nên quét động toàn bộ rồi dựng lại đủ 4 lệnh.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán và Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

alter table public.suppliers enable row level security;

-- ─── 1. Xoá TOÀN BỘ policy đang có trên bảng, bất kể tên gì ───
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'suppliers'
  loop
    execute format('drop policy %I on public.suppliers', pol.policyname);
  end loop;
end $$;

-- ─── 2. Dựng lại: 3 lệnh mở như cũ, riêng DELETE thu về Admin ───
create policy "suppliers select authenticated"
  on public.suppliers for select
  to authenticated
  using (true);

create policy "suppliers insert authenticated"
  on public.suppliers for insert
  to authenticated
  with check (true);

create policy "suppliers update authenticated"
  on public.suppliers for update
  to authenticated
  using (true)
  with check (true);

-- CHỈ Admin trong allowed_users mới xoá được.
create policy "suppliers delete admin only"
  on public.suppliers for delete
  to authenticated
  using (
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and au.role = 'Admin'
    )
  );

-- ─── 3. KIỂM TRA ───
-- Phải thấy đúng 4 dòng. Dòng DELETE phải có điều kiện allowed_users/Admin,
-- KHÔNG được là `true`.
select policyname as ten_policy, cmd as lenh, qual as dieu_kien
from pg_policies
where schemaname = 'public' and tablename = 'suppliers'
order by cmd, policyname;
