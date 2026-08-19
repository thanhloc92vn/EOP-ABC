-- ============================================================
-- 058 — KẾ HOẠCH TÀI CHÍNH THÁNG (module Báo cáo > Kế hoạch thu chi > Kế hoạch TC)
--
-- MỤC ĐÍCH:
-- Migration 048 đã dựng DANH MỤC đối tác để lập kế hoạch thì chọn thay vì gõ.
-- File này dựng nơi lưu chính BẢN KẾ HOẠCH — trước đó màn hình "Kế hoạch TC"
-- chỉ giữ dữ liệu trong bộ nhớ trình duyệt, tải lại trang là mất trắng.
--
-- 11 cột bám đúng file Excel công ty đang dùng
-- (public/templates/TNEC_ke_hoach_tai_chinh_thang.xlsx), thêm 3 cột kỹ thuật:
--   - `year`       : file Excel tách mỗi tháng một sheet nên không có cột năm.
--                    Gộp mọi tháng vào một bảng thì bắt buộc phải có năm, không
--                    thì tháng 8/2026 và tháng 8/2027 chồng lên nhau.
--   - `sort_order` : giữ đúng thứ tự người lập đã xếp, không phó mặc cho
--                    thứ tự trả về của CSDL.
--   - `created_by` : ai lập dòng này — vừa để hiển thị, vừa là căn cứ phân
--                    quyền sửa/xoá ở mục 3.
--
-- LƯU CẢ MÃ LẪN TÊN DỰ ÁN, KHÔNG khoá ngoại sang `projects` — cùng chủ đích đã
-- ghi ở migration 037/048: đổi tên dự án trong danh mục KHÔNG được sửa ngược
-- bản kế hoạch cũ đã in ra trình ký.
--
-- Tên đối tác cũng lưu thành CHỮ (`customer`) chứ không khoá ngoại sang
-- `finance_partners`: kế hoạch có thể ghi một đơn vị chưa kịp đưa vào danh mục,
-- và xoá đối tác trong danh mục không được phép làm rỗng bản kế hoạch đã lập.
--
-- ⚠ QUYỀN SỬA/XOÁ HIỆN LÀ "CHỦ DÒNG HOẶC ADMIN" — đây là mức chặt tạm thời,
-- chọn khi luồng nghiệp vụ (ai nhập, có qua duyệt không) CHƯA CHỐT. Nới ra thì
-- dễ, thu lại sau khi mọi người đã sửa chéo dữ liệu của nhau thì khó.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ file -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. BẢNG ───
create table if not exists public.finance_plans (
  id           uuid primary key default gen_random_uuid(),
  department   text,                        -- Phòng ban / Ban ĐH đề xuất
  flow         text not null default 'chi'
               check (flow in ('thu','chi')),
  customer     text,                        -- Khách hàng / nhà thầu
  content      text,                        -- Nội dung thanh toán
  amount       numeric(18,0) not null default 0,
  project_code text,
  project_name text,
  fund_source  text,                        -- Nguồn tiền
  week         smallint check (week between 1 and 5),
  month        smallint not null check (month between 1 and 12),
  year         smallint not null check (year between 2000 and 2100),
  pay_date     date,                        -- Ngày thanh toán dự kiến
  sort_order   integer not null default 0,
  -- Điền sẵn từ JWT: client KHÔNG gửi trường này lên, nên không giả danh được.
  created_by   text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Màn hình luôn lọc theo kỳ (năm + tháng) rồi mới xếp thứ tự.
create index if not exists idx_finance_plans_period
  on public.finance_plans (year, month, sort_order);
create index if not exists idx_finance_plans_pay_date
  on public.finance_plans (pay_date);
create index if not exists idx_finance_plans_owner
  on public.finance_plans (created_by);

-- ─── 2. TỰ CẬP NHẬT updated_at ───
create or replace function public.finance_plans_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists finance_plans_touch_trg on public.finance_plans;
create trigger finance_plans_touch_trg
  before update on public.finance_plans
  for each row execute function public.finance_plans_touch();

-- ─── 3. RLS ───
--
-- Cùng cửa vào với cả module Báo cáo: Admin, hoặc người có cờ can_view_reports
-- (migration 042). Khai lại hai hàm cho chắc — nếu chạy file này trên một
-- Supabase mới dựng cho khách khác mà chưa chạy đủ migration cũ thì policy bên
-- dưới lỗi "function does not exist" giữa chừng, và vì SQL Editor chạy trong
-- MỘT transaction nên toàn bộ file rollback sạch, rất khó lần ra nguyên nhân.
-- Cả hai lệnh đều idempotent, chạy trên TNEC là no-op.
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

-- ⚠ BẮT BUỘC có điều kiện "email đăng nhập KHÁC RỖNG".
-- position('' in bất_kỳ_chuỗi_nào) = 1, nên thiếu điều kiện này thì một phiên
-- KHÔNG có danh tính sẽ khớp MỌI dòng và được coi là có quyền.
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

alter table public.finance_plans enable row level security;

-- Xoá TOÀN BỘ policy cũ bằng vòng lặp thay vì đoán tên — chạy lại file này
-- nhiều lần vẫn sạch, và không bỏ sót policy mặc định do Supabase sinh ra.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'finance_plans'
  loop
    execute format('drop policy %I on public.finance_plans', p.policyname);
  end loop;
end $$;

-- ĐỌC: cả module cùng nhìn một bản kế hoạch. Chia nhỏ theo phòng ở tầng đọc sẽ
-- làm hỏng chính mục đích của bảng — cộng dòng tiền toàn công ty theo tháng.
create policy "reports_read_finance_plans" on public.finance_plans
  for select to authenticated
  using (public.is_admin_caller() or public.can_view_reports_caller());

-- THÊM: phải tự đứng tên. `created_by` có default lấy từ JWT, nhưng vẫn chặn ở
-- đây phòng trường hợp client cố tình gửi kèm email người khác.
create policy "reports_insert_finance_plans" on public.finance_plans
  for insert to authenticated
  with check (
    (public.is_admin_caller() or public.can_view_reports_caller())
    and lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- SỬA / XOÁ: chủ dòng hoặc Admin.
create policy "owner_update_finance_plans" on public.finance_plans
  for update to authenticated
  using (
    public.is_admin_caller()
    or (
      public.can_view_reports_caller()
      and lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    public.is_admin_caller()
    or (
      public.can_view_reports_caller()
      and lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "owner_delete_finance_plans" on public.finance_plans
  for delete to authenticated
  using (
    public.is_admin_caller()
    or (
      public.can_view_reports_caller()
      and lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- ─── 4. KIỂM TRA ───
-- Phải ra đúng 4 dòng: SELECT / INSERT / UPDATE / DELETE.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'finance_plans'
order by cmd;

-- Chạy trong SQL Editor (không có JWT) thì CẢ HAI phải trả về false.
-- Ra true là policy đang hở cho phiên không danh tính.
select public.is_admin_caller() as admin_no_jwt,
       public.can_view_reports_caller() as reports_no_jwt;
