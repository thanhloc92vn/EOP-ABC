-- FIX: cho phép sign_date (và expiration_date) NULL
-- Lý do: khi import danh sách theo dõi từ Excel, nhiều dòng là HĐ thử việc
-- chưa có ngày ký HĐLĐ, nên sign_date = NULL. Ràng buộc NOT NULL khiến toàn bộ
-- các dòng này bị từ chối khi lưu (báo nhầm là "trùng số HĐ").
-- Chạy trong Supabase Dashboard > SQL Editor.

ALTER TABLE public.contracts ALTER COLUMN sign_date DROP NOT NULL;
ALTER TABLE public.contracts ALTER COLUMN expiration_date DROP NOT NULL;

-- (Tùy chọn) đảm bảo upsert onConflict=contract_number hoạt động:
-- cần một UNIQUE constraint trên contract_number.
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_contract_number_key UNIQUE (contract_number);
