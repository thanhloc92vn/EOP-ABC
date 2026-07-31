-- ============================================================
-- 020 — BẢNG THẬT CHO KHO VPP (`vpp_supplies`) + gỡ mock + siết RLS
--
-- VẤN ĐỀ (trước migration này):
-- Danh mục tồn kho Văn phòng phẩm KHÔNG có bảng riêng. Toàn bộ danh mục bị
-- nhét thành MỘT chuỗi JSON trong cột `notes` của một dòng task giả:
--       tasks.title = 'VPP_INVENTORY_CATALOG'
-- Hệ quả:
--   1. Không query / báo cáo / phân quyền được theo từng vật tư.
--   2. Ghi đè kiểu last-write-wins: mỗi lần sửa 1 ô, giao diện ghi lại TOÀN BỘ
--      JSON bằng `.eq("title", ...)` (không dùng id, không có khoá phiên bản).
--      Hai người mở tab cùng lúc -> người lưu sau xoá sạch thay đổi của người
--      trước, im lặng, không báo lỗi.
--   3. Dòng giả nằm chung bảng với Kanban `/tasks`; chỉ cần ai sửa `status` là
--      nó hiện thành một thẻ lạ giữa bảng công việc.
--   4. 3 dòng đang có trong DB vẫn là DỮ LIỆU MOCK seed từ mã nguồn
--      (Giấy A4 150 / Bút bi 12 / Kẹp bướm 45), chưa ai nhập liệu thật.
--
-- SAU MIGRATION:
--   • Bảng `vpp_supplies` — mỗi vật tư MỘT dòng, có id, sửa/xoá theo dòng.
--   • Chỉ lưu số liệu ĐẦU VÀO (initial_stock, imported). Các số dẫn xuất
--     (cấp phát / số dư cuối kỳ / trạng thái cảnh báo) do giao diện tính từ
--     phiếu VPP -> không còn cột denormalize lệch nhau như `stock` cũ.
--   • RLS: ai đăng nhập cũng ĐỌC được danh mục (cần để chọn vật tư khi lập
--     phiếu); chỉ Admin / cờ can_manage_vpp / người phòng HCNS mới THÊM-SỬA-XOÁ.
--   • Dữ liệu cũ trong JSON được bê sang bảng mới, mock được gỡ (có điều kiện).
--
-- ⚠ VỀ VIỆC GỠ MOCK (bước 4): chỉ xoá 3 dòng mock khi chúng CÒN NGUYÊN giá trị
--   seed gốc và chưa từng nhập kho (imported = 0). Nếu HCNS đã sửa số liệu trên
--   một dòng nào đó thì dòng đó đã thành dữ liệu thật -> GIỮ LẠI. Bước 7b in ra
--   để bạn đối chiếu.
--
-- ⚠ Dòng task giả KHÔNG bị xoá — chỉ đổi tên thành ..._ARCHIVED_020 để nó biến
--   khỏi mọi truy vấn của ứng dụng mà vẫn giữ JSON gốc làm bản lưu. Sau khi
--   kiểm tra bảng mới chạy đúng vài ngày, chạy câu DELETE ở bước 8 để dọn hẳn.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Bảng danh mục vật tư ───
create table if not exists public.vpp_supplies (
  id            uuid primary key default gen_random_uuid(),
  name          text    not null,
  cat           text    not null default 'Khác',
  unit          text    not null default 'cái',
  initial_stock integer not null default 0,   -- số dư đầu kỳ
  imported      integer not null default 0,   -- số lượng nhập kho trong kỳ
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.vpp_supplies is
  'Danh mục vật tư văn phòng (VPP). Chỉ lưu số liệu đầu vào; số cấp phát và số dư cuối kỳ được tính từ các phiếu VPP trong bảng tasks.';

-- Tên vật tư là khoá nghiệp vụ — giao diện đối chiếu phiếu cấp phát theo tên.
-- Chặn trùng không phân biệt hoa/thường và khoảng trắng thừa.
create unique index if not exists vpp_supplies_name_uniq
  on public.vpp_supplies (lower(btrim(name)));

-- ─── 2. Tự cập nhật updated_at ───
create or replace function public.vpp_supplies_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vpp_supplies_touch_trg on public.vpp_supplies;
create trigger vpp_supplies_touch_trg
  before update on public.vpp_supplies
  for each row execute function public.vpp_supplies_touch();

-- ─── 3. Bê dữ liệu cũ từ JSON trong tasks.notes sang bảng mới ───
-- Bỏ qua nếu notes không phải mảng JSON hợp lệ. `on conflict do nothing` khiến
-- bước này an toàn khi chạy lại: đã có dòng nào thì không đụng vào dòng đó.
do $$
declare
  moved integer := 0;
begin
  with src as (
    select item
    from public.tasks t,
         lateral jsonb_array_elements(t.notes::jsonb) as item
    where t.title = 'VPP_INVENTORY_CATALOG'
      and t.notes is not null
      and btrim(t.notes) like '[%'
      and jsonb_typeof(t.notes::jsonb) = 'array'
  ),
  parsed as (
    select
      btrim(item ->> 'name')                                        as name,
      coalesce(nullif(btrim(item ->> 'cat'),  ''), 'Khác')          as cat,
      coalesce(nullif(btrim(item ->> 'unit'), ''), 'cái')           as unit,
      -- initialStock là trường mới; các dòng seed cũ chỉ có `stock`.
      floor(coalesce(
        nullif(btrim(item ->> 'initialStock'), '')::numeric,
        nullif(btrim(item ->> 'stock'),        '')::numeric,
        0
      ))::int                                                        as initial_stock,
      floor(coalesce(nullif(btrim(item ->> 'imported'), '')::numeric, 0))::int as imported
    from src
    where coalesce(btrim(item ->> 'name'), '') <> ''
  ),
  deduped as (
    -- JSON cũ có thể chứa tên trùng nhau (khác hoa/thường) — giữ dòng có số lớn nhất.
    select distinct on (lower(name))
           name, cat, unit, initial_stock, imported
    from parsed
    order by lower(name), initial_stock desc, imported desc
  )
  insert into public.vpp_supplies (name, cat, unit, initial_stock, imported)
  select name, cat, unit, greatest(initial_stock, 0), greatest(imported, 0)
  from deduped
  on conflict do nothing;

  get diagnostics moved = row_count;
  raise notice 'Đã chuyển % vật tư từ JSON sang bảng vpp_supplies.', moved;
exception
  when others then
    raise notice 'Bỏ qua bước chuyển dữ liệu (notes không phải JSON hợp lệ): %', sqlerrm;
end $$;

-- ─── 4. GỠ MOCK — chỉ xoá dòng còn nguyên giá trị seed gốc ───
-- Dòng nào HCNS đã sửa (initial_stock khác giá trị mock, hoặc đã nhập kho)
-- được coi là dữ liệu thật và giữ nguyên.
do $$
declare
  removed integer := 0;
begin
  delete from public.vpp_supplies
  where imported = 0
    and (
         (lower(btrim(name)) = lower('Giấy A4 Double A 70gsm') and initial_stock = 150)
      or (lower(btrim(name)) = lower('Bút bi Thiên Long xanh') and initial_stock = 12)
      or (lower(btrim(name)) = lower('Kẹp bướm 25mm')          and initial_stock = 45)
    );
  get diagnostics removed = row_count;
  raise notice 'Đã gỡ % dòng mock (còn nguyên giá trị seed gốc).', removed;
end $$;

-- ─── 5. Ai được THÊM/SỬA/XOÁ danh mục VPP ───
-- Khớp đúng tập hợp mà giao diện đang cho phép: Admin, người có cờ
-- can_manage_vpp, hoặc nhân sự phòng HCNS.
create or replace function public.caller_can_manage_vpp()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- (a) Admin trong allowed_users
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and au.role = 'Admin'
    )
    -- (b) Cờ cấp qua giao diện Cài đặt > Cờ quyền người dùng.
    --     Khớp kiểu "chứa" vì cột email lưu nhiều địa chỉ trong 1 ô.
    or exists (
      select 1 from public.approval_permissions p
      where coalesce(auth.jwt() ->> 'email', '') <> ''
        and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
        and p.can_manage_vpp = true
    )
    -- (c) Nhân sự phòng HCNS (khớp lib/access.ts:isHrDept, cả có dấu lẫn không dấu)
    or exists (
      select 1 from public.employees e
      where coalesce(auth.jwt() ->> 'email', '') <> ''
        and position(lower(auth.jwt() ->> 'email') in lower(coalesce(e.email, ''))) > 0
        and (
             lower(coalesce(e.department, '')) like '%hành chính%'
          or lower(coalesce(e.department, '')) like '%hanh chinh%'
          or lower(coalesce(e.department, '')) like '%nhân sự%'
          or lower(coalesce(e.department, '')) like '%nhan su%'
          or lower(coalesce(e.department, '')) like '%hcns%'
        )
    );
