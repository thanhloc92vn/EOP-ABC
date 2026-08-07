# Kiến trúc Tổ chức & Phân quyền (portable spec)

> Trích xuất từ hệ thống **PM - HCNS - TNEC** (Next.js App Router + Supabase).
> Mục đích: bê nguyên mô hình này sang dự án khác. AI đọc file này là đủ để
> dựng lại, không cần đọc code gốc.

---

## 0. Nguyên tắc nền — đọc trước khi làm bất cứ gì

Bốn nguyên tắc dưới đây là lý do hệ thống này bán được cho nhiều khách hàng.
Vi phạm một cái là mất tính tái sử dụng.

1. **Không hardcode danh tính.** Không được viết tên người / email / chức danh
   cụ thể vào code để quyết định quyền. Quyền = một **dòng dữ liệu** trong bảng.
   Lý do: khi bàn giao công việc, quyền chuyển theo người kế nhiệm chỉ bằng sửa
   bảng — không phải sửa code, deploy lại.
2. **DEFAULTS trong code = đúng hiện trạng đang chạy.** Mọi loader cấu hình phải
   có hằng số fallback khớp 100% dữ liệu thật. DB lỗi / RLS chặn / chưa đăng
   nhập → hệ thống chạy y như cũ, không trắng màn hình.
3. **RLS là hàng rào thật, UI chỉ là tiện nghi.** Cờ quyền ẩn menu — nhưng nếu
   không có RLS thì người dùng vẫn gọi thẳng PostgREST đọc sạch bảng. Mỗi cờ
   "được xem X" phải có policy tương ứng ở DB.
4. **View KHÔNG có RLS.** Supabase cấp sẵn quyền cho `anon`/`PUBLIC` trên object
   mới trong schema `public`. Tạo view xong phải `revoke ... from anon, public`
   TRƯỚC khi `grant select to authenticated` — nếu quên, view mở cho toàn
   Internet qua anon key vốn nằm công khai trong bundle JS.

---

## 1. Bản đồ dữ liệu

```
tenant_config      key/value cấu hình công ty + gói dịch vụ
departments        phòng ban / ban điều hành / ban giám đốc
employees          hồ sơ nhân sự (nguồn: tên, phòng ban, chức danh, email)
  └ employees_directory   VIEW — employees trừ cột PII (ai đăng nhập cũng đọc)
allowed_users      whitelist đăng nhập + cột role='Admin'
approval_permissions   1 dòng / người — ~15 cờ boolean + supervises_name
approval_groups    tổ có luồng duyệt cấp 1 riêng (tổ trưởng ≠ trưởng phòng)
leave_exceptions   đặc cách: X được duyệt đơn nghỉ 1 ngày của Y
tasks              dùng chung cho Kanban công việc + đơn nghỉ phép/công tác
```

Khoá nối giữa các bảng là **text**, không phải FK:
- `employees.name` ↔ `approval_groups.leader_name` / `member_names[]` / `tasks.assignee`
- `employees.email` ↔ `approval_permissions.email` ↔ `allowed_users.email` ↔ JWT email

> Khớp email theo kiểu **chứa, không phân biệt hoa thường**
> (`position(lower(jwt_email) in lower(p.email)) > 0`), vì một người có thể có
> nhiều email lưu cách nhau dấu phẩy. Khớp tên theo kiểu **bỏ dấu + chứa**.
> Đây là điểm yếu đã biết, đổi cho chặt hơn sẽ vỡ dữ liệu cũ — giữ nguyên.

---

## 2. Cấu hình công ty (`tenant_config`)

Bảng `key text primary key, value jsonb, description text, updated_at`.

Các khoá đang dùng:

| key | ý nghĩa |
|---|---|
| `company_name`, `company_short` | tên công ty đầy đủ / viết tắt |
| `system_title`, `system_subtitle` | tiêu đề + phụ đề sidebar, tab trình duyệt |
| `logo_text` | 2 chữ trong ô logo vuông |
| `contract_no_suffix` | hậu tố số hợp đồng `006335/2026/HĐTV/<suffix>` |
| `email_sender_name` | tên người gửi email hệ thống |
| `chairman_name` | người chủ trì họp mặc định (prompt AI biên bản) |
| `site_url`, `hcns_head_name` | link hệ thống, trưởng phòng HCNS |
| `admin_staff` | mảng nhân sự hành chính `{name, full_name, role, duties}` |
| `saturday_exempt_names` | miễn làm thứ 7 nhưng vẫn tính đủ công |
| `plan` | `basic` \| `professional` \| `enterprise` |

