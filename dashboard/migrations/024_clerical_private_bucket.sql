-- ============================================================
-- 024 — KHO RIÊNG TƯ CHO VĂN THƯ (`clerical-private`)
--
-- VẤN ĐỀ:
-- Công văn đi/đến đang nằm trong bucket `clerical-documents` với cờ
-- public = true. Đường dẫn dạng
--     https://<project>.supabase.co/storage/v1/object/public/clerical-documents/<tên tệp>
-- mở được từ BẤT KỲ máy nào trên Internet, không cần đăng nhập — kể cả người
-- đã nghỉ việc. Migration 019 siết RLS cho BẢNG `clerical_documents` rất chặt,
-- nhưng RLS của bảng không bảo vệ được TỆP nằm trong Storage.
--
-- VÌ SAO KHÔNG ĐƠN GIẢN ĐỔI `clerical-documents` THÀNH PRIVATE:
-- Bucket đó đang dùng chung với 2 module khác — Hành chính (thư mục
-- `invoices/`) và Góp ý (thư mục `suggestions/`, form CÔNG KHAI cho người
-- chưa đăng nhập). Đổi cờ public là cấp bucket, sẽ làm gãy cả hai. Nên ở bước
-- này dựng bucket RIÊNG cho văn thư; hai module kia xử lý sau.
--
-- PHẠM VI MIGRATION NÀY: chỉ tạo kho mới + phân quyền. Tệp công văn CŨ vẫn
-- nằm ở bucket công khai cho tới khi chạy script chuyển kho
-- (scripts/migrate-clerical-to-private.mjs) — xem bước 4.
--
-- QUYỀN: bám đúng hai cấp mà migration 019 đã đặt cho bảng clerical_documents
--   ĐỌC/TẢI  — Admin hoặc cờ can_view_documents
--   GHI/XOÁ  — Admin hoặc cờ can_manage_documents
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. HAI HÀM KIỂM QUYỀN ───
-- Tách ra hàm để policy của Storage và của bảng dùng chung một định nghĩa,
-- tránh cảnh sửa một nơi quên nơi kia (bài học từ migration 019).
create or replace function public.caller_can_view_documents()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.allowed_users au
      where au.role = 'Admin' and au.email ilike auth.email()
    )
    or exists (
      select 1 from public.approval_permissions p
      where p.can_view_documents = true
        and p.email ilike '%' || auth.email() || '%'
    )
    or exists (
      select 1 from public.approval_permissions p
      where p.can_manage_documents = true
        and p.email ilike '%' || auth.email() || '%'
    );
$$;

create or replace function public.caller_can_manage_documents()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.allowed_users au
      where au.role = 'Admin' and au.email ilike auth.email()
    )
    or exists (
      select 1 from public.approval_permissions p
      where p.can_manage_documents = true
        and p.email ilike '%' || auth.email() || '%'
    );
$$;

-- ─── 2. BUCKET RIÊNG TƯ ───
-- Bọc bắt lỗi: SQL Editor chạy cả script trong MỘT transaction, thiếu quyền
-- ghi storage.* sẽ kéo đổ luôn hai hàm ở trên (bài học từ migration 023).
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'clerical-private',
    'clerical-private',
    false,
    10485760, -- 10MB (rộng hơn mức 5MB giao diện đang chặn, để có chỗ xoay xở)
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  )
  on conflict (id) do update set
    public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  raise notice 'Bucket clerical-private đã sẵn sàng (private, 10MB).';
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG tạo được bucket bằng SQL (%). Vào Supabase > Storage > New bucket, tên đúng "clerical-private", BỎ TICK Public.', sqlerrm;
end $$;

-- ─── 3. POLICY CHO BUCKET ───
do $$
begin
  execute 'drop policy if exists "clerical private select viewer" on storage.objects';
  execute 'drop policy if exists "clerical private insert manager" on storage.objects';
  execute 'drop policy if exists "clerical private update manager" on storage.objects';
  execute 'drop policy if exists "clerical private delete manager" on storage.objects';

  execute $p$
    create policy "clerical private select viewer"
      on storage.objects for select to authenticated
      using (bucket_id = 'clerical-private' and public.caller_can_view_documents())
  $p$;

  execute $p$
    create policy "clerical private insert manager"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'clerical-private' and public.caller_can_manage_documents())
  $p$;

  execute $p$
    create policy "clerical private update manager"
      on storage.objects for update to authenticated
      using (bucket_id = 'clerical-private' and public.caller_can_manage_documents())
      with check (bucket_id = 'clerical-private' and public.caller_can_manage_documents())
  $p$;

  execute $p$
    create policy "clerical private delete manager"
      on storage.objects for delete to authenticated
      using (bucket_id = 'clerical-private' and public.caller_can_manage_documents())
  $p$;

  raise notice 'Đã đặt 4 policy cho bucket clerical-private.';
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG đặt được policy storage (%). Tạo tay trong Supabase > Storage > clerical-private > Policies, xem bước 5c.', sqlerrm;
end $$;

-- ─── 4. KIỂM TRA ───
-- 4a. Bucket phải là private
select id, public, file_size_limit from storage.buckets where id = 'clerical-private';

-- 4b. Phải đúng 4 policy
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'clerical private%'
order by cmd;

-- 4c. Bao nhiêu công văn còn trỏ vào bucket CÔNG KHAI — đây là số tệp mà
--     script chuyển kho sẽ phải xử lý. Về 0 nghĩa là đã chuyển xong hết.
select count(*) as con_o_kho_cong_khai
from public.clerical_documents
where scan_file_url like '%/object/public/clerical-documents/%'
   or original_file_url like '%/object/public/clerical-documents/%';

-- 4d. Bao nhiêu công văn đã nằm ở kho riêng tư (tiền tố `private:`)
select count(*) as da_o_kho_rieng_tu
from public.clerical_documents
where scan_file_url like 'private:%' or original_file_url like 'private:%';

-- ─── 5. GHI CHÚ VẬN HÀNH ───
-- 5a. Sau migration này, công văn TẢI LÊN MỚI đi thẳng vào kho riêng tư.
-- 5b. Công văn CŨ vẫn ở kho công khai cho tới khi chạy:
--        node scripts/migrate-clerical-to-private.mjs
--     (cần SUPABASE_SERVICE_ROLE_KEY — xem hướng dẫn trong chính tệp script)
-- 5c. Nếu bước 3 báo WARNING, tạo tay 4 policy cho vai trò `authenticated`:
--        SELECT : bucket_id = 'clerical-private' and public.caller_can_view_documents()
--        INSERT : bucket_id = 'clerical-private' and public.caller_can_manage_documents()
--        UPDATE : bucket_id = 'clerical-private' and public.caller_can_manage_documents()
--        DELETE : bucket_id = 'clerical-private' and public.caller_can_manage_documents()
