-- ============================================================
-- 050 — PHIẾU TRÌNH KÝ HỒ SƠ/VĂN BẢN + LUỒNG DUYỆT 4 CẤP
--
-- MỤC ĐÍCH:
-- P. Kế hoạch Đấu thầu lập "Phiếu trình ký hồ sơ/văn bản" (mẫu TL/BM/011) cho
-- từng đợt thanh toán A-B, in ra giấy rồi cầm đi xin chữ ký lần lượt 3 cấp, cuối
-- cùng chuyển Kế toán. Tờ giấy đi tới đâu không ai tra được, và số liệu đợt
-- trước phải lật sổ tìm lại.
--
-- Bảng này lưu phiếu + toàn bộ vết duyệt, để:
--   1. Biết phiếu đang nằm ở cấp nào, ai đã ký, ký lúc nào.
--   2. TỰ CỘNG luỹ kế đã thanh toán từ các đợt trước của cùng hợp đồng —
--      xem hàm public.luy_ke_da_thanh_toan() ở mục 6. Đây là con số dễ sai nhất
--      khi làm tay, và cũng là con số AI tuyệt đối không được đoán.
--
-- LUỒNG (mục 5 dựng trigger canh, không tin mỗi giao diện):
--
--   nhap ──trình──> cho_pgd_qlda ──> cho_pgd_khdt ──> cho_giam_doc
--                                                          │
--                                                          v
--                        hoan_tat <──xác nhận đã chi── cho_ke_toan
--
--   Bất kỳ cấp nào cũng có thể TRẢ LẠI -> status = 'tra_lai', người lập sửa
--   rồi trình lại từ đầu (quay về cho_pgd_qlda).
--
-- PHÂN QUYỀN: 4 cờ mới trong approval_permissions, tick trong Cài đặt >
-- Cờ quyền. Đổi người phụ trách KHÔNG phải sửa SQL.
--
-- CHƯA LÀM Ở FILE NÀY: kho file hồ sơ gốc (bucket storage). Cố ý tách sang bước
-- sau — lệnh trên storage.objects mà lỗi là kéo rollback sạch cả file trong
-- SQL Editor (chạy trong MỘT transaction), mất luôn phần bảng đã tạo.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. CỜ QUYỀN ───
alter table public.approval_permissions
  add column if not exists can_approve_signing_qlda      boolean not null default false,
  add column if not exists can_approve_signing_khdt      boolean not null default false,
  add column if not exists can_approve_signing_director  boolean not null default false,
  add column if not exists can_approve_signing_accounting boolean not null default false,
  -- Ai được LẬP phiếu. Tách khỏi cờ xem Báo cáo: kế toán/giám đốc cần xem và
  -- duyệt nhưng không phải người lập, còn chuyên viên KHĐT thì ngược lại.
  add column if not exists can_create_signing            boolean not null default false;

