-- ============================================================
-- 059 — MỘT ĐỐI TÁC NHIỀU TÀI KHOẢN, MỘT HỢP ĐỒNG CHIA NHIỀU TÀI KHOẢN
--
-- VẤN ĐỀ:
-- Migration 048 để 3 cột `bank_account` / `bank_name` / `bank_branch` ngay trên
-- bảng `finance_partners`, tức MỖI ĐƠN VỊ CHỈ GIỮ ĐƯỢC MỘT tài khoản. Thực tế
-- một nhà thầu dùng tài khoản khác nhau cho từng gói thầu. Với cấu trúc cũ, cách
-- duy nhất là lập 10 dòng "Minh Khang" cho 10 số tài khoản — mà cột `name` lại
-- `unique` nên còn phải bịa tên "Minh Khang (2)", "Minh Khang (3)"...
--
-- Đó đúng là căn bệnh 048 sinh ra để chữa: file Excel cũ có 95 cách gõ tên cho
-- 49 đơn vị thật, riêng Minh Khang bị gõ 5 kiểu, nên không cộng nổi công nợ
-- theo nhà thầu. Nhân bản đối tác là đưa bệnh đó thẳng vào CSDL.
--
-- CÁCH LÀM:
--   1. Tài khoản tách ra bảng riêng, 1 đối tác : N tài khoản.
--   2. Hợp đồng nối với tài khoản qua BẢNG NỐI, vì một gói thầu thỉnh thoảng
--      chia tiền về 2 tài khoản. Dùng cột `account_id` đơn thì chỉ trỏ được một.
--
-- VÌ SAO BẢNG NỐI CHỨ KHÔNG PHẢI CỘT MẢNG `account_ids uuid[]`:
-- Mảng KHÔNG có khoá ngoại. Xoá một tài khoản đi thì id của nó vẫn nằm lại
-- trong mảng của các dòng hợp đồng, không cách nào biết. Đây là dữ liệu điều
-- hướng dòng tiền — trỏ vào một tài khoản không còn tồn tại là chuyển tiền sai
-- địa chỉ, nên chấp nhận thêm một bảng để lấy ràng buộc thật.
--
-- KHÔNG XOÁ 3 CỘT CŨ trên `finance_partners`. Chúng được nạp sang bảng mới ở
-- mục 3 và từ đó thành dữ liệu chết. Giữ lại để nếu bản mới có chỗ nào chưa
-- lường hết thì còn đối chiếu; dọn ở một migration sau, khi đã chạy ổn.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ file -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. BẢNG TÀI KHOẢN ───
create table if not exists public.finance_partner_accounts (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.finance_partners(id) on delete cascade,
  -- Nhãn tự đặt để người lập phiếu phân biệt: "TK chính", "TK thi công Vàm Lẽo",
  -- "TK nhận tạm ứng". Số tài khoản trần thì nhìn 10 dòng không biết chọn dòng nào.
  label        text,
  bank_account text not null,
  bank_name    text,
  bank_branch  text,
  is_default   boolean not null default false,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_fpa_partner on public.finance_partner_accounts (partner_id);

-- Cùng một đơn vị không được có hai dòng cùng số tài khoản.
create unique index if not exists uq_fpa_partner_account
  on public.finance_partner_accounts (partner_id, bank_account);

-- Mỗi đơn vị nhiều nhất MỘT tài khoản mặc định. Dùng unique index có điều kiện
-- (`where is_default`) chứ không phải ràng buộc thường: ràng buộc thường sẽ cấm
-- luôn việc có nhiều tài khoản KHÔNG mặc định.
create unique index if not exists uq_fpa_one_default
  on public.finance_partner_accounts (partner_id) where is_default;

create or replace function public.finance_partner_accounts_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists finance_partner_accounts_touch_trg on public.finance_partner_accounts;
create trigger finance_partner_accounts_touch_trg
  before update on public.finance_partner_accounts
  for each row execute function public.finance_partner_accounts_touch();

-- ─── 2. BẢNG NỐI HỢP ĐỒNG ↔ TÀI KHOẢN ───
create table if not exists public.finance_contract_accounts (
  contract_id uuid not null references public.finance_partner_contracts(id) on delete cascade,
  account_id  uuid not null references public.finance_partner_accounts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (contract_id, account_id)
);

create index if not exists idx_fca_account on public.finance_contract_accounts (account_id);

-- ─── 3. NẠP DỮ LIỆU ĐANG CÓ ───
-- Số tài khoản đã nhập trên từng đối tác thành tài khoản MẶC ĐỊNH của đối tác
-- đó. Không ai phải nhập lại, và mọi hợp đồng cũ vẫn trỏ đúng chỗ như trước.
insert into public.finance_partner_accounts
  (partner_id, label, bank_account, bank_name, bank_branch, is_default, sort_order)
select
  p.id,
  'Tài khoản chính',
  btrim(p.bank_account),
  p.bank_name,
  p.bank_branch,
  true,
  0
from public.finance_partners p
where p.bank_account is not null
  and btrim(p.bank_account) <> ''
on conflict (partner_id, bank_account) do nothing;

-- Mọi dòng hợp đồng đang có nối vào tài khoản mặc định của đối tác nó.
insert into public.finance_contract_accounts (contract_id, account_id)
select c.id, a.id
from public.finance_partner_contracts c
join public.finance_partner_accounts a
  on a.partner_id = c.partner_id and a.is_default
on conflict do nothing;

-- ─── 4. RLS ───
--
-- Cùng cửa vào với cả module Báo cáo. Khai lại hai hàm cho chắc — nếu chạy file
-- này trên một Supabase mới dựng cho khách khác mà chưa chạy đủ migration cũ thì
-- policy bên dưới lỗi "function does not exist" giữa chừng, và vì SQL Editor
-- chạy trong MỘT transaction nên toàn bộ file rollback sạch, rất khó lần ra
-- nguyên nhân. Cả hai lệnh đều idempotent, chạy trên TNEC là no-op.
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

alter table public.finance_partner_accounts  enable row level security;
alter table public.finance_contract_accounts enable row level security;

-- Xoá TOÀN BỘ policy cũ bằng vòng lặp thay vì đoán tên — chạy lại file này
-- nhiều lần vẫn sạch, và không bỏ sót policy mặc định do Supabase sinh ra.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('finance_partner_accounts', 'finance_contract_accounts')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Đọc và ghi cùng một điều kiện, khớp đúng bảng hợp đồng ở 048: Ban điều hành
-- phải tự thêm được tài khoản của nhà thầu mình, bắt đi qua Admin là nút cổ chai.
--
-- KHÔNG khoá riêng quyền XOÁ về Admin như 052 làm với `finance_partners`: xoá
-- một đối tác kéo theo toàn bộ hợp đồng của nó nên mới phải chặt, còn xoá một
-- tài khoản chỉ mất đúng dòng đó cùng các liên kết tới nó, nhập lại 30 giây.
create policy "reports_read_finance_accounts" on public.finance_partner_accounts
  for select to authenticated
  using (public.is_admin_caller() or public.can_view_reports_caller());

create policy "reports_write_finance_accounts" on public.finance_partner_accounts
  for all to authenticated
  using (public.is_admin_caller() or public.can_view_reports_caller())
  with check (public.is_admin_caller() or public.can_view_reports_caller());

create policy "reports_read_contract_accounts" on public.finance_contract_accounts
  for select to authenticated
  using (public.is_admin_caller() or public.can_view_reports_caller());

create policy "reports_write_contract_accounts" on public.finance_contract_accounts
  for all to authenticated
  using (public.is_admin_caller() or public.can_view_reports_caller())
  with check (public.is_admin_caller() or public.can_view_reports_caller());

-- ─── 5. KIỂM TRA ───
-- (a) Mỗi đối tác có bao nhiêu tài khoản, đã nạp đúng chưa.
select p.name,
       count(a.id) as so_tai_khoan,
       count(*) filter (where a.is_default) as so_mac_dinh
from public.finance_partners p
left join public.finance_partner_accounts a on a.partner_id = p.id
group by p.name
order by p.name;

-- (b) Hợp đồng nào chưa nối được tài khoản nào (đối tác chưa nhập số TK).
select p.name as doi_tac, c.contract_no, c.project_name
from public.finance_partner_contracts c
join public.finance_partners p on p.id = c.partner_id
where not exists (
  select 1 from public.finance_contract_accounts x where x.contract_id = c.id
);

-- (c) Phải ra 4 dòng policy: 2 bảng × (SELECT + ALL).
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('finance_partner_accounts', 'finance_contract_accounts')
order by tablename, cmd;

-- (d) Chạy trong SQL Editor (không có JWT) thì CẢ HAI phải trả về false.
select public.is_admin_caller() as admin_no_jwt,
       public.can_view_reports_caller() as reports_no_jwt;
