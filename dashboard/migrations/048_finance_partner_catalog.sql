-- ============================================================
-- 048 — DANH MỤC ĐỐI TÁC THANH TOÁN (module Báo cáo > Kế hoạch thu chi)
--
-- MỤC ĐÍCH:
-- Ban điều hành lập kế hoạch tài chính tháng bằng file Excel
-- (public/templates/TNEC_ke_hoach_tai_chinh_thang.xlsx), mỗi tháng gõ lại tay
-- từ đầu. Hệ quả đo được trên chính file đó: 95 tên "Khách hàng" khác nhau
-- nhưng thực chất chỉ là 49 đơn vị — Yên Phúc bị gõ 7 kiểu, Minh Khang 5,
-- Trung Quân 4. Không tổng hợp được theo nhà thầu, và không nơi nào lưu SỐ TÀI
-- KHOẢN / CHI NHÁNH ngân hàng nên kế toán phải tra lại hợp đồng giấy mỗi lần.
--
-- Migration này dựng danh mục chuẩn để lần sau CHỌN thay vì GÕ.
--
-- VÌ SAO KHÔNG DÙNG LẠI BẢNG `suppliers`:
-- `suppliers` là danh mục nhà cung cấp HÀNH CHÍNH của HCNS (thuê văn phòng,
-- máy lạnh, chuyển phát nhanh) đang nuôi màn hình "Thanh toán định kỳ" ở
-- /administration. Đổ 49 nhà thầu xây dựng vào đó sẽ làm ngập màn hình HCNS và
-- trộn hai luồng nghiệp vụ không liên quan.
--
-- VÌ SAO 2 BẢNG:
-- Số tài khoản thuộc về ĐƠN VỊ (đổi 1 lần, dùng chung mọi dự án). Số hợp đồng
-- và nội dung thanh toán thuộc về cặp ĐỐI TÁC × DỰ ÁN — SMC có HĐ riêng ở Dung
-- Quất và ở Tỉnh lộ 8; Minh Khang có 4 HĐ khác nhau trên Thường Phước. Gộp 1
-- bảng thì đổi số tài khoản Minh Khang phải sửa 4 dòng.
--
-- TIỀN TỐ `finance_`, KHÔNG PHẢI `plan_`: trong repo này "plan" đã mang nghĩa
-- gói thương mại (lib/plan.ts, lib/planShared.ts) — đặt `plan_partners` sẽ đọc
-- nhầm thành "đối tác của gói dịch vụ".
--
-- DANH MỤC ĐỐI TÁC ĐỂ TRỐNG: bản đầu có seed sẵn 49 đơn vị gộp từ file Excel,
-- nhưng 17/08/2026 user chốt bỏ để tự nhập tay. Mục 5 dọn nốt 49 dòng đó khỏi
-- CSDL. ĐỪNG seed lại danh sách mẫu vào file này.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ file -> Run.
--
-- An toàn chạy lại nhiều lần. NGOẠI LỆ DUY NHẤT: mục 5 xoá theo danh sách 49
-- tên cũ, nên nếu sau này bạn tự tạo một nhà thầu TRÙNG ĐÚNG một trong 49 tên đó
-- rồi chạy lại file này, dòng vừa tạo sẽ bị xoá. Nhập xong danh mục của mình rồi
-- thì không cần chạy lại file này nữa.
-- ============================================================

