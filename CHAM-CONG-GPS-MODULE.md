# Module Chấm công GPS (Ban Điều hành dự án) — Tài liệu port đầy đủ

> Tài liệu tự chứa để **tái sử dụng module sang phần mềm khác**. Gồm: kiến trúc, chi phí,
> phụ thuộc, toàn bộ mã nguồn (SQL + React/Next.js), điểm tích hợp, chống gian lận,
> và **cách fix lỗi gửi email Gmail**. (Cập nhật: bản mới nhất trên nhánh master.)

Stack gốc: **Next.js (App Router) + React + TypeScript + TailwindCSS + Supabase (Postgres + Storage + Auth) + Nodemailer**. Bản đồ (module Vị trí dự án) dùng **Leaflet + OpenStreetMap**. Icon: **lucide-react**.

---

## 0. Tính năng đã có (checklist tính năng)

- ✅ Nhân sự BĐH check-in bằng **GPS + ảnh camera** trên điện thoại (`/cham-cong`), đo **bán kính** (mặc định 50m).
- ✅ Ảnh chụp **nén < 2MB** (client) + trần bucket 2MB (server).
- ✅ HR xem card **"Danh sách nhân viên chấm công GPS"** trong trang C&B, 2 chế độ:
  - **Tổng hợp ngày công**: Tổng công / Trễ / Sớm / Tăng ca (theo ca chuẩn từng BĐH) — **cột & icon đồng bộ y hệt bảng Văn phòng** (Mã NV/Họ tên · Email nhận báo cáo (sửa được) · Trạng thái gửi · Hành động 👁 + ✈).
  - **Chi tiết lượt chấm**: theo ngày (vào/ra/khoảng cách/ảnh), bấm ảnh mở **popup giữa màn hình**.
- ✅ **Cây thư mục theo tháng** (Năm → Tháng) như bảng công Văn phòng, mỗi tháng có **👁 Xem · ⬇ Tải CSV · 🗑 Xoá**.
- ✅ **Bộ lọc theo Ban Điều hành** + ô tìm kiếm.
- ✅ **Email nhận báo cáo sửa được**: thêm nhiều địa chỉ cách nhau bằng dấu phẩy.
- ✅ **Gửi email báo cáo** (từng người / tất cả) — dùng chung SMTP + API + mẫu email với khối Văn phòng.
- ✅ Chống gian lận: giờ server, khoảng cách tính lại ở DB, chống định vị rác, 1 lần hợp lệ/buổi/ngày.

---

## 1. Kiến trúc

```
[Nhân sự BĐH — điện thoại]                         [Nhân sự HR — trang C&B]
  Trang /cham-cong          ──ghi──►  gps_checkins  ──đọc/tổng hợp──►  Card "DS chấm công GPS"
  GPS + camera + bán kính              (raw event)                     Thư mục tháng + bảng
                                                                       + Xuất CSV + Gửi email
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

> ⚠️ Reverse-geocoding (toạ độ → địa chỉ chữ) qua Google **tốn tiền** → **KHÔNG dùng** (đã biết tên dự án). Cần địa chỉ thì dùng **Nominatim (OSM)** miễn phí.
> ⚠️ **HTTPS bắt buộc**: Geolocation + camera chỉ chạy trên `https://` hoặc `localhost`. Qua IP LAN (http) sẽ bị chặn.

---

## 3. Phụ thuộc & hợp đồng dữ liệu (khi port)

- **Auth / danh tính:** `useCurrentUser()` trả `{ authenticated, email, name, department, isAdmin, ... }`.
- **Danh mục dự án + toạ độ:** bảng `project_locations` (`bdh_name, lat, lng, radius_m, shift_in, shift_out`); danh sách BĐH qua `fetchDepartments()` (bảng `departments` type='bdh').
- **Supabase client:** `@/lib/supabase`.
- **HTTP helper:** `@/lib/apiClient` → `apiFetch(url, init)` (fetch kèm token). Thay bằng `fetch` nếu API không cần auth.
- **Hộp thoại căn giữa:** `useDialogs()` → `{ confirm, notify }` (truyền vào component HR để xác nhận xoá).
- **API gửi email:** `POST /api/send-attendance-email` (Nodemailer) — hợp đồng payload ở §8.

---

## 4. Database — `migrations/066_gps_checkins.sql`

Chạy trong Supabase SQL Editor. Idempotent.

