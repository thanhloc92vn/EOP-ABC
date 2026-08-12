-- ============================================================
-- 038 — THEO DÕI SAU HOÀN THÀNH ("Update thông tin")
--
-- BÀI TOÁN:
-- Nhân viên làm xong phần việc, nhưng DỰ ÁN còn theo tiếp: chủ đầu tư yêu cầu
-- bổ sung, chờ nghiệm thu, chờ thanh toán... Cột "Đã hoàn thành" đóng sổ quá
-- sớm, còn ô "Ghi chú" thì người sau ghi đè người trước nên ba tháng sau không
-- ai biết đã đi qua những bước nào.
--
-- GIẢI PHÁP: thêm trạng thái thứ 6 `tracking` (cột "Update thông tin") + bảng
-- lịch sử `task_updates`. Mỗi lần cập nhật là MỘT DÒNG MỚI, không đè lên dòng
-- cũ -> giữ được vết bàn giao: ai dặn gì, giao cho ai, hạn nào.
--
-- KHÔNG cần đụng cột `tasks.status` (kiểu text, không có ràng buộc giá trị) —
-- 'tracking' ghi vào là chạy.
--
-- QUYỀN VIẾT CẬP NHẬT = cấp quản lý HOẶC người đang được tag trong việc đó.
-- Người được tag phải báo cáo lại được phần mình làm, không thì luồng đứt ở
-- giữa và sếp phải đi hỏi miệng.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán toàn bộ file -> Run.
-- An toàn chạy lại nhiều lần.
-- PHỤ THUỘC: cần migration 010 (hàm caller_can_manage_tasks, caller_owns_task)
-- và 008 (caller_employee_name) đã chạy trước. Cả hai đều đã chạy trên TNEC.
-- ============================================================

create table if not exists public.task_updates (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  content       text not null,
  -- Người được giao theo dõi bước tiếp theo. Lưu TÊN dạng text, không khoá
  -- ngoại — cùng lối với tasks.assignee, và để người nghỉ việc không làm
  -- gãy lịch sử cũ.
  tagged_name   text,
  next_due_date date,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_task_updates_task on public.task_updates (task_id, created_at desc);
create index if not exists idx_task_updates_tag  on public.task_updates (tagged_name);

-- ─── RLS ───
alter table public.task_updates enable row level security;

-- Xoá sạch policy cũ bằng vòng lặp thay vì đoán tên — chạy lại file vẫn sạch.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'task_updates'
  loop
    execute format('drop policy %I on public.task_updates', p.policyname);
  end loop;
end $$;

-- ĐỌC: mọi nhân sự nội bộ đã đăng nhập. Nội dung theo dõi không phải bí mật,
-- và giấu đi thì bảng "Danh sách việc theo dõi" mất hết ý nghĩa.
create policy "task_updates_read" on public.task_updates
  for select to authenticated using (true);

-- VIẾT: cấp quản lý, HOẶC người đang được tag ở một dòng nào đó của việc này.
-- LƯU Ý caller_owns_task() (migration 010) tuy tên là "owns task" nhưng ruột
-- chỉ là so khớp tên người gọi với một chuỗi tên kiểu "chứa 2 chiều" — dùng
-- lại đúng chỗ này thay vì viết thêm một hàm so tên thứ hai gần y hệt, để hai
-- bản không có cơ hội trôi lệch nhau về sau.
create policy "task_updates_insert" on public.task_updates
  for insert to authenticated
  with check (
    public.caller_can_manage_tasks()
    or exists (
      select 1 from public.task_updates u
      where u.task_id = task_updates.task_id
        and public.caller_owns_task(u.tagged_name)
    )
  );

-- SỬA / XOÁ dòng lịch sử: chỉ cấp quản lý. Người được tag viết thêm được
-- nhưng không xoá được vết cũ — đó là điểm mấu chốt của một dòng thời gian.
create policy "task_updates_update" on public.task_updates
  for update to authenticated
  using (public.caller_can_manage_tasks());

create policy "task_updates_delete" on public.task_updates
  for delete to authenticated
  using (public.caller_can_manage_tasks());

-- ─── KIỂM TRA ───
select policyname, cmd, coalesce(qual, with_check, '—') as dieu_kien
from pg_policies
where schemaname = 'public' and tablename = 'task_updates'
order by cmd, policyname;

select count(*) as so_dong_cap_nhat from public.task_updates;
