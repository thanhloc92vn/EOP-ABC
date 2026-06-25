-- Lệnh SQL khởi tạo bảng quản lý lịch trình đi công tác trên Supabase
-- Vui lòng truy cập trang Supabase -> SQL Editor -> Tạo truy vấn mới, dán đoạn code này và nhấn Run.

CREATE TABLE IF NOT EXISTS public.business_trips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  name TEXT NOT NULL,
  dest TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  purpose TEXT NOT NULL,
  cost NUMERIC DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'Đã duyệt' NOT NULL,
  task_id UUID
);

-- Vô hiệu hoá RLS để client-side có thể tự do đọc/ghi dữ liệu
ALTER TABLE public.business_trips DISABLE ROW LEVEL SECURITY;

-- Tạo các Policy công khai để đảm bảo quyền truy cập đọc/ghi hoạt động tốt
DROP POLICY IF EXISTS "Allow public select for business_trips" ON public.business_trips;
CREATE POLICY "Allow public select for business_trips" ON public.business_trips FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for business_trips" ON public.business_trips;
CREATE POLICY "Allow public insert for business_trips" ON public.business_trips FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for business_trips" ON public.business_trips;
CREATE POLICY "Allow public update for business_trips" ON public.business_trips FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete for business_trips" ON public.business_trips;
CREATE POLICY "Allow public delete for business_trips" ON public.business_trips FOR DELETE USING (true);
