-- ============================================================
-- 001 — NỀN MÓNG THƯƠNG MẠI HOÁ: tenant_config + departments
-- Chạy trong Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- An toàn chạy lại nhiều lần (idempotent).
-- ============================================================

-- ─── 1. BẢNG CẤU HÌNH CÔNG TY (thay các hằng số brand/format trong code) ───
create table if not exists tenant_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

-- Seed giá trị TNEC hiện tại (khớp 100% hành vi đang chạy — code sẽ fallback
-- về đúng các giá trị này nếu thiếu dòng config)
insert into tenant_config (key, value, description) values
  ('company_name',        '"Trung Nam E&C"',            'Tên công ty đầy đủ'),
  ('company_short',       '"TNEC"',                     'Tên viết tắt'),
  ('system_title',        '"PM - HCNS - TNEC"',         'Tiêu đề hệ thống (sidebar, tab trình duyệt)'),
  ('system_subtitle',     '"Hệ thống HCNS"',            'Phụ đề dưới tiêu đề sidebar'),
  ('logo_text',           '"TN"',                       'Chữ trong ô logo vuông'),
  ('contract_no_suffix',  '"TNE&C"',                    'Hậu tố số hợp đồng: 006335/2026/HĐTV/<suffix>'),
  ('email_sender_name',   '"Phòng HCNS TNEC"',          'Tên hiển thị người gửi email hệ thống'),
  ('chairman_name',       '"Huỳnh Giáp Nhân"',          'Người chủ trì cuộc họp mặc định (prompt AI biên bản)'),
  ('plan',                '"enterprise"',               'Gói dịch vụ: basic | professional | enterprise')
on conflict (key) do nothing; -- không ghi đè nếu đã chỉnh tay

-- ─── 2. BẢNG PHÒNG BAN (thay 7 bản copy DEPARTMENTS trong code) ───
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('phong_ban', 'bdh', 'ban_giam_doc')),
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into departments (name, type, sort_order) values
  -- 9 phòng ban (khớp cả 6 danh sách trong code)
  ('Phòng Hành Chính Nhân Sự', 'phong_ban', 10),
  ('Phòng Tài Chính Kế Toán',  'phong_ban', 20),
  ('Phòng Vật Tư Thiết Bị',    'phong_ban', 30),
  ('Phòng Thị Trường',         'phong_ban', 40),
  ('Phòng Kế Hoạch Đấu Thầu',  'phong_ban', 50),
  ('Phòng Kỹ Thuật',           'phong_ban', 60),
  ('Phòng An Toàn Lao Động',   'phong_ban', 70),
  ('Phòng Quản Lý Dự Án',      'phong_ban', 80),
  ('Phòng Thư Ký, Trợ Lý',     'phong_ban', 90),
  -- 10 Ban điều hành dự án (khớp cb + employees BDH_OPTIONS)
  ('BĐH Vàm Lẽo',               'bdh', 110),
  ('BĐH Rạch Xuyên Tâm',        'bdh', 120),
  ('BĐH Thường Phước',          'bdh', 130),
  ('BĐH XLNT Tây Ninh',         'bdh', 140),
  ('BĐH KCN Cà Ná',             'bdh', 150),
  ('BĐH Chống Hạn Ninh Thuận',  'bdh', 160),
  ('BĐH Tỉnh Lộ 8',             'bdh', 170),
  ('BĐH Cầu Mã Đà',             'bdh', 180),
  ('BĐH ĐMT Trà Vinh 2',        'bdh', 190),
  ('BĐH Hương Lộ 11',           'bdh', 200),
  ('BĐH ĐT 769',                'bdh', 210),
  ('BĐH ĐT 773',                'bdh', 220),
  -- Mục quản lý chi phí (administration + api_vpp)
  ('Giám đốc',                  'ban_giam_doc', 230),
  ('Phó Giám đốc',              'ban_giam_doc', 240)
on conflict (name) do nothing;

-- ─── 3. RLS: mọi người đăng nhập được ĐỌC, chỉ Admin được SỬA ───
alter table tenant_config enable row level security;
alter table departments   enable row level security;

-- Xoá toàn bộ policy cũ trước khi tạo (tránh policy rác chồng nhau)
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('tenant_config', 'departments')
  loop
    execute format('drop policy %I on %I', p.policyname, p.tablename);
  end loop;
end $$;

create policy "authenticated_read_config" on tenant_config
  for select to authenticated using (true);

-- Màn hình đăng nhập (chưa có session) cần đọc brand để hiển thị đúng tên
-- công ty — chỉ mở các khóa brand thuần hiển thị, không mở khóa nào khác.
create policy "anon_read_brand_config" on tenant_config
  for select to anon
  using (key in ('company_name', 'company_short', 'system_title', 'system_subtitle', 'logo_text'));

create policy "admin_write_config" on tenant_config
  for all to authenticated
  using (exists (
    select 1 from allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  ));

create policy "authenticated_read_departments" on departments
  for select to authenticated using (true);

-- Form Góp ý công khai (chưa đăng nhập) và các API route AI server-side
-- (không có session) cần đọc danh sách phòng ban. Tên phòng ban vốn đã
-- hiển thị công khai trên form Góp ý nên không lộ thông tin mới.
create policy "anon_read_departments" on departments
  for select to anon using (active = true);

create policy "admin_write_departments" on departments
  for all to authenticated
  using (exists (
    select 1 from allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  ));

-- ─── 4. KIỂM TRA KẾT QUẢ ───
select 'tenant_config' as bang, count(*) as so_dong from tenant_config
union all
select 'departments', count(*) from departments;
