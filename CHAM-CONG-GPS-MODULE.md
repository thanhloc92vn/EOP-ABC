# Module Chấm công GPS (Ban Điều hành dự án) — Tài liệu port đầy đủ

> Tài liệu tự chứa để **tái sử dụng module sang phần mềm khác**. Gồm: kiến trúc, chi phí,
> phụ thuộc, toàn bộ mã nguồn (SQL + React/Next.js), điểm tích hợp, chống gian lận,
> và **cách fix lỗi gửi email Gmail**. (Cập nhật: migration 067 — ngoài vùng bị TỪ CHỐI GHI; migration 068 — bán kính mặc định 100m.)

Stack gốc: **Next.js (App Router) + React + TypeScript + TailwindCSS + Supabase (Postgres + Storage + Auth) + Nodemailer**. Bản đồ (module Vị trí dự án) dùng **Leaflet + OpenStreetMap**. Icon: **lucide-react**.

---

## 0. Tính năng đã có

- ✅ Nhân sự BĐH check-in bằng **GPS + ảnh camera** trên điện thoại (`/cham-cong`), đo **bán kính** (mặc định 100m).
- ✅ **Ngoài bán kính = CHẶN HẲN**: hiện **popup Alert giữa màn hình**, không mở camera, **không ghi bản ghi nào** (server cũng RAISE EXCEPTION nếu bị lách client). → không có "bản ghi ma", không mập mờ "có tính công hay không".
- ✅ Ảnh chụp **nén < 2MB** (client) + trần bucket 2MB (server).
- ✅ HR xem card **"Danh sách nhân viên chấm công GPS"** trong trang C&B, 2 chế độ:
  - **Tổng hợp ngày công**: Tổng công / Trễ / Sớm / Tăng ca (theo ca chuẩn từng BĐH) — **cột & icon đồng bộ y hệt bảng Văn phòng** (Mã NV/Họ tên · Email nhận báo cáo (sửa được) · Trạng thái gửi · Hành động 👁 + ✈).
  - **Chi tiết lượt chấm**: theo ngày (vào/ra/khoảng cách/ảnh), bấm ảnh mở **popup giữa màn hình**.
- ✅ **Cây thư mục theo tháng** (Năm → Tháng) như bảng công Văn phòng, mỗi tháng có **👁 Xem · ⬇ Tải CSV · 🗑 Xoá**.
- ✅ **Bộ lọc theo Ban Điều hành** + ô tìm kiếm. 2 ô thống kê: *Nhân sự chấm* · *Lượt chấm hợp lệ*.
- ✅ **Email nhận báo cáo sửa được**: thêm nhiều địa chỉ cách nhau bằng dấu phẩy.
- ✅ **Gửi email báo cáo** (từng người / tất cả) — dùng chung SMTP + API + mẫu email với khối Văn phòng.
- ✅ Chống gian lận: giờ server, khoảng cách tính lại ở DB, chống định vị rác, 1 lần hợp lệ/buổi/ngày.

---

## 1. Kiến trúc

```
[Nhân sự BĐH — điện thoại]                         [Nhân sự HR — trang C&B]
  Trang /cham-cong          ──ghi──►  gps_checkins  ──đọc/tổng hợp──►  Card "DS chấm công GPS"
  GPS + camera + bán kính              (chỉ lưu khi                      Thư mục tháng + bảng
  (ngoài vùng = chặn hẳn)               HỢP LỆ)                          + Xuất CSV + Gửi email
```

Toạ độ mỗi dự án lấy từ bảng **`project_locations`** (khoá `bdh_name` ↔ bảng `departments` type='bdh'). Danh sách BĐH lấy qua `fetchDepartments()` → `deps.bdh: string[]`. Ai đăng nhập, thuộc phòng ban nào lấy qua hook `useCurrentUser()`.

---

## 2. Chi phí = 0đ API GPS

| Thành phần | Công nghệ | Chi phí |
|---|---|---|
| Lấy toạ độ nhân sự | `navigator.geolocation.getCurrentPosition` | **Miễn phí** |
| Tính khoảng cách (bán kính) | **Haversine** (client & server) | **Miễn phí** |
| Bản đồ (module Vị trí dự án) | **Leaflet + OpenStreetMap** | **Miễn phí** |
| Chụp ảnh minh chứng | `navigator.mediaDevices.getUserMedia` | **Miễn phí** |
| Lưu ảnh | Supabase Storage (bucket private, ≤2MB) | Trong gói Supabase |

