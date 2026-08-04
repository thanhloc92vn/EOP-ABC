-- ============================================================
-- 023 — MODULE TIN TỨC NỘI BỘ (Thông báo / Giới thiệu / Sự kiện)
--
-- MỤC ĐÍCH:
-- Hệ thống chưa có kênh truyền thông nội bộ: thông báo phúc lợi, bài giới thiệu
-- công ty và tin sự kiện vẫn đi qua email/Zalo — không lưu lại, không tra được.
-- Migration này dựng 3 bảng + 1 bucket riêng tư + cờ quyền đăng bài.
--
-- CẤU TRÚC:
--   news_posts        — bài viết (3 danh mục), ảnh bìa, nội dung Markdown rút gọn,
--                       link ngoài (dán link báo/website), trường riêng cho sự kiện.
--   news_attachments  — ảnh album + file PDF đính kèm (đường dẫn trong bucket).
--   news_reactions    — thả tim, khoá chính (post_id, user_email) => mỗi người 1 tim.
--
-- VÌ SAO ĐẾM TIM BẰNG TRIGGER, KHÔNG BẰNG VIEW:
-- Dùng view thống kê sẽ dính đúng cái bẫy đã gặp ở `employees_directory`: RLS
-- KHÔNG áp cho view, phải revoke anon/public thủ công rồi mới grant authenticated.
-- Cột `like_count` + trigger giữ mọi thứ trong tầm RLS của bảng gốc, và danh sách
-- 20 bài chỉ cần MỘT truy vấn.
--
-- QUYỀN:
--   XEM   — mọi tài khoản đã đăng nhập (module ở gói Basic, không cần cờ).
--   ĐĂNG  — Admin hoặc cờ mới `can_manage_news`.
-- ⚠ KHÔNG tự bật cờ cho ai. Sau khi chạy, vào Cài đặt hệ thống > User Permissions
--   và tick "Tin tức — Đăng bài" cho đúng người (thường là HCNS/Marketing).
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. BẢNG BÀI VIẾT ───
create table if not exists public.news_posts (
  id             uuid primary key default gen_random_uuid(),
  category       text not null default 'thong_bao'
                   check (category in ('thong_bao', 'gioi_thieu', 'su_kien')),
  title          text not null,
  summary        text,                       -- trích đoạn hiện trên card danh sách
  content_md     text,                       -- Markdown RÚT GỌN (xem lib/newsMarkdown.ts)
  cover_path     text,                       -- đường dẫn trong bucket, KHÔNG lưu URL
                                             -- (bucket private -> link phải ký lại mỗi lần)
  status         text not null default 'draft'
                   check (status in ('draft', 'published')),
  pinned         boolean not null default false,

  -- Chỉ dùng cho danh mục 'su_kien'
  event_start_at timestamptz,
  event_end_at   timestamptz,
  event_location text,

  -- Link báo / website ngoài: [{ "label": "Báo Tuổi Trẻ", "url": "https://..." }]
  external_links jsonb not null default '[]'::jsonb,

  author_email   text,
  author_name    text,
  department     text,
  published_at   timestamptz,

  -- Số dẫn xuất, cập nhật bằng trigger/RPC — không cho client ghi trực tiếp
  like_count     integer not null default 0,
  view_count     integer not null default 0,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.news_posts is
  'Tin nội bộ: thông báo, giới thiệu, sự kiện. like_count/view_count là số dẫn xuất do trigger và RPC news_increment_view cập nhật.';

-- Danh sách luôn sắp theo (ghim, ngày đăng) và lọc theo danh mục
create index if not exists news_posts_feed_idx
  on public.news_posts (status, pinned desc, published_at desc nulls last);
create index if not exists news_posts_category_idx
  on public.news_posts (category);

-- ─── 2. BẢNG TỆP ĐÍNH KÈM ───
-- Ảnh album sự kiện và PDF thông báo dùng chung bảng, phân biệt bằng `kind`.
create table if not exists public.news_attachments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.news_posts(id) on delete cascade,
  path        text not null,                 -- đường dẫn trong bucket news-media
  name        text not null,
  mime        text,
  size_bytes  bigint,
  kind        text not null default 'file' check (kind in ('image', 'file')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists news_attachments_post_idx
  on public.news_attachments (post_id, sort_order);

-- ─── 3. BẢNG THẢ TIM ───
-- Khoá chính kép = mỗi người đúng MỘT tim cho mỗi bài; bấm lại là xoá dòng.
create table if not exists public.news_reactions (
  post_id    uuid not null references public.news_posts(id) on delete cascade,
  user_email text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_email)
);

-- ─── 4. TRIGGER: updated_at + đếm tim ───
create or replace function public.news_posts_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists news_posts_touch_trg on public.news_posts;
create trigger news_posts_touch_trg
  before update on public.news_posts
  for each row execute function public.news_posts_touch();

-- Đồng bộ like_count. security definer để chạy được kể cả khi người bấm tim
-- không có quyền UPDATE bảng news_posts (họ chỉ có quyền ghi news_reactions).
create or replace function public.news_reactions_sync_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.news_posts
       set like_count = like_count + 1
     where id = new.post_id;
    return new;
  else
    update public.news_posts
       set like_count = greatest(like_count - 1, 0)
     where id = old.post_id;
    return old;
  end if;
end;
$$;

drop trigger if exists news_reactions_sync_count_trg on public.news_reactions;
create trigger news_reactions_sync_count_trg
  after insert or delete on public.news_reactions
  for each row execute function public.news_reactions_sync_count();

-- Chạy lại migration trên CSDL đã có dữ liệu: nắn lại số đếm cho khớp thực tế.
update public.news_posts p
   set like_count = coalesce(c.n, 0)
  from (
    select post_id, count(*)::int as n
    from public.news_reactions group by post_id
  ) c
 where c.post_id = p.id and p.like_count is distinct from c.n;

-- ─── 5. RPC ĐẾM LƯỢT XEM ───
-- Tách khỏi policy UPDATE: nếu cho mọi người UPDATE news_posts để cộng lượt xem
-- thì họ cũng sửa được tiêu đề/nội dung. security definer + chỉ đụng 1 cột.
create or replace function public.news_increment_view(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.news_posts
     set view_count = view_count + 1
   where id = p_id and status = 'published';
$$;

revoke all on function public.news_increment_view(uuid) from public, anon;
grant execute on function public.news_increment_view(uuid) to authenticated;

-- ─── 6. CỜ QUYỀN ĐĂNG BÀI ───
alter table public.approval_permissions
  add column if not exists can_manage_news boolean not null default false;

create or replace function public.caller_can_manage_news()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.allowed_users au
      where au.role = 'Admin' and au.email ilike auth.email()
    )
    or exists (
      select 1 from public.approval_permissions p
      where p.can_manage_news = true
        and p.email ilike '%' || auth.email() || '%'
    );
$$;

-- ─── 7. RLS ───
-- Quét động pg_policies để xoá sạch policy cũ (không đoán tên) rồi dựng whitelist.
alter table public.news_posts       enable row level security;
alter table public.news_attachments enable row level security;
alter table public.news_reactions   enable row level security;

do $$
declare pol record;
begin
  for pol in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('news_posts', 'news_attachments', 'news_reactions')
  loop
    execute format('drop policy if exists %I on public.%I;', pol.policyname, pol.tablename);
  end loop;
end $$;

-- 7a. news_posts — đọc: bài đã đăng cho mọi người đăng nhập; bản nháp chỉ người đăng bài
create policy "news_posts select published or editor"
  on public.news_posts for select to authenticated
  using (status = 'published' or public.caller_can_manage_news());

create policy "news_posts insert editor"
  on public.news_posts for insert to authenticated
  with check (public.caller_can_manage_news());

create policy "news_posts update editor"
  on public.news_posts for update to authenticated
  using (public.caller_can_manage_news())
  with check (public.caller_can_manage_news());

create policy "news_posts delete editor"
  on public.news_posts for delete to authenticated
  using (public.caller_can_manage_news());

-- 7b. news_attachments — đọc kèm theo bài đọc được
create policy "news_attachments select with post"
  on public.news_attachments for select to authenticated
  using (
    exists (
      select 1 from public.news_posts p
      where p.id = post_id
        and (p.status = 'published' or public.caller_can_manage_news())
    )
  );

create policy "news_attachments insert editor"
  on public.news_attachments for insert to authenticated
  with check (public.caller_can_manage_news());

create policy "news_attachments update editor"
  on public.news_attachments for update to authenticated
  using (public.caller_can_manage_news())
  with check (public.caller_can_manage_news());

create policy "news_attachments delete editor"
  on public.news_attachments for delete to authenticated
  using (public.caller_can_manage_news());

-- 7c. news_reactions — ai đăng nhập cũng đọc (để biết mình đã tim chưa),
--     nhưng chỉ ghi/xoá được ĐÚNG dòng của chính mình.
create policy "news_reactions select authenticated"
  on public.news_reactions for select to authenticated
  using (true);

create policy "news_reactions insert own"
  on public.news_reactions for insert to authenticated
  with check (user_email ilike auth.email());

create policy "news_reactions delete own"
  on public.news_reactions for delete to authenticated
  using (user_email ilike auth.email());

-- ─── 8. KHO TỆP (bucket riêng tư) ───
-- KHÔNG dùng bucket public 'clerical-documents': bài tin có thể đính kèm PDF
-- thông báo lương/phúc lợi. Bucket private + link ký hạn giờ, giống migration 015.
-- Cũng bọc bắt lỗi vì lý do y hệt phần policy bên dưới: thiếu quyền ghi
-- storage.buckets sẽ kéo đổ toàn bộ migration.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'news-media',
    'news-media',
    false,
    10485760, -- 10MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
  )
  on conflict (id) do update set
    public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  raise notice 'Bucket news-media đã sẵn sàng (private, 10MB).';
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG tạo được bucket news-media bằng SQL (%). Hãy vào Supabase > Storage > New bucket, đặt tên đúng "news-media" và BỎ TICK Public.', sqlerrm;
end $$;

