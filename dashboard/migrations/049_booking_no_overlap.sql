-- ============================================================================
-- 049: Chặn cứng trùng lịch xe / phòng họp ở mức DATABASE
--
-- Bối cảnh: 17/08/2026 phát hiện 2 đơn đăng ký Fortuner cùng ngày 19/8 đều được
-- duyệt. Phần mềm có kiểm tra trùng nhưng chỉ là cảnh báo window.confirm (bấm OK
-- là qua), khâu phê duyệt/điều phối không kiểm tra, và 2 người bấm gửi cùng lúc
-- thì cả 2 đều lọt (kiểm-tra-rồi-mới-ghi không nguyên tử).
--
-- Cách xử lý: dùng EXCLUDE constraint của Postgres — cùng một xe/phòng thì hai
-- khoảng thời gian KHÔNG được giao nhau. Đây là hàng rào cuối cùng: dù giao diện
-- có lỗi, dù gọi thẳng API, database vẫn từ chối.
--
-- ⚠️ CHẠY TRONG: Supabase → SQL Editor
-- ⚠️ BƯỚC 0 BẮT BUỘC: nếu dữ liệu còn dòng trùng thì lệnh tạo ràng buộc sẽ BÁO LỖI
--    và không tạo được. Chạy phần "BƯỚC 0" trước để soi, xử lý xong mới chạy tiếp.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- BƯỚC 0 — SOI CÁC LỊCH ĐANG TRÙNG (chạy riêng, chỉ đọc, không sửa gì)
-- Bôi đen đoạn này rồi bấm Run. Nếu ra 0 dòng → chạy thẳng BƯỚC 1.
-- Nếu ra dòng nào, vào phần mềm Từ chối hoặc Xoá bớt 1 trong 2 đơn rồi soi lại.
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT a.resource_name,
--        a.host_name  AS chu_tri_1, a.start_time AS bat_dau_1, a.end_time AS ket_thuc_1, a.status AS trang_thai_1,
--        b.host_name  AS chu_tri_2, b.start_time AS bat_dau_2, b.end_time AS ket_thuc_2, b.status AS trang_thai_2
-- FROM public.resource_bookings a
-- JOIN public.resource_bookings b
--   ON a.id < b.id
--  AND a.booking_type  = b.booking_type
--  AND a.resource_name = b.resource_name
--  AND a.start_time    < b.end_time
--  AND a.end_time      > b.start_time
-- WHERE a.status <> 'rejected'
--   AND b.status <> 'rejected'
-- ORDER BY a.start_time;


-- ─────────────────────────────────────────────────────────────────────────────
-- BƯỚC 1 — Tạo ràng buộc chặn trùng
-- ─────────────────────────────────────────────────────────────────────────────

-- btree_gist cho phép trộn so sánh bằng (=) với so sánh giao nhau (&&) trong
-- cùng một chỉ mục GiST. Không có nó thì không tạo được EXCLUDE kiểu này.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Chạy lại được nhiều lần: gỡ ràng buộc cũ trước khi tạo mới.
ALTER TABLE public.resource_bookings
  DROP CONSTRAINT IF EXISTS resource_bookings_no_overlap;

-- start_time/end_time có thể là timestamptz hoặc timestamp tuỳ lúc dựng bảng,
-- nên chọn đúng kiểu range tương ứng thay vì đoán.
DO $mig$
DECLARE
  coltype text;
BEGIN
  SELECT data_type INTO coltype
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'resource_bookings'
    AND column_name  = 'start_time';

  IF coltype IS NULL THEN
    RAISE EXCEPTION 'Không thấy bảng public.resource_bookings — kiểm tra lại tên bảng.';
  END IF;

  IF coltype = 'timestamp with time zone' THEN
    EXECUTE $q$
      ALTER TABLE public.resource_bookings
        ADD CONSTRAINT resource_bookings_no_overlap
        EXCLUDE USING gist (
          booking_type  WITH =,
          resource_name WITH =,
          tstzrange(start_time, end_time, '[)') WITH &&
        )
        WHERE (status <> 'rejected')
    $q$;
  ELSE
    EXECUTE $q$
      ALTER TABLE public.resource_bookings
        ADD CONSTRAINT resource_bookings_no_overlap
        EXCLUDE USING gist (
          booking_type  WITH =,
          resource_name WITH =,
          tsrange(start_time, end_time, '[)') WITH &&
        )
        WHERE (status <> 'rejected')
    $q$;
  END IF;
END
$mig$;

-- Ghi chú cách hoạt động:
--  • '[)' = chạm mép KHÔNG tính là trùng. Xe trả lúc 10:00 thì đơn khác bắt đầu
--    đúng 10:00 vẫn hợp lệ — đúng thực tế điều phối xe.
--  • WHERE (status <> 'rejected') = đơn đã Từ chối không giữ chỗ nữa, người khác
--    book lại được ngay. Đơn "Chờ duyệt" VẪN giữ chỗ (giữ chỗ theo thứ tự đăng ký).
--  • Đổi xe khi điều phối cũng bị kiểm tra, vì UPDATE cũng phải qua ràng buộc này.
--  • Muốn nhường xe cho Ban lãnh đạo: Từ chối hoặc Xoá lịch cũ trước, rồi book mới.

-- Kiểm tra lại sau khi chạy — phải thấy 1 dòng resource_bookings_no_overlap:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.resource_bookings'::regclass
--   AND conname  = 'resource_bookings_no_overlap';
