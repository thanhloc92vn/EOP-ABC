-- ============================================================
-- 046 — KHOÁ NGÀY BẮT ĐẦU / DEADLINE ĐÃ ẤN ĐỊNH
--
-- YÊU CẦU (user chốt 15/08/2026):
-- Nhân viên KHÔNG được tự dời hạn công việc của mình. Ngày giao (start_date) và
-- deadline (due_date) một khi đã có thì chỉ cấp quản lý / tổ trưởng mới sửa được.
-- Task CHƯA có hạn thì vẫn dùng bình thường: ai cũng đặt được lần đầu — đặt xong
-- là khoá. Tạo việc mới không bị ảnh hưởng (trigger chỉ chạy khi UPDATE).
--
-- VÌ SAO CẦN TRIGGER CHỨ KHÔNG CHỈ KHOÁ Ở GIAO DIỆN:
-- app/tasks/page.tsx đã `disabled` hai ô ngày (lockStartDate / lockDueDate), nhưng
-- đó chỉ là hiển thị. Gọi thẳng PostgREST vẫn dời hạn được, mà policy UPDATE trên
-- `tasks` hiện vẫn là `using(true)`. Trigger là chỗ chặn thật.
--
-- VÌ SAO TRIGGER CHỨ KHÔNG PHẢI RLS:
-- Luật này phụ thuộc vào GIÁ TRỊ CŨ của dòng (có hạn rồi hay chưa) và chỉ nhắm
-- vào 2 cột. RLS chỉ cho phép/từ chối cả dòng, không diễn đạt được "cột này khoá,
-- cột kia không". Cùng lý do migration 008 chọn trigger.
--
-- PHẠM VI — CHỈ TASK KANBAN THƯỜNG:
-- Bảng `tasks` dùng chung cho Kanban công việc, đơn nghỉ phép/công tác, và phiếu
-- VPP. Đơn nghỉ phép có start_date/due_date là NGÀY NGHỈ, sửa theo luồng duyệt
-- riêng; phiếu VPP cũng có luồng riêng của trang Hành chính. Trigger này bỏ qua
-- cả hai loại đó — nhận diện bằng tiêu đề, đúng cách 008 và 045 đang làm.
--
-- KHÔNG đụng policy nào. Chỉ thêm 1 trigger BEFORE UPDATE.
-- Chạy song song được với trigger sẵn có `trg_guard_task_approval` (008): hai
-- trigger BEFORE UPDATE chạy lần lượt theo thứ tự tên, không tranh nhau.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

create or replace function public.guard_task_dates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  title_lower text := lower(coalesce(old.title, ''));
begin
  -- ─── 1. Bỏ qua đơn nghỉ phép / công tác và phiếu VPP ───
  if title_lower like 'nghỉ phép%' or title_lower like '%nghi phep%'
     or title_lower like 'công tác%' or title_lower like '%cong tac%'
     or title_lower like 'vpp:%'     or title_lower like '%vpp%'
  then
    return new;
  end if;

  -- ─── 2. Không đụng tới 2 cột ngày -> không phải việc của trigger này ───
  -- Kéo thẻ đổi cột, sửa mô tả, cập nhật tiến độ... đi qua đây không bị cản.
  if new.due_date   is not distinct from old.due_date
     and new.start_date is not distinct from old.start_date
  then
    return new;
  end if;

  -- ─── 3. Cấp quản lý sửa thoải mái ───
  -- Dùng lại hàm của migration 010 (đã bổ sung ở 028/029) nên danh sách chức danh
  -- luôn khớp với `canManageTasks` bên app/tasks/page.tsx. Đã gồm Admin.
  if public.caller_can_manage_tasks() then
    return new;
  end if;

  -- ─── 4. Ô đang TRỐNG thì cho đặt lần đầu; đã có ngày thì khoá ───
  if old.due_date is not null and new.due_date is distinct from old.due_date then
    raise exception
      'Deadline đã được ấn định (%). Chỉ Trưởng phòng, Phó phòng, Tổ trưởng, Chỉ huy trưởng/phó, Ban lãnh đạo hoặc Admin mới dời được hạn.',
      to_char(old.due_date, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  if old.start_date is not null and new.start_date is distinct from old.start_date then
    raise exception
      'Ngày bắt đầu đã được ấn định (%). Chỉ cấp quản lý mới sửa được.',
      to_char(old.start_date, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.guard_task_dates() is
  'Chặn nhân viên tự dời start_date/due_date của task Kanban đã ấn định. Ô còn trống vẫn đặt được lần đầu. Bỏ qua đơn nghỉ phép/công tác và phiếu VPP. Khớp lockStartDate/lockDueDate trong app/tasks/page.tsx.';

drop trigger if exists trg_guard_task_dates on public.tasks;
create trigger trg_guard_task_dates
  before update on public.tasks
  for each row
  execute function public.guard_task_dates();


-- ============================================================
-- KIỂM TRA
-- ============================================================
-- 1. Cả 2 trigger cùng đang bật trên `tasks`.
select tgname as trigger_name,
       case tgenabled when 'O' then 'đang bật' else tgenabled::text end as trang_thai
from pg_trigger
where tgrelid = 'public.tasks'::regclass and not tgisinternal
order by tgname;

-- 2. Bao nhiêu task Kanban thường đang CÓ hạn (sẽ bị khoá với nhân viên)
--    và bao nhiêu chưa có hạn (vẫn đặt được lần đầu).
select
  count(*) filter (where due_date is not null) as da_co_deadline_se_khoa,
  count(*) filter (where due_date is null)     as chua_co_deadline_van_dat_duoc
from public.tasks
where lower(coalesce(title,'')) not like '%nghi phep%'
  and lower(coalesce(title,'')) not like '%nghỉ phép%'
  and lower(coalesce(title,'')) not like '%cong tac%'
  and lower(coalesce(title,'')) not like '%công tác%'
  and lower(coalesce(title,'')) not like '%vpp%';

-- 3. KIỂM TRA TRÊN GIAO DIỆN sau khi chạy:
--   [ ] Nhân viên thường : mở sửa 1 việc ĐÃ có hạn -> 2 ô ngày xám, không bấm được
--   [ ] Nhân viên thường : mở sửa 1 việc CHƯA có hạn -> đặt hạn được, lưu xong khoá
--   [ ] Nhân viên thường : sửa tên/mô tả/tiến độ của việc đã có hạn -> vẫn lưu bình thường
--   [ ] Tổ trưởng / TP   : vẫn dời được hạn của mọi việc trong phòng
--   [ ] Bất kỳ ai        : nộp đơn nghỉ phép ở /lich -> KHÔNG bị trigger này cản
--   [ ] HCNS             : Kanban VPP ở /hanh-chinh -> thao tác bình thường


-- ============================================================
-- GỠ NẾU CÓ SỰ CỐ  (dán riêng khối này vào SQL Editor)
-- ============================================================
-- drop trigger if exists trg_guard_task_dates on public.tasks;
