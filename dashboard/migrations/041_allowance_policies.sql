-- ============================================================
-- 041 — Bảng `allowance_policies` (định mức phụ cấp cơm, xăng, điện thoại)
--
-- Trước đây 3 thẻ ở tab "Phụ cấp cơm, xăng, dt..." là số cứng trong code
-- (MOCK_ALLOWANCES). Định mức có thể dao động nên tách ra bảng riêng để
-- HCNS tự sửa trên giao diện, không phải sửa code + deploy lại.
--
-- Hai kiểu tính:
--   kind = 'per_day'   -> per_day_amount × days_per_month (cơm trưa)
--   kind = 'threshold' -> đủ threshold_days công thì full_amount,
--                         thiếu thì reduced_amount (xăng xe, điện thoại)
--
-- Quyền sửa: Admin HOẶC cờ `can_view_attendance_imports` — đúng nhóm đang
-- được xoá lịch trình công tác và xoá đơn nghỉ chế độ. KHÔNG thêm cờ mới.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. BẢNG ───
create table if not exists public.allowance_policies (
  code            text primary key,
  name            text not null,
  target          text not null default '',
  kind            text not null check (kind in ('per_day', 'threshold')),
  per_day_amount  numeric,
  days_per_month  numeric,
  threshold_days  numeric,
  full_amount     numeric,
  reduced_amount  numeric,
  sort_order      int not null default 0,
  updated_at      timestamptz not null default now(),
  updated_by      text
);

-- ─── 2. SEED định mức đang áp dụng ───
-- Cơm trưa: 35.000 đ/ngày × 23 ngày công (thứ 2 → thứ 6). 23 là số ngày công
-- của tháng dư 31 ngày, áp cố định cho mọi tháng.
-- Xăng xe & điện thoại: từ 15 ngày công trở lên hưởng đủ 100.000 đ/tháng,
-- dưới 15 ngày còn 50.000 đ/tháng.
insert into public.allowance_policies
  (code, name, target, kind, per_day_amount, days_per_month, threshold_days, full_amount, reduced_amount, sort_order)
values
  ('lunch', 'Cơm trưa văn phòng',  'Toàn bộ nhân viên chính thức', 'per_day',   35000, 23,   null, null,   null,  1),
  ('fuel',  'Xăng xe di chuyển',   'Toàn bộ tài khoản',            'threshold', null,  null, 15,   100000, 50000, 2),
  ('phone', 'Điện thoại liên lạc', 'Toàn bộ tài khoản',            'threshold', null,  null, 15,   100000, 50000, 3)
on conflict (code) do nothing;

-- ─── 3. RLS: ai đăng nhập cũng ĐỌC được, chỉ Admin/cờ mới GHI ───
alter table public.allowance_policies enable row level security;

-- Xoá sạch policy cũ trước khi tạo (tránh policy rác chồng nhau)
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'allowance_policies'
  loop
    execute format('drop policy %I on public.allowance_policies', p.policyname);
  end loop;
end $$;

create policy "ap_read_authenticated" on public.allowance_policies
  for select to authenticated using (true);

create policy "ap_write_hr" on public.allowance_policies
  for all to authenticated
  using (
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(auth.jwt() ->> 'email')
        and au.role = 'Admin'
    )
    or exists (
      select 1 from public.approval_permissions ap
      where lower(coalesce(ap.email, '')) like '%' || lower(auth.jwt() ->> 'email') || '%'
        and ap.can_view_attendance_imports = true
    )
  )
  with check (
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(auth.jwt() ->> 'email')
        and au.role = 'Admin'
    )
    or exists (
      select 1 from public.approval_permissions ap
      where lower(coalesce(ap.email, '')) like '%' || lower(auth.jwt() ->> 'email') || '%'
        and ap.can_view_attendance_imports = true
    )
  );

-- ─── 4. KIỂM TRA ───
select code, name, kind, per_day_amount, days_per_month, threshold_days, full_amount, reduced_amount
from public.allowance_policies
order by sort_order;