> ⚠️ Reverse-geocoding (toạ độ → địa chỉ chữ) qua Google **tốn tiền** → **KHÔNG dùng**. Cần địa chỉ thì dùng **Nominatim (OSM)** miễn phí.
> ⚠️ **HTTPS bắt buộc**: Geolocation + camera chỉ chạy trên `https://` hoặc `localhost`.

---

## 3. Phụ thuộc & hợp đồng dữ liệu (khi port)

- **Auth / danh tính:** `useCurrentUser()` → `{ authenticated, email, name, department, isAdmin, ... }`.
- **Danh mục dự án + toạ độ:** bảng `project_locations` (`bdh_name, lat, lng, radius_m, shift_in, shift_out`); danh sách BĐH qua `fetchDepartments()` (bảng `departments` type='bdh').
- **Supabase client:** `@/lib/supabase`.
- **HTTP helper:** `@/lib/apiClient` → `apiFetch(url, init)` (fetch kèm token).
- **Hộp thoại căn giữa:** `useDialogs()` → `{ confirm, notify }` (truyền vào card HR để xác nhận xoá).
- **API gửi email:** `POST /api/send-attendance-email` (Nodemailer) — hợp đồng payload ở §8.

---

## 4. Database — `migrations/066_gps_checkins.sql` (+ `067` cập nhật trigger)

Chạy trong Supabase SQL Editor. Idempotent.

