-- ============================================================
-- 065 — THU HẸP TẦM NHÌN THEO NGƯỜI LẬP (Phiếu trình ký + Kế hoạch TC)
--
-- THAY ĐỔI NGHIỆP VỤ (user chốt 24/08/2026):
-- Nhân viên A lập phiếu chỉ thấy phiếu của A, nhân viên B chỉ thấy của B.
-- Ban lãnh đạo thấy hết.
--
-- ĐÂY LÀ VIỆC ĐẢO LẠI HAI QUYẾT ĐỊNH CŨ, ghi rõ ra để người đọc sau không
-- tưởng là sửa nhầm:
--   • 050 mục 7 từng ghi "ai có chân trong luồng thì thấy tất cả phiếu".
--   • 058 mục 3 từng ghi "cả module cùng nhìn một bản kế hoạch".
-- Cả hai nay bị thay bởi yêu cầu trên. Phần LÝ DO của hai ghi chú đó vẫn đúng
-- và vẫn được tôn trọng — xem mục 2 và 3 bên dưới.
--
-- ⚠ HỆ QUẢ ĐÃ CÂN NHẮC, KHÔNG PHẢI BỎ SÓT:
--   1. Tổng thu/chi tháng và file Excel "Kế hoạch TC" của một nhân viên từ nay
--      CHỈ gồm dòng của chính họ. Muốn bản đầy đủ toàn công ty thì phải là
--      Admin hoặc Ban lãnh đạo. Đây chính là cái giá của việc ẩn theo người.
--   2. Người lập có thể gặp lỗi trùng "đợt" trên một hợp đồng do đồng nghiệp
--      đã lập mà họ không nhìn thấy (unique index uq_signing_hopdong_dot của
--      050). Lỗi sẽ khó hiểu vì dòng gây trùng bị ẩn. Chấp nhận: thà báo trùng
--      còn hơn để hai phiếu cùng đợt cùng chạy.
--   3. KHÔNG đụng `signing_is_participant()` — hàm đó là chốt chặn của
--      `luy_ke_da_thanh_toan()` (050 mục 6), vốn CỐ Ý đọc xuyên RLS để cộng các
--      đợt trước kể cả đợt do người khác lập. Sửa nó là làm sai số luỹ kế trên
--      mọi phiếu. Luỹ kế vì vậy vẫn đúng dù người lập không còn thấy đợt cũ.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ file -> Run.
-- An toàn chạy lại nhiều lần.
-- YÊU CẦU: đã chạy 050, 053, 058.
-- ============================================================

-- ─── 1. HAI HÀM NHẬN DIỆN NGƯỜI GỌI ───

-- Email của phiên đang gọi, đã lower + không bao giờ NULL.
-- Tách ra thành hàm để policy bên dưới không lặp lại `lower(coalesce(...))`
-- bốn lần — mỗi lần lặp là một chỗ có thể quên mất bẫy chuỗi rỗng.
create or replace function public.caller_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Ban lãnh đạo. Danh sách chức danh PHẢI khớp `isDirectorRole()` trong
-- lib/access.ts và nhánh lãnh đạo của `caller_can_manage_tasks()` (029) —
-- lệch nhau là sinh đúng loại lỗi 029 đã mô tả: giao diện cho thấy nút, RLS
-- lại chặn.
--
-- ⚠ Điều kiện "email KHÁC RỖNG" là BẮT BUỘC. position('' in bất_kỳ_chuỗi_nào)
-- = 1, nên thiếu nó thì phiên không có danh tính khớp MỌI dòng employees và
-- được coi là Ban lãnh đạo. Đây đúng cái bẫy 018/050 đã dính.
create or replace function public.is_director_caller()
returns boolean
language sql
stable
security definer          -- đọc `employees` bất chấp RLS đã siết ở 011
set search_path = public
as $$
  select public.caller_email() <> ''
     and exists (
       select 1 from public.employees e
       where position(public.caller_email() in lower(coalesce(e.email, ''))) > 0
         and lower(coalesce(e.role, '')) ~
             'giám đốc|giam doc|ban lãnh đạo|ban lanh dao|chủ tịch|chu tich|chairman'
     );
$$;

comment on function public.is_director_caller() is
  'Người gọi có phải lãnh đạo cấp cao không (Giám đốc/Phó GĐ/Tổng GĐ, Ban lãnh đạo, Chủ tịch, Chairman). Phải khớp isDirectorRole() trong lib/access.ts.';

