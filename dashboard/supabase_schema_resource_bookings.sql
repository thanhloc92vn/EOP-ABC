-- SQL Schema cho module "Quản lý Đăng ký" (Đăng ký xe & Đăng ký phòng họp).
-- Copy toàn bộ, vào Supabase -> SQL Editor -> New Query, dán và chạy.

CREATE TABLE IF NOT EXISTS public.resource_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Loại đăng ký: 'xe' (Fortuner/Xpander) hoặc 'phong_hop' (Phòng họp lớn/nhỏ)
  booking_type TEXT NOT NULL CHECK (booking_type IN ('xe', 'phong_hop')),
  resource_name TEXT NOT NULL, -- 'Fortuner' | 'Xpander' | 'Phòng họp lớn' | 'Phòng họp nhỏ'

  host_name TEXT NOT NULL,          -- Người chủ trì
  requester_name TEXT,              -- Người gửi đăng ký
  requester_email TEXT,             -- Email người gửi (nhận mail kết quả)
  department TEXT,                  -- Phòng ban đăng ký

  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  content TEXT,                     -- Nội dung cuộc họp / mục đích sử dụng xe

  attendees JSONB DEFAULT '[]'::JSONB, -- Danh sách tên nhân viên tham dự (chọn từ danh bạ)
  attendee_count INT DEFAULT 0,        -- Số lượng người (tự tính khi chọn tên, cho phép sửa tay)

  participant_type TEXT DEFAULT 'noi_bo' CHECK (participant_type IN ('noi_bo', 'khach_hang')),
  customer_info TEXT,               -- Thông tin khách hàng (khi participant_type = 'khach_hang')
  notes TEXT,                       -- Ghi chú (order nước, trà, bánh kẹo, trái cây...)

  -- Luồng duyệt 2 cấp: Trưởng phòng xác nhận -> HCNS (điều phối xe & phòng họp) duyệt cuối
  status TEXT DEFAULT 'pending_manager' CHECK (status IN ('pending_manager', 'pending_hcns', 'approved', 'rejected')),
  manager_approved_by TEXT,
  manager_approved_at TIMESTAMPTZ,
  final_decision_by TEXT,
  final_decision_at TIMESTAMPTZ,
  reject_reason TEXT,
  email_sent BOOLEAN DEFAULT false
);

-- Theo pattern chung của hệ thống: client thao tác trực tiếp, RLS tắt
ALTER TABLE public.resource_bookings DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select for resource_bookings" ON public.resource_bookings;
CREATE POLICY "Allow public select for resource_bookings" ON public.resource_bookings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for resource_bookings" ON public.resource_bookings;
CREATE POLICY "Allow public insert for resource_bookings" ON public.resource_bookings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for resource_bookings" ON public.resource_bookings;
CREATE POLICY "Allow public update for resource_bookings" ON public.resource_bookings FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete for resource_bookings" ON public.resource_bookings;
CREATE POLICY "Allow public delete for resource_bookings" ON public.resource_bookings FOR DELETE USING (true);

-- ━━━ PHÂN QUYỀN DUYỆT CUỐI (HCNS - điều phối xe & phòng họp) ━━━
-- Thêm cột quyền duyệt đăng ký vào bảng approval_permissions hiện có
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS can_approve_booking BOOLEAN NOT NULL DEFAULT false;

-- Cấp quyền duyệt cuối cho chị Nguyễn Bích Như Quỳnh (phòng HCNS)
INSERT INTO public.approval_permissions (email, name, can_approve_booking)
SELECT email, name, true
FROM public.employees
WHERE name ILIKE '%Nguyễn Bích Như Quỳnh%'
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_permissions p WHERE p.name ILIKE '%Nguyễn Bích Như Quỳnh%'
  );

-- Nếu chị Quỳnh đã có sẵn dòng phân quyền thì chỉ bật cờ booking
UPDATE public.approval_permissions
SET can_approve_booking = true
WHERE name ILIKE '%Nguyễn Bích Như Quỳnh%';

-- Kiểm tra kết quả
SELECT * FROM public.approval_permissions;