```sql
-- ─── 1. BỔ SUNG CẤU HÌNH CHO project_locations ───
alter table public.project_locations
  add column if not exists radius_m  integer default 100,  -- 100m (migration 068)
  add column if not exists shift_in  text    default '08:00',
  add column if not exists shift_out text    default '17:00';

-- ─── 2. HÀM KHOẢNG CÁCH HAVERSINE (mét) ───
create or replace function public.gps_distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- ─── 3. BẢNG gps_checkins ───
create table if not exists public.gps_checkins (
  id             uuid primary key default gen_random_uuid(),
  user_email     text not null,
  employee_code  text,
  employee_name  text,
  bdh_name       text not null,
  kind           text not null check (kind in ('in','out')),  -- 'in'=vào/sáng, 'out'=ra/chiều
  captured_at    timestamptz not null default now(),          -- GIỜ SERVER (trigger ghi đè)
  lat            double precision not null,
  lng            double precision not null,
  accuracy_m     double precision,
  distance_m     double precision,                            -- server tính
  radius_m       integer,
  is_valid       boolean not null default false,              -- server quyết (nay luôn true khi ghi được)
  photo_path     text,
  device         text,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_gps_checkins_email on public.gps_checkins (user_email);
create index if not exists idx_gps_checkins_bdh   on public.gps_checkins (bdh_name);
create index if not exists idx_gps_checkins_time  on public.gps_checkins (captured_at desc);

-- Chống chấm trùng: 1 lần HỢP LỆ / buổi (vào/ra) / ngày (giờ VN).
create unique index if not exists uq_gps_checkins_valid_per_day
  on public.gps_checkins (
    user_email, kind, ((timezone('Asia/Ho_Chi_Minh', captured_at))::date)
  ) where is_valid;

-- ─── 4. TRIGGER (bản 067): TỪ CHỐI GHI khi không hợp lệ ───
-- Ngoài bán kính / GPS rác >100m / BĐH chưa định vị -> RAISE EXCEPTION (không ghi
-- bản ghi ma). Mọi dòng ghi thành công đều is_valid=true.
create or replace function public.gps_checkins_validate()
returns trigger language plpgsql as $$
declare pl record; d double precision;
begin
  new.captured_at := now();  -- giờ chính thức = server, bỏ qua client
  select lat, lng, coalesce(radius_m, 100) as radius_m into pl
  from public.project_locations where bdh_name = new.bdh_name limit 1;
  if not found then
    raise exception 'BĐH "%" chưa được ghim toạ độ.', new.bdh_name using errcode='check_violation';
  end if;
  if new.accuracy_m is not null and new.accuracy_m > 100 then
    raise exception 'Tín hiệu GPS quá yếu (sai số ~% m).', round(new.accuracy_m) using errcode='check_violation';
  end if;
  d := public.gps_distance_m(new.lat, new.lng, pl.lat, pl.lng);
  if d > pl.radius_m then
    raise exception 'Ngoài bán kính: cách BĐH ~% m (bán kính % m).', round(d), pl.radius_m using errcode='check_violation';
  end if;
  new.radius_m := pl.radius_m; new.distance_m := d; new.is_valid := true;
  return new;
end;
$$;

drop trigger if exists trg_gps_checkins_validate on public.gps_checkins;
create trigger trg_gps_checkins_validate
  before insert on public.gps_checkins
  for each row execute function public.gps_checkins_validate();

-- ─── 5. RLS ───
alter table public.gps_checkins enable row level security;
revoke all on public.gps_checkins from anon;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='gps_checkins'
  loop execute format('drop policy if exists %I on public.gps_checkins', pol.policyname); end loop;
end $$;

create policy "gps_insert_self" on public.gps_checkins
  for insert to authenticated with check (user_email ilike auth.email());
create policy "gps_select_self_or_hr" on public.gps_checkins
  for select to authenticated using (
    user_email ilike auth.email()
    or exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports=true and ap.email ilike '%'||auth.email()||'%'));
create policy "gps_update_hr" on public.gps_checkins
  for update to authenticated using (
    exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports=true and ap.email ilike '%'||auth.email()||'%'));
create policy "gps_delete_hr" on public.gps_checkins
  for delete to authenticated using (
    exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports=true and ap.email ilike '%'||auth.email()||'%'));

-- ─── 6. BUCKET ẢNH (private, ≤2MB) ───
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('gps-checkins','gps-checkins', false, 2097152,   -- 2MB
          array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set
    public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
exception when insufficient_privilege or others then
  raise warning 'Tao bucket tay: Supabase > Storage > New bucket "gps-checkins", BO TICK Public.';
end $$;

do $$ begin
  execute 'drop policy if exists "gps photo insert self" on storage.objects';
  execute 'drop policy if exists "gps photo select self or hr" on storage.objects';
  execute 'drop policy if exists "gps photo delete hr" on storage.objects';
  execute $p$ create policy "gps photo insert self" on storage.objects
      for insert to authenticated with check (bucket_id='gps-checkins') $p$;
  execute $p$ create policy "gps photo select self or hr" on storage.objects
      for select to authenticated using (
        bucket_id='gps-checkins' and (
          owner = auth.uid()
          or exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
          or exists (select 1 from public.approval_permissions ap
                     where ap.can_view_attendance_imports=true and ap.email ilike '%'||auth.email()||'%'))) $p$;
  execute $p$ create policy "gps photo delete hr" on storage.objects
      for delete to authenticated using (
        bucket_id='gps-checkins' and (
          exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
          or exists (select 1 from public.approval_permissions ap
                     where ap.can_view_attendance_imports=true and ap.email ilike '%'||auth.email()||'%'))) $p$;
exception when insufficient_privilege or others then
  raise warning 'Tao policy storage tay trong Supabase > Storage > gps-checkins > Policies.';
end $$;
```

**Migration `067_gps_reject_out_of_range.sql`** (nếu tách file): chỉ gồm hàm trigger bản mới ở trên **+** dọn dữ liệu cũ:
```sql
-- Dọn bản ghi ngoài vùng cũ (is_valid=false) — dữ liệu thử nghiệm, không tính công.
delete from public.gps_checkins where is_valid = false;
```

> Tiên quyết: đã có `project_locations` (lat/lng), `allowed_users` (role), `approval_permissions` (can_view_attendance_imports). Hệ đích khác thì thay điều kiện RLS bằng cơ chế quyền tương đương.

---

## 5. Trang check-in (nhân sự BĐH) — `app/cham-cong/page.tsx`

Mobile-first. Nhận diện BĐH → GPS → **nếu ngoài bán kính: popup Alert giữa màn hình + dừng** → nếu trong vùng: ép chụp ảnh (overlay giờ+toạ độ+dự án, **nén < 2MB**) → upload + insert.