```sql
-- ============================================================
-- 066_gps_checkins.sql — CHẤM CÔNG GPS cho khối Ban Điều hành dự án (BĐH)
-- Chống gian lận: giờ = server; khoảng cách & is_valid = server tính lại (không
-- tin client); loại định vị rác accuracy>100m; 1 lần hợp lệ/buổi/ngày.
-- ============================================================

-- ─── 1. BỔ SUNG CẤU HÌNH CHO project_locations ───
alter table public.project_locations
  add column if not exists radius_m  integer default 50,
  add column if not exists shift_in  text    default '08:00',
  add column if not exists shift_out text    default '17:00';

-- ─── 2. HÀM KHOẢNG CÁCH HAVERSINE (mét) ───
create or replace function public.gps_distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  ));
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
  is_valid       boolean not null default false,              -- server quyết
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
  )
  where is_valid;

-- ─── 4. TRIGGER: giờ server + khoảng cách + is_valid (server-side) ───
create or replace function public.gps_checkins_validate()
returns trigger language plpgsql as $$
declare pl record;
begin
  new.captured_at := now();  -- giờ chính thức = server, bỏ qua client
  select lat, lng, coalesce(radius_m, 50) as radius_m into pl
  from public.project_locations where bdh_name = new.bdh_name limit 1;
  if not found then
    new.distance_m := null; new.radius_m := coalesce(new.radius_m, 50); new.is_valid := false;
    return new;
  end if;
  new.radius_m   := pl.radius_m;
  new.distance_m := public.gps_distance_m(new.lat, new.lng, pl.lat, pl.lng);
  new.is_valid   := (new.distance_m <= pl.radius_m)
                    and (new.accuracy_m is null or new.accuracy_m <= 100);
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
  for pol in select policyname from pg_policies
    where schemaname='public' and tablename='gps_checkins'
  loop execute format('drop policy if exists %I on public.gps_checkins', pol.policyname); end loop;
end $$;

-- INSERT: chỉ cho CHÍNH mình.
create policy "gps_insert_self" on public.gps_checkins
  for insert to authenticated with check (user_email ilike auth.email());

-- SELECT: bản ghi của mình, hoặc Admin / đầu mối HCNS xem tất cả.
create policy "gps_select_self_or_hr" on public.gps_checkins
  for select to authenticated using (
    user_email ilike auth.email()
    or exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports = true and ap.email ilike '%' || auth.email() || '%')
  );

-- UPDATE/DELETE: chỉ Admin / đầu mối HCNS.
create policy "gps_update_hr" on public.gps_checkins
  for update to authenticated using (
    exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports = true and ap.email ilike '%' || auth.email() || '%')
  );
create policy "gps_delete_hr" on public.gps_checkins
  for delete to authenticated using (
    exists (select 1 from public.allowed_users au where au.role='Admin' and au.email ilike auth.email())
    or exists (select 1 from public.approval_permissions ap
               where ap.can_view_attendance_imports = true and ap.email ilike '%' || auth.email() || '%')
  );

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

> Tiên quyết: đã có `project_locations` (lat/lng), `allowed_users` (role), `approval_permissions` (can_view_attendance_imports). Hệ đích khác thì thay điều kiện RLS bằng cơ chế quyền tương đương.

---

## 5. Trang check-in (nhân sự BĐH) — `app/cham-cong/page.tsx`

Mobile-first. Nhận diện BĐH theo phòng ban → GPS → đo bán kính → ép chụp ảnh camera (overlay giờ+toạ độ+dự án, **nén < 2MB**) → upload + insert (server tự tính hợp lệ).

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { fetchDepartments } from "@/lib/departments";
import {
  MapPin, Camera, CheckCircle2, XCircle, Loader2, Navigation,
  LogIn, LogOut, RefreshCw, ShieldAlert, Clock,
} from "lucide-react";

type Located = { bdh_name: string; lat: number; lng: number; radius_m: number | null; province: string | null };
type TodayRow = { kind: "in" | "out"; captured_at: string; is_valid: boolean; distance_m: number | null };

// Haversine (mét) — client phản hồi tức thì; server tính lại khi lưu.
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

export default function ChamCongPage() {
  const user = useCurrentUser();
  const [isBdh, setIsBdh] = useState<boolean | null>(null);
  const [loc, setLoc] = useState<Located | null>(null);
  const [locLoading, setLocLoading] = useState(true);
  const [today, setToday] = useState<TodayRow[]>([]);
  const [kind, setKind] = useState<"in" | "out" | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [dist, setDist] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "locating" | "camera" | "saving">("idle");
  const [err, setErr] = useState(""); const [okMsg, setOkMsg] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const radius = loc?.radius_m ?? 50;
  const inRange = dist !== null && dist <= radius;

  const loadContext = useCallback(async () => {
    if (!user.authenticated || !user.department) return;
    setLocLoading(true);
    try {
      const deps = await fetchDepartments();
      const bdh = deps.bdh.includes(user.department);
      setIsBdh(bdh);
      if (!bdh) { setLocLoading(false); return; }
      const { data: pl } = await supabase.from("project_locations")
        .select("bdh_name, lat, lng, radius_m, province").eq("bdh_name", user.department).maybeSingle();
      setLoc(pl as Located | null);
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const { data: rows } = await supabase.from("gps_checkins")
        .select("kind, captured_at, is_valid, distance_m")
        .gte("captured_at", startOfDay.toISOString()).order("captured_at", { ascending: true });
      setToday((rows || []) as TodayRow[]);
    } catch { setIsBdh(false); } finally { setLocLoading(false); }
  }, [user.authenticated, user.department]);

  useEffect(() => { loadContext(); }, [loadContext]);
  useEffect(() => () => stopCamera(), []);

  const doneIn = useMemo(() => today.some(r => r.kind === "in" && r.is_valid), [today]);
  const doneOut = useMemo(() => today.some(r => r.kind === "out" && r.is_valid), [today]);

  function stopCamera() { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  function reset() { stopCamera(); setKind(null); setGps(null); setDist(null); setPhase("idle"); setErr(""); setOkMsg(""); }

  async function startCheckin(which: "in" | "out") {
    setErr(""); setOkMsg(""); setKind(which); setPhase("locating"); setGps(null); setDist(null);
    if (!("geolocation" in navigator)) { setErr("Thiết bị không hỗ trợ định vị GPS."); setPhase("idle"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGps({ lat: latitude, lng: longitude, acc: accuracy });
        if (loc) setDist(distanceM(latitude, longitude, loc.lat, loc.lng));
        if (accuracy > 100) { setErr(`Tín hiệu GPS quá yếu (sai số ~${Math.round(accuracy)}m). Ra chỗ thoáng và thử lại.`); setPhase("idle"); return; }
        openCamera();
      },
      (e) => {
        const m: Record<number, string> = {
          1: "Bạn đã chặn quyền vị trí. Vào cài đặt trình duyệt cho phép truy cập vị trí rồi thử lại.",
          2: "Không lấy được vị trí. Kiểm tra GPS/định vị đã bật chưa.",
          3: "Lấy vị trí quá lâu. Thử lại ở nơi thoáng.",
        };
        setErr(m[e.code] || "Không lấy được vị trí GPS."); setPhase("idle");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream; setPhase("camera");
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 60);
    } catch { setErr("Không mở được camera. Cho phép quyền camera trong trình duyệt rồi thử lại."); setPhase("idle"); }
  }

  async function captureAndSave() {
    if (!videoRef.current || !gps || !kind) return;
    setPhase("saving"); setErr("");
    try {
      const v = videoRef.current;
      const maxW = 720;
      const scale = Math.min(1, maxW / (v.videoWidth || maxW));
      const w = Math.round((v.videoWidth || maxW) * scale);
      const h = Math.round((v.videoHeight || maxW * 0.75) * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(v, 0, 0, w, h);

      const lines = [
        `${user.department}`,
        `${new Date().toLocaleString("vi-VN")}`,
        `GPS ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (±${Math.round(gps.acc)}m)`,
        dist !== null ? `Cách vị trí BĐH: ${Math.round(dist)}m` : "",
      ].filter(Boolean);
      const pad = 8, lh = 18, boxH = lines.length * lh + pad;
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, h - boxH, w, boxH);
      ctx.fillStyle = "#fff"; ctx.font = "600 13px sans-serif"; ctx.textBaseline = "top";
      lines.forEach((t, i) => ctx.fillText(t, pad, h - boxH + pad / 2 + i * lh));

      // Nén JPEG, đảm bảo ảnh < 2MB (720px/q0.7 thường ~100-200KB).
      const MAX_BYTES = 2 * 1024 * 1024;
      const encode = (qlt: number): Promise<Blob> =>
        new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", qlt));
      let quality = 0.7;
      let blob: Blob = await encode(quality);
      while (blob.size > MAX_BYTES && quality > 0.3) { quality -= 0.15; blob = await encode(quality); }
      if (blob.size > MAX_BYTES) throw new Error("Ảnh quá lớn (>2MB). Vui lòng thử lại.");

      stopCamera();

      const ym = new Date().toISOString().slice(0, 7);
      const path = `${user.email}/${ym}/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from("gps-checkins").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw new Error("Không tải được ảnh lên: " + up.error.message);

      const { error: insErr } = await supabase.from("gps_checkins").insert([{
        user_email: user.email, employee_name: user.name, bdh_name: user.department, kind,
        lat: gps.lat, lng: gps.lng, accuracy_m: gps.acc, photo_path: path,
        device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
        // captured_at / distance_m / is_valid do TRIGGER server tự tính.
      }]);
      if (insErr) {
        if ((insErr as any).code === "23505") throw new Error(`Bạn đã chấm công ${kind === "in" ? "VÀO" : "RA"} hợp lệ hôm nay rồi.`);
        throw new Error("Không lưu được: " + insErr.message);
      }
      setOkMsg(`Đã chấm công ${kind === "in" ? "VÀO" : "RA"} lúc ${new Date().toLocaleTimeString("vi-VN")}.`);
      setPhase("idle"); setKind(null); setGps(null); setDist(null); loadContext();
    } catch (e: any) { setErr(e?.message || "Có lỗi khi lưu chấm công."); setPhase("idle"); stopCamera(); }
  }

  // … phần JSX (header, trạng thái hôm nay, camera, 2 nút VÀO/RA) — xem đầy đủ ở repo.
  // Chốt logic: chặn người không thuộc BĐH; disable nút khi đã chấm buổi đó; hiện
  // khoảng cách + trạng thái trong/ngoài bán kính.
}
```

> Phần JSX trình bày dài; giữ nguyên trong file repo. Điểm mấu chốt đã nằm ở khối logic trên.

---

## 6. Card HR — `app/cb/GpsCheckinList.tsx` (toàn bộ)

Props: `{ smtpConfig, onNeedSmtp, confirm, notify }`. Tải **toàn bộ** lượt chấm để dựng cây thư mục tháng, lọc theo tháng ở client.

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/apiClient";
import { MapPin, RefreshCw, Loader2, CheckCircle2, XCircle, Image as ImageIcon, Search, Download, LayoutList, Table2, Mail, AlertCircle, X, Eye, Trash2, Send } from "lucide-react";

type SmtpConfig = { user: string; pass: string; provider: string; host: string; port: number; secure: boolean };
type Row = { id: string; user_email: string; employee_name: string | null; bdh_name: string; kind: "in" | "out"; captured_at: string; distance_m: number | null; radius_m: number | null; is_valid: boolean; photo_path: string | null };
type Shift = { in: string; out: string };
type EmailStatus = "idle" | "sending" | "success" | "error";

const VN = "Asia/Ho_Chi_Minh";
const vnDayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: VN, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const vnMonthKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: VN, year: "numeric", month: "2-digit" }).format(new Date(iso));
const vnHHMM = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: VN, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const fmtT = (iso?: string) => (iso ? vnHHMM(iso) : "—");
const fmtDayVN = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: VN, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const weekdayVN = (dayKey: string) => new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: VN }).format(new Date(`${dayKey}T12:00:00+07:00`));
const ddmmyyyy = (dayKey: string) => { const [y, m, d] = dayKey.split("-"); return `${d}/${m}/${y}`; };

type Detail = { date: string; dayOfWeek: string; checkin: string; checkout: string; hours: number; late: number; early: number; status: string };
type DayGroup = { key: string; name: string; bdh: string; dateIso: string; in?: Row; out?: Row };
type Summary = { email: string; name: string; bdh: string; employeeCode: string; totalDays: number; totalLate: number; totalEarly: number; totalOvertime: number; validSessions: number; details: Detail[] };
type ConfirmFn = (opts: { title: string; message: string; confirmLabel?: string; tone?: "danger" | "normal" }) => Promise<boolean>;

// Quy đổi lượt chấm HỢP LỆ -> ngày công (dùng chung bảng tháng + nút Tải xuống từng tháng).
function buildSummaries(rows: Row[], shiftOf: (b: string) => Shift, codeByEmail: Record<string, string>): Summary[] {
  const byEmp = new Map<string, { name: string; bdh: string; days: Map<string, { in?: Row; out?: Row }> }>();
  for (const r of rows) {
    if (!r.is_valid) continue;
    let e = byEmp.get(r.user_email);
    if (!e) { e = { name: r.employee_name || r.user_email, bdh: r.bdh_name, days: new Map() }; byEmp.set(r.user_email, e); }
    const dk = vnDayKey(r.captured_at);
    const d = e.days.get(dk) || {}; d[r.kind] = r; e.days.set(dk, d);
  }
  const out: Summary[] = [];
  for (const [email, e] of byEmp) {
    const sh = shiftOf(e.bdh);
    const shIn = toMin(sh.in), shOut = toMin(sh.out);
    let totalDays = 0, late = 0, early = 0, ot = 0, sessions = 0;
    const details: Detail[] = [];
    for (const dk of [...e.days.keys()].sort()) {
      const d = e.days.get(dk)!;
      const hasIn = !!d.in, hasOut = !!d.out;
      sessions += (hasIn ? 1 : 0) + (hasOut ? 1 : 0);
      totalDays += hasIn && hasOut ? 1 : (hasIn || hasOut ? 0.5 : 0);
      const inMin = hasIn ? toMin(vnHHMM(d.in!.captured_at)) : null;
      const outMin = hasOut ? toMin(vnHHMM(d.out!.captured_at)) : null;
      const dLate = inMin !== null && inMin > shIn ? inMin - shIn : 0;
      const dEarly = outMin !== null && outMin < shOut ? shOut - outMin : 0;
      const dOt = outMin !== null && outMin > shOut ? (outMin - shOut) / 60 : 0;
      late += dLate; early += dEarly; ot += dOt;
      details.push({
        date: ddmmyyyy(dk), dayOfWeek: weekdayVN(dk),
        checkin: hasIn ? vnHHMM(d.in!.captured_at) : "", checkout: hasOut ? vnHHMM(d.out!.captured_at) : "",
        hours: inMin !== null && outMin !== null ? Math.round(((outMin - inMin) / 60) * 10) / 10 : 0,
        late: dLate, early: dEarly, status: hasIn && hasOut ? "Hợp lệ (GPS)" : "Thiếu buổi",
      });
    }
    out.push({ email, name: e.name, bdh: e.bdh, employeeCode: codeByEmail[email.toLowerCase()] || "",
      totalDays, totalLate: late, totalEarly: early, totalOvertime: Math.round(ot * 100) / 100, validSessions: sessions, details });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

function summariesToCsv(sums: Summary[]): string {
  const header = ["Họ và tên", "Ban điều hành", "Tổng công (ngày)", "Trễ (phút)", "Sớm (phút)", "Tăng ca (giờ)", "Số buổi hợp lệ"];
  const lines = sums.map(s => [s.name, s.bdh, s.totalDays, s.totalLate, s.totalEarly, s.totalOvertime, s.validSessions]);
  return "﻿" + [header, ...lines].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export default function GpsCheckinList({ smtpConfig, onNeedSmtp, confirm, notify }: { smtpConfig: SmtpConfig; onNeedSmtp: () => void; confirm: ConfirmFn; notify: (msg: string) => void }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // yyyy-mm đang xem
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [shiftMap, setShiftMap] = useState<Record<string, Shift>>({});
  const [codeByEmail, setCodeByEmail] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [bdhFilter, setBdhFilter] = useState("");
  const [photo, setPhoto] = useState<{ url: string; title: string } | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [view, setView] = useState<"summary" | "detail">("summary");
  const [mailStatus, setMailStatus] = useState<Record<string, EmailStatus>>({});
  const [mailError, setMailError] = useState<Record<string, string>>({});
  const [emailOverride, setEmailOverride] = useState<Record<string, string>>({}); // email sửa tay (nhiều, phân tách ',')
  const [sendingAll, setSendingAll] = useState(false);

  const monthLabel = useMemo(() => { const [y, m] = month.split("-"); return `${m}/${y}`; }, [month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ck, pl, dir] = await Promise.all([
        supabase.from("gps_checkins")
          .select("id, user_email, employee_name, bdh_name, kind, captured_at, distance_m, radius_m, is_valid, photo_path")
          .order("captured_at", { ascending: false }).limit(10000),
        supabase.from("project_locations").select("bdh_name, shift_in, shift_out"),
        supabase.from("employees_directory").select("email, employee_code"),
      ]);
      setAllRows((ck.data || []) as Row[]);
      const sm: Record<string, Shift> = {};
      (pl.data || []).forEach((p: any) => { sm[p.bdh_name] = { in: p.shift_in || "08:00", out: p.shift_out || "17:00" }; });
      setShiftMap(sm);
      const cbe: Record<string, string> = {};
      (dir.data || []).forEach((e: any) => {
        String(e.email || "").split(/[,;]/).forEach(tok => { const k = tok.trim().toLowerCase(); if (k && e.employee_code) cbe[k] = e.employee_code; });
      });
      setCodeByEmail(cbe); setMailStatus({});
    } catch { setAllRows([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => allRows.filter(r => vnMonthKey(r.captured_at) === month), [allRows, month]);
  const monthsTree = useMemo(() => {
    const agg = new Map<string, { emails: Set<string>; valid: number; total: number }>();
    for (const r of allRows) {
      const mk = vnMonthKey(r.captured_at);
      let e = agg.get(mk); if (!e) { e = { emails: new Set(), valid: 0, total: 0 }; agg.set(mk, e); }
      e.emails.add(r.user_email); e.total++; if (r.is_valid) e.valid++;
    }
    const byYear = new Map<string, { monthKey: string; monthNum: string; people: number; valid: number; total: number }[]>();
    [...agg.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).forEach(([mk, v]) => {
      const [y, mn] = mk.split("-");
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push({ monthKey: mk, monthNum: mn, people: v.emails.size, valid: v.valid, total: v.total });
    });
    return byYear;
  }, [allRows]);

  const shiftOf = useCallback((bdh: string): Shift => shiftMap[bdh] || { in: "08:00", out: "17:00" }, [shiftMap]);

  const groups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>();
    for (const r of rows) {
      const k = `${r.user_email}|${vnDayKey(r.captured_at)}`;
      let g = map.get(k);
      if (!g) { g = { key: k, name: r.employee_name || r.user_email, bdh: r.bdh_name, dateIso: r.captured_at }; map.set(k, g); }
      if (r.kind === "in" && (!g.in || (r.is_valid && !g.in.is_valid))) g.in = r;
      if (r.kind === "out" && (!g.out || (r.is_valid && !g.out.is_valid))) g.out = r;
    }
    const needle = q.trim().toLowerCase();
    return [...map.values()]
      .filter(g => !bdhFilter || g.bdh === bdhFilter)
      .filter(g => !needle || g.name.toLowerCase().includes(needle) || g.bdh.toLowerCase().includes(needle))
      .sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1));
  }, [rows, q, bdhFilter]);

  const summaries = useMemo<Summary[]>(() => {
    const needle = q.trim().toLowerCase();
    return buildSummaries(rows, shiftOf, codeByEmail)
      .filter(s => !bdhFilter || s.bdh === bdhFilter)
      .filter(s => !needle || s.name.toLowerCase().includes(needle) || s.bdh.toLowerCase().includes(needle));
  }, [rows, q, bdhFilter, shiftOf, codeByEmail]);

  const bdhOptions = useMemo(() => [...new Set(rows.map(r => r.bdh_name))].sort((a, b) => a.localeCompare(b, "vi")), [rows]);
  const stats = useMemo(() => {
    const src = bdhFilter ? rows.filter(r => r.bdh_name === bdhFilter) : rows;
    const people = new Set(src.map(r => r.user_email)).size;
    const valid = src.filter(r => r.is_valid).length;
    return { people, valid, invalid: src.length - valid };
  }, [rows, bdhFilter]);

  async function viewPhoto(path: string | null, title: string) {
    if (!path) return;
    setPhotoLoading(true); setPhoto({ url: "", title });
    const { data, error } = await supabase.storage.from("gps-checkins").createSignedUrl(path, 120);
    setPhotoLoading(false);
    if (error || !data?.signedUrl) { setPhoto(null); alert("Không mở được ảnh minh chứng."); return; }
    setPhoto({ url: data.signedUrl, title });
  }

  async function sendOne(s: Summary): Promise<boolean> {
    if (!smtpConfig.user || !smtpConfig.pass) { onNeedSmtp(); return false; }
    const recipientEmail = (emailOverride[s.email] ?? s.email).split(",").map(x => x.trim()).filter(Boolean).join(", ");
    if (!recipientEmail) { setMailStatus(p => ({ ...p, [s.email]: "error" })); setMailError(p => ({ ...p, [s.email]: "Chưa có email nhận" })); return false; }
    setMailStatus(p => ({ ...p, [s.email]: "sending" })); setMailError(p => ({ ...p, [s.email]: "" }));
    try {
      const res = await apiFetch("/api/send-attendance-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpConfig,
          recipient: { email: recipientEmail, name: s.name, employeeCode: s.employeeCode || "—" },
          summary: { totalDays: s.totalDays, totalLate: s.totalLate, totalEarly: s.totalEarly, totalOvertime: s.totalOvertime },
          details: s.details, month: monthLabel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMailStatus(p => ({ ...p, [s.email]: "success" })); return true;
    } catch (e: any) {
      const msg = e?.message || "Gửi thất bại";
      setMailStatus(p => ({ ...p, [s.email]: "error" })); setMailError(p => ({ ...p, [s.email]: msg })); return false;
    }
  }
  async function sendAll() {
    if (!smtpConfig.user || !smtpConfig.pass) { onNeedSmtp(); return; }
    const ready = summaries.filter(s => mailStatus[s.email] !== "success");
    if (ready.length === 0) return;
    setSendingAll(true); for (const s of ready) await sendOne(s); setSendingAll(false);
  }
  function exportCsv() { downloadCsv(`cham-cong-gps-${month}.csv`, summariesToCsv(summaries)); }
  function exportMonthCsv(monthKey: string) {
    const mr = allRows.filter(r => vnMonthKey(r.captured_at) === monthKey);
    const sums = buildSummaries(mr, shiftOf, codeByEmail);
    if (sums.length === 0) { notify("Tháng này chưa có lượt chấm hợp lệ để tải."); return; }
    downloadCsv(`cham-cong-gps-${monthKey}.csv`, summariesToCsv(sums));
  }
  async function deleteMonth(monthKey: string, label: string) {
    const mr = allRows.filter(r => vnMonthKey(r.captured_at) === monthKey);
    if (mr.length === 0) return;
    const ok = await confirm({ title: "Xoá dữ liệu chấm công GPS?",
      message: `Xoá TẤT CẢ ${mr.length} lượt chấm công GPS của Tháng ${label}? Hành động này không thể hoàn tác.`,
      confirmLabel: "Xoá", tone: "danger" });
    if (!ok) return;
    const ids = mr.map(r => r.id);
    const { error } = await supabase.from("gps_checkins").delete().in("id", ids);
    if (error) { notify("Không xoá được: " + error.message); return; }
    const paths = mr.map(r => r.photo_path).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from("gps-checkins").remove(paths);
    notify(`Đã xoá dữ liệu chấm công Tháng ${label}.`); load();
  }

  // … JSX: cây thư mục tháng (👁/⬇/🗑), thanh công cụ (toggle view, lọc BĐH, tìm,
  //   Gửi tất cả, Xuất CSV, Làm mới), 3 ô thống kê, bảng "Tổng hợp" (đồng bộ cột
  //   với bảng Văn phòng: Mã NV/Họ tên · Email (input sửa được) · Trạng thái gửi
  //   · Hành động 👁+✈), bảng "Chi tiết", và modal ảnh căn giữa. Xem đầy đủ ở repo.
}
```