**RLS:**
- `authenticated` đọc tất cả.
- `anon` chỉ đọc 5 khoá brand (`company_name, company_short, system_title,
  system_subtitle, logo_text`) — để màn hình đăng nhập hiện đúng tên công ty.
- Chỉ `allowed_users.role='Admin'` được ghi.

**Loader client** (`lib/tenantConfig.ts`): cache module-level, hook
`useTenantConfig()` render ngay bằng `TENANT_DEFAULTS` rồi tự cập nhật.
Điểm tinh tế: **chỉ cache khi đọc được khoá `plan`** — vì phiên chưa đăng nhập
chỉ lấy được các khoá brand, cache lúc đó sẽ khoá luôn config thiếu.

**Loader server** (`lib/tenantConfigServer.ts`): dùng anon key, cache TTL 5 phút.

---

## 3. Phòng ban & Ban điều hành (`departments`)

```sql
create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('phong_ban','bdh','ban_giam_doc')),
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
```

Ba loại — đây là mô hình tổ chức cốt lõi, giữ nguyên khi port:

- **`phong_ban`** — khối văn phòng công ty. Hiện có 10 mục, `sort_order` 5–90:
  Ban Lãnh Đạo (5), Hành Chính Nhân Sự (10), Tài Chính Kế Toán (20),
  Vật Tư Thiết Bị (30), Thị Trường (40), Kế Hoạch Đấu Thầu (50), Kỹ Thuật (60),
  An Toàn Lao Động (70), Quản Lý Dự Án (80), Thư Ký & Trợ Lý (90).
- **`bdh`** — Ban điều hành **theo dự án/công trường**, `sort_order` 110+.
  Đây là chiều tổ chức thứ hai: nhân sự thuộc một BĐH thay vì một phòng.
  Trưởng đơn vị của BĐH là **Chỉ huy trưởng**, không phải "Trưởng phòng".
- **`ban_giam_doc`** — Giám đốc / Phó Giám đốc, `sort_order` 230+. Không dùng
  cho hồ sơ nhân sự; chỉ là **mục quy trách nhiệm chi phí** ở trang Hành chính.

**Quy tắc gộp:** dropdown chọn phòng ban của nhân sự = `phong_ban + bdh`
(`lists.all`). Mục quản lý chi phí dùng cả ba.

**RLS:** `authenticated` đọc tất cả; `anon` đọc `active = true` (form Góp ý công
khai và các API route server-side không có session cần danh sách này); chỉ Admin
ghi.

**Loader:** `lib/departments.ts` (client, hook `useDepartments()`) và
`lib/departmentsServer.ts` (server, cache 5 phút). Cả hai fallback theo **từng
nhóm**: nếu `phong_ban` trả về rỗng (VD RLS chặn một phần) thì chỉ nhóm đó dùng
default, không phải cả bộ.

Cách dùng trong component — giữ tên biến cũ để không phải sửa chỗ gọi:
```ts
const { phongBan: DEPARTMENTS, bdh: BDH_OPTIONS } = useDepartments();
```

---

## 4. Danh sách nhân viên (`employees`)

Cột: `id, employee_code, name, department, position, role, gender, start,
date_of_birth, phone, cccd, cccd_date, cccd_place, permanent_address,
temporary_address, degree, status, email, emergency_contact_{name,
relationship, phone}, avatar, notes`.

`status` là cờ vòng đời: `Thử việc` / `Chính thức` / `Nghỉ việc` /
`Kiêm nhiệm`. Chuỗi `"Nghỉ việc"` (có dấu hoặc không) **khoá đăng nhập** ở
`AuthWrapper`.

### Tách PII — bắt buộc

