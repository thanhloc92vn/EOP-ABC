-- Thêm cột phụ hỗ trợ duyệt 2 cấp (Trưởng phòng/Tổ trưởng -> HCNS) cho đơn
-- Nghỉ phép và Công tác — vốn đang được lưu chung trong bảng `tasks` (dùng chung
-- với Kanban Quản lý Công việc). KHÔNG đổi cột `status` hiện có để không ảnh
-- hưởng tới 5 cột Kanban (planning/in_progress/pending_approval/need_revision/completed).
--
-- Cách hoạt động: khi status vẫn là 'pending_approval', cột `approval_stage` cho biết
-- đơn đang ở cấp nào: 'pending_manager' (chờ Trưởng phòng/Tổ trưởng xác nhận) hoặc
-- 'pending_hcns' (đã qua cấp 1, chờ HCNS duyệt cuối). NULL (đơn cũ trước khi có cột
-- này) mặc định được coi là 'pending_manager'.
--
-- Copy toàn bộ, vào Supabase -> SQL Editor -> New Query, dán và chạy.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS approval_stage TEXT,
  ADD COLUMN IF NOT EXISTS manager_approved_by TEXT,
  ADD COLUMN IF NOT EXISTS manager_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_decision_by TEXT,
  ADD COLUMN IF NOT EXISTS final_decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reject_reason TEXT,
  ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.tasks.approval_stage IS
  'Chỉ áp dụng cho đơn Nghỉ phép/Công tác: pending_manager -> pending_hcns. NULL = coi như pending_manager (đơn tạo trước khi có cột này).';
