-- ============================================================
-- 045 — SIẾT QUYỀN ĐỌC BẢNG `tasks`
--
-- VẤN ĐỀ:
-- Policy SELECT trên `tasks` vẫn là template mặc định của Supabase với điều kiện
-- `true`. Bất kỳ nhân viên nào đăng nhập đều đọc được TOÀN BỘ bảng qua PostgREST:
--   • đơn nghỉ phép / công tác của người khác (kèm lý do trong `description`)
--   • task của mọi phòng ban, mọi dự án
--   • phiếu VPP của phòng khác
-- Giao diện CÓ lọc (app/tasks/page.tsx:1040-1130), nhưng lọc ở CLIENT — dữ liệu
-- đã tải về máy người dùng rồi mới ẩn đi. Mở tab Network là thấy hết.
--
-- 008 đã bịt "tự duyệt", 010 đã bịt "xoá bừa". Đây là mảnh còn lại: "đọc trộm".
--
-- ─── NGUYÊN TẮC: NỚI BẰNG HOẶC RỘNG HƠN GIAO DIỆN, KHÔNG BAO GIỜ CHẶT HƠN ───
-- Hệ thống đang chạy production, và RLS trả về RỖNG chứ KHÔNG báo lỗi — policy
-- chặt hơn giao diện = tính năng chết im lặng, rất khó lần ra. Vì vậy policy này
-- CỐ Ý rộng hơn UI ở một chỗ: Trưởng/Phó phòng & Tổ trưởng được CSDL cho đọc
-- toàn bộ (qua caller_can_manage_tasks), trong khi UI chỉ cho họ thấy phòng mình.
-- Chấp nhận được — mục tiêu bước này là chặn NHÂN VIÊN THƯỜNG. Muốn siết tiếp
-- cấp phòng thì làm ở migration sau, sau khi bước này đã chạy êm vài tuần.
--
-- VÌ SAO KHÔNG SO THEO PHÒNG BAN:
-- `tasks` KHÔNG có cột department (037 chỉ thêm project_code/project_name/
-- work_group/work_source). Phòng phải suy ra bằng cách tra `assignee` (TEXT) sang
-- `employees.name`. Mà `assignee` không đồng nhất:
--   • Đơn nghỉ phép/công tác : tên đầy đủ  ("Nguyễn Bích Như Quỳnh")
--   • Kanban VPP             : TÊN PHÒNG   ("Phòng Kỹ thuật") hoặc tên ngắn
-- Nên hàm dưới xử lý riêng từng loại dòng thay vì một phép so duy nhất.
--
-- CẤP 1 DUYỆT ĐƠN — chỉ cần 2 bảng nhỏ, không cần quét employees:
-- Theo lib/approvers.ts, cấp 1 gồm: tổ trưởng nhóm (approval_groups) -> đặc cách
-- (leave_exceptions) -> Trưởng/Phó phòng cùng phòng. Nhóm thứ BA đã được
-- caller_can_manage_tasks() phủ sẵn (khớp chức danh), nên ở đây chỉ cần tra 2
-- bảng đầu — vừa đúng hơn, vừa nhanh hơn nhiều so với quét cả bảng nhân sự.
--
-- HIỆU NĂNG:
-- Mọi hàm tra danh tính đều KHÔNG nhận tham số dòng và được gọi trong policy dưới
-- dạng `(select ...)`. Đây là mẫu chuẩn của Supabase: bọc trong scalar subquery
-- thì Postgres nâng lên InitPlan và chỉ chạy MỘT LẦN cho cả câu truy vấn, thay vì
-- lặp lại trên từng dòng. Chỉ 2 thứ chạy theo dòng: phép so chuỗi thuần
-- (task_visible_to) và tra cấp 1 trên 2 bảng nhỏ.
--
-- ─── PHẠM VI ───
-- CHỈ đụng policy SELECT. INSERT / UPDATE / DELETE giữ nguyên tuyệt đối.
-- Tái sử dụng 2 hàm đã chạy ổn định: caller_can_manage_tasks() (010, sửa ở
-- 028/029) và caller_owns_task(text) (010).
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor.
-- An toàn chạy lại nhiều lần. Chạy MỤC 1+2 trước, thử MỤC 3, rồi mới tới MỤC 4.
-- ============================================================


