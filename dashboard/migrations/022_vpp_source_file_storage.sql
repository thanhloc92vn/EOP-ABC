-- ============================================================
-- 022 — LƯU PHIẾU YÊU CẦU VPP GỐC (ảnh / PDF / Excel)
-- (Hành chính > 5. VPP > tab 2 & 3 > Nhập file yêu cầu)
--
-- File gốc được tải lên bucket dùng chung 'clerical-documents',
-- trong thư mục con 'vpp-requests/'. Đường dẫn public được ghi
-- vào cột notes (JSON) của bảng `tasks` — KHÔNG cần bảng mới.
--
-- Việc duy nhất phải làm ở DB: bucket đang chặn MIME type của
-- Excel nên phiếu gốc dạng .xlsx/.xls sẽ bị Storage từ chối.
-- Migration này bổ sung 2 MIME type Excel vào danh sách cho phép.
--
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  -- .xlsx và .xls (phiếu yêu cầu VPP hầu hết là Excel)
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain'
]
WHERE id = 'clerical-documents';

-- Kiểm tra lại sau khi chạy:
-- SELECT id, public, file_size_limit, allowed_mime_types
-- FROM storage.buckets WHERE id = 'clerical-documents';