**Logic then chốt (khối lấy GPS + chặn ngoài vùng):**
```tsx
const radius = loc?.radius_m ?? 100;

navigator.geolocation.getCurrentPosition((pos) => {
  const { latitude, longitude, accuracy } = pos.coords;
  setGps({ lat: latitude, lng: longitude, acc: accuracy });
  const d = loc ? distanceM(latitude, longitude, loc.lat, loc.lng) : null;
  if (d !== null) setDist(d);
  if (accuracy > 100) { setErr(`Tín hiệu GPS quá yếu (~${Math.round(accuracy)}m)…`); setPhase("idle"); return; }
  // NGOÀI BÁN KÍNH -> popup, KHÔNG mở camera, KHÔNG ghi nhận:
  if (d !== null && d > radius) {
    setAlertMsg(`Bạn đang cách vị trí BĐH ~${Math.round(d)}m, ngoài bán kính ${radius}m.\n\nHệ thống KHÔNG ghi nhận lượt chấm ngoài vùng.`);
    setPhase("idle"); return;
  }
  openCamera();  // chỉ mở camera khi trong bán kính
}, onError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });

// Haversine client:
function distanceM(lat1,lng1,lat2,lng2){const R=6371000,r=(d)=>d*Math.PI/180;
  const a=Math.sin(r(lat2-lat1)/2)**2+Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(r(lng2-lng1)/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));}
```

**Chụp + nén < 2MB:**
```tsx
const MAX_BYTES = 2 * 1024 * 1024;
const encode = (q: number): Promise<Blob> =>
  new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/jpeg", q));
let quality = 0.7, blob = await encode(quality);
while (blob.size > MAX_BYTES && quality > 0.3) { quality -= 0.15; blob = await encode(quality); }
if (blob.size > MAX_BYTES) throw new Error("Ảnh quá lớn (>2MB).");
// upload storage 'gps-checkins' path `${email}/${yyyy-mm}/${uuid}.jpg` rồi insert gps_checkins
// (captured_at / distance_m / is_valid do TRIGGER server tự tính).
```

**Popup Alert căn giữa (trang standalone, không dùng useDialogs):**
```tsx
{alertMsg && (
  <div onClick={() => setAlertMsg("")} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div onClick={e => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto"><AlertTriangle size={26} /></div>
      <h3 className="font-extrabold text-slate-800 text-base">Ngoài phạm vi chấm công</h3>
      <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">{alertMsg}</p>
      <button onClick={() => setAlertMsg("")} className="w-full py-3 rounded-2xl bg-[#005BAC] text-white font-bold text-sm">Đã hiểu</button>
    </div>
  </div>
)}
```
> Nút VÀO/RA disabled khi `!loc` (BĐH chưa định vị) hoặc đã chấm buổi đó; chặn người không thuộc BĐH. Toàn bộ JSX xem file repo.

---

## 6. Card HR — `app/cb/GpsCheckinList.tsx`

Props: `{ smtpConfig, onNeedSmtp, confirm, notify }`. Tải **toàn bộ** lượt chấm (limit 10000) để dựng cây thư mục tháng, lọc theo tháng ở client.

**Quy đổi lượt HỢP LỆ → ngày công (dùng chung cho bảng + nút tải từng tháng):**
```ts
totalDays += hasIn && hasOut ? 1 : (hasIn || hasOut ? 0.5 : 0);   // đủ vào+ra=1, thiếu buổi=0.5
const dLate  = inMin  > shIn  ? inMin - shIn      : 0;   // đi trễ (phút)
const dEarly = outMin < shOut ? shOut - outMin    : 0;   // về sớm (phút)
const dOt    = outMin > shOut ? (outMin - shOut)/60 : 0; // tăng ca (giờ)
// shIn/shOut = phút của project_locations.shift_in / shift_out (mặc định 08:00–17:00)
```

**Giờ Việt Nam** (dữ liệu lưu UTC): `Intl.DateTimeFormat(..., { timeZone: "Asia/Ho_Chi_Minh" })` cho ngày (`en-CA` yyyy-mm-dd), tháng (`en-CA` yyyy-mm), giờ (`en-GB` HH:MM 24h).

