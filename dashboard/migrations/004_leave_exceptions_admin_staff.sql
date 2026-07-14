-- ============================================================
-- 004 — DỌN HARDCODE NGHIỆP VỤ NHỎ CÒN LẠI
-- 1. Bảng leave_exceptions: ngoại lệ duyệt cấp 1 đơn nghỉ 1 ngày
--    (thay 2 cặp hardcode Quỳnh->Hằng, Hoành Anh->Quyên trong approvers.ts)
-- 2. tenant_config thêm 3 khóa: site_url, hcns_head_name, admin_staff
-- 3. Mở rộng policy anon đọc tenant_config cho API server-side
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần (idempotent).
-- ============================================================

-- ─── 1. BẢNG NGOẠI LỆ DUYỆT NGHỈ 1 NGÀY ───
-- Mỗi dòng = "approver_name được duyệt cấp 1 đơn nghỉ 1 NGÀY của assignee_name".
-- Khớp tên kiểu "chứa, không phân biệt hoa thường & dấu" (giống hành vi cũ):
-- lưu "Quỳnh" sẽ khớp cả "Nguyễn Bích Như Quỳnh".
create table if not exists leave_exceptions (
  id uuid primary key default gen_random_uuid(),
  approver_name text not null,
  assignee_name text not null,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed đúng 2 cặp đặc cách hiện hành (không ghi đè nếu đã có)
insert into leave_exceptions (approver_name, assignee_name, note)
select v.approver_name, v.assignee_name, v.note
from (values
  ('Quỳnh',     'Hằng',  'Quỳnh xác nhận đơn nghỉ 1 ngày của Hằng (đặc cách quy định nội bộ)'),
  ('Hoành Anh', 'Quyên', 'Hoành Anh xác nhận đơn nghỉ 1 ngày của Quyên (đặc cách quy định nội bộ)')
) as v(approver_name, assignee_name, note)
where not exists (
  select 1 from leave_exceptions le
  where le.approver_name = v.approver_name and le.assignee_name = v.assignee_name
);

-- RLS: đăng nhập được đọc, chỉ Admin sửa (xoá hết policy cũ trước, tránh policy rác)
alter table leave_exceptions enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'leave_exceptions'
  loop
    execute format('drop policy %I on leave_exceptions', p.policyname);
  end loop;
end $$;

create policy "authenticated_read_leave_exceptions" on leave_exceptions
  for select to authenticated using (true);

create policy "admin_write_leave_exceptions" on leave_exceptions
  for all to authenticated
  using (exists (
    select 1 from allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  ));

-- ─── 2. TENANT_CONFIG: 3 KHÓA MỚI ───
insert into tenant_config (key, value, description) values
  ('site_url',       '"https://nhansutrungnamec.com"', 'URL hệ thống (link trong email khi thiếu header origin)'),
  ('hcns_head_name', '"Lê Thị Hoa Đào"',               'Trưởng phòng HCNS — người duyệt mặc định trong C&B'),
  ('saturday_exempt_names', '["Phạm Thành Lộc"]'::jsonb, 'Người được miễn làm thứ Bảy nhưng vẫn tính đủ công (bảng công C&B); khớp tên kiểu chứa, không dấu'),
  ('admin_staff',    '[
      {"name": "Như Quỳnh", "full_name": "Nguyễn Bích Như Quỳnh", "role": "Phó phòng Hành chính", "duties": "Phụ trách hậu cần, kho VPP, phòng họp, tiếp khách & làm hồ sơ thanh toán, đối soát hóa đơn"},
      {"name": "Thanh Hằng", "full_name": "", "role": "Văn thư", "duties": "Phụ trách tiếp nhận, phân loại, lưu trữ và chuyển phát công văn"},
      {"name": "Thanh Ngân", "full_name": "", "role": "Hành chính", "duties": "Phụ trách hỗ trợ công tác hành chính, quản lý văn phòng phẩm & cấp phát vật tư"}
    ]'::jsonb, 'Nhân sự hành chính (kanban VPP trang Hành chính): name khớp cột assignee của task')
on conflict (key) do nothing;

-- ─── 3. MỞ RỘNG POLICY ANON ĐỌC TENANT_CONFIG ───
-- API route server-side (gửi email, prompt AI) đọc config bằng anon key.
-- Các khóa mở thêm đều KHÔNG nhạy cảm hơn hiện trạng: email_sender_name,
-- chairman_name vốn đã nằm sẵn trong bundle JS client (TENANT_DEFAULTS).
drop policy if exists "anon_read_brand_config" on tenant_config;
create policy "anon_read_brand_config" on tenant_config
  for select to anon
  using (key in (
    'company_name', 'company_short', 'system_title', 'system_subtitle',
    'logo_text', 'email_sender_name', 'chairman_name', 'site_url'
  ));

-- ─── 4. KIỂM TRA KẾT QUẢ ───
select 'leave_exceptions' as bang, count(*) as so_dong from leave_exceptions
union all
select 'tenant_config', count(*) from tenant_config;