-- ─── 2. PHIẾU TRÌNH KÝ ───
--
-- Chỉ thay policy SELECT. INSERT/UPDATE/DELETE và trigger canh luồng của
-- 050/052/053 giữ NGUYÊN — bài toán ở đây là "thấy được gì", không phải
-- "làm được gì".
--
-- Điểm sửa cốt lõi: bỏ `can_create_signing_caller()` khỏi quyền đọc. Trước đây
-- ai được cấp cờ LẬP phiếu thì đọc được MỌI phiếu — chính là thứ user không
-- muốn (A thấy phiếu của B).
--
-- VÌ SAO NGƯỜI DUYỆT VẪN THẤY MỌI PHIẾU ĐÃ TRÌNH, chứ không chỉ phiếu đang ở
-- đúng chặng của mình: Kế toán duyệt xong thì phiếu sang 'hoan_tat' và rời khỏi
-- chặng của họ; nếu cắt theo chặng thì vừa bấm xong là phiếu biến mất khỏi
-- danh sách, không tra cứu lại được. Lẽ ra nên lọc theo "ai đã ký" nhưng các
-- cột qlda_by/khdt_by/giam_doc_by/ke_toan_by lưu TÊN HIỂN THỊ chứ không phải
-- email (SigningPanel.tsx: `const who = user.name || user.email`) nên không so
-- khớp được với danh tính JWT. Dùng cờ duyệt là cách đúng và ổn định.
--
-- Bản nháp ('nhap') của người khác thì người duyệt KHÔNG thấy — chưa trình thì
-- chưa phải việc của họ.
drop policy if exists "signing_select" on public.signing_submissions;

create policy "signing_select" on public.signing_submissions
  for select to authenticated
  using (
    public.is_admin_caller()
    or public.is_director_caller()
    -- Giữ bất kỳ cờ duyệt nào = có chân trong luồng.
    -- coalesce quanh array_length KHÔNG thừa: array_length('{}', 1) trả NULL
    -- chứ không phải 0 (đã ghi ở 050 mục 4).
    or (
      coalesce(array_length(public.signing_stages_of_caller(), 1), 0) > 0
      and status <> 'nhap'
    )
    -- Người lập luôn thấy phiếu của chính mình, kể cả bản nháp.
    or (public.caller_email() <> '' and lower(created_by) = public.caller_email())
  );

-- ─── 3. KẾ HOẠCH TÀI CHÍNH THÁNG ───
--
-- Chỉ thay policy SELECT; INSERT/UPDATE/DELETE của 058 giữ nguyên (vốn đã là
-- "chủ dòng hoặc Admin", và vẫn đòi cờ can_view_reports để được ghi).
--
-- Ban lãnh đạo được ĐỌC nhưng KHÔNG được sửa/xoá dòng của người khác — cố ý,
-- user chỉ yêu cầu "thấy hết". Cần sửa hộ thì dùng tài khoản Admin.
--
-- `can_view_reports_caller()` bị bỏ khỏi quyền đọc: cờ đó là cửa vào MODULE
-- Báo cáo, không còn là quyền xem dữ liệu của người khác.
drop policy if exists "reports_read_finance_plans" on public.finance_plans;

create policy "reports_read_finance_plans" on public.finance_plans
  for select to authenticated
  using (
    public.is_admin_caller()
    or public.is_director_caller()
    or (public.caller_email() <> '' and lower(created_by) = public.caller_email())
  );

-- Policy mới lọc theo `lower(created_by)`, mà index cũ idx_finance_plans_owner
-- dựng trên `created_by` nguyên bản nên không dùng được. Thêm index hàm cho
-- khớp — `signing_submissions` đã có sẵn idx_signing_creator kiểu này từ 050.
create index if not exists idx_finance_plans_owner_lower
  on public.finance_plans (lower(created_by));

-- ─── 4. DANH MỤC ĐỐI TÁC: KHÔNG ĐỔI ───
-- `finance_partners` / `finance_partner_accounts` / `finance_partner_contracts`
-- vẫn dùng chung toàn công ty (user chốt). Cố ý không có lệnh nào ở đây —
-- ghi ra để lần sau không ai tưởng là bỏ sót.

-- ─── 5. KIỂM TRA ───

-- 5a. Chạy trong SQL Editor (KHÔNG có JWT) -> BẮT BUỘC ra '' và false.
-- Ra khác là hàm đang hở cho phiên không danh tính.
select public.caller_email()      as phai_la_chuoi_rong,
       public.is_director_caller() as phai_la_false;

-- 5b. Ai đang được coi là Ban lãnh đạo (những người này sẽ thấy toàn bộ).
-- Danh sách rỗng = chưa ai có chức danh khớp, lúc đó CHỈ Admin thấy hết.
select name, role, department, email
from public.employees
where lower(coalesce(role, '')) ~
      'giám đốc|giam doc|ban lãnh đạo|ban lanh dao|chủ tịch|chu tich|chairman'
order by department, name;

-- 5c. Dòng kế hoạch không có người lập -> sau khi chạy file này sẽ CHỈ Admin và
-- Ban lãnh đạo nhìn thấy. Nếu ra > 0 dòng, cần gán lại created_by thủ công.
select count(*) as dong_ke_hoach_khong_co_nguoi_lap
from public.finance_plans
where coalesce(created_by, '') = '';

select count(*) as phieu_khong_co_nguoi_lap
from public.signing_submissions
where coalesce(created_by, '') = '';

-- 5d. Ai lập bao nhiêu — đối chiếu nhanh sau khi đổi.
select created_by, count(*) as so_dong from public.finance_plans
group by created_by order by so_dong desc;

select created_by, status, count(*) as so_phieu from public.signing_submissions
group by created_by, status order by created_by, status;

-- 5e. Policy còn đúng 4 lệnh trên mỗi bảng.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('signing_submissions', 'finance_plans')
order by tablename, cmd;
