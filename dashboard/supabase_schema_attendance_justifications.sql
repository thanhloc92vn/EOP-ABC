-- Lệnh SQL khởi tạo bảng quản lý giải trình chấm công trên Supabase
-- Vui lòng truy cập trang Supabase -> SQL Editor -> Tạo truy vấn mới, dán đoạn code này và nhấn Run.

CREATE TABLE IF NOT EXISTS public.attendance_justifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  reason TEXT NOT NULL,
  propose TEXT NOT NULL,
  approver TEXT NOT NULL,
  status TEXT DEFAULT 'Chờ duyệt' CHECK (status IN ('Chờ duyệt', 'Đã duyệt'))
);

-- Vô hiệu hoá RLS để client-side có thể tự do đọc/ghi dữ liệu (thuận tiện cho môi trường phát triển)
ALTER TABLE public.attendance_justifications DISABLE ROW LEVEL SECURITY;

-- Tạo các Policy công khai để đảm bảo quyền truy cập đọc/ghi hoạt động tốt trong mọi cấu hình RLS:
DROP POLICY IF EXISTS "Allow public select for attendance_justifications" ON public.attendance_justifications;
CREATE POLICY "Allow public select for attendance_justifications" ON public.attendance_justifications FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for attendance_justifications" ON public.attendance_justifications;
CREATE POLICY "Allow public insert for attendance_justifications" ON public.attendance_justifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for attendance_justifications" ON public.attendance_justifications;
CREATE POLICY "Allow public update for attendance_justifications" ON public.attendance_justifications FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete for attendance_justifications" ON public.attendance_justifications;
CREATE POLICY "Allow public delete for attendance_justifications" ON public.attendance_justifications FOR DELETE USING (true);
