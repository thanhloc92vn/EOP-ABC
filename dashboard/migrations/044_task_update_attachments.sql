-- ============================================================
-- 044 — ĐÍNH KÈM TỆP CHO DÒNG CẬP NHẬT THEO DÕI (ảnh / PDF, tối đa 2MB)
--
-- BÀI TOÁN: bảng "Danh sách việc theo dõi" chỉ cho gõ chữ. Mà một bước theo dõi
-- thực tế hay đi kèm bằng chứng: ảnh hiện trường vừa chụp, bản scan công văn
-- vừa nhận, PDF biên bản nghiệm thu. Trước đây phải đưa lên Drive rồi dán link
-- vào ô nội dung — link chết là mất luôn bằng chứng.
--
-- CHỈ MỘT CỘT, KHÔNG BUCKET MỚI: dùng lại kho riêng tư `task-files` của
-- migration 043. Kho đó đã đặt sẵn đúng thứ cần: private, chặn 2MB, chỉ nhận
-- ảnh + PDF, policy đọc cho mọi người đã đăng nhập và xoá chỉ cấp quản lý. Đẻ
-- thêm bucket thứ hai y hệt chỉ tạo chỗ để hai bên trôi lệch cấu hình.
--
-- Kiểu jsonb [{path, name}] — giống hệt `tasks.attachment_files`, để hai nơi
-- dùng chung một bộ hàm đọc/ghi trong lib/taskFiles.ts.
--
-- KHÔNG cần sửa RLS: cột nằm trên bảng `task_updates` đã bật RLS từ migration
-- 038; ai viết được dòng cập nhật thì viết được cột này.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > dán cả file > Run.
-- An toàn chạy lại nhiều lần.
-- PHỤ THUỘC: migration 038 (bảng task_updates) và 043 (bucket task-files).
-- ============================================================

alter table public.task_updates
  add column if not exists attachment_files jsonb not null default '[]'::jsonb;

-- ─── KIỂM TRA ───
-- 1. Cột đã có trên bảng task_updates
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'task_updates'
  and column_name = 'attachment_files';

-- 2. Kho tệp dùng chung vẫn đúng cấu hình (phải là public = false, 2097152)
select id, public, file_size_limit
from storage.buckets where id = 'task-files';