RLS là theo **dòng**, không theo **cột**. Nhưng cả hệ thống cần tra cứu
tên/phòng ban/người duyệt của mọi người, trong khi CCCD & địa chỉ nhà thì không
ai được đọc đại trà. Giải pháp:

- **View `employees_directory`** = mọi cột **TRỪ** `cccd, cccd_date, cccd_place,
  permanent_address, temporary_address, emergency_contact_*, notes`.
  Dựng cột động từ `information_schema.columns` để cột mới tự vào view.
  View cố ý là SECURITY DEFINER (mặc định) — phải đọc xuyên RLS của bảng gốc,
  an toàn vì bản thân view đã lọc cột. Supabase linter sẽ cảnh báo; đó là chủ ý.
  `revoke all from public, anon` → `grant select to authenticated`.
- **Bảng gốc `employees`**: SELECT chỉ cho Admin / `can_view_employees` /
  `can_manage_employees` / `can_view_salary` / **chính mình** (khớp email).

⚠️ `date_of_birth` và `phone` được coi là **dùng chung** (tính năng tra sinh
nhật), nằm trong view. Giữ đúng ranh giới này, đừng tự vẽ lại.

Mọi truy vấn tra cứu trong app phải trỏ vào `employees_directory`, không phải
`employees`. (`AuthWrapper`, `Sidebar`, dropdown chọn người duyệt, gán việc…)

---

## 5. Phân quyền — 4 tầng, đừng nhầm lẫn

### Tầng 1 — Được vào hệ thống? (`AuthWrapper`)

Đăng nhập Google OAuth → kiểm tra tuần tự:
1. `allowed_users` khớp email, `role='Admin'` → vào, `isAdmin = true`.
2. Không phải Admin → tra `employees_directory` theo email.
   - `status` chứa "nghỉ việc" → **chặn**, báo liên hệ HCNS.
   - Có hồ sơ, đang làm → vào.
3. Không có ở cả hai → màn hình "Từ chối truy cập".

> Lưu ý đặt tên gây hiểu nhầm trong code gốc: biến `isAdmin` ở `AuthWrapper`
> thực chất nghĩa là "được vào hệ thống", nhân viên thường cũng `true`.
> Quyền Admin thật = `allowed_users.role === 'Admin'`, các trang tự tra lại.

### Tầng 2 — Gói dịch vụ (`plan`) — chặn theo MODULE

Bảng phân gói trung tâm ở `lib/planShared.ts` (logic thuần, dùng chung
client+server):

```ts
PLAN_RANK = { basic: 1, professional: 2, enterprise: 3 }
ROUTE_MIN_PLAN = [
  { prefix: "/tasks",           min: "professional" },
  { prefix: "/calendar",        min: "professional" },
  { prefix: "/dang-ky",         min: "professional" },
  { prefix: "/recruitment",     min: "professional" },
  { prefix: "/administration",  min: "professional" },
  { prefix: "/document-control",min: "professional" },
  { prefix: "/meeting-team",    min: "enterprise"   },
  // route không liệt kê = basic (luôn mở)
]
FEATURE_MIN_PLAN = { ai_search: "enterprise", meeting_ai: "enterprise" }
```

- Khớp theo **prefix dài nhất**.
- `normalizePlan()` fallback về `enterprise` khi config lỗi — **không bao giờ
  khoá nhầm khách hàng** vì lỗi kỹ thuật.
- Sidebar `.filter(isPathAllowed)` để ẩn menu; `AuthWrapper` chặn cả truy cập
  thẳng URL bằng màn hình "Tính năng thuộc gói X".

### Tầng 3 — Cờ quyền cá nhân (`approval_permissions`) — chặn theo CHỨC NĂNG

Một dòng / người, khoá là `email`. Toàn bộ cột `boolean not null default false`:

**Nhóm duyệt yêu cầu**
| cờ | ý nghĩa |
|---|---|
| `can_approve_trip` | duyệt cuối đơn công tác (cấp 2 — HCNS) |
| `can_approve_leave` | duyệt cuối đơn nghỉ phép (cấp 2 — HCNS) |
| `can_approve_justification` | duyệt giải trình chấm công |
| `can_approve_booking` | duyệt đăng ký xe / phòng họp |
| `can_approve_benefit` | duyệt chi phúc lợi (hiếu hỷ, thưởng lễ) |

