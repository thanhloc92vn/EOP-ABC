-- ============================================================
-- 040_my_contract_type_fn.sql — LOẠI HĐLĐ CỦA CHÍNH MÌNH (ô "Loại hợp đồng")
--
-- VẤN ĐỀ: migration 018 khoá bảng `contracts` chỉ cho Admin + người có cờ
-- "Xem lương & HĐLĐ". Đúng như thiết kế, NHƯNG ô "Loại hợp đồng" ở đầu hồ sơ
-- nhân viên (trang C&B) lại đọc thẳng bảng đó — nên nhân viên thường nhận về
-- 0 dòng và luôn thấy "Chưa ký HĐ", kể cả khi họ đã ký hợp đồng thật.
--
-- CÁCH XỬ LÝ: mở ĐÚNG MỘT Ô DỮ LIỆU, không nới RLS.
--   Hàm security definer dưới đây chỉ trả về MỘT chuỗi: cột `type` (Loại HĐLĐ)
--   trong hợp đồng của CHÍNH người đang đăng nhập. Không trả lương, không trả
--   số HĐ, không trả hợp đồng của bất kỳ ai khác — không có tham số nào để
--   người gọi trỏ sang người khác.
--
-- Cách khớp người: đúng quy ước toàn hệ thống — "email đã lưu CHỨA email đăng
-- nhập" (một người có thể lưu nhiều email ngăn bởi dấu phẩy).
-- Cách chọn hợp đồng: y hệt giao diện — ưu tiên HĐ có số thật + ngày ký, rồi
-- tới HĐ có số thật, cuối cùng là bản ghi mới nhất. ("Số thật" = không mang
-- tiền tố IMPORT- do hệ thống tự sinh.)
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ file -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

create or replace function public.my_contract_type()
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  -- Để kiểu text và so sánh bằng ::text: bảng `contracts` được tạo tay từ giao
  -- diện Supabase nên employee_id có nơi là uuid, có nơi là text. Bảng chỉ vài
  -- trăm dòng nên ép kiểu không ảnh hưởng tốc độ.
  v_id    text;
  v_code  text;
  v_name  text;
  v_type  text;
begin
  -- ⚠ BẮT BUỘC: position('' in bất_kỳ_chuỗi_nào) = 1, nên phiên KHÔNG có danh
  -- tính (email rỗng) sẽ khớp với MỌI nhân viên nếu bỏ chốt này. Cùng cái bẫy
  -- đã dính ở migration 018.
  if v_email = '' then
    return null;
  end if;

  select e.id::text, e.employee_code, e.name
    into v_id, v_code, v_name
  from public.employees e
  where position(v_email in lower(coalesce(e.email, ''))) > 0
  limit 1;

  if not found then
    return null;
  end if;

  select c.type
    into v_type
  from public.contracts c
  where (c.employee_id is not null and c.employee_id::text = v_id)
     or (coalesce(btrim(v_code), '') <> ''
         and btrim(coalesce(c.employee_code, '')) = btrim(v_code))
     or (c.employee_name is not null
         and lower(btrim(regexp_replace(c.employee_name, '\([^)]*\)', '', 'g')))
           = lower(btrim(coalesce(v_name, ''))))
  order by
    case
      when coalesce(c.contract_number, '') <> ''
       and c.contract_number not like 'IMPORT-%'
       and c.sign_date is not null then 0
      when coalesce(c.contract_number, '') <> ''
       and c.contract_number not like 'IMPORT-%' then 1
      else 2
    end,
    c.created_at desc nulls last
  limit 1;

  return v_type;
end;
$fn$;

-- Chỉ người ĐÃ ĐĂNG NHẬP mới gọi được. Thu quyền của anon/public cho chắc —
-- mặc định Postgres cấp execute cho public.
revoke all on function public.my_contract_type() from public;
revoke all on function public.my_contract_type() from anon;
grant execute on function public.my_contract_type() to authenticated;


-- ─── KIỂM CHỨNG SAU KHI CHẠY ───
-- 1) Chạy ngay trong SQL Editor (nơi KHÔNG có danh tính đăng nhập):
--    PHẢI trả về NULL. Nếu ra một loại hợp đồng nào đó nghĩa là đang khớp nhầm
--    email rỗng với mọi nhân viên -> chạy lại bản mới nhất của file này.
select public.my_contract_type() as phai_la_null;

-- 2) ĐO THẬT: đăng nhập bằng 1 tài khoản NHÂN VIÊN THƯỜNG (không có cờ
--    "Xem lương & HĐLĐ"), mở Console trình duyệt:
--       await supabase.rpc('my_contract_type')
--    PHẢI ra đúng Loại HĐLĐ của người đó. Đồng thời:
--       await supabase.from('contracts').select('*').limit(1)
--    PHẢI vẫn ra 0 dòng — khoá lương của migration 018 không được hở.