**Bố cục JSX cần tái tạo:**
- **Cây thư mục tháng:** `📁 Năm {year}` → `📁 Tháng {mn}` + "X nhân sự · Y/Z lượt hợp lệ" + 3 nút **👁 setMonth · ⬇ exportMonthCsv(monthKey) · 🗑 deleteMonth(monthKey)**.
- **2 ô thống kê:** *Nhân sự chấm* · *Lượt chấm hợp lệ* (đã bỏ "Lượt ngoài vùng" vì không còn bản ghi ngoài vùng).
- **Bảng Tổng hợp** (đồng bộ Văn phòng): `Mã NV/Họ tên` · `Ban điều hành` · `Tổng công/Trễ/Sớm/Tăng ca` · **`Email nhận báo cáo`** = `<input value={emailOverride[s.email] ?? s.email} onChange=...>` (sửa được, nhiều email cách nhau ',') · `Trạng thái gửi` (badge) · `Hành động` (👁 xem chi tiết + ✈ `sendOne`).
- **Bảng Chi tiết:** ngày · vào · ra · khoảng cách · trạng thái · ảnh (bấm → modal căn giữa qua `createSignedUrl`).

**Gửi email (nhiều địa chỉ):**
```ts
const recipientEmail = (emailOverride[s.email] ?? s.email).split(",").map(x=>x.trim()).filter(Boolean).join(", ");
await apiFetch("/api/send-attendance-email", { method:"POST", headers:{"Content-Type":"application/json"},
  body: JSON.stringify({ smtpConfig, recipient:{email:recipientEmail,name:s.name,employeeCode:s.employeeCode||"—"},
    summary:{totalDays:s.totalDays,totalLate:s.totalLate,totalEarly:s.totalEarly,totalOvertime:s.totalOvertime},
    details:s.details, month: monthLabel }) });
```

**Xoá 1 tháng (có confirm căn giữa):** `confirm({title,message,tone:"danger"})` → `supabase.from("gps_checkins").delete().in("id", ids)` → xoá ảnh `storage.from("gps-checkins").remove(paths)`.

> Toàn bộ mã đầy đủ ở file repo `app/cb/GpsCheckinList.tsx`.

---

## 7. Điểm tích hợp

**a) Render trong trang C&B** — `app/cb/page.tsx` (có `const { notify, confirm } = useDialogs();`):
```tsx
import GpsCheckinList from "./GpsCheckinList";
<GpsCheckinList smtpConfig={smtpConfig} onNeedSmtp={() => setShowEmailConfigModal(true)} confirm={confirm} notify={notify} />
```

**b) Menu** — `components/Sidebar.tsx` (hiện cho Admin hoặc nhân sự BĐH):
```tsx
import { useDepartments } from "@/lib/departments";
const deps = useDepartments();
const showGpsCheckin = !currentUser.loading && (currentUser.isAdmin || deps.bdh.includes(currentUser.department));
...(showGpsCheckin ? [{ label: "Chấm công GPS", href: "/cham-cong", icon: Fingerprint }] : []),
```

**c) Phân gói route** — `lib/planShared.ts`: `{ prefix: "/cham-cong", min: "basic" }`.

---

## 8. Hợp đồng API gửi email — `POST /api/send-attendance-email`

Nodemailer. `recipient.email` **nhận nhiều địa chỉ cách nhau bằng dấu phẩy**.
```jsonc
{
  "smtpConfig": { "user": "...", "pass": "<App Password>", "host": "smtp.gmail.com", "port": 465, "secure": true },
  "recipient":  { "email": "a@gmail.com, b@congty.vn", "name": "Nguyễn Văn A", "employeeCode": "5497" },
  "summary":    { "totalDays": 0.5, "totalLate": 151, "totalEarly": 0, "totalOvertime": 0 },
  "details": [ { "date": "01/09/2026", "dayOfWeek": "Thứ Hai", "checkin": "08:35", "checkout": "17:00",
                 "hours": 8, "late": 35, "early": 0, "status": "Hợp lệ (GPS)" } ],
  "month": "09/2026"
}
```
Server dựng email HTML (KPI + bảng chi tiết) + **đính kèm Excel** cá nhân. Transporter:
```ts
const portNum = Number(smtpConfig.port) || 465;
const isSecure = smtpConfig.secure === undefined ? (portNum === 465) : smtpConfig.secure;
nodemailer.createTransport({ host: smtpConfig.host || "smtp.gmail.com", port: portNum, secure: isSecure,
  auth: { user: smtpConfig.user, pass: smtpConfig.pass }, tls: { rejectUnauthorized: false } });
// transporter.sendMail({ to: recipient.email, ... })  // to nhận chuỗi nhiều email cách nhau ','
```

