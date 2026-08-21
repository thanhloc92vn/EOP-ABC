-- ============================================================
-- 062 — THƯ VIỆN JD TUYỂN DỤNG (nút "Cấu hình JD" trong tab Chấm điểm CV,
--        trang /recruitment)
--
-- MỤC ĐÍCH:
-- Ô "Mô tả công việc (JD)" ở màn hình chấm điểm CV trước đây phải dán tay mỗi
-- lần: mở file Word/mail cũ, copy, dán vào. Cùng một vị trí ("Nhân viên ATLĐ")
-- tuyển đi tuyển lại chục lần trong năm, mỗi lần một bản JD hơi khác nhau, nên
-- điểm AI chấm cũng lệch nhau mà không ai biết vì sao.
--
-- Bảng này lưu sẵn MỘT bản JD chuẩn cho mỗi vị trí. Bấm một phát là nạp thẳng
-- vào ô mô tả, không phải copy từ ngoài nữa.
--
-- CỘT `norm_position` LÀ KHOÁ SO KHỚP, không phải để hiển thị:
-- "ATLĐ", "atlđ", "AT LĐ" phải coi là một vị trí. Postgres bản thường không bỏ
-- dấu tiếng Việt được (cần extension `unaccent`, khách tự dựng Supabase có thể
-- chưa bật), nên ỨNG DỤNG bỏ dấu + hạ chữ thường rồi ghi xuống cột này — cùng
-- đúng hàm `foldVi` đang dùng cho danh mục đối tác và danh mục cung đường.
-- Cột `position` giữ nguyên chữ người dùng gõ để in ra.
--
-- ⚠ MỖI VỊ TRÍ CHỈ MỘT DÒNG (unique index). Lưu trùng tên thì màn hình SỬA dòng
-- cũ chứ không đẻ dòng thứ hai — hai bản JD cùng tên "ATLĐ" nằm cạnh nhau thì
-- người chọn không biết bấm bản nào, mà chấm nhầm JD là sai cả đợt tuyển.
-- Cần hai bản khác nhau thì đặt tên khác nhau ("ATLĐ – công trường",
-- "ATLĐ – văn phòng").
--
-- ⚠ QUYỀN SỬA/XOÁ LÀ "CHỦ DÒNG HOẶC ADMIN" — giống migration 058 và 061. Ai cũng
-- thêm được JD mới (không thì nhân sự phải chờ Admin nhập hộ), nhưng không sửa/
-- xoá được bản JD của người khác.
--
-- ĐỌC: mọi tài khoản đã đăng nhập. JD là bản mô tả công việc đăng tuyển công
-- khai lên TopCV/VietnamWorks — không phải dữ liệu cá nhân của ứng viên, nên
-- không gói trong cờ `can_view_candidates`.
--
-- ⚠ PHẦN RLS Ở MỤC 3 ĐÃ BỊ MIGRATION 063 THAY THẾ (21/08/2026): luật "chủ dòng
-- hoặc Admin" bên dưới không còn hiệu lực, quyền ghi giờ là "Admin hoặc cờ
-- can_view_candidates". File này vẫn phải chạy TRƯỚC 063 vì nó tạo bảng.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> dán TOÀN BỘ file -> Run.
-- An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. BẢNG ───
create table if not exists public.jd_templates (
  id            uuid primary key default gen_random_uuid(),
  position      text not null,              -- chữ gốc người dùng gõ, để hiển thị
  -- Khoá so khớp: đã bỏ dấu + hạ chữ thường ở tầng ứng dụng.
  norm_position text not null,
  department    text,                        -- phòng ban / bộ phận cần tuyển
  content       text not null,               -- nội dung JD, nạp thẳng vào ô mô tả
  note          text,                        -- VD: "bản 2026", "dự án Tây Ninh"
  -- Điền sẵn từ JWT: client KHÔNG gửi trường này lên, nên không giả danh được.
  created_by    text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists uq_jd_templates_position
  on public.jd_templates (norm_position);

create index if not exists idx_jd_templates_owner
  on public.jd_templates (created_by);

-- ─── 2. TỰ CẬP NHẬT updated_at ───
create or replace function public.jd_templates_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists jd_templates_touch_trg on public.jd_templates;
create trigger jd_templates_touch_trg
  before update on public.jd_templates
  for each row execute function public.jd_templates_touch();

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

alter table public.jd_templates enable row level security;

-- Xoá TOÀN BỘ policy cũ bằng vòng lặp thay vì đoán tên — chạy lại file này
-- nhiều lần vẫn sạch, và không bỏ sót policy mặc định do Supabase sinh ra.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'jd_templates'
  loop
    execute format('drop policy %I on public.jd_templates', p.policyname);
  end loop;
end $$;

-- ĐỌC: mọi tài khoản đã đăng nhập (xem phần đầu file).
create policy "auth_read_jd_templates" on public.jd_templates
  for select to authenticated
  using (true);

-- THÊM: phải tự đứng tên. `created_by` có default lấy từ JWT, nhưng vẫn chặn ở
-- đây phòng trường hợp client cố tình gửi kèm email người khác.
create policy "auth_insert_jd_templates" on public.jd_templates
  for insert to authenticated
  with check (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- SỬA / XOÁ: chủ dòng hoặc Admin.
create policy "owner_update_jd_templates" on public.jd_templates
  for update to authenticated
  using (
    public.is_admin_caller()
    or lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    public.is_admin_caller()
    or lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "owner_delete_jd_templates" on public.jd_templates
  for delete to authenticated
  using (
    public.is_admin_caller()
    or lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ─── 4. KIỂM TRA NHANH SAU KHI CHẠY ───
-- select position, department, length(content) as so_ky_tu, created_by
-- from public.jd_templates order by position;
