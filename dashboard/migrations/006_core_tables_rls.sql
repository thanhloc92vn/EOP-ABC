-- ============================================================
-- 006 — BẬT RLS CHO 3 BẢNG LÕI: employees, tasks, allowed_users
--
-- BỐI CẢNH (quan trọng, đọc trước khi chạy):
-- Trên production TNEC hiện tại 3 bảng này ĐÃ được bảo vệ — kiểm chứng bằng
-- cách gọi REST API bằng anon key: cả 3 đều trả 0 dòng. Nhưng việc bật RLS đó
-- được làm TAY trong Supabase Dashboard, KHÔNG có trong repo. Hệ quả: chạy trọn
-- bộ migration của repo lên một project Supabase mới (deploy cho khách hàng) sẽ
-- ra hệ thống mà `employees` và `tasks` đọc được công khai bằng anon key —
-- toàn bộ hồ sơ nhân sự phơi ra Internet.
--
-- File này lấp đúng khoảng trống đó.
--
-- NGUYÊN TẮC AN TOÀN — khác với các migration khác trong repo:
-- Các file trước dùng kiểu "xoá sạch policy cũ rồi tạo lại" vì repo là nguồn
-- sự thật của những bảng đó. Ở đây thì NGƯỢC LẠI: policy production do người
-- vận hành tạo tay và repo KHÔNG biết nội dung. Nên file này:
--   • Chỉ bật RLS nếu đang tắt
--   • Chỉ tạo policy nếu bảng CHƯA có policy nào
--   • Không xoá, không sửa bất kỳ policy sẵn có nào
-- ⇒ Chạy trên production TNEC = KHÔNG ĐỔI GÌ (no-op an toàn).
-- ⇒ Chạy trên project mới = thiết lập mức bảo vệ tối thiểu đúng đắn.
--
-- ⚠ QUAN HỆ VỚI MIGRATION 010 (sửa 04/08/2026):
-- Bản đầu của file này tạo cho `tasks` MỘT policy `FOR ALL using(true)`. Trong
-- `pg_policies` policy đó mang `cmd = 'ALL'`, mà vòng dọn dẹp của migration 010
-- chỉ lọc `cmd = 'DELETE'` -> nó không bị gỡ, và vì các permissive policy được
-- OR với nhau nên `using(true)` vẫn cho phép XOÁ. Hệ quả: trên một project chạy
-- tuần tự 001->022, khoá xoá của 010 bị vô hiệu HOÀN TOÀN.
-- Nay tách thành 3 policy riêng SELECT / INSERT / UPDATE, KHÔNG có DELETE, để
-- 010 là nơi duy nhất định đoạt quyền xoá.
-- (Production TNEC không dính lỗi này: policy `tasks` ở đó do người vận hành
-- tạo tay, đã tách sẵn theo lệnh — kiểm chứng bằng pg_policies ngày 04/08/2026.)
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán và Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── Hàm trợ giúp: người đang đăng nhập có phải Admin không ───
-- Dùng lại đúng cách nhận diện Admin của các migration 003/004/005.
create or replace function public.is_admin_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.role = 'Admin'
  );
$$;

do $$
declare
  t text;
  has_policy boolean;
  rls_on boolean;