> Phần JSX render dài (bảng + cây thư mục + modal). Toàn bộ logic quan trọng đã ở trên; bố cục JSX giữ trong file repo `app/cb/GpsCheckinList.tsx`.

**Điểm chính JSX cần tái tạo:**
- **Cây thư mục tháng:** `📁 Năm {year}` → `📁 Tháng {mn}` + "X nhân sự · Y/Z lượt hợp lệ" + 3 nút **👁 setMonth · ⬇ exportMonthCsv · 🗑 deleteMonth**.
- **Bảng Tổng hợp** (đồng bộ Văn phòng): cột `Mã NV/Họ tên` (tên + code) · `Ban điều hành` · `Tổng công/Trễ/Sớm/Tăng ca` · **`Email nhận báo cáo`** (`<input value={emailOverride[s.email] ?? s.email} onChange=...>` — sửa được, nhiều email cách nhau ',') · `Trạng thái gửi` (badge Chờ gửi/Đang gửi/Thành công/Lỗi gửi) · `Hành động` (👁 xem chi tiết + ✈ `sendOne`).
- **Modal ảnh:** `fixed inset-0 z-[100] flex items-center justify-center bg-black/70` — bấm nền hoặc ✕ để đóng.

---

## 7. Điểm tích hợp

**a) Render trong trang C&B** — `app/cb/page.tsx` (component có `const { notify, confirm } = useDialogs();`):
```tsx
import GpsCheckinList from "./GpsCheckinList";
// trong tab chấm công (chỉ HR/HCNS xem):
<GpsCheckinList smtpConfig={smtpConfig} onNeedSmtp={() => setShowEmailConfigModal(true)} confirm={confirm} notify={notify} />
```

