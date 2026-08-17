-- ============================================================
-- 053 — GỘP HAI BƯỚC PHÓ GIÁM ĐỐC THÀNH MỘT CHẶNG
--
-- THAY ĐỔI NGHIỆP VỤ:
-- Migration 050 dựng luồng tuần tự PGĐ QLDA -> PGĐ KHĐT -> Giám đốc, tức phiếu
-- phải qua ĐỦ CẢ HAI Phó Giám đốc. Thực tế chỉ cần MỘT trong hai vị xem xét là
-- chuyển thẳng Giám đốc — vị nào rảnh trước thì xem trước, không ai phải chờ ai.
--
-- LUỒNG MỚI:
--   nhap ──> cho_pho_giam_doc ──> cho_giam_doc ──> cho_ke_toan ──> hoan_tat
--              (QLDA HOẶC KHĐT)
--   Trả lại vẫn từ bất kỳ bước nào -> tra_lai.
--
-- VẪN GIỮ HAI CỜ QUYỀN RIÊNG (qlda / khdt), KHÔNG gộp làm một:
-- tờ phiếu giấy TL/BM/011 có HAI ô ý kiến riêng (mục 3 cho P.QLDA, mục 4 cho
-- P.KHĐT). Phải biết ai ký để ghi ý kiến vào đúng ô — gộp cờ thì mất thông tin
-- đó. Ô của vị không ký để trắng, đúng như tờ giấy.
--
-- HAI TRẠNG THÁI CŨ 'cho_pgd_qlda' / 'cho_pgd_khdt' vẫn nằm trong danh sách
-- hợp lệ: phiếu đang chạy dở được chuyển sang trạng thái mới ở mục 2, nhưng giữ
-- lại giá trị cũ để không có dòng nào rơi ra ngoài check constraint giữa chừng.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- YÊU CẦU: đã chạy 050 và 052.
-- ============================================================

-- ─── 1. NỚI CHECK CONSTRAINT ───
alter table public.signing_submissions
  drop constraint if exists signing_submissions_status_check;

alter table public.signing_submissions
  add constraint signing_submissions_status_check
  check (status in (
    'nhap',
    'cho_pho_giam_doc',
    'cho_giam_doc',
    'cho_ke_toan',
    'hoan_tat',
    'tra_lai',
    -- Hai giá trị cũ, giữ để phiếu lịch sử không vi phạm ràng buộc.
    'cho_pgd_qlda',
    'cho_pgd_khdt'
  ));

-- ─── 2. CHUYỂN PHIẾU ĐANG CHẠY DỞ ───
-- Trigger guard chỉ canh UPDATE của người dùng; lệnh này chạy bằng quyền chủ
-- bảng trong SQL Editor nên không vướng, nhưng vẫn tắt trigger cho chắc —
-- không thì mọi dòng đều bị "Bạn không có quyền chuyển phiếu" vì phiên SQL
-- Editor không có JWT.
alter table public.signing_submissions disable trigger guard_signing_transition_trg;

update public.signing_submissions
set status = 'cho_pho_giam_doc'
where status in ('cho_pgd_qlda', 'cho_pgd_khdt');

alter table public.signing_submissions enable trigger guard_signing_transition_trg;

-- ─── 3. NGƯỜI GIỮ CHẶNG: MỘT TRONG HAI PHÓ GIÁM ĐỐC ───
-- Giữ nguyên điều kiện "email đăng nhập KHÁC RỖNG" — thiếu nó thì
-- position('' in bất_kỳ_chuỗi_nào) = 1, phiên không danh tính khớp mọi dòng.
create or replace function public.signing_stages_of_caller()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select array_remove(array[
        -- MỘT trong hai cờ Phó Giám đốc là đủ giữ chặng này.
        case when bool_or(p.can_approve_signing_qlda)
               or bool_or(p.can_approve_signing_khdt)      then 'cho_pho_giam_doc' end,
        case when bool_or(p.can_approve_signing_director)   then 'cho_giam_doc'    end,
        case when bool_or(p.can_approve_signing_accounting) then 'cho_ke_toan'     end
      ], null)
     from public.approval_permissions p
     where coalesce(auth.jwt() ->> 'email', '') <> ''
       and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0),
    '{}'::text[]
  );
$$;

-- ─── 4. TRIGGER THEO LUỒNG MỚI ───
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
  -- Thiếu chốt này thì cấp duyệt vừa bấm duyệt vừa đổi được "giá trị đề nghị
  -- thanh toán" trong cùng một lệnh UPDATE — phiếu in một đằng, tiền chuyển một
  -- nẻo, mà vết duyệt vẫn sạch. Muốn sửa thì phải TRẢ LẠI cho người lập.
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
  if old.status in ('nhap','tra_lai') and new.status = 'cho_pho_giam_doc' then
    if not is_owner then
      raise exception 'Chỉ người lập phiếu mới được trình phiếu.';
    end if;
    return new;
  end if;

  -- Duyệt tiến một bước: phải đúng cấp đang giữ phiếu, và đúng bước kế tiếp.
  if old.status = any(stages) then
    if (old.status = 'cho_pho_giam_doc' and new.status = 'cho_giam_doc')
    or (old.status = 'cho_giam_doc'     and new.status = 'cho_ke_toan')
    or (old.status = 'cho_ke_toan'      and new.status = 'hoan_tat') then
      return new;
    end if;
    raise exception 'Không chuyển được từ "%" sang "%".', old.status, new.status;
  end if;

  raise exception 'Bạn không có quyền chuyển phiếu từ "%" sang "%".', old.status, new.status;
end;
$$;

-- ─── 5. KIỂM TRA ───
-- 5a. Không còn phiếu nào ở hai trạng thái cũ
select status, count(*) as so_phieu
from public.signing_submissions
group by status
order by status;

-- 5b. Chạy trong SQL Editor (KHÔNG có JWT) -> BẮT BUỘC ra mảng rỗng
select public.signing_stages_of_caller() as phai_la_mang_rong;

-- 5c. Ai đang giữ chặng Phó Giám đốc
select name, email, can_approve_signing_qlda, can_approve_signing_khdt
from public.approval_permissions
where can_approve_signing_qlda or can_approve_signing_khdt
order by name;
