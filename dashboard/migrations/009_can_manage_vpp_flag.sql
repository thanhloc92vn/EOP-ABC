-- ============================================================
-- 009 — CỜ `can_manage_vpp` (thay 3 email viết cứng)
--
-- VẤN ĐỀ:
-- app/tasks/page.tsx trước đây quyết định "ai được thấy mọi phiếu VPP" bằng
-- cách so 3 địa chỉ gmail viết thẳng trong mã nguồn:
--     nhuquynh.nguyenbich@gmail.com / thanhhangg25697@gmail.com / quyen.0408@gmail.com
-- Chỗ này sót lại sau đợt dọn hardcode (commit 287c708). Hệ quả đúng như vấn
-- đề đã biết của tính năng bàn giao: khi một trong ba người nghỉ việc, người
-- tiếp nhận KHÔNG thấy phiếu VPP, và "Bàn giao & Khoá tài khoản" không sửa
-- được vì tên nằm trong code chứ không phải dữ liệu.
--
-- SAU MIGRATION NÀY:
-- Quyền đó là cờ trong bảng -> cấp/thu hồi ngay tại Cài đặt -> Cờ quyền người
-- dùng, và tự chuyển sang người tiếp nhận khi bàn giao.
--
-- LƯU Ý: điều kiện "phòng ban chứa 'hành chính' / 'nhân sự'" trong code KHÔNG
-- đổi — cờ này chỉ thay phần đặc cách theo email.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Thêm cột ───
alter table public.approval_permissions
  add column if not exists can_manage_vpp boolean not null default false;

-- ─── 2. Cấp cho đúng 3 người đang được hardcode, để hành vi không đổi ───
-- Khớp kiểu "chứa" vì cột email lưu 2 địa chỉ trong 1 ô ("mail công ty, gmail").
update public.approval_permissions
set can_manage_vpp = true
where lower(coalesce(email, '')) like '%nhuquynh.nguyenbich@gmail.com%'
   or lower(coalesce(email, '')) like '%thanhhangg25697@gmail.com%'
   or lower(coalesce(email, '')) like '%quyen.0408@gmail.com%';

-- ─── 3. KIỂM TRA ───
-- Mong đợi: đúng những người phụ trách VPP hiện tại.
-- Nếu ra ÍT HƠN 3 dòng: gmail trong approval_permissions khác với chuỗi
-- hardcode cũ (vd đã đổi mail) -> cấp tay bằng giao diện Cờ quyền người dùng,
-- KHÔNG cần sửa SQL.
select name, email, can_manage_vpp
from public.approval_permissions
where can_manage_vpp = true
order by name;