**Nhóm truy cập dữ liệu**
| cờ | ý nghĩa |
|---|---|
| `can_manage_employees` | sửa / xoá / khoá hồ sơ nhân sự |
| `can_view_employees` | xem FULL danh sách; không có → chỉ thấy chính mình |
| `can_view_salary` | lương & HĐLĐ (C&B + tìm kiếm AI) — nhạy cảm nhất |
| `can_view_invoices` | xem mọi hồ sơ thanh toán; không có → chỉ phiếu tự tạo |
| `can_view_documents` | Văn thư |
| `can_view_candidates` | Tuyển dụng |
| `can_view_attendance_imports` | kho bảng công máy chấm công |
| `can_view_all_tasks` | thấy mọi thẻ Kanban thay vì chỉ việc của mình |
| `can_manage_vpp` | thấy mọi phiếu VPP của tất cả phòng ban |
| `can_view_suggestions` | xem/xử lý Góp ý & Kiến nghị |

**Cột đặc biệt** `supervises_name text` — quan hệ giám sát 1-1: chủ dòng này
thấy thêm task của người có tên đó (khớp `tasks.assignee` dạng text).

`hasAnyApprovalPermission()` chỉ tính 4 cờ approve đầu — quyết định hiện mục
"Duyệt yêu cầu" trên sidebar. `can_view_suggestions` cố ý **không** nằm trong đó.

**RLS:** mọi `authenticated` được SELECT (toàn hệ thống dựa vào đây để gate UI,
siết SELECT là vỡ); INSERT/UPDATE/DELETE chỉ Admin.

**Loader** `fetchApprovalPermissions(email)`: dùng `select("*")` (không liệt kê
cột) để không vỡ khi tenant chưa chạy migration thêm cờ mới; không tìm thấy dòng
→ trả `NO_APPROVAL_PERMISSIONS` (mọi cờ false).

**UI quản lý**: modal `UserPermissionsModal` trong Cài đặt hệ thống, 3 tab —
*Cờ quyền người dùng* / *Nhóm duyệt riêng* / *Đặc cách nghỉ 1 ngày*. Sau khi sửa
gọi `invalidateApproverCaches()` để không phải F5.

### Tầng 4 — RLS ở database

Cờ UI phải có policy tương ứng. Ví dụ mẫu (dùng lại y nguyên):

```sql
create or replace function public.is_admin_caller()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email',''))
      and au.role = 'Admin'
  );
$$;
```

Kiểm tra cờ trong policy:
```sql
exists (
  select 1 from public.approval_permissions p
  where position(lower(coalesce(auth.jwt() ->> 'email','')) in lower(p.email)) > 0
    and p.can_manage_employees = true
)
```

---

## 6. Luồng phê duyệt — 4 cơ chế song song

Đơn nghỉ phép / công tác nằm chung bảng `tasks`, phân biệt bằng cột phụ
`approval_stage` (`pending_manager` → `pending_hcns`), **không** đụng cột
`status` để không ảnh hưởng Kanban thường.

**Cấp 1** (`isLeaveTripCap1Approver`) — xét theo đúng thứ tự này:
1. Admin → luôn duyệt được.
2. Người gửi thuộc **`approval_groups`** → chỉ **tổ trưởng của chính nhóm đó**
   duyệt, KHÔNG phải trưởng phòng ban. (VD: Tổ Marketing trực thuộc HCNS.)
3. Đơn nghỉ **1 ngày** và có dòng trong **`leave_exceptions`** khớp
   (approver, assignee) → duyệt được. Khớp tên bỏ dấu + chứa.
4. Người gửi chỉ định tường minh trong ghi chú: `"Người duyệt: <tên>"`.
5. `isManagerRole(role)` → bất kỳ Trưởng/Phó phòng nào (cố ý **không** giới hạn
   cùng phòng ban — giữ đúng hành vi hiện có).

**Cấp 2** (`isLeaveTripCap2Approver`) — Admin, hoặc `can_approve_trip` /
`can_approve_leave` tuỳ loại đơn.