-- ─── 1. BẢNG ĐỐI TÁC ───
create table if not exists public.finance_partners (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,       -- Tên chuẩn (dùng để đối chiếu)
  short_name   text,                       -- Tên gọi tắt, để tìm nhanh: "Yên Phúc"
  party_type   text not null default 'nha_thau_phu'
               check (party_type in ('nha_thau_phu','nha_cung_cap','chu_dau_tu','ca_nhan')),
  tax_code     text,
  bank_account text,                       -- Số tài khoản
  bank_name    text,                       -- Ngân hàng
  bank_branch  text,                       -- Chi nhánh / PGD
  note         text,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_finance_partners_active on public.finance_partners (active);

create or replace function public.finance_partners_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists finance_partners_touch_trg on public.finance_partners;
create trigger finance_partners_touch_trg
  before update on public.finance_partners
  for each row execute function public.finance_partners_touch();

-- ─── 2. BẢNG HỢP ĐỒNG / NỘI DUNG THANH TOÁN THEO DỰ ÁN ───
-- LƯU CẢ MÃ LẪN TÊN DỰ ÁN, KHÔNG khoá ngoại sang `projects` — cùng chủ đích đã
-- ghi ở migration 037: đổi tên dự án trong danh mục KHÔNG được sửa ngược bản
-- ghi cũ đã in ra phiếu.
create table if not exists public.finance_partner_contracts (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references public.finance_partners(id) on delete cascade,
  project_code    text,
  project_name    text,
  contract_no     text,
  default_content text,                    -- Nội dung thanh toán mẫu
  flow            text not null default 'chi' check (flow in ('thu','chi')),
  department      text,                    -- Phòng ban / Ban ĐH phụ trách
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_fpc_partner on public.finance_partner_contracts (partner_id);
create index if not exists idx_fpc_project on public.finance_partner_contracts (project_code);

-- Chống nhân đôi khi chạy lại file. Dùng UNIQUE INDEX (không phải table
-- constraint) vì cần coalesce(contract_no,'') — hợp đồng chưa có số vẫn phải
-- so được, mà NULL trong unique constraint thì không bao giờ trùng nhau.
create unique index if not exists uq_fpc_partner_project_contract
  on public.finance_partner_contracts (partner_id, coalesce(project_code,''), coalesce(contract_no,''));

-- ─── 3. RLS — SIẾT THEO CỜ `can_view_reports` ───
--
-- Hai thứ dưới đây lẽ ra đã có sẵn (cột cờ từ 042, hàm is_admin_caller từ
-- 006/018). Khai lại cho chắc: nếu chạy file này trên một Supabase mới dựng cho
-- khách khác mà chưa chạy đủ migration cũ thì policy bên dưới sẽ lỗi "column
-- does not exist" / "function does not exist" giữa chừng, và vì SQL Editor chạy
-- trong MỘT transaction nên toàn bộ file rollback sạch — rất khó lần ra nguyên
-- nhân. Cả hai lệnh đều idempotent, chạy trên TNEC là no-op.
alter table public.approval_permissions
  add column if not exists can_view_reports boolean not null default false;

create or replace function public.is_admin_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  );
$$;

-- Migration 042 đã dặn: "Khi dựng bảng số liệu thì phải siết RLS theo đúng cờ
-- này — dữ liệu doanh thu nhạy cảm ngang bảng lương." Bảng này lộ số tài khoản
-- nhà thầu và toàn bộ danh sách hợp đồng nên áp đúng như vậy.
--
-- ⚠ BẮT BUỘC có điều kiện "email đăng nhập KHÁC RỖNG".
-- position('' in bất_kỳ_chuỗi_nào) = 1, nên thiếu điều kiện này thì một phiên
-- KHÔNG có danh tính sẽ khớp MỌI dòng và được coi là có quyền. Đã dính đúng bẫy
-- này ở migration 018 — kiểm chứng bằng cách chạy hàm trong SQL Editor (nơi
-- không có JWT): phải trả về false.
create or replace function public.can_view_reports_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') <> ''
     and exists (
       select 1 from public.approval_permissions p
       where p.can_view_reports = true
         and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
     );
$$;

alter table public.finance_partners           enable row level security;
alter table public.finance_partner_contracts  enable row level security;

-- Xoá TOÀN BỘ policy cũ bằng vòng lặp thay vì đoán tên — chạy lại file này
-- nhiều lần vẫn sạch, và không bỏ sót policy mặc định do Supabase sinh ra.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('finance_partners', 'finance_partner_contracts')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ĐỌC và GHI cùng một điều kiện. Cho GHI chứ không chỉ Admin: Ban điều hành
-- phải tự thêm nhà thầu của mình, bắt đi qua Admin sẽ thành nút cổ chai.
-- `is_admin_caller()` đã có sẵn từ migration 006/018, không viết lại.
create policy "reports_read_finance_partners" on public.finance_partners
  for select to authenticated
  using (public.is_admin_caller() or public.can_view_reports_caller());

create policy "reports_write_finance_partners" on public.finance_partners
  for all to authenticated
  using (public.is_admin_caller() or public.can_view_reports_caller())
  with check (public.is_admin_caller() or public.can_view_reports_caller());

create policy "reports_read_finance_contracts" on public.finance_partner_contracts
  for select to authenticated
  using (public.is_admin_caller() or public.can_view_reports_caller());

create policy "reports_write_finance_contracts" on public.finance_partner_contracts
  for all to authenticated
  using (public.is_admin_caller() or public.can_view_reports_caller())
  with check (public.is_admin_caller() or public.can_view_reports_caller());

-- ============================================================
-- 4. SEED — CHỈ danh sách dự án
--
-- 16 mã dự án rút từ 23 sheet của
-- public/templates/TNEC_ke_hoach_tai_chinh_thang.xlsx (dữ liệu thật, không phải
-- mẫu bịa). Danh mục dự án dùng chung với module Quản lý công việc nên giữ lại.
--
-- Danh mục ĐỐI TÁC thì KHÔNG seed — user tự nhập tay. Xem mục 5 bên dưới.
-- ============================================================

-- ─── SEED A: DANH SÁCH DỰ ÁN TRIỂN KHAI (bảng `projects`, migration 037) ───
insert into public.projects (code, name, sort_order) values
  ('VP-HCM', 'VP HCM', 10),
  ('VP-DN', 'VP ĐÀ NẴNG', 20),
  ('VP-42CMT', 'DA VP 42 CHU MẠNH TRINH', 30),
  ('CPQL', 'CHI PHÍ QUẢN LÝ', 40),
  ('BANK-THUE', 'BANK + THUẾ', 50),
  ('XLNT-TN', 'XLNT TÂY NINH', 60),
  ('DMT-TV', 'ĐIỆN MẶT TRỜI TRÀ VINH', 70),
  ('CANA', 'CÀ NÁ', 80),
  ('RXT', 'RẠCH XUYÊN TÂM', 90),
  ('HL11', 'HƯƠNG LỘ 11', 100),
  ('VAMLEO', 'VÀM LẼO', 110),
  ('TL8', 'TỈNH LỘ 8', 120),
  ('THUONGPHUOC', 'THƯỜNG PHƯỚC', 130),
  ('CAUMADA', 'CẦU MÃ ĐÀ', 140),
  ('DUNGQUAT', 'DUNG QUẤT', 150),
  ('DN2', 'ĐIỆN NỔI ĐỒNG NAI 2', 160)
on conflict (code) do nothing;

-- ─── 5. DỌN 49 ĐỐI TÁC MẪU (chỉ có tác dụng đúng một lần) ───
--
-- Bản 048 ĐẦU TIÊN có seed sẵn 49 đối tác + 62 hợp đồng gộp từ 23 sheet của file
-- Excel kế hoạch tài chính. Ngày 17/08/2026 user chốt BỎ danh sách mẫu đó, tự
-- nhập tay từng nhà thầu. Phần seed đã gỡ khỏi file; khối này dọn nốt những dòng
-- mà bản cũ đã kịp ghi vào CSDL.
--
-- XOÁ THEO ĐÚNG 49 TÊN, KHÔNG dùng "delete from finance_partners" trống:
-- xoá trắng cả bảng thì lần nào chạy lại file này cũng cuốn sạch các nhà thầu
-- user đã tự nhập. Liệt kê tên ra thì chỉ đúng dòng do seed sinh ra mới bị đụng,
-- và chạy lại lần thứ hai là no-op vì chúng không còn nữa.
--
-- 62 dòng hợp đồng kèm theo tự mất theo khoá ngoại on delete cascade.
--
-- KHÔNG đụng tới 16 dự án ở SEED A phía trên: đó là tên dự án thật, lại dùng
-- chung với module Quản lý công việc (ô chọn dự án trong form giao việc).
delete from public.finance_partners
where name in (
    ('Lê Thiện Thanh'),
    ('Ban QLDA tỉnh An Giang'),
    ('Ban QLDA ĐTXD các công trình dân dụng tỉnh Tây Ninh'),
    ('Ban QLDA Đầu tư Xây dựng các công trình Giao thông TP.HCM'),
    ('Ban QLDA Đầu tư Xây dựng thành phố Đồng Nai'),
    ('Ban Quản lý Khu kinh tế tỉnh Đồng Tháp'),
    ('Ban Quản lý Đầu tư và Xây dựng Thuỷ lợi 10'),
    ('Công ty Cổ phần Lọc hoá dầu Bình Sơn (BSR)'),
    ('Công ty Cổ phần Thuỷ điện Trung Nam'),
    ('Công ty Cổ phần Điện mặt trời Trung Nam Trà Vinh'),
    ('Công ty Cổ phần Đầu tư Hạ tầng KCN Trung Nam Cà Ná'),
    ('UBND tỉnh Tây Ninh'),
    ('Công ty TNHH Dịch vụ An ninh Bảo vệ Long Thiên Bảo'),
    ('Công ty CP Tư vấn Kiểm định và Xây dựng Công trình 36'),
    ('Công ty CP Tư vấn Xây dựng & Thương mại Phương Quân'),
    ('Công ty Cổ phần Dịch vụ Kỹ thuật SMC'),
    ('Công ty Cổ phần Kỹ thuật & Xây dựng Công Minh'),
    ('Công ty Cổ phần Sản xuất và Dịch vụ Tổng hợp Kinh Bắc'),
    ('Công ty Cổ phần Tư vấn Kiểm định Cà Mau'),
    ('Công ty Cổ phần Tư vấn Nền móng và Xây dựng Tekco'),
    ('Công ty Cổ phần Tập đoàn Quang Phúc'),
    ('Công ty Cổ phần Xây dựng Hoa Sen'),
    ('Công ty TNHH Công nghệ Kỹ thuật điện An Nguyên'),
    ('Công ty TNHH Enviro World'),
    ('Công ty TNHH Giải pháp Môi trường Đại Nam'),
    ('Công ty TNHH Hữu Biên'),
    ('Công ty TNHH MTV CQ'),
    ('Công ty TNHH MTV Thương mại & DV Dương Đông'),
    ('Công ty TNHH MTV Xây dựng Thành Hân'),
    ('Công ty TNHH MTV Đô La Thành'),
    ('Công ty TNHH Minh Khang'),
    ('Công ty TNHH Nga Hải'),
    ('Công ty TNHH Quảng cáo và Xây dựng Đại Cát'),
    ('Công ty TNHH SX TM DV ĐTXD ST 16'),
    ('Công ty TNHH Thương mại Kỹ thuật Xây dựng Toàn Thắng'),
    ('Công ty TNHH Tư vấn Thiết kế Thắng Lợi'),
    ('Công ty TNHH Tư vấn Xây dựng Miền Đông'),
    ('Công ty TNHH Vingo Land'),
    ('Công ty TNHH XD - TM - DV - SX Phát Hưng Khang'),
    ('Công ty TNHH XD Trang trí Nội thất C.A.S VN'),
    ('Công ty TNHH XD VT TM Chí Phúc'),
    ('Công ty TNHH Xuân Sơn Hải Dương'),
    ('Công ty TNHH Xây dựng Minh Khang'),
    ('Công ty TNHH Xây dựng Phát triển Hạ tầng Trung Quân'),
    ('Công ty TNHH Xây dựng Phước Vạn Thịnh'),
    ('Công ty TNHH Xây dựng và Thương mại Song Phú'),
    ('Công ty TNHH Xây dựng và Thương mại Yên Phúc'),
    ('Công ty TNHH Đầu tư XD và MT Huy Hoàng'),
    ('Viện Chuyên ngành Cơ khí Tự động hoá và Đo lường')
);

-- ─── 6. KIỂM TRA ───
-- Mong đợi: projects=16, còn finance_partners và finance_partner_contracts
-- đều = 0 (danh mục đối tác do người dùng tự nhập tay).
-- Nếu đã tự nhập nhà thầu rồi thì hai số đó là số của bạn, không phải 0.
select 'projects' as bang, count(*) as so_dong from public.projects
union all
select 'finance_partners', count(*) from public.finance_partners
union all
select 'finance_partner_contracts', count(*) from public.finance_partner_contracts;

-- Phép thử RLS: chạy trong SQL Editor (KHÔNG có JWT) -> BẮT BUỘC trả về false.
-- Ra true nghĩa là hàm hở, dừng lại và sửa trước khi dùng.
select public.can_view_reports_caller() as phai_la_false;

-- Ai đang được xem module Báo cáo (ngoài Admin):
select name, email from public.approval_permissions where can_view_reports = true order by name;