-- ============================================================
-- 0. TIỀN KIỂM — AI SẼ MẤT SẠCH DỮ LIỆU SAU KHI SIẾT
-- ============================================================
-- ⚠ CHẠY KHỐI NÀY ĐẦU TIÊN. Nếu nó trả về dòng nào, ĐỪNG chạy MỤC 4 vội —
-- sửa dữ liệu email trước, nếu không những người đó sẽ mở /cong-viec ra thấy
-- TRẮNG TRƠN mà không có thông báo lỗi nào.
--
-- Toàn hệ thống nhận diện người dùng bằng quy ước "email ĐÃ LƯU trong
-- employees.email CHỨA email đăng nhập". Ai đăng nhập bằng địa chỉ chưa được
-- khai vào ô đó (hay gặp nhất: tài khoản Gmail cá nhân) thì
-- caller_employee_name() trả về rỗng -> không khớp được dòng nào.
-- Trước 045 điều này vô hại vì SELECT là `true`; sau 045 thì mất sạch quyền đọc.
select
  au.email                              as email_dang_nhap,
  au.role                               as vai_tro,
  'KHÔNG khớp dòng nào trong employees' as canh_bao
from public.allowed_users au
where not exists (
  select 1 from public.employees e
  where position(lower(au.email) in lower(coalesce(e.email, ''))) > 0
)
order by au.email;

-- Cách sửa: mở Danh sách nhân viên -> hồ sơ người đó -> thêm email đăng nhập vào
-- ô Email (giữ email cũ, ngăn cách bằng dấu phẩy). Xem ghi chú ở migration 008.


-- ============================================================
-- 1. HÀM THUẦN — MỘT DÒNG CÓ ĐƯỢC THẤY KHÔNG
-- ============================================================
-- Không đụng CSDL, chỉ so chuỗi -> immutable, chạy rất nhanh theo dòng.
-- Tách phần "luật" khỏi phần "danh tính" để MỤC 3 chạy thử được cho email bất kỳ
-- mà không cần đăng nhập bằng tài khoản đó.

-- So tên kiểu "chứa" 2 chiều — dùng lại đúng quy ước của migration 010:
-- `assignee` lúc là tên đầy đủ ("Nguyễn Bích Như Quỳnh"), lúc là tên ngắn
-- ("Như Quỳnh"), nên phải so cả hai chiều. Có chặn rỗng để '' không khớp mọi thứ.
-- PHẢI tạo TRƯỚC task_visible_to: Postgres kiểm tra thân hàm SQL ngay lúc tạo,
-- gọi một hàm chưa tồn tại là lỗi luôn.
create or replace function public.names_overlap(a text, b text)
returns boolean
language sql
immutable
as $$
  select coalesce(btrim(a),'') <> ''
     and coalesce(btrim(b),'') <> ''
     and (
          position(lower(btrim(a)) in lower(btrim(b))) > 0
       or position(lower(btrim(b)) in lower(btrim(a))) > 0
     );
$$;

