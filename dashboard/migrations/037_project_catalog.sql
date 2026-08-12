-- ============================================================
-- 037 — DANH MỤC DỰ ÁN + NHÓM/NGUỒN CÔNG VIỆC (công ty xây dựng)
--
-- MỤC ĐÍCH:
-- Bảng task hiện chỉ có tên việc / người nhận / hạn. Công ty xây dựng cần biết
-- việc thuộc DỰ ÁN nào, thuộc NHÓM việc gì và đến từ NGUỒN nào. Migration này
-- tạo 2 bảng danh mục + thêm 4 cột vào `tasks`.
--
-- VÌ SAO `projects` LÀ BẢNG RIÊNG, KHÔNG DÙNG LẠI `departments` (type='bdh'):
-- Hệ thống vốn coi mỗi Ban Điều Hành là một dự án (xem 016_project_locations).
-- Nhưng `departments` là CƠ CẤU TỔ CHỨC — nó điều khiển bộ lọc nhân sự, phạm vi
-- VPP và gói-theo-phòng. Nhét mã dự án vào đó thì dự án chưa lập BĐH sẽ không
-- khai báo được, và mỗi lần sửa danh mục dự án là động vào cơ cấu phòng ban.
-- Tách bảng riêng: hai thứ tiến hoá độc lập, không thứ nào kéo thứ nào.
--
-- LƯU CẢ MÃ LẪN TÊN VÀO `tasks` — CÓ CHỦ ĐÍCH:
-- Không dùng khoá ngoại. Task là bản ghi lịch sử: đổi tên dự án trong danh mục
-- KHÔNG được làm đổi ngược tên đã ghi trên task cũ. Cùng lối với cột `assignee`
-- (lưu tên dạng text) mà toàn hệ thống đang dùng.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán toàn bộ file -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. DANH MỤC DỰ ÁN ───
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,        -- Mã dự án, VD "TN-VL-01"
  name       text not null,               -- Tên dự án đầy đủ
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_active on public.projects (active);

-- ─── 2. DANH MỤC NHÓM / NGUỒN CÔNG VIỆC ───
-- Một bảng dùng chung, phân biệt bằng cột `kind`. Gộp lại thay vì tạo 2 bảng
-- giống hệt nhau: thêm loại danh mục thứ 3 sau này chỉ là thêm một giá trị
-- `kind`, không phải viết thêm bảng + RLS + màn hình quản lý mới.
create table if not exists public.task_catalog (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('work_group', 'work_source')),
  name       text not null,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

create index if not exists idx_task_catalog_kind on public.task_catalog (kind, active);

-- ─── 3. THÊM 4 CỘT VÀO `tasks` ───
-- Đều nullable: mọi task CŨ vẫn hợp lệ, không cần điền bù, không gãy luồng nào.
alter table public.tasks add column if not exists project_code text;
alter table public.tasks add column if not exists project_name text;
alter table public.tasks add column if not exists work_group   text;
alter table public.tasks add column if not exists work_source  text;

create index if not exists idx_tasks_project_code on public.tasks (project_code);

-- ─── 4. RLS: ai đăng nhập cũng ĐỌC được, chỉ Admin GHI ───
-- Người tạo task phải đọc được danh mục để chọn, nên SELECT mở cho authenticated.
-- Sửa danh mục là việc quản trị -> chỉ Admin.
alter table public.projects     enable row level security;
alter table public.task_catalog enable row level security;

-- Xoá TOÀN BỘ policy cũ bằng vòng lặp thay vì đoán tên — chạy lại file này
-- nhiều lần vẫn sạch, và không bỏ sót policy mặc định do Supabase sinh ra.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('projects', 'task_catalog')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy "authenticated_read_projects" on public.projects
  for select to authenticated using (true);

create policy "admin_write_projects" on public.projects
  for all to authenticated
  using (exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  ));

create policy "authenticated_read_task_catalog" on public.task_catalog
  for select to authenticated using (true);

create policy "admin_write_task_catalog" on public.task_catalog
  for all to authenticated
  using (exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  ));

-- ─── 5. SEED NHÓM / NGUỒN CÔNG VIỆC ───
-- Gợi ý ban đầu để màn hình không trống trơn. Sửa/xoá thoải mái trong
-- Cài đặt hệ thống -> Danh mục công việc, KHÔNG cần đụng code.
-- Bảng `projects` cố ý ĐỂ TRỐNG: mã dự án là dữ liệu thật của công ty,
-- seed bừa vào chỉ tạo rác phải đi dọn.
insert into public.task_catalog (kind, name, sort_order) values
  ('work_group', 'Thi công',              10),
  ('work_group', 'Kỹ thuật - Bản vẽ',     20),
  ('work_group', 'Vật tư - Thiết bị',     30),
  ('work_group', 'Hồ sơ - Pháp lý',       40),
  -- Xếp cạnh "Hồ sơ - Pháp lý" vì cùng mảng giấy tờ; đây là công văn đi/đến
  -- của Văn thư, khác với hồ sơ pháp lý dự án.
  ('work_group', 'Văn bản - Công văn',    45),
  ('work_group', 'Nghiệm thu - Thanh toán', 50),
  ('work_group', 'An toàn - Chất lượng',  60),
  ('work_group', 'Hành chính - Nhân sự',  70),
  ('work_source', 'Chủ đầu tư',           10),
  ('work_source', 'Ban lãnh đạo',         20),
  ('work_source', 'Ban điều hành dự án',  30),
  ('work_source', 'Phòng ban nội bộ',     40),
  ('work_source', 'Phòng QLDA',           41),
  ('work_source', 'Phòng KHĐT',           42),
  ('work_source', 'Tư vấn giám sát',      50),
  ('work_source', 'Nhà thầu phụ',         60),
  ('work_source', 'Phát sinh hiện trường', 70),
  -- Việc giao qua nhóm chat — nguồn có thật và khá phổ biến ở công trường,
  -- xếp cuối vì là KÊNH truyền đạt chứ không phải đơn vị phát sinh việc.
  ('work_source', 'Nhóm Viber',           80),
  ('work_source', 'Nhóm Zalo',            90)
on conflict (kind, name) do nothing;

-- ─── 6. KIỂM TRA ───
select 'projects' as bang, count(*) as so_dong from public.projects
union all
select 'task_catalog', count(*) from public.task_catalog;

select kind, name, sort_order from public.task_catalog order by kind, sort_order;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'tasks'
  and column_name in ('project_code', 'project_name', 'work_group', 'work_source')
order by column_name;