**b) Menu** — `components/Sidebar.tsx` (hiện cho Admin hoặc nhân sự BĐH):
```tsx
import { useDepartments } from "@/lib/departments";
const deps = useDepartments();
const showGpsCheckin = !currentUser.loading && (currentUser.isAdmin || deps.bdh.includes(currentUser.department));
// trong navItems:
...(showGpsCheckin ? [{ label: "Chấm công GPS", href: "/cham-cong", icon: Fingerprint }] : []),
```

**c) Phân gói route** — `lib/planShared.ts`:
```ts
{ prefix: "/cham-cong", min: "basic" },
```

---

## 8. Hợp đồng API gửi email — `POST /api/send-attendance-email`

Nodemailer. `recipient.email` **nhận nhiều địa chỉ cách nhau bằng dấu phẩy** (nodemailer gửi tới tất cả).
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
Server dựng email HTML (KPI + bảng chi tiết) + **đính kèm Excel** cá nhân, trả `{ success }` hoặc `{ error }`. Transporter:
```ts
const portNum = Number(smtpConfig.port) || 465;
const isSecure = smtpConfig.secure === undefined ? (portNum === 465) : smtpConfig.secure;
nodemailer.createTransport({ host: smtpConfig.host || "smtp.gmail.com", port: portNum, secure: isSecure,
  auth: { user: smtpConfig.user, pass: smtpConfig.pass }, tls: { rejectUnauthorized: false } });
// … transporter.sendMail({ to: recipient.email, ... })  // to nhận chuỗi nhiều email cách nhau ','
```