---

## 9. Chống gian lận

| Rủi ro | Biện pháp |
|---|---|
| **Ngoài bán kính** | Client: popup + chặn (không mở camera). Server: **RAISE EXCEPTION** — không ghi bản ghi nào. |
| Fake GPS / định vị wifi-IP | Loại nếu `accuracy > 100m` (client chặn + server RAISE). |
| Sửa code client "luôn hợp lệ" | Server tính lại khoảng cách trong trigger và **từ chối ghi** nếu ngoài vùng; RLS chỉ cho insert của chính mình. |
| Sửa đồng hồ máy | Giờ chính thức = `now()` server (trigger ghi đè). |
| Chấm hộ | Gắn cứng `user_email` = tài khoản đăng nhập; 1 lần hợp lệ/buổi/ngày (unique index). |
| Ảnh cũ / chụp lại | Ép camera sống (`getUserMedia`), overlay giờ + toạ độ + dự án. |

---

## 10. FIX LỖI GỬI EMAIL GMAIL ⭐

**Triệu chứng:** `534-5.7.9 Application-specific password required` (hoặc `535-5.7.8 Username and Password not accepted`).
**Nguyên nhân:** Gmail bật Xác minh 2 bước **bắt buộc dùng Mật khẩu ứng dụng (App Password) 16 ký tự**, không nhận mật khẩu Gmail thường. **Không phải lỗi code.**
**Cách fix:**
1. Bật **Xác minh 2 bước**: https://myaccount.google.com/security
2. Tạo **App Password**: https://myaccount.google.com/apppasswords → đặt tên → chuỗi `abcd efgh ijkl mnop`.
3. Dán vào ô mật khẩu SMTP, **xoá hết khoảng trắng** → `abcdefghijklmnop` → Lưu → Gửi lại.

**Gmail đúng:** host `smtp.gmail.com`, port `465`, secure `true`, user = email đầy đủ, pass = App Password.
**Nhà cung cấp khác:** Outlook/Office365 `smtp.office365.com:587` (secure false, STARTTLS) — nhiều nơi cũng cần App Password nếu bật 2FA.

---

## 11. Checklist triển khai (port)

- [ ] Có `project_locations` với `lat/lng`; chạy phần ALTER thêm `radius_m/shift_in/shift_out`.
- [ ] Chạy `066_gps_checkins.sql` → `067_gps_reject_out_of_range.sql` (từ chối ngoài vùng + dọn dữ liệu cũ) → `068_gps_radius_100.sql` (bán kính 100m). Sửa RLS cho khớp hệ đích.
- [ ] Tạo bucket `gps-checkins` (private, ≤2MB) nếu SQL không tạo được.
- [ ] Thêm trang `/cham-cong` (có popup ngoài vùng) + card `GpsCheckinList` (+ props confirm/notify).
- [ ] Đấu nối `useCurrentUser`, `fetchDepartments`, `apiFetch`, `useDialogs`, API email.
- [ ] Thêm menu + phân quyền route.
- [ ] Deploy **HTTPS** (bắt buộc GPS + camera).
- [ ] Ghim toạ độ BĐH; cấu hình SMTP bằng **App Password**.
- [ ] Test: chấm trong vùng (ghi + tính công); chấm **ngoài vùng (popup, KHÔNG ghi)**; chống trùng; popup ảnh; thư mục tháng (xem/tải/xoá); lọc BĐH; sửa email + gửi nhiều địa chỉ.

---

*Tài liệu module Chấm công GPS — dự án EOP-ABC. Khớp bản đã push (nhánh master, gồm migration 067).*