### `isManagerRole()` — điểm rất dễ sót khi port

Nhận diện "trưởng đơn vị" từ chuỗi chức danh. Phải bao gồm cả các chức danh
**không mang chữ "trưởng phòng"**, nếu thiếu thì Kế toán trưởng và Chỉ huy
trưởng các BĐH không nhận được thông báo duyệt cấp 1:

```
trưởng phòng | phó phòng | phó trưởng phòng | quyền trưởng phòng
giám đốc | quản lý | tổ trưởng | leader
kế toán trưởng | trưởng bộ phận | chỉ huy trưởng | chỉ huy phó
tp. | tp <space> | tp
```
Mỗi biến thể phải có **cả bản có dấu và không dấu**.

Thứ tự người duyệt cấp 1 mặc định của một đơn vị:
**Trưởng phòng → Phó phòng → để trống** (không tự nhảy lên cấp cao hơn).

### `approval_groups`
```sql
name text unique, leader_name text, member_names text[], active boolean
```
Thêm/bớt thành viên, đổi tổ trưởng = sửa bảng, không sửa code.

### `leave_exceptions`
```sql
approver_name text, assignee_name text, active boolean
```
Mỗi dòng = "approver được duyệt cấp 1 đơn nghỉ **1 ngày** của assignee".
Lưu tên ngắn ("Quỳnh") là khớp được cả tên đầy đủ lẫn biến thể không dấu.

> Khác biệt quan trọng giữa hai bảng: `approval_groups` rỗng → dùng
> `FALLBACK_GROUPS`. `leave_exceptions` **tồn tại nhưng rỗng** → tôn trọng là
> "chủ động tắt hết ngoại lệ", không fallback.

---

## 7. Xác thực API route (server-side)

Mọi route `/api/*` bắt buộc gọi `requireApiAuth(req)`. Chuẩn header:

- `x-supabase-auth` → access token Supabase = **danh tính**
- `Authorization` → khoá OpenAI của người dùng (**không** phải danh tính)

Danh tính **luôn** lấy từ token đã xác minh server-side. Không bao giờ tin
`currentUser` / `email` do client gửi trong body.

```ts
const auth = await requireApiAuth(req);
if (!auth.ok) return auth.response;
const db = supabaseForCaller(auth.caller); // client chạy đúng RLS của người này
```

Client gọi qua `lib/apiClient.ts` (`apiFetch`) để tự gắn header.

Rủi ro nếu bỏ qua: (1) gửi email **từ địa chỉ chính thức công ty** tới người
nhận tuỳ ý; (2) đốt `OPENAI_API_KEY` của công ty không giới hạn.

---

## 8. Mẫu code chuẩn cho loader cấu hình

Copy nguyên khuôn này cho mọi bảng cấu hình mới:

```ts
"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

export const X_DEFAULTS: X = { /* = đúng dữ liệu thật đang chạy */ };

let cached: X | null = null;
let inflight: Promise<X> | null = null;

export async function fetchX(): Promise<X> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.from("x").select("...");
      if (error || !data || data.length === 0) return X_DEFAULTS; // KHÔNG cache
      cached = /* merge với DEFAULTS */;
      return cached;
    } catch { return X_DEFAULTS; }
    finally { inflight = null; }
  })();
  return inflight;
}

export function useX(): X {
  const [v, setV] = useState<X>(cached || X_DEFAULTS);
  useEffect(() => { let m = true; fetchX().then(r => m && setV(r)); return () => { m = false; }; }, []);
  return v;
}
```

Ba tính chất bắt buộc: `inflight` chống query trùng, **chỉ cache khi dữ liệu
đủ**, hook render ngay bằng DEFAULTS.

---

## 9. Khuôn migration SQL

Hai kiểu, dùng đúng kiểu tuỳ nguồn sự thật:

**Kiểu A — repo là nguồn sự thật** (bảng do migration tạo ra): xoá **TOÀN BỘ**
policy cũ bằng vòng lặp động rồi tạo lại whitelist. Đừng đoán tên policy cũ.
```sql
do $$ declare pol record; begin
  for pol in select policyname from pg_policies
             where schemaname='public' and tablename='<t>'
  loop execute format('drop policy if exists %I on public.<t>', pol.policyname); end loop;
end $$;
```

