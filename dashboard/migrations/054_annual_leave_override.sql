-- ============================================================
-- 054 — CHO ADMIN CHỈNH TAY CỘT "TỔNG PHÉP"
--
-- HIỆN TRẠNG:
-- Cột "Tổng phép" ở C&B > Chấm công > Nghỉ phép là số TÍNH RA, không lưu ở đâu:
--   tổng phép = 12 (cơ bản) + floor(thâm niên / 5)
-- Nên mọi trường hợp thực tế lệch công thức (nhận việc giữa năm, thoả thuận
-- riêng, chuyển công ty trong tập đoàn giữ nguyên phép cũ...) đều KHÔNG sửa được.
--
-- CÁCH SỬA:
-- Thêm MỘT cột ghi đè. NULL = để hệ thống tự tính như cũ; có số = dùng số đó.
-- Không đụng tới công thức, không đụng tới bảng nào khác.
--
-- QUYỀN GHI: KHÔNG cần policy mới. Migration 007 đã khoá UPDATE trên
-- `employees` sau hàm `can_manage_employees_caller()` (Admin trong allowed_users
-- HOẶC cờ can_manage_employees) — đúng phạm vi người dùng yêu cầu.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

alter table public.employees
  add column if not exists annual_leave_override integer;

comment on column public.employees.annual_leave_override is
  'Tổng ngày phép năm do Admin nhập tay. NULL = tự tính 12 + floor(thâm niên/5).';

-- ─── KIỂM TRA KẾT QUẢ ───
-- Mong đợi: 1 dòng, data_type = integer, is_nullable = YES.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'employees'
  and column_name = 'annual_leave_override';
