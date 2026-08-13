-- ============================================================
-- 043 — ĐÍNH KÈM TỆP CHO CÔNG VIỆC (ảnh / PDF, tối đa 2MB)
--
-- BÀI TOÁN: form giao việc mới chỉ có ô "Link sản phẩm đính kèm" — người giao
-- phải tự đưa tệp lên Drive rồi dán link về. Ảnh hiện trường, bản scan công văn,
-- PDF bản vẽ là thứ gửi kèm hàng ngày, nên cho đính thẳng vào việc.
--
-- HAI PHẦN:
--   1. Kho tệp RIÊNG TƯ `task-files` — không đặt public như bucket của Góp ý /
--      Hành chính. Ảnh hiện trường và bản scan là tài liệu nội bộ; bucket public
--      nghĩa là ai cầm được đường dẫn cũng mở được, kể cả người đã nghỉ việc.
--      Giới hạn 2MB + chỉ nhận ảnh/PDF đặt NGAY Ở ĐÂY chứ không chỉ chặn trên
--      giao diện — chặn mỗi ở giao diện thì gọi thẳng API vẫn tải tệp 500MB lên.
--   2. Cột `tasks.attachment_files` (jsonb) — danh sách [{path, name}].
--      Dùng jsonb chứ không phải một cột text: một việc thường kèm 2-3 tấm ảnh,
--      và còn phải giữ TÊN GỐC của tệp để hiện cho người xem (đường dẫn trong
--      kho có gắn dấu thời gian chống trùng, đọc rất khó).
--
-- CỘT `attachments` (số đếm) đã có sẵn từ trước và đang được thẻ Kanban dùng để
-- hiện biểu tượng cái kẹp giấy, nhưng CHƯA AI GHI vào nên luôn bằng 0. Nay ghi
-- đúng số tệp vào đó -> cái kẹp giấy trên thẻ tự sáng, không phải sửa giao diện
-- thẻ. Lệnh dưới chỉ bảo đảm cột tồn tại, không đụng dữ liệu cũ.
--
-- QUYỀN ĐỌC TỆP: mọi nhân sự đã đăng nhập. Đây là mức khớp với bảng `tasks`
-- hiện tại (bảng task chưa siết RLS theo phòng — việc đó là hạng mục riêng).
-- Đặt chặt hơn bảng ở đây chỉ tạo cảnh nhìn thấy việc mà mở không được tệp.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. CỘT TRÊN BẢNG tasks ───
alter table public.tasks
  add column if not exists attachment_files jsonb not null default '[]'::jsonb;

-- Cột đếm cho cái kẹp giấy trên thẻ Kanban — thêm nếu bảng chưa có.
alter table public.tasks
  add column if not exists attachments integer not null default 0;

-- ─── 2. KHO TỆP RIÊNG TƯ ───
-- Bọc bắt lỗi: SQL Editor chạy cả script trong MỘT transaction, thiếu quyền ghi
-- storage.* sẽ kéo đổ luôn phần cột ở trên (bài học từ migration 023).
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'task-files',
    'task-files',
    false,
    2097152, -- 2MB, đúng mức giao diện đang chặn
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'
    ]
  )
  on conflict (id) do update set
    public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  raise notice 'Bucket task-files đã sẵn sàng (private, 2MB, ảnh + PDF).';
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG tạo được bucket bằng SQL (%). Vào Supabase > Storage > New bucket, tên đúng "task-files", BỎ TICK Public, đặt file size limit 2MB.', sqlerrm;
end $$;

-- ─── 3. POLICY CHO BUCKET ───
-- Xoá theo tên rồi tạo lại — chạy lại file vẫn sạch.
do $$
begin
  execute 'drop policy if exists "task files select authenticated" on storage.objects';
  execute 'drop policy if exists "task files insert authenticated" on storage.objects';
  execute 'drop policy if exists "task files update authenticated" on storage.objects';
  execute 'drop policy if exists "task files delete authenticated" on storage.objects';
  execute 'drop policy if exists "task files delete manager" on storage.objects';

  execute $p$
    create policy "task files select authenticated"
      on storage.objects for select to authenticated
      using (bucket_id = 'task-files')
  $p$;

  execute $p$
    create policy "task files insert authenticated"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'task-files')
  $p$;

  execute $p$
    create policy "task files update authenticated"
      on storage.objects for update to authenticated
      using (bucket_id = 'task-files')
      with check (bucket_id = 'task-files')
  $p$;

  -- XOÁ: chỉ cấp quản lý (cùng hàm đang gác nút xoá task của migration 010).
  -- Một tệp có thể được NHIỀU việc dùng chung — giao một việc cho 3 người là 3
  -- dòng task cùng trỏ vào một tệp — nên không để ai cũng xoá được.
  execute $p$
    create policy "task files delete manager"
      on storage.objects for delete to authenticated
      using (bucket_id = 'task-files' and public.caller_can_manage_tasks())
  $p$;

  raise notice 'Đã đặt 4 policy cho bucket task-files.';
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG đặt được policy storage (%). Tạo tay trong Supabase > Storage > task-files > Policies.', sqlerrm;
end $$;

-- ─── 4. KIỂM TRA ───
-- 4a. Bucket phải private, đúng 2MB
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'task-files';

-- 4b. Policy của bucket
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'task files%'
order by cmd;

-- 4c. Hai cột trên bảng tasks
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'tasks'
  and column_name in ('attachment_files', 'attachments')
order by column_name;