-- ─── 2. BẢNG PHIẾU ───
create table if not exists public.signing_submissions (
  id                    uuid primary key default gen_random_uuid(),
  ma_phieu              text unique,            -- TK-2026-0001, sinh ở trigger

  -- Phần đầu phiếu (người lập tự gõ, AI không đặt hộ)
  don_vi                text,
  ve_viec               text,
  noi_dung_trinh        text,

  -- 13 trường trong khung đỏ
  dot_so                integer,
  chu_dau_tu            text,
  du_an                 text,
  hop_dong_so           text,
  ngay_ky_hop_dong      text,                   -- giữ text: hồ sơ ghi "01/4/2026"
  goi_thau              text,
  gia_tri_hd            numeric(20,2),
  gia_tri_nghiem_thu    numeric(20,2),          -- (A)
  giu_bao_hanh          numeric(20,2),          -- (B)
  giu_lai_tung_lan      numeric(20,2),          -- (C)
  ty_le_giu_lai         numeric(6,2),
  khau_tru_tam_ung      numeric(20,2),          -- (D)
  ty_le_thu_hoi         numeric(6,2),
  de_nghi_thanh_toan    numeric(20,2),          -- A-B-C-D, cho phép ghi đè tay
  luy_ke_da_thanh_toan  numeric(20,2),
  tam_ung_con_lai       numeric(20,2),

  -- Gắn danh mục dự án (migration 037). Lưu CẢ mã lẫn tên, KHÔNG khoá ngoại —
  -- cùng chủ đích 037/048: đổi tên dự án không được sửa ngược phiếu đã trình.
  project_code          text,
  project_name          text,

  -- Vết của AI, để người lập biết số nào máy đọc được, số nào tự điền
  ai_ghi_chu            text,
  ai_thieu              jsonb not null default '[]'::jsonb,
  files                 jsonb not null default '[]'::jsonb,  -- hồ sơ gốc, dùng ở bước sau

  -- Trạng thái
  status                text not null default 'nhap'
                        check (status in ('nhap','cho_pgd_qlda','cho_pgd_khdt',
                                          'cho_giam_doc','cho_ke_toan','hoan_tat','tra_lai')),

  -- Vết duyệt từng cấp
  ykien_qlda            text,
  qlda_by               text,
  qlda_at               timestamptz,
  ykien_khdt            text,
  khdt_by               text,
  khdt_at               timestamptz,
  ykien_giam_doc        text,
  giam_doc_by           text,
  giam_doc_at           timestamptz,
  ke_toan_by            text,
  ke_toan_at            timestamptz,
  ngay_chi              date,

  -- Vết trả lại
  tra_lai_tu            text,                   -- trả lại từ bước nào
  tra_lai_boi           text,
  tra_lai_luc           timestamptz,
  tra_lai_ly_do         text,

  created_by            text not null,          -- email người lập
  created_by_name       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_signing_status   on public.signing_submissions (status);
create index if not exists idx_signing_creator  on public.signing_submissions (lower(created_by));
create index if not exists idx_signing_hopdong  on public.signing_submissions (hop_dong_so);
create index if not exists idx_signing_project  on public.signing_submissions (project_code);

-- Một hợp đồng chỉ có MỘT phiếu cho mỗi đợt. Bỏ qua phiếu đã trả lại/nháp để
-- người lập còn sửa lại được mà không vướng trùng.
create unique index if not exists uq_signing_hopdong_dot
  on public.signing_submissions (hop_dong_so, dot_so)
  where hop_dong_so is not null and dot_so is not null
    and status not in ('tra_lai','nhap');

-- ─── 3. updated_at + mã phiếu tự sinh ───
create sequence if not exists public.signing_submissions_seq;

create or replace function public.signing_submissions_touch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and (new.ma_phieu is null or new.ma_phieu = '') then
    new.ma_phieu := 'TK-' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY')
                  || '-' || lpad(nextval('public.signing_submissions_seq')::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists signing_submissions_touch_trg on public.signing_submissions;
create trigger signing_submissions_touch_trg
  before insert or update on public.signing_submissions
  for each row execute function public.signing_submissions_touch();

-- ─── 4. AI NHẬN DIỆN NGƯỜI DUYỆT ───
--
-- ⚠ BẮT BUỘC có điều kiện "email đăng nhập KHÁC RỖNG".
-- position('' in bất_kỳ_chuỗi_nào) = 1, nên thiếu điều kiện này thì phiên KHÔNG
-- có danh tính sẽ khớp MỌI dòng và được coi là có đủ quyền. Đã dính đúng bẫy
-- này ở migration 018 — kiểm chứng bằng cách gọi hàm trong SQL Editor (nơi
-- không có JWT): phải trả về mảng rỗng.
--
-- Trả về DANH SÁCH trạng thái mà người gọi được phép duyệt. Gộp 4 cờ vào một
-- hàm thay vì viết 4 hàm gần giống hệt nhau: RLS chỉ cần một phép `= any(...)`.
create or replace function public.signing_stages_of_caller()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select array_remove(array[
        case when bool_or(p.can_approve_signing_qlda)       then 'cho_pgd_qlda'  end,
        case when bool_or(p.can_approve_signing_khdt)       then 'cho_pgd_khdt'  end,
        case when bool_or(p.can_approve_signing_director)   then 'cho_giam_doc'  end,
        case when bool_or(p.can_approve_signing_accounting) then 'cho_ke_toan'   end
      ], null)
     from public.approval_permissions p
     where coalesce(auth.jwt() ->> 'email', '') <> ''
       and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0),
    '{}'::text[]
  );
