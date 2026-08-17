-- ============================================================
-- 047 — Bảng `benefit_policies` (định mức trợ cấp phúc lợi theo cấp)
--
-- Trước đây bảng "Định mức phúc lợi" (C&B > Phúc lợi) là hằng số cứng
-- BENEFIT_POLICY trong code: 5 dòng, mỗi ô 1 con số, cột "Điều hành cao cấp"
-- ghi "Theo phê duyệt". Định mức 2026 mở rộng thành 8 dòng, có thêm phần
-- hiện vật (giỏ hoa / vòng hoa) đi kèm tiền mặt, nên tách ra bảng riêng để
-- HCNS tự sửa trên giao diện, không phải sửa code + deploy lại.
--
-- Mỗi cấp có 2 cột: `*_amount` = tiền mặt, `*_gift` = giá trị hiện vật
-- (tên hiện vật lấy ở `gift_label` của dòng). NULL = cấp đó không áp dụng,
-- giao diện hiển thị "—".
--
--   exec   = Điều hành cao cấp     mid    = Quản lý cấp trung
--   senior = Quản lý cấp cao       junior = Quản lý sơ cấp
--   staff  = CBNV
--
-- Quyền sửa: Admin HOẶC cờ `can_manage_employees` ("Quản lý hồ sơ nhân sự").
-- KHÔNG thêm cờ mới.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. BẢNG ───
create table if not exists public.benefit_policies (
  code           text primary key,
  name           text not null,
  gift_label     text,
  exec_amount    numeric,
  exec_gift      numeric,
  senior_amount  numeric,
  senior_gift    numeric,
  mid_amount     numeric,
  mid_gift       numeric,
  junior_amount  numeric,
  junior_gift    numeric,
  staff_amount   numeric,
  staff_gift     numeric,
  sort_order     int not null default 0,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

-- ─── 2. SEED định mức điều chỉnh năm 2026 ───
insert into public.benefit_policies
  (code, name, gift_label,
   exec_amount, exec_gift, senior_amount, senior_gift, mid_amount, mid_gift,
   junior_amount, junior_gift, staff_amount, staff_gift, sort_order)
values
  ('birthday', 'Sinh nhật', 'Giỏ hoa',
   2000000, 1000000, 1000000, 800000, 800000, 500000, 600000, null, 400000, null, 1),

  ('marriage', 'Kết hôn', null,
   5000000, null, 3000000, null, 2000000, null, 1000000, null, 1000000, null, 2),

  ('childbirth', 'Sinh con', null,
   3000000, null, 2000000, null, 1000000, null, 700000, null, 500000, null, 3),

  ('spouse_childbirth', 'Vợ CBNV sinh con', null,
   2000000, null, 1000000, null, 800000, null, 600000, null, 400000, null, 4),

  ('sickness', 'Ốm đau', null,
   2000000, null, 1000000, null, 800000, null, 600000, null, 400000, null, 5),

  ('relative', 'Thân nhân', null,
   2000000, null, 1000000, null, null, null, null, null, null, null, 6),

  ('funeral_immediate', 'Tử tuất (vợ/chồng, bố mẹ vợ chồng, con hợp pháp)', 'Vòng hoa',
   3000000, 1500000, 2000000, 1500000, 1000000, 1000000, 700000, 1000000, 500000, 1000000, 7),

  ('funeral_extended', 'Tử tuất (ông bà nội ngoại, anh chị em ruột)', 'Vòng hoa',
   2000000, 1500000, 1000000, 1500000, 500000, 1000000, null, 1000000, null, 1000000, 8)
on conflict (code) do nothing;

-- ─── 3. RLS: ai đăng nhập cũng ĐỌC được, chỉ Admin/cờ mới GHI ───
alter table public.benefit_policies enable row level security;

-- Xoá sạch policy cũ trước khi tạo (tránh policy rác chồng nhau)
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'benefit_policies'
  loop
    execute format('drop policy %I on public.benefit_policies', p.policyname);
  end loop;
end $$;

create policy "bp_read_authenticated" on public.benefit_policies
  for select to authenticated using (true);

create policy "bp_write_hr" on public.benefit_policies
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
        and ap.can_manage_employees = true
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
        and ap.can_manage_employees = true
    )
  );

-- ─── 4. KIỂM TRA ───
select code, name, gift_label,
       exec_amount, exec_gift, senior_amount, senior_gift,
       mid_amount, mid_gift, junior_amount, junior_gift,
       staff_amount, staff_gift
from public.benefit_policies
order by sort_order;
