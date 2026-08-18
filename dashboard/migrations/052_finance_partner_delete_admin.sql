-- ============================================================
-- 052 — XOÁ ĐỐI TÁC THANH TOÁN: CHỈ ADMIN
--
-- Migration 048 để một policy `for all` duy nhất cho finance_partners: ai có cờ
-- can_view_reports thì thêm / sửa / XOÁ đều được. Chủ đích lúc đó là tránh nút
-- cổ chai — Ban điều hành phải tự thêm nhà thầu của mình.
--
-- Giữ nguyên phần thêm/sửa đó. Chỉ tách riêng quyền XOÁ về Admin, vì xoá một
-- đối tác là XOÁ CỨNG và kéo theo toàn bộ dòng hợp đồng của nó (khoá ngoại
-- `on delete cascade` ở bảng finance_partner_contracts) — bấm nhầm một cái là
-- mất cả số tài khoản lẫn danh sách hợp đồng, không có thùng rác để lấy lại.
--
-- KHÔNG đụng tới finance_partner_contracts: xoá một DÒNG HỢP ĐỒNG vẫn mở cho
-- người có cờ Báo cáo như cũ. Đó là việc sửa dữ liệu thường ngày, phạm vi hẹp.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. DỌN POLICY CŨ ───
-- Chỉ quét đúng bảng finance_partners. Xoá theo vòng lặp chứ không gọi tên:
-- file 048 đặt tên policy kiểu này, Supabase có thể sinh thêm kiểu khác, đoán
-- tên là bỏ sót và policy `for all` cũ sẽ sống sót, nuốt luôn luật mới.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'finance_partners'
  loop
    execute format('drop policy %I on public.finance_partners', p.policyname);
  end loop;
end $$;

-- ─── 2. DỰNG LẠI ĐỦ 4 LUẬT ───
-- Vòng lặp trên xoá sạch nên phải khai lại cả SELECT, không riêng DELETE.

create policy "reports_read_finance_partners" on public.finance_partners
  for select to authenticated
  using (public.is_admin_caller() or public.can_view_reports_caller());

create policy "reports_insert_finance_partners" on public.finance_partners
  for insert to authenticated
  with check (public.is_admin_caller() or public.can_view_reports_caller());

create policy "reports_update_finance_partners" on public.finance_partners
  for update to authenticated
  using (public.is_admin_caller() or public.can_view_reports_caller())
  with check (public.is_admin_caller() or public.can_view_reports_caller());

-- Điểm khác biệt duy nhất của file này.
create policy "admin_delete_finance_partners" on public.finance_partners
  for delete to authenticated
  using (public.is_admin_caller());

-- ─── 3. KIỂM TRA ───
-- Phải ra đúng 4 dòng, và dòng cmd = DELETE có qual chứa is_admin_caller
-- (KHÔNG được chứa can_view_reports_caller).
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'finance_partners'
order by cmd, policyname;

-- Bảng hợp đồng phải còn nguyên policy cũ của 048 (2 dòng: select + all).
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'finance_partner_contracts'
order by cmd, policyname;
