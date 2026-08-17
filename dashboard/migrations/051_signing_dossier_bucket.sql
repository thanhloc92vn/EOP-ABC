-- ============================================================
-- 051 — KHO RIÊNG TƯ CHO HỒ SƠ TRÌNH KÝ (`signing-dossiers`)
--
-- Chứa file gốc người lập tải lên để AI bóc tách: hợp đồng, biên bản nghiệm
-- thu, bảng xác định giá trị đề nghị thanh toán. Đây là căn cứ để đối chiếu khi
-- sếp hỏi "số này ở đâu ra", nên phải giữ lại chứ không chỉ giữ kết quả bóc.
--
-- BẮT BUỘC PRIVATE: giá trị hợp đồng, tiến độ giải ngân, tên nhà thầu — bucket
-- public thì dán được link cho bất kỳ ai trên Internet, RLS của bảng
-- signing_submissions không che nổi tệp nằm trong Storage (bài học migration 024).
--
-- QUYỀN: bám đúng luồng migration 050 —
--   ĐỌC/TẢI  : ai có chân trong luồng (signing_is_participant)
--   GHI/XOÁ  : Admin hoặc người được cấp cờ lập phiếu
--
-- VÌ SAO TÁCH KHỎI 050: SQL Editor chạy cả file trong MỘT transaction, mà lệnh
-- trên storage.* rất hay vướng quyền. Gộp chung thì một lỗi ở đây kéo rollback
-- sạch cả bảng + RLS đã tạo. Mỗi khối dưới đây còn được bọc thêm `exception` để
-- lỗi chỉ thành cảnh báo, không đổ cả file.
--
-- YÊU CẦU: đã chạy 050 trước (cần 2 hàm signing_is_participant /
-- can_create_signing_caller).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. BUCKET ───
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'signing-dossiers',
    'signing-dossiers',
    false,
    26214400, -- 25MB, khớp trần tổng dung lượng của api/analyze-signing-dossier
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  )
  on conflict (id) do update set
    public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  raise notice 'Bucket signing-dossiers da san sang (private, 25MB).';
exception
  when insufficient_privilege or others then
    raise warning 'KHONG tao duoc bucket bang SQL (%). Vao Supabase > Storage > New bucket, ten dung "signing-dossiers", BO TICK Public.', sqlerrm;
end $$;

-- ─── 2. POLICY ───
do $$
begin
  execute 'drop policy if exists "signing dossier select participant" on storage.objects';
  execute 'drop policy if exists "signing dossier insert creator" on storage.objects';
  execute 'drop policy if exists "signing dossier update creator" on storage.objects';
  execute 'drop policy if exists "signing dossier delete creator" on storage.objects';

  execute $p$
    create policy "signing dossier select participant"
      on storage.objects for select to authenticated
      using (bucket_id = 'signing-dossiers' and public.signing_is_participant())
  $p$;

  execute $p$
    create policy "signing dossier insert creator"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'signing-dossiers'
                  and (public.is_admin_caller() or public.can_create_signing_caller()))
  $p$;

  execute $p$
    create policy "signing dossier update creator"
      on storage.objects for update to authenticated
      using (bucket_id = 'signing-dossiers'
             and (public.is_admin_caller() or public.can_create_signing_caller()))
      with check (bucket_id = 'signing-dossiers'
                  and (public.is_admin_caller() or public.can_create_signing_caller()))
  $p$;

  execute $p$
    create policy "signing dossier delete creator"
      on storage.objects for delete to authenticated
      using (bucket_id = 'signing-dossiers'
             and (public.is_admin_caller() or public.can_create_signing_caller()))
  $p$;

  raise notice 'Da dat 4 policy cho bucket signing-dossiers.';
exception
  when insufficient_privilege or others then
    raise warning 'KHONG dat duoc policy storage (%). Tao tay trong Supabase > Storage > signing-dossiers > Policies.', sqlerrm;
end $$;

-- ─── 3. KIỂM TRA ───
-- 3a. Bucket phải là private (public = false)
select id, public, file_size_limit from storage.buckets where id = 'signing-dossiers';

-- 3b. Phải đúng 4 policy
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'signing dossier%'
order by policyname;
