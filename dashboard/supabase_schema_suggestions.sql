-- Lệnh SQL khởi tạo bảng quản lý góp ý & kiến nghị trên Supabase
-- Vui lòng truy cập trang Supabase -> SQL Editor -> Tạo truy vấn mới, dán đoạn code này và nhấn Run.

CREATE TABLE IF NOT EXISTS suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  department TEXT,
  sender_name TEXT,
  sender_contact TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'resolved', 'archived')),
  response TEXT,
  attachment_url TEXT
);

-- Tạo Index để tối ưu hoá tốc độ truy vấn theo trạng thái và thời gian tạo
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
CREATE INDEX IF NOT EXISTS idx_suggestions_created_at ON suggestions(created_at);

-- Vô hiệu hoá RLS để client-side có thể tự do đọc/ghi dữ liệu (thuận tiện cho môi trường phát triển)
ALTER TABLE suggestions DISABLE ROW LEVEL SECURITY;
