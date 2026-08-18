-- ============================================================
-- 057 — Ý KIẾN TRAO ĐỔI TRONG CÔNG VIỆC (chat nhanh trong task)
--
-- BÀI TOÁN:
-- Người giao việc và người nhận việc đang trao đổi qua Zalo/miệng, còn ô "Ghi
-- chú" trên task thì chỉ MỘT dòng và người sau ghi đè người trước. Không có
-- chỗ nào lưu được mạch trao đổi "làm tới đâu rồi, vướng gì, ai dặn gì".
--
-- GIẢI PHÁP: bảng `task_comments` — mỗi ý kiến là MỘT DÒNG MỚI, hiện ngay
-- trong modal "Chỉnh sửa công việc", kèm tên + chức danh người viết.
--
-- ─── KHÔNG SỬA, KHÔNG XOÁ (user chốt 18/08/2026) ───
-- File này CỐ Ý không tạo policy UPDATE và DELETE. RLS mặc định là CẤM, nên
-- không có policy = không ai xoá/sửa được qua ứng dụng, kể cả bình luận của
-- chính mình. Đây là chủ ý: mạch trao đổi công việc phải giữ nguyên vẹn, xoá
-- được một câu là mất ngữ cảnh của cả đoạn sau. Cần gỡ một dòng sai (lộ thông
-- tin, gõ nhầm chỗ) thì Admin xoá tay trong SQL Editor.
-- Xoá task thì bình luận theo đó biến mất (on delete cascade).
--
-- ─── QUYỀN ĐỌC: KẾ THỪA NGUYÊN LUẬT CỦA BẢNG `tasks` ───
-- Policy dưới KHÔNG chép lại logic phòng ban, mà hỏi ngược `public.tasks`:
-- thấy được task thì thấy được bình luận của task đó. Policy được đánh giá dưới
-- danh nghĩa người gọi nên RLS của `tasks` (migration 045) vẫn áp cho câu hỏi
-- ngược này. Nhờ vậy hai bên KHÔNG BAO GIỜ trôi lệch nhau: sửa luật ở 045 là
-- bình luận tự đi theo.
--
-- BẢNG THỨ HAI `task_comment_reads` — dấu ĐÃ ĐỌC, phục vụ cái chuông.
-- Chuông ở Header vốn suy ra "việc cần xử lý" từ dữ liệu, KHÔNG lưu trạng thái
-- đã đọc. Thiếu bảng này thì một bình luận sẽ nằm lì trên chuông vĩnh viễn.
-- Mỗi người + mỗi task một dòng, cập nhật khi họ MỞ modal việc đó ra xem.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán toàn bộ file -> Run.
-- An toàn chạy lại nhiều lần.
-- PHỤ THUỘC: migration 045 (RLS đọc bảng tasks) đã chạy. Đã chạy trên TNEC.
-- ============================================================


-- ============================================================
-- 1. BẢNG Ý KIẾN
-- ============================================================
create table if not exists public.task_comments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  body         text not null,
  -- Email đăng nhập của người viết — dùng để so danh tính (không cho mạo danh)
  -- và để chuông biết "cái này của chính tôi thì đừng báo".
  author_email text not null,
  -- Tên + chức danh lưu DENORMALIZED ngay lúc gửi, đúng lối `created_by_name`
  -- của phiếu trình ký: người đổi chức danh hay nghỉ việc thì câu nói cũ vẫn
  -- giữ đúng danh nghĩa lúc họ nói.
  author_name  text,
  author_role  text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_task_comments_task    on public.task_comments (task_id, created_at);
create index if not exists idx_task_comments_created on public.task_comments (created_at desc);

alter table public.task_comments enable row level security;

-- Xoá sạch policy cũ bằng vòng lặp động thay vì đoán tên — chạy lại file vẫn sạch.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'task_comments'
  loop
    execute format('drop policy %I on public.task_comments', p.policyname);
  end loop;
end $$;

-- ĐỌC: thấy task thì thấy ý kiến của task đó (kế thừa RLS của `tasks`).
create policy "task_comments_read" on public.task_comments
  for select to authenticated
  using (
    exists (select 1 from public.tasks t where t.id = task_comments.task_id)
  );

-- VIẾT: cùng phạm vi đọc, THÊM điều kiện email phải là email đang đăng nhập.
-- Thiếu vế sau thì gọi thẳng PostgREST là ghi được bình luận đứng tên người khác.
create policy "task_comments_insert" on public.task_comments
  for insert to authenticated
  with check (
    exists (select 1 from public.tasks t where t.id = task_comments.task_id)
    and coalesce(auth.jwt() ->> 'email', '') <> ''
    and lower(btrim(author_email)) = lower(auth.jwt() ->> 'email')
  );

-- CỐ Ý KHÔNG CÓ policy UPDATE / DELETE — xem phần đầu file.


-- ============================================================
-- 2. DẤU ĐÃ ĐỌC (cho chuông)
-- ============================================================
create table if not exists public.task_comment_reads (
  user_email   text not null,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_email, task_id)
);

alter table public.task_comment_reads enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'task_comment_reads'
  loop
    execute format('drop policy %I on public.task_comment_reads', p.policyname);
  end loop;
end $$;

-- Dấu đã đọc là chuyện RIÊNG của từng người: chỉ đọc/ghi được dòng của chính
-- mình. Cần đủ 3 policy vì ứng dụng dùng UPSERT (insert lần đầu, update lần sau).
create policy "task_comment_reads_read" on public.task_comment_reads
  for select to authenticated
  using (lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "task_comment_reads_insert" on public.task_comment_reads
  for insert to authenticated
  with check (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and lower(user_email) = lower(auth.jwt() ->> 'email')
  );

create policy "task_comment_reads_update" on public.task_comment_reads
  for update to authenticated
  using (lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', '')));


-- ============================================================
-- 3. KIỂM TRA
-- ============================================================
-- 3.1 — task_comments phải có ĐÚNG 2 policy (SELECT + INSERT), không có
--       UPDATE/DELETE. Thấy dòng UPDATE hay DELETE ở đây là sai chủ ý.
select tablename, policyname, cmd, coalesce(qual, with_check, '—') as dieu_kien
from pg_policies
where schemaname = 'public' and tablename in ('task_comments', 'task_comment_reads')
order by tablename, cmd, policyname;

-- 3.2 — Đếm dòng (chạy trong SQL Editor là quyền chủ sở hữu, bỏ qua RLS).
select
  (select count(*) from public.task_comments)      as so_y_kien,
  (select count(*) from public.task_comment_reads) as so_dau_da_doc;

-- 3.3 — SAU KHI CHẠY, KIỂM TRA TRÊN GIAO DIỆN:
--   [ ] Mở /tasks -> bấm một thẻ -> thấy khối "Ý KIẾN TRAO ĐỔI" cuối modal
--   [ ] Gửi một ý kiến -> hiện ngay, đúng tên + chức danh mình
--   [ ] Tài khoản khác (người nhận task / trưởng phòng) -> chuông có thông báo
--   [ ] Mở modal task đó ra -> thông báo trên chuông tự tắt
--   [ ] Nhân viên phòng khác -> KHÔNG thấy ý kiến của task không liên quan


-- ============================================================
-- 4. GỠ NGAY NẾU CÓ SỰ CỐ   (dán riêng khối này vào SQL Editor)
-- ============================================================
-- Hai bảng này độc lập, gỡ đi không ảnh hưởng gì tới `tasks`:
--
-- drop table if exists public.task_comment_reads;
-- drop table if exists public.task_comments;
