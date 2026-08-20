-- ============================================================
-- 060 — PHIẾU TRÌNH KÝ: TÁCH 2 LOẠI (hồ sơ/văn bản · hợp đồng)
--
-- BỐI CẢNH:
-- Công ty có thêm biểu mẫu KHKT/BM/001 "PHIẾU TRÌNH KÝ HỢP ĐỒNG" — trình duyệt
-- NỘI DUNG HỢP ĐỒNG TRƯỚC KHI KÝ, khác hẳn TL/BM/011 hiện có (trình MỘT ĐỢT
-- THANH TOÁN của hợp đồng đã ký).
--
-- VÌ SAO DÙNG CHUNG BẢNG, KHÔNG DỰNG BẢNG RIÊNG:
-- Hai loại chỉ khác nhau ở phần TRƯỜNG DỮ LIỆU. Còn lại giống hệt: sinh mã
-- phiếu, RLS, trigger khoá chuyển bước, hộp việc cần duyệt, email báo cấp duyệt,
-- đính kèm tệp, nhân đôi phiếu. Dựng bảng riêng là nhân đôi toàn bộ phần đó, và
-- tệ nhất: người duyệt phải canh HAI hộp việc thay vì một.
--
-- KHÁC BIỆT VỀ LUỒNG — QUAN TRỌNG:
--   ho_so    : Phó GĐ -> Giám đốc -> KẾ TOÁN -> Hoàn tất   (4 chặng, như cũ)
--   hop_dong : Phó GĐ -> Giám đốc -> Hoàn tất              (KHÔNG có Kế toán)
-- Tờ KHKT/BM/001 chỉ có 3 ô ký: Người trình · Phụ trách · BLĐ Phê duyệt. Không
-- có chỗ cho kế toán, vì hợp đồng chưa phát sinh chi tiền.
--
-- BẢNG SO SÁNH A-B ↔ B-B′ LƯU JSONB, KHÔNG PHẢI 12 CỘT:
-- user xác nhận số dòng THÊM/BỚT ĐƯỢC, nên không cố định 6 dòng a–f. Và đây là
-- chữ tự do chỉ để in ra giấy, không bao giờ lọc hay cộng theo — cùng lối cột
-- `files` và `ai_thieu` đang dùng.
--
-- BÊN A / BÊN B ĐỂ TRỐNG, KHÔNG MẶC ĐỊNH TRUNG NAM:
-- user xác nhận vai đổi theo loại hợp đồng — hợp đồng A-B thì Bên A là chủ đầu
-- tư còn Trung Nam là Bên B; hợp đồng B-B′ thì Trung Nam là Bên A còn nhà thầu
-- phụ là Bên B.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ file -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. CỘT MỚI ───
-- Phiếu cũ tự thành 'ho_so' nhờ default — không phải cập nhật dòng nào.
alter table public.signing_submissions
  add column if not exists loai        text not null default 'ho_so',
  add column if not exists hang_muc    text,
  add column if not exists ben_a       text,
  add column if not exists ben_b       text,
  add column if not exists vat_percent numeric,
  add column if not exists so_sanh     jsonb not null default '[]'::jsonb;

-- Ràng buộc tách riêng khỏi ADD COLUMN để chạy lại file không lỗi "đã tồn tại".
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.signing_submissions'::regclass
      and conname = 'signing_submissions_loai_check'
  ) then
    alter table public.signing_submissions
      add constraint signing_submissions_loai_check
      check (loai in ('ho_so', 'hop_dong'));
  end if;
end $$;

create index if not exists idx_signing_loai on public.signing_submissions (loai);

-- ─── 2. TRIGGER KHOÁ CHUYỂN BƯỚC ───
--
-- Dựng lại nguyên hàm của migration 053, sửa đúng HAI chỗ:
--   (a) Danh sách cột người duyệt KHÔNG được đụng: thêm 6 cột mới. Thiếu chỗ
--       này thì cấp duyệt vừa bấm duyệt vừa sửa được bảng so sánh hoặc đổi tên
--       Bên B — phiếu in một đằng, vết duyệt vẫn sạch.
--   (b) Bước cuối rẽ theo `loai`: hợp đồng đi thẳng từ Giám đốc sang Hoàn tất.
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
     -- (a) 6 cột của 060
     or new.loai                 is distinct from old.loai
     or new.hang_muc             is distinct from old.hang_muc
     or new.ben_a                is distinct from old.ben_a
     or new.ben_b                is distinct from old.ben_b
     or new.vat_percent          is distinct from old.vat_percent
     or new.so_sanh              is distinct from old.so_sanh
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
    if old.status = 'cho_pho_giam_doc' and new.status = 'cho_giam_doc' then
      return new;
    end if;

    -- (b) Chặng sau Giám đốc rẽ theo loại phiếu.
    if old.status = 'cho_giam_doc' then
      if old.loai = 'hop_dong' and new.status = 'hoan_tat' then
        return new;   -- phiếu hợp đồng: hết luồng ở Giám đốc
      end if;
      if old.loai <> 'hop_dong' and new.status = 'cho_ke_toan' then
        return new;   -- phiếu hồ sơ/văn bản: còn chặng Kế toán
      end if;
    end if;

    if old.status = 'cho_ke_toan' and new.status = 'hoan_tat' then
      return new;
    end if;

    raise exception 'Không chuyển được từ "%" sang "%" (loại phiếu: %).',
      old.status, new.status, old.loai;
  end if;

  raise exception 'Bạn không có quyền chuyển phiếu từ "%" sang "%".', old.status, new.status;
end;
$$;

-- Trigger vốn đã gắn từ 050, create or replace ở trên là đủ. Gắn lại cho chắc
-- nếu chạy file này trên một Supabase mới dựng cho khách khác.
drop trigger if exists guard_signing_transition_trg on public.signing_submissions;
create trigger guard_signing_transition_trg
  before update on public.signing_submissions
  for each row execute function public.guard_signing_transition();

-- ─── 3. KIỂM TRA ───
-- 3a. 6 cột mới đã có, và mọi phiếu cũ đều là 'ho_so'.
select loai, count(*) as so_phieu
from public.signing_submissions
group by loai
order by loai;

-- 3b. Ràng buộc loại đã gắn (phải ra đúng 1 dòng).
select conname, pg_get_constraintdef(oid) as dinh_nghia
from pg_constraint
where conrelid = 'public.signing_submissions'::regclass
  and conname = 'signing_submissions_loai_check';

-- 3c. Chạy trong SQL Editor (KHÔNG có JWT) -> BẮT BUỘC ra mảng rỗng.
select public.signing_stages_of_caller() as phai_la_mang_rong;