-- ⚠ POLICY TRÊN storage.objects — BỌC TRONG KHỐI BẮT LỖI, CÓ LÝ DO:
-- Trên các dự án Supabase mới, vai trò chạy SQL Editor KHÔNG sở hữu bảng
-- storage.objects, nên `create policy` ở đây báo "must be owner of table
-- objects" và làm HỎNG CẢ SCRIPT (SQL Editor chạy trong một transaction ->
-- rollback sạch, 3 bảng ở trên cũng biến mất theo, trông như migration không
-- chạy gì cả). Bọc lại để phần cốt lõi luôn được giữ, còn phần policy nếu
-- không đặt được thì báo hướng dẫn làm tay ở cuối.
do $$
begin
  execute 'drop policy if exists "news media select authenticated" on storage.objects';
  execute 'drop policy if exists "news media insert editor"        on storage.objects';
  execute 'drop policy if exists "news media update editor"        on storage.objects';
  execute 'drop policy if exists "news media delete editor"        on storage.objects';

  -- Đọc: mọi tài khoản đã đăng nhập (link ký hạn giờ do app phát)
  execute $p$
    create policy "news media select authenticated"
      on storage.objects for select to authenticated
      using (bucket_id = 'news-media')
  $p$;

  -- Ghi/xoá: chỉ người được cấp quyền đăng bài
  execute $p$
    create policy "news media insert editor"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'news-media' and public.caller_can_manage_news())
  $p$;

  execute $p$
    create policy "news media update editor"
      on storage.objects for update to authenticated
      using (bucket_id = 'news-media' and public.caller_can_manage_news())
      with check (bucket_id = 'news-media' and public.caller_can_manage_news())
  $p$;

  execute $p$
    create policy "news media delete editor"
      on storage.objects for delete to authenticated
      using (bucket_id = 'news-media' and public.caller_can_manage_news())
  $p$;

  raise notice 'Đã đặt xong 4 policy cho bucket news-media.';
