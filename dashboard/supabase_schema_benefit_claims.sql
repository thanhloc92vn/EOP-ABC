-- Bảng trợ cấp hiếu hỷ & biến cố (Phúc lợi → Hiếu hỷ & Trợ cấp)
-- Nguồn dữ liệu thật, đồng bộ cho mọi tài khoản (thay cho mock/localStorage cũ).

create table if not exists public.benefit_claims (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid,
  name        text not null,
  role        text,
  department  text,
  level       text,
  category    text,            -- Loại trợ cấp: Kết hôn / Sinh con / Ốm đau / Sinh nhật ...
  amount      text,            -- Lưu text để giữ được giá trị "Theo phê duyệt"
  date        date,            -- Ngày sự kiện
  status      text default 'Chờ phê duyệt',
  notes       text,
  created_at  timestamptz default now()
);

alter table public.benefit_claims enable row level security;

-- Cho phép tài khoản đã đăng nhập đọc/ghi (đồng bộ chung toàn hệ thống)
drop policy if exists "benefit_claims_read" on public.benefit_claims;
create policy "benefit_claims_read"  on public.benefit_claims for select using (true);

drop policy if exists "benefit_claims_write" on public.benefit_claims;
create policy "benefit_claims_write" on public.benefit_claims for all using (true) with check (true);
