-- ============================================================
-- 025 — SỔ NHẬP KHO VPP + ĐỊNH MỨC VPP THEO PHÒNG BAN
--
-- PHỤC VỤ: nút "Báo cáo tổng hợp" trong tab VPP, gồm 4 mục:
--   (1) VPP nhập trong tháng   -> cần bảng `vpp_stock_entries` (migration này)
--   (2) Định mức VPP theo tháng -> cần bảng `vpp_quotas`       (migration này)
--   (3) VPP xuất trong tháng    -> KHÔNG cần gì thêm: phiếu cấp phát nằm trong
--       `tasks` và đã có ngày, giao diện tự cộng theo tháng.
--   (4) Đề xuất mua VPP         -> KHÔNG cần gì thêm: suy ra từ số dư cuối kỳ.
--
-- ─── VÌ SAO PHẢI CÓ SỔ NHẬP KHO ───
-- `vpp_supplies.imported` là MỘT con số cộng dồn, không gắn tháng nào. Nhập 10
-- cây bút tháng 7 và 5 cây tháng 8 thì ô đó ghi 15 — không tách ra được, nên
-- không thể trả lời "tháng này nhập bao nhiêu". Sổ dưới đây ghi từng lần nhập
-- kèm NGÀY, báo cáo tháng nào cũng cộng đúng mà không cần thao tác chốt sổ.
--
-- QUAN HỆ VỚI CỘT `imported` — CỐ Ý GIỮ CẢ HAI:
-- Cột `imported` vẫn là nguồn tính số dư cuối kỳ như cũ (nhiều chỗ trong giao
-- diện đang đọc nó). Giao diện sẽ ghi ĐỒNG THỜI: cộng vào `imported` và thêm
-- một dòng sổ. Không đổi cách tính tồn kho hiện hành = không có rủi ro lệch số
-- dư ngay lúc triển khai. Sổ chỉ dùng để BÓC TÁCH THEO THÁNG.
-- Bước 3 dưới đây nạp một dòng sổ mở đầu cho phần `imported` đã có sẵn, để tổng
-- cộng của sổ luôn khớp với cột `imported` ngay từ đầu.
--
-- ─── ĐỊNH MỨC ───
-- Theo PHÒNG BAN × VẬT TƯ × THÁNG (yêu cầu chốt 05/08/2026). Hành chính nhập
-- tay, hệ thống chỉ lưu và đối chiếu — KHÔNG tự chặn phiếu vượt định mức, chỉ
-- báo để người duyệt tự quyết.
--
-- QUYỀN: dùng lại đúng hàm `caller_can_manage_vpp()` mà migration 020 đã dựng
-- (Admin / cờ can_manage_vpp / nhân sự phòng HCNS). Đọc thì mọi tài khoản đã
-- đăng nhập đều được — phòng ban cần thấy định mức của mình khi lập phiếu.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 0. Chốt chặn: 020 phải chạy trước ───
do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'vpp_supplies'
  ) then
    raise exception 'Chưa có bảng vpp_supplies — hãy chạy migration 020 trước.';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'caller_can_manage_vpp'
  ) then
    raise exception 'Chưa có hàm caller_can_manage_vpp() — hãy chạy migration 020 trước.';
  end if;
end $$;