create or replace function public.task_visible_to(
  p_title       text,    -- tasks.title
  p_assignee    text,    -- tasks.assignee
  p_notes       text,    -- tasks.notes (JSON dạng text, CÓ THỂ HỎNG -> không parse)
  p_my_name     text,    -- employees.name của người gọi (lower + btrim)
  p_my_dept     text,    -- employees.department của người gọi (lower + btrim)
  p_is_hr       boolean, -- người gọi thuộc phòng HCNS
  p_can_approve boolean, -- có cờ can_approve_leave HOẶC can_approve_trip
  p_is_cap1     boolean, -- người gọi là cấp 1 duyệt đơn của người này
  p_supervises  text     -- approval_permissions.supervises_name (lower + btrim)
)
returns boolean
language sql
immutable
as $$
  select case
    -- ─── ĐƠN NGHỈ PHÉP / CÔNG TÁC ───
    when lower(coalesce(p_title,'')) like 'nghỉ phép%'
      or lower(coalesce(p_title,'')) like '%nghi phep%'
      or lower(coalesce(p_title,'')) like 'công tác%'
      or lower(coalesce(p_title,'')) like '%cong tac%'
    then
         coalesce(p_can_approve, false)    -- HCNS duyệt cấp 2
      or coalesce(p_is_cap1, false)        -- tổ trưởng nhóm / đặc cách
      or public.names_overlap(p_my_name, p_assignee)   -- đơn của chính mình

    -- ─── PHIẾU VPP (Kanban Hành chính) ───
    -- assignee ở đây thường là TÊN PHÒNG, không phải tên người.
    when lower(coalesce(p_title,'')) like 'vpp:%'
      or lower(coalesce(p_title,'')) like '%vpp%'
    then
         coalesce(p_is_hr, false)          -- HCNS xử lý toàn bộ VPP
      or (coalesce(p_my_name,'') <> ''     -- người yêu cầu (notes.requesterName)
          and position(p_my_name in lower(coalesce(p_notes,''))) > 0)
      or public.names_overlap(p_my_dept, p_assignee)    -- đúng phòng nhận

    -- ─── TASK KANBAN THƯỜNG ───
    -- Nhân viên thường chỉ thấy việc của chính mình (khớp UI, bước 4).
    -- Cấp quản lý đã được caller_can_manage_tasks() phủ ở MỤC 4, không tới đây.
    else
         public.names_overlap(p_my_name, p_assignee)
      or public.names_overlap(p_supervises, p_assignee) -- quan hệ giám sát
  end;
$$;

comment on function public.task_visible_to(text,text,text,text,text,boolean,boolean,boolean,text) is
  'Luật thuần quyết định một dòng `tasks` có hiện với người gọi không. Phải khớp bộ lọc client trong app/tasks/page.tsx:1040-1130.';


-- ============================================================
-- 2. HÀM TRA DANH TÍNH NGƯỜI ĐANG ĐĂNG NHẬP
-- ============================================================
-- Khớp email theo quy ước toàn hệ thống: email ĐÃ LƯU chứa email đăng nhập (một
-- người có thể khai nhiều email trong 1 ô). Xem migration 008/010.
-- Tất cả đều KHÔNG nhận tham số -> gọi bằng `(select ...)` trong policy để chạy
-- một lần duy nhất cho cả câu truy vấn.

-- Phòng ban của người gọi (đã lower + btrim). `caller_employee_name()` đã có sẵn
-- từ migration 008 nên không tạo lại.
create or replace function public.caller_department()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(btrim(coalesce(e.department, '')))
  from public.employees e
  where coalesce(auth.jwt() ->> 'email', '') <> ''
    and position(lower(auth.jwt() ->> 'email') in lower(coalesce(e.email, ''))) > 0
  limit 1;
$$;

-- Người gọi có thuộc phòng HCNS không — khớp isHrDept() trong lib/access.ts.
-- Liệt kê cả có dấu lẫn không dấu vì CSDL không bật extension unaccent.
create or replace function public.caller_is_hr()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select d like '%hành chính%' or d like '%hanh chinh%'
        or d like '%nhân sự%'   or d like '%nhan su%'
        or d like '%hcns%'
    from (select public.caller_department() as d) x
  ), false);
$$;

-- Người gọi có cờ duyệt đơn nào không (nghỉ phép HOẶC công tác) — cấp 2 HCNS.
create or replace function public.caller_can_approve_requests()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.approval_permissions p
    where coalesce(auth.jwt() ->> 'email', '') <> ''
      and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
      and (coalesce(p.can_approve_leave, false) or coalesce(p.can_approve_trip, false))
  );