**Kiểu B — production đã cấu hình tay, repo không biết nội dung** (VD
`employees`, `tasks`, `allowed_users`): chỉ bật RLS nếu đang tắt, chỉ tạo policy
nếu bảng **chưa có policy nào**, tuyệt đối không xoá/sửa policy sẵn có.
⇒ Chạy trên production cũ = no-op. Chạy trên project mới = có bảo vệ tối thiểu.

Mọi file phải: idempotent (`if not exists`, `on conflict do nothing`), có comment
tiếng Việt giải thích **tại sao**, và kết bằng một câu `select` kiểm tra kết quả.

Đánh số tuần tự `NNN_ten_ngan.sql`, chạy tay trong Supabase SQL Editor.

---

## 10. Checklist dựng lại ở dự án mới

- [ ] Tạo `tenant_config` + seed khoá brand/plan; RLS: auth đọc, anon đọc 5 khoá
      brand, Admin ghi.
- [ ] Tạo `departments` + seed 3 `type`; RLS: auth đọc, anon đọc `active`,
      Admin ghi.
- [ ] Tạo `allowed_users(email, role)` với ít nhất 1 dòng `role='Admin'`.
- [ ] Tạo `employees` đủ cột; bật RLS.
- [ ] Tạo view `employees_directory` — **revoke anon/public trước, grant sau**.
- [ ] Siết SELECT bảng `employees` về Admin / 3 cờ / chính mình.
- [ ] Tạo `approval_permissions` đủ cờ; RLS: auth SELECT, Admin ghi.
- [ ] Tạo `approval_groups`, `leave_exceptions`.
- [ ] Hàm `is_admin_caller()` (+ `can_view_employee_pii()` nếu tách PII).
- [ ] Port `lib/`: `tenantConfig(+Server)`, `departments(+Server)`, `approvers`,
      `planShared`, `plan`, `apiAuth`, `apiClient`.
- [ ] Port `AuthWrapper` (5 trạng thái: loading → chưa login → đang kiểm tra →
      từ chối → chặn theo gói → render).
- [ ] Port `Sidebar` (lọc menu theo gói + cờ approver).
- [ ] Port `UserPermissionsModal` (3 tab quản lý quyền).
- [ ] Mọi route `/api/*` gọi `requireApiAuth`.
- [ ] **Kiểm chứng bằng anon key**: gọi REST tới `employees`, `tasks`,
      `employees_directory`, `approval_permissions` — phải trả 0 dòng hoặc lỗi.
      RLS chặn anon trả **mảng rỗng, không báo lỗi** → dễ tưởng nhầm là đã chạy.

---

## 11. Nợ kỹ thuật đã biết (đừng lặp lại khi port)

- Còn bản dự phòng hardcode tên trong `lib/approvers.ts`
  (`FALLBACK_GROUPS`, `FALLBACK_LEAVE_EXCEPTIONS`, `TENANT_DEFAULTS.admin_staff`,
  `saturday_exempt_names`). Ở dự án mới nên để rỗng và bắt buộc seed DB.
- `app/administration/page.tsx` còn danh sách CP-01..CP-22 hardcode kèm tên
  người nhận giả — nên sinh từ `departments`.
- `app/phong-ban/page.tsx` có `DEPT_CONFIG` 9 phòng hardcode riêng (icon/màu),
  **không** đọc bảng `departments`. Đây là màn hình trình bày cũ, port thì nên
  chuyển sang đọc bảng và map icon theo `name`.
- Tính năng "Bàn giao & Khoá tài khoản" chỉ chuyển **cờ quyền theo email**;
  KHÔNG chuyển vai trò theo tên (tổ trưởng, đặc cách, task đang gán). Người kế
  nhiệm phải được sửa tay ở `approval_groups` / `leave_exceptions`.
- `Sidebar` vẫn còn check chuỗi chức danh song song với cờ quyền — dư thừa nhưng
  vô hại; ở dự án mới chỉ nên dùng cờ.