---

## 9. Chống gian lận

| Rủi ro | Biện pháp |
|---|---|
| Fake GPS / định vị wifi-IP | Loại nếu `accuracy > 100m` (client + server). |
| Sửa code client "luôn hợp lệ" | Server tính lại khoảng cách + `is_valid` trong trigger; RLS chỉ cho insert của chính mình. |
| Sửa đồng hồ máy | Giờ chính thức = `now()` server (trigger ghi đè). |
| Chấm hộ | Gắn cứng `user_email` = tài khoản đăng nhập; 1 lần hợp lệ/buổi/ngày (unique index). |
| Ảnh cũ / chụp lại | Ép camera sống (`getUserMedia`), overlay giờ + toạ độ + dự án. |
| BĐH chưa ghim toạ độ | Trigger `is_valid=false`; trang check-in chặn. |

---

## 10. FIX LỖI GỬI EMAIL GMAIL ⭐

**Triệu chứng:** nút gửi báo lỗi, thông báo:
```
534-5.7.9 Application-specific password required     (hoặc 535-5.7.8 Username and Password not accepted)
```
**Nguyên nhân:** Gmail bật Xác minh 2 bước **bắt buộc dùng Mật khẩu ứng dụng (App Password) 16 ký tự**, không nhận mật khẩu Gmail thường. **Không phải lỗi code.**

