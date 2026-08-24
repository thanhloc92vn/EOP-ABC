-- ============================================================
-- 066 — GHI NHẬN CHỦ ĐÍCH: THƯ KÝ / TRỢ LÝ ĐƯỢC TÍNH LÀ BAN LÃNH ĐẠO
--
-- KHÔNG ĐỔI HÀNH VI. File này chỉ sửa `comment on function` để ghi lại một
-- quyết định, vì nếu không ghi thì lần sau người đọc mã (kể cả AI) sẽ tưởng là
-- lỗi và "sửa" mất — hôm nay đã suýt xảy ra đúng như vậy.
--
-- CHUYỆN ĐÃ XẢY RA:
-- `is_director_caller()` của migration 065 nhận diện lãnh đạo bằng cách dò
-- chuỗi 'giám đốc' trong `employees.role`. Chuỗi đó khớp luôn hai chức danh
-- giúp việc, phát hiện khi chạy mục 5b của 065 trên dữ liệu thật:
--
--   Đinh Thị Hồng Vân    — "Thư ký phó giám đốc" — Phòng Quản Lý Dự Án
--   Đoàn Thị Minh Thường — "Trợ lý Giám Đốc"     — Phòng Thư Ký, Trợ Lý
--
-- Ban đầu việc này được báo lên như một lỗ hổng, kèm bản vá loại trừ chức danh
-- giúp việc. USER BÁC BỎ (24/08/2026): cho thư ký và trợ lý thấy toàn bộ là CÓ
-- CHỦ ĐÍCH — họ làm việc thay mặt lãnh đạo nên cần đọc được đủ hồ sơ. Bản vá
-- loại trừ đã bị huỷ, không đưa vào repo.
--
-- ⚠ HỆ QUẢ CẦN BIẾT — CHỌN THEO CHỨC DANH LÀ CHỌN CẢ TƯƠNG LAI:
-- Điều kiện là "chức danh có chứa chữ giám đốc", nên BẤT KỲ chức danh nào thêm
-- sau này mà chứa chuỗi đó cũng TỰ ĐỘNG đọc được toàn bộ phiếu trình ký và
-- toàn bộ kế hoạch tài chính — không cần ai cấp quyền, không có cảnh báo.
-- Ví dụ chưa tồn tại nhưng rất dễ phát sinh: "Lái xe Giám đốc", "Tạp vụ Ban
-- Giám đốc". Ai thêm chức danh kiểu đó vào Danh sách nhân viên thì phải cân
-- nhắc, hoặc quay lại thu hẹp điều kiện ở đây.
--
-- Mục 2 bên dưới là câu truy vấn để RÀ ĐỊNH KỲ ai đang được hưởng quyền này.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần. YÊU CẦU: đã chạy 065.
-- ============================================================

-- ─── 1. GHI CHỦ ĐÍCH VÀO CHÍNH ĐỊNH NGHĨA HÀM ───
-- Định nghĩa hàm giữ NGUYÊN như 065 — chỉ thay phần chú thích.
comment on function public.is_director_caller() is
  'Người gọi có thuộc diện Ban lãnh đạo không (Giám đốc/Phó GĐ/Tổng GĐ, Ban lãnh đạo, Chủ tịch, Chairman). CÓ CHỦ ĐÍCH bao gồm cả thư ký/trợ lý của lãnh đạo — chức danh chứa chữ "giám đốc" nên khớp, và user đã xác nhận 24/08/2026 rằng họ CẦN thấy toàn bộ để làm việc thay mặt lãnh đạo. ĐỪNG "sửa" thành loại trừ thư ký/trợ lý; xem migration 066. Danh sách chức danh khớp isDirectorRole() trong lib/access.ts.';

-- ─── 2. RÀ SOÁT: AI ĐANG THẤY TOÀN BỘ ───
-- Chạy lại câu này mỗi khi thêm chức danh mới có chữ "giám đốc".
-- Mọi người trong danh sách đều đọc được TOÀN BỘ phiếu trình ký và kế hoạch TC.
select
  e.name,
  e.role,
  e.department,
  case
    when lower(coalesce(e.role, '')) ~ 'thư ký|thu ky|trợ lý|tro ly|phụ tá|phu ta'
      then 'giúp việc lãnh đạo — cho phép có chủ đích'
    else 'lãnh đạo'
  end as dien
from public.employees e
where lower(coalesce(e.role, '')) ~
      'giám đốc|giam doc|ban lãnh đạo|ban lanh dao|chủ tịch|chu tich|chairman'
order by dien, e.department, e.name;