begin
  foreach t in array array['employees', 'tasks', 'allowed_users']
  loop
    -- Bỏ qua nếu bảng chưa tồn tại trên project này
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = t
    ) then
      raise notice 'Bỏ qua %: bảng không tồn tại', t;
      continue;
    end if;

    -- 1. Bật RLS nếu đang tắt
    select c.relrowsecurity into rls_on
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t;

    if not rls_on then
      execute format('alter table public.%I enable row level security', t);
      raise notice 'Đã BẬT RLS cho %', t;
    else
      raise notice '% đã bật RLS sẵn — giữ nguyên', t;
    end if;

    -- 2. Chỉ tạo policy mặc định khi bảng chưa có policy nào.
    --    Có policy rồi = người vận hành đã cấu hình riêng -> không đụng vào.
    select exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t
    ) into has_policy;

    if has_policy then
      raise notice '% đã có policy riêng — KHÔNG tạo thêm, không sửa', t;
      continue;
    end if;

    if t = 'employees' then
      -- Đọc: mọi tài khoản đã đăng nhập. Toàn hệ thống phụ thuộc bảng này để
      -- tra cứu tên/phòng ban/người duyệt, nên không siết ở tầng RLS; việc chỉ
      -- cho xem FULL danh sách được gate ở UI bằng cờ can_view_employees.
      -- Điểm mấu chốt là ANON thì KHÔNG đọc được gì.
      execute 'create policy "authenticated_read_employees" on public.employees
                 for select to authenticated using (true)';
      -- Ghi: Admin, hoặc người có cờ can_manage_employees
      execute 'create policy "manager_write_employees" on public.employees
                 for all to authenticated
                 using (
                   public.is_admin_caller()
                   or exists (
                     select 1 from public.approval_permissions p
                     where position(lower(coalesce(auth.jwt() ->> ''email'', '''')) in lower(p.email)) > 0
                       and p.can_manage_employees = true
                   )
                 )';
      raise notice 'Đã tạo policy mặc định cho employees';

    elsif t = 'tasks' then
      -- Kanban công việc + đơn nghỉ phép/công tác dùng chung bảng này. Nhân
      -- viên cần tạo đơn và cập nhật việc của mình, việc lọc ai thấy gì đang
      -- xử lý ở UI (can_view_all_tasks / supervises_name). Ở tầng RLS chỉ cần
      -- chặn anon.
      -- TÁCH THEO LỆNH, KHÔNG DÙNG `FOR ALL` — xem ghi chú đầu file: `FOR ALL`
      -- sẽ nuốt luôn quyền DELETE và vô hiệu hoá migration 010.
      execute 'create policy "authenticated_select_tasks" on public.tasks
                 for select to authenticated using (true)';
      execute 'create policy "authenticated_insert_tasks" on public.tasks
                 for insert to authenticated with check (true)';
      execute 'create policy "authenticated_update_tasks" on public.tasks
                 for update to authenticated using (true) with check (true)';
      -- Cố ý KHÔNG tạo policy DELETE ở đây: migration 010 tạo, giới hạn về
      -- cấp quản lý / người phụ trách. Chưa chạy 010 = không ai xoá được, đó
      -- là hướng fail an toàn.
      raise notice 'Đã tạo policy mặc định cho tasks (select/insert/update)';

    elsif t = 'allowed_users' then
      -- AuthWrapper đọc bảng này ngay sau khi đăng nhập để xác định Admin.
      execute 'create policy "authenticated_read_allowed_users" on public.allowed_users
                 for select to authenticated using (true)';
      -- Chỉ Admin được thêm/sửa/xoá — đây là bảng cấp quyền Admin, không thể
      -- để người dùng thường tự ghi vào.
      execute 'create policy "admin_write_allowed_users" on public.allowed_users
                 for all to authenticated using (public.is_admin_caller())';
      raise notice 'Đã tạo policy mặc định cho allowed_users';
    end if;
  end loop;
end $$;

-- ─── VÁ NGƯỢC: gỡ policy `FOR ALL` do BẢN CŨ của chính file này tạo ───
-- Chỉ chạm vào đúng một policy mang tên `authenticated_all_tasks` — dấu vết
-- riêng của bản cũ. Project nào không có nó (kể cả production TNEC) thì khối
-- này là no-op tuyệt đối.
-- Gỡ xong phải cấp bù SELECT/INSERT/UPDATE, nếu không thì tenant nào đã chạy
-- cả 006 cũ lẫn 010 sẽ chỉ còn mỗi policy DELETE và bảng `tasks` chết hẳn.
do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'tasks'
  ) then
    return;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tasks'
      and policyname = 'authenticated_all_tasks'
  ) then
    raise notice 'tasks: không có policy FOR ALL cũ — không cần vá';
    return;
  end if;

  execute 'drop policy if exists "authenticated_all_tasks" on public.tasks';
  raise notice 'tasks: ĐÃ GỠ policy FOR ALL cũ (nó vô hiệu hoá migration 010)';

  -- Cấp bù theo từng lệnh, chỉ khi lệnh đó chưa có policy nào khác phủ.
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='tasks' and cmd='SELECT') then
    execute 'create policy "authenticated_select_tasks" on public.tasks
               for select to authenticated using (true)';
    raise notice 'tasks: đã cấp bù policy SELECT';
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='tasks' and cmd='INSERT') then
    execute 'create policy "authenticated_insert_tasks" on public.tasks
               for insert to authenticated with check (true)';
    raise notice 'tasks: đã cấp bù policy INSERT';
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='tasks' and cmd='UPDATE') then
    execute 'create policy "authenticated_update_tasks" on public.tasks
               for update to authenticated using (true) with check (true)';
    raise notice 'tasks: đã cấp bù policy UPDATE';
  end if;
end $$;

-- ─── KIỂM TRA KẾT QUẢ ───
-- rls_bat phải = true cho cả 3 bảng.
select
  c.relname            as bang,
  c.relrowsecurity     as rls_bat,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as so_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('employees', 'tasks', 'allowed_users')
order by c.relname;

-- Riêng `tasks`: cột `cmd` KHÔNG được có giá trị 'ALL'. Nếu thấy 'ALL' nghĩa là
-- còn một policy nuốt trọn mọi lệnh và migration 010 đang bị vô hiệu.
select policyname, cmd, permissive, coalesce(qual, '—') as dieu_kien_using
from pg_policies
where schemaname = 'public' and tablename = 'tasks'
order by cmd, policyname;
