-- ============================================================
-- 039 — TRẠNG THÁI THEO DÕI ("Đang triển khai" / "Hoàn thành")
--
-- Cột "Thao tác" trong bảng Danh sách việc theo dõi. Task ở cột 6 ("Update
-- thông tin") có thêm một trạng thái riêng, TÁCH KHỎI `tasks.status`:
--   active (mặc định) = đang triển khai, còn theo dõi
--   done              = đã xong, giữ lại để tra lịch sử
--
-- Task xong theo dõi VẪN NẰM Ở CỘT 6 (không quay về "Đã hoàn thành") — giữ
-- nguyên toàn bộ dòng thời gian tại chỗ để sau này còn tra lại được.
--
-- VÌ SAO CỘT RIÊNG, KHÔNG DÙNG `status`: `status` điều khiển task nằm ở CỘT
-- NÀO trên Kanban. Nhét thêm giá trị vào đó thì phải đẻ thêm cột thứ 7 trên
-- board. Đây là hai trục khác nhau: nằm ở đâu, và đang triển khai hay xong.
--
-- CHẶN 2 TẦNG: giao diện ẩn nút với nhân viên, VÀ trigger dưới đây chặn ở CSDL.
-- Chỉ ẩn nút thì gọi thẳng PostgREST vẫn đổi được — đúng lỗ hổng đã gặp với
-- dấu X xoá task.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán toàn bộ file -> Run.
-- An toàn chạy lại nhiều lần.
-- PHỤ THUỘC: cần migration 010 (hàm caller_can_manage_tasks) đã chạy — đã có.
-- ============================================================

alter table public.tasks
  add column if not exists tracking_status text not null default 'active';

-- Chỉ nhận đúng 2 giá trị. Dùng DO block vì `add constraint if not exists`
-- không tồn tại trong Postgres.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_tracking_status_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_tracking_status_check
      check (tracking_status in ('active', 'done'));
  end if;
end $$;

create index if not exists idx_tasks_tracking_status
  on public.tasks (tracking_status) where status = 'tracking';

-- ─── Trigger: chỉ cấp quản lý đổi được trạng thái theo dõi ───
create or replace function public.guard_task_tracking_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Chỉ soi khi CỘT NÀY thật sự đổi. Mọi thao tác khác trên task (kéo thẻ, sửa
  -- tiến độ, đổi mô tả) không bị đụng tới.
  if new.tracking_status is distinct from old.tracking_status
     and not public.caller_can_manage_tasks() then
    raise exception
      'Chỉ Ban lãnh đạo, Trưởng/Phó phòng, Tổ trưởng hoặc Admin mới đổi được trạng thái theo dõi công việc.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Trigger RIÊNG, không gộp vào trg_guard_task_approval của migration 008:
-- cái đó chỉ chạy trên đơn nghỉ phép/công tác (lọc theo tiêu đề) và thoát sớm
-- với task thường — gộp vào là logic hai bên vướng nhau.
drop trigger if exists trg_guard_task_tracking_status on public.tasks;
create trigger trg_guard_task_tracking_status
  before update on public.tasks
  for each row
  execute function public.guard_task_tracking_status();

-- ─── KIỂM TRA ───
select tgname as trigger_name,
       case tgenabled when 'O' then 'đang bật' else tgenabled::text end as trang_thai
from pg_trigger
where tgrelid = 'public.tasks'::regclass and not tgisinternal
order by tgname;

select tracking_status, count(*) as so_task
from public.tasks
group by tracking_status;