$$;

create or replace function public.can_create_signing_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') <> ''
     and exists (
       select 1 from public.approval_permissions p
       where p.can_create_signing = true
         and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
     );
$$;

-- Có mặt trong luồng = người lập, hoặc giữ bất kỳ cờ duyệt nào, hoặc Admin.
--
-- coalesce quanh array_length KHÔNG thừa: array_length('{}', 1) trả NULL chứ
-- không phải 0, nên thiếu nó thì người ngoài luồng nhận NULL thay vì false —
-- RLS coi NULL là cấm nên vẫn an toàn, nhưng trigger mục 5 dùng lại hàm này thì
-- NULL sẽ luồn qua các nhánh if một cách khó lần.
create or replace function public.signing_is_participant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_caller()
      or public.can_create_signing_caller()
      or coalesce(array_length(public.signing_stages_of_caller(), 1), 0) > 0;
$$;

-- ─── 5. TRIGGER CANH LUỒNG ───
-- RLS quyết định "được đụng vào dòng này không", còn trigger quyết định "được
-- đổi sang trạng thái nào". Tách hai việc: RLS không diễn tả nổi máy trạng thái,
-- mà nhét luật chuyển bước vào giao diện thì gọi thẳng REST API là lách được.
create or replace function public.guard_signing_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin   boolean := public.is_admin_caller();
  stages     text[]  := public.signing_stages_of_caller();
  is_owner   boolean := coalesce(auth.jwt() ->> 'email', '') <> ''
                        and lower(old.created_by) = lower(auth.jwt() ->> 'email');