-- ─── 1. Sổ nhập kho ───
create table if not exists public.vpp_stock_entries (
  id         uuid primary key default gen_random_uuid(),
  supply_id  uuid not null references public.vpp_supplies(id) on delete cascade,
  qty        integer not null check (qty > 0),
  -- Ngày nhập kho thực tế. Tách khỏi created_at để nhập bù cho ngày đã qua.
  entry_date date not null default current_date,
  note       text not null default '',
  -- Email người ghi sổ, để truy lại khi số liệu lệch
  created_by text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.vpp_stock_entries is
  'Sổ nhập kho VPP — mỗi lần nhập một dòng, có ngày. Dùng để bóc tách "nhập trong tháng"; số dư cuối kỳ vẫn tính từ vpp_supplies.imported.';

-- Báo cáo luôn lọc theo khoảng ngày rồi gom theo vật tư
create index if not exists vpp_stock_entries_date_idx
  on public.vpp_stock_entries (entry_date desc);
create index if not exists vpp_stock_entries_supply_idx
  on public.vpp_stock_entries (supply_id);

-- ─── 2. Định mức theo phòng ban ───
create table if not exists public.vpp_quotas (
  id         uuid primary key default gen_random_uuid(),
  -- Tên phòng ban / ban điều hành, khớp `tasks.assignee` của phiếu VPP.
  -- Để TEXT chứ không khoá ngoại: danh sách phòng ban còn nằm ở localStorage
  -- (allocationTargets), chưa có bảng chuẩn để tham chiếu.
  department text not null,
  supply_id  uuid not null references public.vpp_supplies(id) on delete cascade,
  -- Tháng áp dụng, dạng 'YYYY-MM'
  month      text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  qty        integer not null default 0 check (qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.vpp_quotas is
  'Định mức VPP theo phòng ban × vật tư × tháng. Hành chính nhập tay; hệ thống chỉ đối chiếu và cảnh báo, KHÔNG tự chặn phiếu vượt định mức.';

-- Một phòng × một vật tư × một tháng chỉ có đúng một dòng định mức.
-- So tên phòng không phân biệt hoa/thường và khoảng trắng thừa, cùng cách
-- migration 020 chặn trùng tên vật tư.
create unique index if not exists vpp_quotas_uniq
  on public.vpp_quotas (lower(btrim(department)), supply_id, month);

create index if not exists vpp_quotas_month_idx
  on public.vpp_quotas (month);

create or replace function public.vpp_quotas_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vpp_quotas_touch_trg on public.vpp_quotas;
create trigger vpp_quotas_touch_trg
  before update on public.vpp_quotas
  for each row execute function public.vpp_quotas_touch();

-- ─── 3. Nạp dòng sổ mở đầu cho số `imported` đã có ───
-- Số nhập kho trước hôm nay không biết rơi vào tháng nào, nên gom thành MỘT
-- dòng ghi rõ là số chuyển sang. Nhờ vậy tổng của sổ khớp cột `imported` ngay
-- từ đầu, không tạo ra chênh lệch khó truy.
-- `where not exists` khiến bước này chạy lại nhiều lần vẫn không nhân đôi.
insert into public.vpp_stock_entries (supply_id, qty, entry_date, note, created_by)
select s.id, s.imported, current_date,
       'Số nhập kho chuyển sang từ trước khi có sổ (migration 025)', 'system'
from public.vpp_supplies s
where s.imported > 0
  and not exists (
    select 1 from public.vpp_stock_entries e where e.supply_id = s.id
  );

-- ─── 4. RLS ───
alter table public.vpp_stock_entries enable row level security;
alter table public.vpp_quotas        enable row level security;

-- Xoá TOÀN BỘ policy cũ (quét động — không đoán tên) trước khi dựng lại.
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('vpp_stock_entries', 'vpp_quotas')
  loop
    execute format('drop policy if exists %I on public.%I;', pol.policyname, pol.tablename);
  end loop;
end $$;

-- Bảng thật (không phải view) nên RLS có hiệu lực; vẫn chặn anon cho chắc.
revoke all on public.vpp_stock_entries from anon;
revoke all on public.vpp_stock_entries from public;
revoke all on public.vpp_quotas        from anon;
revoke all on public.vpp_quotas        from public;
grant select, insert, update, delete on public.vpp_stock_entries to authenticated;
grant select, insert, update, delete on public.vpp_quotas        to authenticated;

-- 4a. ĐỌC: mọi tài khoản đã đăng nhập.
-- Sổ nhập kho và định mức là số liệu điều hành nội bộ, không phải dữ liệu nhạy
-- cảm; phòng ban cần đọc định mức của mình khi lập phiếu.
create policy "vpp_stock_entries_select_authenticated"
  on public.vpp_stock_entries for select
  to authenticated
  using (true);

create policy "vpp_quotas_select_authenticated"
  on public.vpp_quotas for select
  to authenticated
  using (true);

-- 4b. THÊM / SỬA / XOÁ: chỉ người phụ trách VPP.
create policy "vpp_stock_entries_insert_manage"
  on public.vpp_stock_entries for insert
  to authenticated
  with check (public.caller_can_manage_vpp());

create policy "vpp_stock_entries_update_manage"
  on public.vpp_stock_entries for update
  to authenticated
  using (public.caller_can_manage_vpp())
  with check (public.caller_can_manage_vpp());

create policy "vpp_stock_entries_delete_manage"
  on public.vpp_stock_entries for delete
  to authenticated
  using (public.caller_can_manage_vpp());

create policy "vpp_quotas_insert_manage"
  on public.vpp_quotas for insert
  to authenticated
  with check (public.caller_can_manage_vpp());

create policy "vpp_quotas_update_manage"
  on public.vpp_quotas for update
  to authenticated
  using (public.caller_can_manage_vpp())
  with check (public.caller_can_manage_vpp());

create policy "vpp_quotas_delete_manage"
  on public.vpp_quotas for delete
  to authenticated
  using (public.caller_can_manage_vpp());

-- ─── 5. KIỂM TRA ───
-- 5a. Policy: mỗi bảng phải đúng 4 dòng (select / insert / update / delete)
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('vpp_stock_entries', 'vpp_quotas')
order by tablename, cmd;

-- 5b. Tổng sổ nhập kho phải KHỚP cột `imported` của từng vật tư.
--     Cột `lech` phải bằng 0 ở mọi dòng.
select s.name,
       s.imported                      as cot_imported,
       coalesce(sum(e.qty), 0)         as tong_so_nhap_kho,
       s.imported - coalesce(sum(e.qty), 0) as lech
from public.vpp_supplies s
left join public.vpp_stock_entries e on e.supply_id = s.id
group by s.id, s.name, s.imported
order by s.name;