exception
  when insufficient_privilege or others then
    raise warning 'KHÔNG đặt được policy cho storage.objects (%). Phần còn lại của migration VẪN CHẠY ĐÚNG. Hãy vào Supabase > Storage > news-media > Policies và tạo tay 4 policy theo hướng dẫn ở bước 9d.', sqlerrm;
end $$;

-- ─── 9. KIỂM TRA ───
-- 9a. Policy: news_posts 4 dòng, news_attachments 4 dòng, news_reactions 3 dòng
select tablename, policyname, cmd from pg_policies
where schemaname = 'public'
  and tablename in ('news_posts', 'news_attachments', 'news_reactions')
order by tablename, cmd;

-- 9b. Bucket phải là private, 10MB, đúng 5 kiểu tệp
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'news-media';

-- 9c. Policy của bucket — phải ra đúng 4 dòng. RỖNG nghĩa là khối bắt lỗi ở
--     bước 8 đã nhảy vào exception -> làm tay theo 9d.
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'news media%'
order by cmd;

-- 9d. NẾU 9b RỖNG (chưa có bucket) hoặc 9c RỖNG (chưa có policy):
--   • Bucket: Supabase > Storage > New bucket > tên "news-media", BỎ TICK Public,
--     File size limit 10MB.
--   • Policy: Storage > news-media > Policies > New policy > "For full customization",
--     tạo 4 policy cho vai trò `authenticated`:
--       SELECT : bucket_id = 'news-media'
--       INSERT : bucket_id = 'news-media' and public.caller_can_manage_news()
--       UPDATE : bucket_id = 'news-media' and public.caller_can_manage_news()
--       DELETE : bucket_id = 'news-media' and public.caller_can_manage_news()

-- 9e. Ai đang được quyền đăng tin (sau khi tick cờ trong User Permissions)
select name, email, can_manage_news
from public.approval_permissions
where can_manage_news = true
order by name;