begin
  if old.status = new.status then
    -- Không đổi trạng thái: chỉ người lập được sửa nội dung, và chỉ khi phiếu
    -- còn ở nháp/bị trả lại. Đã trình đi rồi mà sửa số thì cấp trên ký một đằng
    -- giấy tờ một nẻo.
    if not (is_admin or (is_owner and old.status in ('nhap','tra_lai'))) then
      raise exception 'Phiếu đang ở bước "%" nên không sửa được nội dung.', old.status;
    end if;
    return new;
  end if;

  if is_admin then
    return new;
  end if;

  -- ⚠ NGƯỜI DUYỆT KHÔNG ĐƯỢC SỬA SỐ LIỆU.
  -- Không có chốt này thì cấp duyệt hoàn toàn có thể vừa bấm duyệt vừa đổi
  -- "giá trị đề nghị thanh toán" trong cùng một lệnh UPDATE — phiếu in ra một
  -- đằng, số chuyển đi một nẻo, mà vết duyệt vẫn sạch sẽ. Người lập muốn sửa
  -- thì phải bị TRẢ LẠI rồi sửa ở trạng thái 'tra_lai'.
  if not is_owner then
    if  new.don_vi               is distinct from old.don_vi
     or new.ve_viec              is distinct from old.ve_viec
     or new.noi_dung_trinh       is distinct from old.noi_dung_trinh
     or new.dot_so               is distinct from old.dot_so
     or new.chu_dau_tu           is distinct from old.chu_dau_tu
     or new.du_an                is distinct from old.du_an
     or new.hop_dong_so          is distinct from old.hop_dong_so
     or new.ngay_ky_hop_dong     is distinct from old.ngay_ky_hop_dong
     or new.goi_thau             is distinct from old.goi_thau
     or new.gia_tri_hd           is distinct from old.gia_tri_hd
     or new.gia_tri_nghiem_thu   is distinct from old.gia_tri_nghiem_thu
     or new.giu_bao_hanh         is distinct from old.giu_bao_hanh
     or new.giu_lai_tung_lan     is distinct from old.giu_lai_tung_lan
     or new.ty_le_giu_lai        is distinct from old.ty_le_giu_lai
     or new.khau_tru_tam_ung     is distinct from old.khau_tru_tam_ung
     or new.ty_le_thu_hoi        is distinct from old.ty_le_thu_hoi
     or new.de_nghi_thanh_toan   is distinct from old.de_nghi_thanh_toan
     or new.luy_ke_da_thanh_toan is distinct from old.luy_ke_da_thanh_toan
     or new.tam_ung_con_lai      is distinct from old.tam_ung_con_lai
     or new.project_code         is distinct from old.project_code
     or new.files                is distinct from old.files
     or new.created_by           is distinct from old.created_by
    then
      raise exception 'Người duyệt không được sửa số liệu trên phiếu. Nếu số sai, hãy TRẢ LẠI để người lập sửa.';
    end if;
  end if;

  -- Trả lại: chỉ cấp ĐANG giữ phiếu mới được trả, và phải ghi lý do.
  if new.status = 'tra_lai' then
    if not (old.status = any(stages)) then
      raise exception 'Bạn không phải cấp đang xử lý phiếu này nên không trả lại được.';
    end if;
    if coalesce(new.tra_lai_ly_do, '') = '' then
      raise exception 'Phải ghi lý do khi trả lại phiếu.';
    end if;
    return new;
  end if;

  -- Người lập trình phiếu đi (lần đầu hoặc sau khi bị trả lại).
  if old.status in ('nhap','tra_lai') and new.status = 'cho_pgd_qlda' then
    if not is_owner then
      raise exception 'Chỉ người lập phiếu mới được trình phiếu.';
    end if;
    return new;
  end if;

  -- Duyệt tiến một bước: phải đúng cấp đang giữ phiếu, và đúng bước kế tiếp.
  if old.status = any(stages) then
    if (old.status = 'cho_pgd_qlda' and new.status = 'cho_pgd_khdt')
    or (old.status = 'cho_pgd_khdt' and new.status = 'cho_giam_doc')
    or (old.status = 'cho_giam_doc' and new.status = 'cho_ke_toan')
    or (old.status = 'cho_ke_toan'  and new.status = 'hoan_tat') then
      return new;
    end if;
    raise exception 'Không chuyển được từ "%" sang "%".', old.status, new.status;
  end if;

  raise exception 'Bạn không có quyền chuyển phiếu từ "%" sang "%".', old.status, new.status;
end;
$$;

drop trigger if exists guard_signing_transition_trg on public.signing_submissions;
create trigger guard_signing_transition_trg
  before update on public.signing_submissions
  for each row execute function public.guard_signing_transition();

-- ─── 6. TỰ CỘNG LUỸ KẾ ĐÃ THANH TOÁN ───
-- Cộng "giá trị đề nghị thanh toán" của MỌI đợt trước cùng hợp đồng đã đi hết
-- luồng, cộng thêm đợt đang lập. Con số này làm tay rất dễ sai, và là con số
-- prompt đã CẤM model tự đoán.
create or replace function public.luy_ke_da_thanh_toan(
  p_hop_dong_so text,
  p_dot_so      integer,
  p_dot_nay     numeric default 0
)
returns numeric
language sql
stable
security definer
set search_path = public
-- SECURITY DEFINER nên hàm này ĐỌC XUYÊN RLS (cố ý — người lập đợt 5 cần cộng
-- các đợt trước kể cả đợt do người khác lập). Vì vậy phải tự kiểm tra người gọi
-- có chân trong luồng không, nếu không thì ai đăng nhập cũng dò được tổng giá
-- trị đã thanh toán của bất kỳ hợp đồng nào chỉ bằng cách đoán số hợp đồng.
as $$
  select case
    when not public.signing_is_participant() then null
    else coalesce((
      select sum(s.de_nghi_thanh_toan)
      from public.signing_submissions s
      where s.hop_dong_so = p_hop_dong_so
        and s.dot_so < p_dot_so
        and s.status not in ('tra_lai','nhap')
    ), 0) + coalesce(p_dot_nay, 0)
  end;
