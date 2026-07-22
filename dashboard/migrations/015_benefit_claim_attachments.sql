-- ============================================================
-- 015 — CHỨNG TỪ ĐÍNH KÈM CHO PHIẾU CHI PHÚC LỢI
-- (C&B > Phúc lợi > Hiếu hỷ & Trợ cấp)
--
-- Ảnh/PDF giấy đăng ký kết hôn, giấy nhập viện, giấy chứng tử... nhạy
-- cảm hơn công văn hay ảnh góp ý, nên KHÔNG dùng bucket public
-- 'clerical-documents' như các module cũ. Bucket riêng, private, chỉ
-- tài khoản đã đăng nhập đọc được, và app phát link ký hạn giờ.
--
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. CỘT LƯU CHỨNG TỪ ───
-- Lưu ĐƯỜNG DẪN trong bucket (không lưu URL) vì bucket private, link xem
-- phải ký lại mỗi lần mở.
alter table public.benefit_claims add column if not exists attachment_path text;
alter table public.benefit_claims add column if not exists attachment_name text;
alter table public.benefit_claims add column if not exists attachment_type text;

-- ─── 2. BUCKET RIÊNG TƯ ───
-- Chặn ngay ở tầng bucket: tối đa 5MB và chỉ nhận ảnh/PDF. Kiểm tra phía
-- trình duyệt có thể bị bỏ qua nếu gọi thẳng API, chốt này thì không.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'benefit-attachments',
  'benefit-attachments',
  false,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─── 3. QUYỀN TRÊN BUCKET ───
drop policy if exists "benefit attachments select authenticated" on storage.objects;
drop policy if exists "benefit attachments insert authenticated" on storage.objects;
drop policy if exists "benefit attachments update authenticated" on storage.objects;
drop policy if exists "benefit attachments delete approver"      on storage.objects;

-- Đọc: mọi tài khoản đã đăng nhập (link ký hạn giờ do app phát)
create policy "benefit attachments select authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'benefit-attachments');

-- Tải lên: mọi tài khoản đã đăng nhập (người lập phiếu tự đính chứng từ)
create policy "benefit attachments insert authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'benefit-attachments');

create policy "benefit attachments update authenticated"
  on storage.objects for update to authenticated
  using (bucket_id = 'benefit-attachments')
  with check (bucket_id = 'benefit-attachments');

-- Xoá file: chỉ người có quyền duyệt phúc lợi (hàm từ migration 013)
create policy "benefit attachments delete approver"
  on storage.objects for delete to authenticated
  using (bucket_id = 'benefit-attachments' and public.caller_can_approve_benefit());

-- ─── 4. CHO NGƯỜI LẬP PHIẾU ĐÍNH KÈM CHỨNG TỪ ───
-- Migration 013 chỉ cho người có cờ duyệt UPDATE bảng benefit_claims, nên
-- người lập phiếu không ghi được đường dẫn chứng từ vào phiếu của chính mình.
-- Mở thêm: sửa được phiếu CỦA MÌNH khi phiếu CÒN ĐANG CHỜ DUYỆT, và
-- with check ràng trạng thái vẫn phải là 'Chờ phê duyệt' -> không tự duyệt được.
drop policy if exists "benefit_claims update own pending" on public.benefit_claims;
create policy "benefit_claims update own pending"
  on public.benefit_claims for update to authenticated
  using (created_by ilike auth.email() and status = 'Chờ phê duyệt')
  with check (created_by ilike auth.email() and status = 'Chờ phê duyệt');

-- ─── 5. KIỂM TRA KẾT QUẢ ───
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'benefit-attachments';

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'benefit_claims'
order by cmd, policyname;
