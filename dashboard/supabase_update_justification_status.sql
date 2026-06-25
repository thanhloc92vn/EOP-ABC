-- Truy cập Supabase -> SQL Editor -> Chạy đoạn mã này để cập nhật ràng buộc trạng thái của bảng giải trình công
-- Bước 1: Xóa ràng buộc cũ (nếu có)
ALTER TABLE public.attendance_justifications DROP CONSTRAINT IF EXISTS attendance_justifications_status_check;

-- Bước 2: Cập nhật dữ liệu cũ từ 'Chờ duyệt' sang 'Chưa duyệt' trước khi tạo ràng buộc mới để tránh lỗi
UPDATE public.attendance_justifications SET status = 'Chưa duyệt' WHERE status = 'Chờ duyệt';

-- Bước 3: Tạo ràng buộc mới chỉ chấp nhận 'Chưa duyệt' hoặc 'Đã duyệt'
ALTER TABLE public.attendance_justifications ADD CONSTRAINT attendance_justifications_status_check CHECK (status IN ('Chưa duyệt', 'Đã duyệt'));

-- Bước 4: Thiết lập giá trị mặc định cho các dòng mới là 'Chưa duyệt'
ALTER TABLE public.attendance_justifications ALTER COLUMN status SET DEFAULT 'Chưa duyệt';