$$;

-- ─── 6. RLS ───
alter table public.vpp_supplies enable row level security;

-- Xoá TOÀN BỘ policy cũ (quét động — không đoán tên) trước khi dựng lại.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'vpp_supplies'
  loop
    execute format('drop policy if exists %I on public.vpp_supplies;', pol.policyname);
  end loop;
end $$;

-- Bảng thật (không phải view) nên RLS có hiệu lực; vẫn chặn anon cho chắc.
revoke all on public.vpp_supplies from anon;
revoke all on public.vpp_supplies from public;
grant select, insert, update, delete on public.vpp_supplies to authenticated;

-- 6a. ĐỌC: mọi người đã đăng nhập. Cần cho ô chọn vật tư khi lập phiếu yêu cầu
--     cấp phát — đây là danh mục văn phòng phẩm, không phải dữ liệu nhạy cảm.
create policy "vpp_supplies_select_authenticated"
  on public.vpp_supplies for select
  to authenticated
  using (true);

-- 6b/c/d. THÊM / SỬA / XOÁ: chỉ người phụ trách VPP.
create policy "vpp_supplies_insert_manage"
  on public.vpp_supplies for insert
  to authenticated
  with check (public.caller_can_manage_vpp());

create policy "vpp_supplies_update_manage"
  on public.vpp_supplies for update
  to authenticated
  using (public.caller_can_manage_vpp())
  with check (public.caller_can_manage_vpp());

