-- ============================================================
-- 008 — CHẶN TỰ DUYỆT ĐƠN NGHỈ PHÉP / CÔNG TÁC
--
-- VẤN ĐỀ ĐANG CÓ:
-- 4 policy trên `tasks` đều là template mặc định của Supabase với điều kiện
-- `true`. Bất kỳ nhân viên nào đăng nhập được đều có thể UPDATE thẳng dòng đơn
-- của CHÍNH MÌNH qua PostgREST, đặt `status = 'completed'` -> đơn nghỉ phép tự
-- duyệt, bỏ qua toàn bộ luồng 2 cấp (Trưởng phòng/Tổ trưởng -> HCNS).
--
-- VÌ SAO DÙNG TRIGGER, KHÔNG DÙNG RLS:
-- Bảng `tasks` dùng chung cho Kanban công việc VÀ đơn từ. Cột nhận diện người
-- phụ trách là `assignee` dạng TEXT:
--   • Đơn nghỉ phép/công tác: assignee = employees.name (TÊN ĐẦY ĐỦ) —
--     xem calendar/page.tsx, modalName lấy từ employees.name
--   • Kanban VPP (trang Hành chính): assignee = TÊN NGẮN ("Như Quỳnh") theo
--     tenant_config.admin_staff, KHÔNG khớp employees.name
-- Một policy RLS so tên chủ sở hữu sẽ trượt ở nhóm thứ hai và làm gãy kanban.
-- Trigger cho phép khoanh vùng CHÍNH XÁC vào đơn nghỉ phép/công tác, để mọi
-- thao tác Kanban thường (kéo thẻ, đổi tiến độ, sửa mô tả) không bị đụng tới.
--
-- PHẠM VI CHẶN — chỉ đúng 2 hành vi:
--   1. Người đứng đơn tự sửa các cột quyết định duyệt của đơn mình
--   2. Duyệt cuối (status -> completed/in_progress) mà không có cờ duyệt
-- Luồng cấp 1 (tổ trưởng / đặc cách nghỉ 1 ngày / trưởng phòng) KHÔNG bị siết
-- thêm điều kiện, vì logic đó phức tạp và đang nằm ở lib/approvers.ts — chỉ
-- cần chặn "tự duyệt" là đủ bịt lỗ hổng.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Tên nhân sự của người đang gọi (khớp email kiểu "chứa") ───
create or replace function public.caller_employee_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select e.name
  from public.employees e
  where coalesce(auth.jwt() ->> 'email', '') <> ''
    and position(lower(auth.jwt() ->> 'email') in lower(coalesce(e.email, ''))) > 0
  limit 1;
$$;

-- ─── 2. Người gọi có cờ duyệt tương ứng không ───
create or replace function public.caller_can_approve(p_is_trip boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.allowed_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and au.role = 'Admin'
    )
    or exists (
      select 1 from public.approval_permissions p
      where coalesce(auth.jwt() ->> 'email', '') <> ''
        and position(lower(auth.jwt() ->> 'email') in lower(coalesce(p.email, ''))) > 0
        and case when p_is_trip then p.can_approve_trip else p.can_approve_leave end = true
    );
$$;

-- ─── 3. Trigger chặn ───
create or replace function public.guard_task_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  title_lower text := lower(coalesce(old.title, ''));
  is_leave     boolean;
  is_trip      boolean;
  is_request   boolean;
  approval_changed boolean;
  becomes_approved boolean;
  me text;
  is_admin boolean;
begin
  -- Chỉ quan tâm đơn nghỉ phép / công tác. Task Kanban thường bỏ qua hoàn toàn.
  is_leave := title_lower like 'nghỉ phép%' or title_lower like '%nghi phep%';
  is_trip  := title_lower like 'công tác%'  or title_lower like '%cong tac%';
  is_request := is_leave or is_trip;
  if not is_request then
    return new;
  end if;

  -- Có đụng vào cột quyết định duyệt không?
  approval_changed :=
        new.approval_stage      is distinct from old.approval_stage
     or new.status              is distinct from old.status
     or new.manager_approved_by is distinct from old.manager_approved_by
     or new.manager_approved_at is distinct from old.manager_approved_at
     or new.final_decision_by   is distinct from old.final_decision_by
     or new.final_decision_at   is distinct from old.final_decision_at;

  if not approval_changed then
    return new;   -- sửa mô tả, ngày tháng... không phải việc của trigger này
  end if;

  is_admin := exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  );
  if is_admin then
    return new;
  end if;

  -- (1) KHÔNG ai được tự quyết đơn đứng tên chính mình
  me := public.caller_employee_name();
  if me is not null and lower(btrim(me)) = lower(btrim(coalesce(old.assignee, ''))) then
    raise exception
      'Không thể tự duyệt hoặc tự thay đổi trạng thái đơn của chính mình. Đơn phải do người có thẩm quyền duyệt.'
      using errcode = 'check_violation';
  end if;

  -- (2) Duyệt CUỐI phải có cờ duyệt tương ứng
  --     (nghỉ phép -> completed, công tác -> in_progress; xem settings/page.tsx)
  becomes_approved :=
        old.status is distinct from new.status
    and (
         (is_trip  and new.status = 'in_progress')
      or (is_leave and new.status = 'completed')
    );

  if becomes_approved and not public.caller_can_approve(is_trip) then
    raise exception
      'Bạn không có quyền duyệt cuối loại đơn này. Cần cờ % trong Cài đặt -> Cờ quyền người dùng.',
      case when is_trip then 'Duyệt công tác' else 'Duyệt nghỉ phép' end
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_task_approval on public.tasks;
create trigger trg_guard_task_approval
  before update on public.tasks
  for each row
  execute function public.guard_task_approval();

-- ─── 4. KIỂM TRA ───
select tgname as trigger_name,
       case tgenabled when 'O' then 'đang bật' else tgenabled::text end as trang_thai
from pg_trigger
where tgrelid = 'public.tasks'::regclass and not tgisinternal;