**Cách fix:**
1. Bật **Xác minh 2 bước**: https://myaccount.google.com/security
2. Tạo **App Password**: https://myaccount.google.com/apppasswords → đặt tên → Google cho chuỗi `abcd efgh ijkl mnop`.
3. Dán vào ô mật khẩu SMTP, **xoá hết khoảng trắng** → `abcdefghijklmnop` → Lưu → Gửi lại.

**Gmail đúng:** host `smtp.gmail.com`, port `465`, secure `true`, user = email đầy đủ, pass = App Password.
**Nhà cung cấp khác:** Outlook/Office365 `smtp.office365.com:587` (secure false, STARTTLS) — nhiều nơi cũng cần App Password nếu bật 2FA.

---

## 11. Checklist triển khai (port)

- [ ] Có `project_locations` với `lat/lng`; chạy phần ALTER thêm `radius_m/shift_in/shift_out`.
- [ ] Chạy `066_gps_checkins.sql` (bảng + hàm + trigger + RLS + bucket 2MB). Sửa RLS cho khớp cơ chế quyền hệ đích.
- [ ] Tạo bucket `gps-checkins` (private, ≤2MB) nếu SQL không tạo được.
- [ ] Thêm trang `/cham-cong` + card `GpsCheckinList` (+ props confirm/notify).
- [ ] Đấu nối `useCurrentUser`, `fetchDepartments`, `apiFetch`, `useDialogs`, API email.
- [ ] Thêm menu + phân quyền route.
- [ ] Deploy **HTTPS** (bắt buộc GPS + camera).
- [ ] Ghim toạ độ BĐH; cấu hình SMTP bằng **App Password**.
- [ ] Test: check-in trong/ngoài bán kính, chống trùng, popup ảnh, thư mục tháng (xem/tải/xoá), lọc BĐH, sửa email + gửi nhiều địa chỉ.

---

*Tài liệu module Chấm công GPS — dự án EOP-ABC. Khớp với bản đã push trên nhánh master.*