create policy "vpp_supplies_delete_manage"
  on public.vpp_supplies for delete
  to authenticated
  using (public.caller_can_manage_vpp());

-- ─── 7. Đưa dòng task giả ra khỏi tầm nhìn của ứng dụng ───
-- Đổi tên thay vì xoá: JSON gốc được giữ làm bản lưu, đồng thời không còn
-- khớp truy vấn nào (`title = 'VPP_INVENTORY_CATALOG'` hay `title ilike 'VPP:%'`).
update public.tasks
set title = 'VPP_INVENTORY_CATALOG_ARCHIVED_020'
where title = 'VPP_INVENTORY_CATALOG';

-- ─── 8. KIỂM TRA ───
-- 8a. Policy: phải đúng 4 dòng (select / insert / update / delete)
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'vpp_supplies'
order by cmd;

-- 8b. Danh mục sau khi dọn. Nếu ra 0 dòng: mock đã gỡ sạch, HCNS bắt đầu nhập
--     liệu thật bằng nút "Nhập kho mới". Nếu còn dòng mock nào -> dòng đó đã
--     bị sửa số liệu nên được giữ lại, xoá tay trên giao diện nếu không cần.
select name, cat, unit, initial_stock, imported, created_at
from public.vpp_supplies
order by name;

-- 8c. Bản lưu JSON cũ (giữ để đối chiếu). Sau khi bảng mới chạy ổn định,
--     chạy câu DELETE dưới đây để dọn hẳn dòng task giả:
--     delete from public.tasks where title = 'VPP_INVENTORY_CATALOG_ARCHIVED_020';
select id, title, left(coalesce(notes, ''), 300) as notes_preview
from public.tasks
where title = 'VPP_INVENTORY_CATALOG_ARCHIVED_020';