$$;

-- Tên người mà người gọi được giao giám sát (approval_permissions.supervises_name).
create or replace function public.caller_supervises()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select max(p.supervises_name)
  from public.approval_permissions p
  where coalesce(auth.jwt() ->> 'email', '') <> ''
    and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0;
$$;

-- Người gọi có phải cấp 1 duyệt đơn CỦA NGƯỜI NÀY không.
-- CỐ Ý nhận `p_my_name` từ ngoài thay vì tự gọi caller_employee_name() bên trong:
-- hàm này chạy theo TỪNG DÒNG, nếu tự tra thì mỗi dòng lại quét bảng `employees`
-- một lần. Nơi gọi truyền vào giá trị đã tính sẵn một lần duy nhất.
-- Còn lại chỉ đụng 2 bảng rất nhỏ (approval_groups vài dòng, leave_exceptions
-- vài chục dòng) nên chi phí theo dòng không đáng kể.
create or replace function public.caller_is_cap1_for(p_assignee text, p_my_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- (a) Tổ trưởng nhóm duyệt: người gọi là leader, người đứng đơn là thành viên
    exists (
      select 1
      from public.approval_groups g, unnest(g.member_names) as m
      where coalesce(g.active, true)
        and public.names_overlap(p_my_name, g.leader_name)
        and public.names_overlap(m, p_assignee)
    )
    -- (b) Đặc cách duyệt đơn nghỉ 1 ngày (bảng leave_exceptions)
    or exists (
      select 1 from public.leave_exceptions x
      where coalesce(x.active, true)
        and public.names_overlap(p_my_name, x.approver_name)
        and public.names_overlap(x.assignee_name, p_assignee)
    );
$$;


-- ============================================================
-- 3. CHẠY THỬ — ĐO TRƯỚC KHI SIẾT   ⚠ CHẠY MỤC NÀY TRƯỚC MỤC 4
-- ============================================================
-- Bỏ dấu `--` và thay email thành email thật cần kiểm tra. Khối này KHÔNG đổi gì,
-- chỉ đếm: sau khi siết thì người đó còn đọc được bao nhiêu dòng trên tổng số.
-- Nên thử ít nhất 3 loại tài khoản:
--   (a) nhân viên thường  -> con số phải GIẢM MẠNH  (đây chính là mục đích)
--   (b) trưởng phòng      -> phải BẰNG tổng          (caller_can_manage_tasks phủ)
--   (c) người HCNS duyệt  -> phải thấy HẾT đơn nghỉ phép/công tác
--
-- with me as (select lower('nguyenvana@trungnam.com.vn') as email),
-- info as (
--   select
--     (select lower(btrim(e.name))       from public.employees e, me
--       where position(me.email in lower(coalesce(e.email,''))) > 0 limit 1) as my_name,
--     (select lower(btrim(e.department)) from public.employees e, me
--       where position(me.email in lower(coalesce(e.email,''))) > 0 limit 1) as my_dept,
--     (select coalesce(bool_or(coalesce(p.can_approve_leave,false)
--                           or coalesce(p.can_approve_trip,false)), false)
--        from public.approval_permissions p, me
--       where position(me.email in lower(coalesce(p.email,''))) > 0)          as can_appr,
--     (select max(p.supervises_name) from public.approval_permissions p, me
--       where position(me.email in lower(coalesce(p.email,''))) > 0)          as supervises
-- )
-- select
--   count(*) as tong_so_dong,
--   count(*) filter (where public.task_visible_to(
--       t.title, t.assignee, t.notes,
--       i.my_name, i.my_dept,
--       coalesce(i.my_dept like '%hành chính%' or i.my_dept like '%hanh chinh%'
--             or i.my_dept like '%nhân sự%'   or i.my_dept like '%nhan su%'
--             or i.my_dept like '%hcns%', false),
--       i.can_appr,
--       false,          -- bỏ qua cấp 1 cho phép đo nhanh (chỉ làm con số THẤP hơn thực tế)
--       i.supervises)) as sau_khi_siet
-- from public.tasks t, info i;


-- ============================================================
-- 4. THAY POLICY SELECT
-- ============================================================
-- Gỡ TOÀN BỘ policy SELECT cũ bằng vòng lặp động thay vì đoán tên — tên mặc định
-- của Supabase khác nhau giữa các dự án, đoán sai là còn sót policy `true` và
-- việc siết thành vô nghĩa.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.tasks', pol.policyname);
    raise notice 'Đã gỡ policy SELECT cũ: %', pol.policyname;
  end loop;
end $$;

-- Mỗi hàm tra danh tính bọc trong `(select ...)` -> Postgres chạy một lần cho cả
-- câu truy vấn (InitPlan), không lặp theo dòng. Đừng bỏ lớp bọc này.
create policy "tasks select by scope"
  on public.tasks
  for select
  to authenticated
  using (
    (select public.caller_can_manage_tasks())      -- Admin / quản lý / cờ quyền
    or public.caller_owns_task(assignee)           -- dòng của chính mình
    or public.task_visible_to(
         title, assignee, notes,
         (select lower(btrim(coalesce(public.caller_employee_name(), '')))),
         (select public.caller_department()),
         (select public.caller_is_hr()),
         (select public.caller_can_approve_requests()),
         public.caller_is_cap1_for(
           assignee,
           (select lower(btrim(coalesce(public.caller_employee_name(), ''))))
         ),
         (select public.caller_supervises())
       )
  );


-- ============================================================
-- 5. KIỂM TRA
-- ============================================================
-- 5.1 — Còn đúng 1 policy SELECT, và điều kiện KHÔNG còn là `true`.
select policyname, cmd, coalesce(qual, '—') as dieu_kien_using
from pg_policies
where schemaname = 'public' and tablename = 'tasks'
order by cmd, policyname;

-- 5.2 — Tổng số dòng trong bảng, để đối chiếu với MỤC 3.
--       Chạy trong SQL Editor là quyền chủ sở hữu (bỏ qua RLS) nên luôn ra TỔNG —
--       con số này KHÔNG phản ánh người dùng thường.
select count(*) as tong_so_dong_trong_bang from public.tasks;

-- 5.3 — SAU KHI CHẠY, KIỂM TRA TRÊN GIAO DIỆN (bắt buộc, đừng bỏ qua):
--   [ ] Nhân viên thường  : /cong-viec còn thấy việc của mình, KHÔNG thấy phòng khác
--   [ ] Trưởng phòng      : /cong-viec còn đủ việc của phòng mình
--   [ ] HCNS              : chuông duyệt trên Header còn đếm đúng số đơn chờ
--   [ ] HCNS              : /hanh-chinh — Kanban VPP còn đủ phiếu
--   [ ] Người nộp đơn     : /lich còn thấy đơn nghỉ phép của chính mình
--   [ ] Tổ trưởng nhóm    : còn thấy đơn nghỉ phép của thành viên trong tổ
--   [ ] Bất kỳ ai         : xuất Word đơn công tác còn chạy (export-template)


-- ============================================================
-- 6. GỠ NGAY NẾU CÓ SỰ CỐ   (dán riêng khối này vào SQL Editor)
-- ============================================================
-- Trả bảng về trạng thái cũ trong 2 giây. Dùng khi phát hiện một nhóm người dùng
-- bị mất dữ liệu mà chưa kịp tìm ra nguyên nhân — khôi phục trước, điều tra sau.
--
-- drop policy if exists "tasks select by scope" on public.tasks;
-- create policy "Enable read access for all users"
--   on public.tasks for select to authenticated using (true);