$$;

-- ─── 7. RLS ───
alter table public.signing_submissions enable row level security;

-- Xoá TOÀN BỘ policy cũ bằng vòng lặp thay vì đoán tên — chạy lại file này
-- nhiều lần vẫn sạch, không bỏ sót policy Supabase tự sinh.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'signing_submissions'
  loop
    execute format('drop policy %I on public.signing_submissions', p.policyname);
  end loop;
end $$;

-- ĐỌC: ai có chân trong luồng thì thấy tất cả phiếu (cần đối chiếu đợt trước),
-- ngoài ra người lập luôn thấy phiếu của chính mình.
create policy "signing_select" on public.signing_submissions
  for select to authenticated
  using (
    public.signing_is_participant()
    or (coalesce(auth.jwt() ->> 'email', '') <> ''
        and lower(created_by) = lower(auth.jwt() ->> 'email'))
  );

-- TẠO: chỉ người được cấp cờ lập phiếu, và phải đứng tên chính mình.
--
-- ⚠ RÀNG status NGAY Ở ĐÂY. Trigger mục 5 chỉ canh UPDATE, nên nếu không chặn
-- thì gọi thẳng REST API tạo một dòng status='hoan_tat' là nhảy qua sạch 4 cấp
-- duyệt, phiếu trông như đã được Giám đốc ký. Phiếu mới chỉ được phép ở 'nhap'
-- (lưu nháp) hoặc 'cho_pgd_qlda' (lập xong trình luôn).
create policy "signing_insert" on public.signing_submissions
  for insert to authenticated
  with check (
    (public.is_admin_caller() or public.can_create_signing_caller())
    and lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and coalesce(auth.jwt() ->> 'email', '') <> ''
    and status in ('nhap','cho_pgd_qlda')
    -- Không cho khai sẵn vết duyệt của cấp trên ngay lúc tạo.
    and qlda_at is null and khdt_at is null
    and giam_doc_at is null and ke_toan_at is null
  );

-- SỬA: người lập (phần luật bước nào được sửa nằm ở trigger mục 5) hoặc cấp
-- đang giữ phiếu hoặc Admin.
create policy "signing_update" on public.signing_submissions
  for update to authenticated
  using (
    public.is_admin_caller()
    or (coalesce(auth.jwt() ->> 'email', '') <> ''
        and lower(created_by) = lower(auth.jwt() ->> 'email'))
    or status = any(public.signing_stages_of_caller())
  );

-- XOÁ: chỉ Admin, hoặc người lập xoá phiếu chưa trình đi.
create policy "signing_delete" on public.signing_submissions
  for delete to authenticated
  using (
    public.is_admin_caller()
    or (status in ('nhap','tra_lai')
        and coalesce(auth.jwt() ->> 'email', '') <> ''
        and lower(created_by) = lower(auth.jwt() ->> 'email'))
  );

-- ─── 8. KIỂM TRA ───
-- Bảng vừa tạo phải rỗng, 5 cờ phải có mặt.
select 'signing_submissions' as bang, count(*) as so_dong from public.signing_submissions;

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'approval_permissions'
  and column_name like 'can_%signing%'
order by column_name;

-- Phép thử RLS: chạy trong SQL Editor (KHÔNG có JWT).
-- BẮT BUỘC ra mảng rỗng và false. Ra khác là hàm hở, dừng lại sửa ngay.
select public.signing_stages_of_caller()  as phai_la_mang_rong,
       public.can_create_signing_caller() as phai_la_false;

-- Ai đang được cấp quyền trong luồng trình ký (lúc mới chạy sẽ chưa có ai —
-- vào Cài đặt > Cờ quyền tick cho từng người):
select name, email,
       can_create_signing, can_approve_signing_qlda, can_approve_signing_khdt,
       can_approve_signing_director, can_approve_signing_accounting
from public.approval_permissions
where can_create_signing or can_approve_signing_qlda or can_approve_signing_khdt
   or can_approve_signing_director or can_approve_signing_accounting
order by name;
