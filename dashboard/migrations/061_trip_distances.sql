-- ============================================================
-- 061 — DANH MỤC CUNG ĐƯỜNG CÔNG TÁC (nút "Cấu hình vị trí" trong form
--        Đăng ký lịch đi công tác, trang /calendar)
--
-- MỤC ĐÍCH:
-- Ô "Độ dài (KM)" ở mỗi chặng đi trước đây phải gõ tay, mỗi người nhớ một số
-- khác nhau cho cùng một cung đường (TPHCM – Tây Ninh: người ghi 100, người ghi
-- 110). Bảng này lưu MỘT con số chuẩn cho mỗi cặp điểm đi – điểm đến, để form
-- công tác tự điền khi người dùng gõ trùng tên địa điểm.
--
-- KHOẢNG CÁCH COI LÀ HAI CHIỀU: lưu "TPHCM – Tây Ninh 104km" thì chặng về
-- "Tây Ninh – TPHCM" cũng lấy đúng số đó. Ứng dụng tra cả hai chiều nên KHÔNG
-- cần nhập hai dòng.
--
-- HAI CỘT `norm_*` LÀ KHOÁ SO KHỚP, không phải để hiển thị:
-- người nhập gõ "Tây Ninh", "tây ninh", "TAY NINH" đều phải ra một dòng. Postgres
-- bản thường không bỏ dấu tiếng Việt được (cần extension `unaccent`, khách tự
-- dựng Supabase có thể chưa bật), nên ỨNG DỤNG bỏ dấu + hạ chữ thường rồi ghi
-- xuống hai cột này — cùng đúng một hàm `foldVi` đang dùng cho danh mục đối tác.
-- Cột `from_location` / `to_location` giữ nguyên chữ người dùng gõ để in ra.
--
-- ⚠ QUYỀN SỬA/XOÁ LÀ "CHỦ DÒNG HOẶC ADMIN" — giống migration 058. Ai cũng thêm
-- được cung đường mới (không thì người đi công tác phải chờ Hành chính nhập hộ),
-- nhưng không sửa/xoá được dòng của người khác.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ file -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. BẢNG ───
create table if not exists public.trip_distances (
  id            uuid primary key default gen_random_uuid(),
  from_location text not null,              -- chữ gốc người dùng gõ, để hiển thị
  to_location   text not null,
  -- Khoá so khớp: đã bỏ dấu + hạ chữ thường ở tầng ứng dụng.
  norm_from     text not null,
  norm_to       text not null,
  distance_km   numeric(8,1) not null check (distance_km > 0 and distance_km <= 20000),
  note          text,                        -- VD: "đi cao tốc", "đường tránh"
  -- Điền sẵn từ JWT: client KHÔNG gửi trường này lên, nên không giả danh được.
  created_by    text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Mỗi cặp điểm chỉ một dòng. Trùng cặp thì màn hình SỬA dòng cũ chứ không đẻ
-- dòng thứ hai — hai con số khác nhau cho cùng cung đường là mất luôn ý nghĩa.
create unique index if not exists uq_trip_distances_pair
  on public.trip_distances (norm_from, norm_to);

create index if not exists idx_trip_distances_owner
  on public.trip_distances (created_by);

-- ─── 2. TỰ CẬP NHẬT updated_at ───
create or replace function public.trip_distances_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trip_distances_touch_trg on public.trip_distances;
create trigger trip_distances_touch_trg
  before update on public.trip_distances
  for each row execute function public.trip_distances_touch();

-- ─── 3. RLS ───
--
-- Khai lại `is_admin_caller` cho chắc: chạy file này trên một Supabase mới dựng
-- cho khách khác mà chưa chạy đủ migration cũ thì policy bên dưới lỗi "function
-- does not exist" giữa chừng, và vì SQL Editor chạy trong MỘT transaction nên
-- toàn bộ file rollback sạch, rất khó lần ra nguyên nhân.
-- Lệnh idempotent, chạy trên TNEC là no-op.
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

alter table public.trip_distances enable row level security;

-- Xoá TOÀN BỘ policy cũ bằng vòng lặp thay vì đoán tên — chạy lại file này
-- nhiều lần vẫn sạch, và không bỏ sót policy mặc định do Supabase sinh ra.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'trip_distances'
  loop
    execute format('drop policy %I on public.trip_distances', p.policyname);
  end loop;
end $$;

-- ĐỌC: mọi tài khoản đã đăng nhập. Đây là cây số giữa hai địa danh, không phải
-- dữ liệu cá nhân; ai đăng ký công tác cũng cần tra.
create policy "auth_read_trip_distances" on public.trip_distances
  for select to authenticated
  using (true);

-- THÊM: phải tự đứng tên. `created_by` có default lấy từ JWT, nhưng vẫn chặn ở
-- đây phòng trường hợp client cố tình gửi kèm email người khác.
create policy "auth_insert_trip_distances" on public.trip_distances
  for insert to authenticated
  with check (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- SỬA / XOÁ: chủ dòng hoặc Admin.
create policy "owner_update_trip_distances" on public.trip_distances
  for update to authenticated
  using (
    public.is_admin_caller()
    or lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    public.is_admin_caller()
    or lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "owner_delete_trip_distances" on public.trip_distances
  for delete to authenticated
  using (
    public.is_admin_caller()
    or lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ─── 4. KIỂM TRA NHANH SAU KHI CHẠY ───
-- select from_location, to_location, distance_km from public.trip_distances
-- order by from_location, to_location;
