-- ============================================================
-- 013 — LUỒNG PHÊ DUYỆT THẬT CHO CHI PHÚC LỢI
-- (C&B > Phúc lợi > Hiếu hỷ & Trợ cấp + Tiền thưởng lễ)
--
-- Trước migration này:
--   * benefit_claims: RLS mở toang (for all using(true)) — ai cũng
--     thêm/sửa/xoá được mọi phiếu, kể cả vai trò anon.
--   * "Trạng thái phê duyệt" do chính người tạo phiếu tự chọn, không
--     có ai duyệt, không lưu ai duyệt / lúc nào.
--   * "Phê duyệt hàng loạt" thưởng lễ chỉ ghi localStorage từng máy.
--
-- Sau migration: phiếu mới luôn ở 'Chờ phê duyệt'; chỉ người có cờ
-- can_approve_benefit (hoặc Admin) mới đổi được trạng thái; mức duyệt
-- thưởng lễ lưu chính thức trên DB, mọi máy thấy như nhau.
--
-- Chạy trong Supabase SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. CỜ QUYỀN MỚI ───
alter table public.approval_permissions
  add column if not exists can_approve_benefit boolean not null default false;

-- ─── 2. BỔ SUNG CỘT VẾT DUYỆT CHO benefit_claims ───
alter table public.benefit_claims add column if not exists created_by       text;
alter table public.benefit_claims add column if not exists approved_by      text;
alter table public.benefit_claims add column if not exists approved_at      timestamptz;
alter table public.benefit_claims add column if not exists rejection_reason text;

-- Phiếu mới mặc định phải là 'Chờ phê duyệt'
alter table public.benefit_claims alter column status set default 'Chờ phê duyệt';

-- ─── 3. HÀM TIỆN ÍCH: người gọi có quyền duyệt phúc lợi không? ───
-- (Admin luôn có quyền; ngoài ra phải bật cờ can_approve_benefit)
create or replace function public.caller_can_approve_benefit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.allowed_users au
      where au.role = 'Admin' and au.email ilike auth.email()
    )
    or exists (
      select 1 from public.approval_permissions p
      where p.can_approve_benefit = true
        and p.email ilike '%' || auth.email() || '%'
    );
$$;

-- ─── 4. SIẾT RLS benefit_claims ───
-- Xoá TOÀN BỘ policy cũ (không đoán tên) rồi dựng lại whitelist.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'benefit_claims'
  loop
    execute format('drop policy if exists %I on public.benefit_claims', pol.policyname);
  end loop;
end $$;

alter table public.benefit_claims enable row level security;

-- Chặn vai trò anon (chưa đăng nhập) ở tầng GRANT — RLS không đủ,
-- xem bài học đã gặp với các view danh bạ.
revoke all on public.benefit_claims from anon;
revoke all on public.benefit_claims from public;
grant select, insert, update, delete on public.benefit_claims to authenticated;

-- ĐỌC: mọi người đăng nhập (trang C&B tự lọc theo quyền xem)
create policy "benefit_claims select authenticated"
  on public.benefit_claims for select to authenticated using (true);

-- THÊM: ai cũng lập được phiếu, NHƯNG bắt buộc ở trạng thái chờ duyệt.
-- Không tự đặt 'Đã duyệt'/'Đã chi' cho phiếu của chính mình được nữa.
create policy "benefit_claims insert pending only"
  on public.benefit_claims for insert to authenticated
  with check (
    coalesce(status, 'Chờ phê duyệt') = 'Chờ phê duyệt'
    or public.caller_can_approve_benefit()
  );

-- SỬA (duyệt / từ chối / chi): chỉ người có cờ hoặc Admin
create policy "benefit_claims update approver only"
  on public.benefit_claims for update to authenticated
  using (public.caller_can_approve_benefit())
  with check (public.caller_can_approve_benefit());

-- XOÁ: người có cờ/Admin xoá được tất cả; người thường chỉ được rút lại
-- phiếu do CHÍNH họ lập và khi phiếu còn đang chờ duyệt.
create policy "benefit_claims delete approver or own pending"
  on public.benefit_claims for delete to authenticated
  using (
    public.caller_can_approve_benefit()
    or (created_by ilike auth.email() and status = 'Chờ phê duyệt')
  );

-- ─── 5. BẢNG MỨC DUYỆT THƯỞNG LỄ (thay localStorage từng máy) ───
create table if not exists public.holiday_bonus_approvals (
  id            uuid primary key default gen_random_uuid(),
  holiday_id    text not null,           -- khớp TNEC_HOLIDAYS[].id
  employee_id   uuid not null,
  employee_name text,
  amount        numeric not null default 0,
  approved_by   text,
  approved_at   timestamptz not null default now(),
  unique (holiday_id, employee_id)
);

alter table public.holiday_bonus_approvals enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'holiday_bonus_approvals'
  loop
    execute format('drop policy if exists %I on public.holiday_bonus_approvals', pol.policyname);
  end loop;
end $$;

revoke all on public.holiday_bonus_approvals from anon;
revoke all on public.holiday_bonus_approvals from public;
grant select, insert, update, delete on public.holiday_bonus_approvals to authenticated;

create policy "holiday_bonus select authenticated"
  on public.holiday_bonus_approvals for select to authenticated using (true);

create policy "holiday_bonus write approver only"
  on public.holiday_bonus_approvals for all to authenticated
  using (public.caller_can_approve_benefit())
  with check (public.caller_can_approve_benefit());

-- ─── 6. KIỂM TRA KẾT QUẢ ───
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('benefit_claims', 'holiday_bonus_approvals')
order by tablename, cmd;
