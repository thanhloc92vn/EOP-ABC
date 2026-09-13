# MODULE BIÊN BẢN HỌP AI — TÀI LIỆU ĐẤU NỐI

> Tài liệu mô tả đầy đủ module Biên bản họp (`/meeting-team`) để đấu nối sang hệ thống khác.
> Cập nhật: 13/09/2026 · Stack gốc: Next.js 16.3.4 (App Router) + React 19 + Supabase + OpenAI.

---

## 1. MODULE LÀM GÌ

Ghi âm cuộc họp 1–2 tiếng → gỡ băng có tách người nói → AI dựng thành biên bản
có cấu trúc → người kiểm tra sửa tay → xuất file Word theo mẫu công ty → tự tạo
Task cho từng đầu việc → dọn file ghi âm để tiết kiệm dung lượng.

**Bốn thiết kế cốt lõi, nếu port sang hệ khác thì đừng bỏ:**

1. **Cắt đoạn 20 phút khi ghi âm.** OpenAI chặn cứng 25MB mỗi lần gọi API gỡ băng
   cho MỌI model, không có endpoint nhận URL hay chạy bất đồng bộ để lách.
2. **Tách người nói (diarization) + mốc giờ thật.** Nếu không có hai thứ này, AI
   buộc phải bịa "ai nói gì" và "lúc mấy giờ" — đây là nguyên nhân chính khiến
   biên bản AI đọc thì trôi chảy nhưng gán sai trách nhiệm.
3. **Mốc trích dẫn trên từng đầu việc.** Bấm vào là tua đúng đoạn ghi âm. Biến
   "AI có thể viết sai" thành "sai thì kiểm chứng được trong vài giây".
4. **Không bao giờ điền giá trị phỏng đoán để lấp chỗ trống.** Thà để trống cho
   người dùng điền còn hơn đưa số liệu bịa vào văn bản chính thức.

---

## 2. LUỒNG XỬ LÝ

```
┌─ Đường vào A: GHI ÂM TRỰC TIẾP ────────────────────────────────┐
│  MediaRecorder (opus mono 32kbps)                              │
│    → tự cắt mỗi 20 phút thành file webm hoàn chỉnh             │
│    → upload từng đoạn lên Storage NGAY trong lúc họp           │
│    → biết giờ đồng hồ thật của từng đoạn                       │
└────────────────────────────────────────────────────────────────┘
┌─ Đường vào B: TẢI FILE CÓ SẴN ─────────────────────────────────┐
│  Kéo thả file ≤ 25MB → upload → đo thời lượng bằng <audio>     │
│  (không biết giờ đồng hồ → timeline chỉ là khoảng thời gian)   │
└────────────────────────────────────────────────────────────────┘
                            ↓
        Tạo biên bản nháp (status = draft) + lưu audio_paths/audio_segments
                            ↓
   Gỡ băng TUẦN TỰ từng đoạn — gpt-4o-transcribe-diarize
   → segments [{speaker, start, end, text}] + quy offset về trục chung
   → server NỐI THÊM vào transcript (không ghi đè) để chết giữa chừng không mất
                            ↓
   AI dựng biên bản — gpt-5.6-sol (mặc định)
   → JSON: metadata + transcript_clean + summary + action_items[] (kèm ts)
                            ↓
   Màn Review: sửa tay mọi trường · gán tên Speaker 1/2/3 · nghe lại theo mốc ts
                            ↓
   Khoá biên bản (confirmed) → xuất .docx theo template → tạo Task tự động
                            ↓
   Dọn file ghi âm (thủ công, hoặc nhắc ngay sau khi xuất Word)
```

---

## 3. DANH SÁCH FILE

### File tạo mới

| File | Vai trò |
|---|---|
| `migrations/069_meeting_recording_diarization.sql` | Toàn bộ thay đổi CSDL |
| `lib/meetingModels.ts` | Hằng số model, giới hạn, tham số ghi âm |
| `components/MeetingRecorder.tsx` | Ghi âm + tự cắt đoạn + upload trong lúc họp |
| `components/VoiceSampleManager.tsx` | Ghi/nghe/xoá mẫu giọng nhân sự |
| `components/DialogProvider.tsx` | Hộp thoại giữa màn hình thay `alert()`/`confirm()` |
| `app/api/meeting/delete-audio/route.ts` | Dọn file ghi âm có chốt chặn an toàn |

### File sửa

| File | Nội dung sửa |
|---|---|
| `app/api/meeting/transcribe/route.ts` | Chuyển sang model diarization, nối transcript, mốc giờ |
| `app/api/meeting/process/route.ts` | Model 5.6, quy tắc chống bịa, 3 chế độ timeline, citation `ts` |
| `app/meeting-team/page.tsx` | Toàn bộ UI mới; gộp pipeline 2 đường vào làm một |

### File không đổi

`app/api/meeting/export-docx/route.ts` — Docxtemplater vẫn dùng nguyên. Trường
`ts` thêm vào `action_items` bị bỏ qua, không ảnh hưởng template.

---

## 4. PHỤ THUỘC

### Thư viện npm

```
@supabase/supabase-js   ^2.107.0
openai                  ^6.32.0
docxtemplater           ^3.68.7    (chỉ cho xuất Word)
pizzip                  ^3.2.0     (chỉ cho xuất Word)
lucide-react            ^0.577.0   (icon)
next                    16.3.4
react / react-dom       19.2.3
```

### Biến môi trường

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
OPENAI_API_KEY          # tuỳ chọn — fallback khi người dùng không dán khoá riêng
OPENAI_MODEL            # tuỳ chọn — mặc định đã có trong code
```

### Helper dùng chung của hệ thống gốc (cần thay thế khi port)

| Helper | Làm gì | Thay bằng gì nếu hệ khác không có |
|---|---|---|
| `lib/apiAuth.ts` → `requireApiAuth(req)` | Xác thực người gọi API qua token Supabase trong header `x-supabase-auth`; trả `{email, userId, token}` | Cơ chế auth của hệ đích. **Không được bỏ** — route gỡ băng đốt tiền OpenAI |
| `lib/apiClient.ts` → `apiFetch()` | Tự gắn token phiên vào header khi gọi `/api/*` | `fetch` + tự gắn token |
| `lib/supabase.ts` | Client anon dùng chung | Client CSDL tương ứng |
| `lib/planShared.ts` → `isFeatureAllowed(plan, "meeting_ai")` | Cổng gói dịch vụ (module này ở mức `basic`) | Bỏ được nếu hệ đích không phân gói |
| `lib/tenantConfigServer.ts` | Lấy `company_name`, `chairman_name` để nhét vào prompt | Hằng số hoặc cấu hình của hệ đích |
| `lib/tenantConfig.ts` + `lib/resigned.ts` | Lọc nhân sự đã nghỉ khỏi danh sách chọn | Bỏ được |
| `components/Sidebar` / `Header` | Khung giao diện | Khung của hệ đích |

### Bảng CSDL dùng chung

| Bảng / View | Module dùng để làm gì |
|---|---|
| `employees_directory` (view) | Danh sách người dự, ánh xạ tên ↔ id, đọc `voice_sample_path` |
| `employees` (bảng gốc) | Ghi `voice_sample_path` (cần quyền quản lý nhân sự) |
| `tenant_config` | `plan`, `company_name`, `chairman_name` |
| `tasks` | Tự tạo Task khi khoá biên bản |

---

## 5. CƠ SỞ DỮ LIỆU

### Bảng `meetings` — đầy đủ

```sql
CREATE TABLE public.meetings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  title                TEXT NOT NULL,
  meeting_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time           TEXT,
  end_time             TEXT,
  location             TEXT,
  chairperson          TEXT,
  secretary            TEXT,
  attendees            TEXT[] DEFAULT '{}',
  project_name         TEXT,
  package_name         TEXT,
  audio_url            TEXT,
  transcript_raw       TEXT,
  transcript_clean     TEXT,
  summary              TEXT,
  action_items         JSONB DEFAULT '[]',
  document_url         TEXT,
  status               TEXT DEFAULT 'draft' CHECK (status IN ('draft','confirmed')),
  distribution         TEXT,

  -- ── Bổ sung bởi migration 069 ──
  audio_paths          TEXT[]      DEFAULT '{}',   -- đường dẫn MỌI đoạn ghi âm
  audio_segments       JSONB       DEFAULT '[]',   -- [{path, offsetSec, durationSec}]
  recording_started_at TIMESTAMPTZ,                -- giờ đồng hồ lúc bấm Ghi
  transcript_segments  JSONB       DEFAULT '[]',   -- [{speaker, start, end, text}]
  speaker_map          JSONB       DEFAULT '{}',   -- {"Speaker 1": "Nguyễn Văn A"}
  audio_deleted_at     TIMESTAMPTZ,
  audio_deleted_by     TEXT,
  ai_model             TEXT                        -- model đã dùng, để so chất lượng
);
```

**Vì sao cần cả `audio_paths` lẫn `audio_segments`:** `audio_paths` để xoá file;
`audio_segments` để biết giây thứ 4000 của cuộc họp nằm trong file nào — không có
nó thì nút tua theo mốc trích dẫn không hoạt động với cuộc họp nhiều đoạn.

### Bảng `employees`

```sql
ALTER TABLE public.employees ADD COLUMN voice_sample_path TEXT;
```

### Storage bucket `meetings`

```
public:           true   (xem mục 12 — còn nợ bảo mật)
file_size_limit:  524288000  (500MB)
allowed_mime_types:
  audio/mpeg, audio/mp3, audio/wav, audio/x-wav, audio/m4a, audio/x-m4a,
  audio/mp4, audio/webm, audio/ogg, video/webm,
  application/vnd.openxmlformats-officedocument.wordprocessingml.document,
  application/msword
```

Cấu trúc thư mục:

```
meetings/
├── recordings/<sessionId>/part_000.webm      ← ghi âm trực tiếp
├── recordings/<sessionId>/000_ten_file.mp3   ← tải file lên
├── voice_samples/<employeeId>.webm           ← mẫu giọng
└── documents/bien_ban_hop_<meetingId>.docx   ← file Word đã xuất
```

> **BẮT BUỘC:** phải có `audio/webm` trong `allowed_mime_types`. MediaRecorder
> trên Chrome/Edge xuất webm; thiếu mime này thì upload bị Storage chặn thẳng.

---

## 6. API ROUTES

Tất cả đều là Next.js Route Handler, `export const maxDuration = 300`
(nền tảng serverless cần trần ≥ 300s; Vercel Hobby chỉ cho 60s → phải nâng gói
hoặc chuyển sang chạy nền).

Header chung mọi request:

```
Content-Type:     application/json
x-supabase-auth:  <access token phiên đăng nhập>   ← danh tính
Authorization:    Bearer <OpenAI API key>          ← KHÔNG phải danh tính
x-openai-model:   gpt-5.6-sol | gpt-5.6-terra      ← chỉ route /process
```

### 6.1 `POST /api/meeting/transcribe`

Gỡ băng MỘT đoạn.

```jsonc
// Request
{
  "meetingId":       "uuid",
  "audioPath":       "recordings/1789.../part_000.webm",
  "offsetSec":       1200,          // vị trí đoạn này trên trục cả cuộc họp
  "knownSpeakerIds": ["emp-uuid"]   // ≤ 4 người có mẫu giọng
}

// Response 200
{
  "success": true,
  "text": "Nguyễn Văn A: ...\nSpeaker 2: ...",
  "segments": [{ "speaker": "...", "start": 1205.2, "end": 1211.8, "text": "..." }],
  "speakers": ["Nguyễn Văn A", "Speaker 2"],
  "known_speakers_used": ["Nguyễn Văn A"],
  "is_hallucination": false,
  "hallucination_warning": ""
}
```

Xử lý bên trong:

1. Gác gói dịch vụ → tải file từ Storage → chặn sớm nếu > 25MB
2. Nạp mẫu giọng của `knownSpeakerIds` từ `employees_directory`, đổi thành data URL
3. Gọi OpenAI (tham số chính xác ở mục 7)
4. Cộng `offsetSec` vào mọi `start`/`end` → quy về trục thời gian chung
5. Kiểm tra dấu hiệu lặp vòng — **chỉ cảnh báo, không bao giờ vứt nội dung**
6. **NỐI THÊM** vào `transcript_raw` / `transcript_segments`, không ghi đè

### 6.2 `POST /api/meeting/process`

Dựng biên bản từ transcript đã có trong CSDL.

```jsonc
// Request
{
  "meetingId":    "uuid",
  "transcriptRaw":"...",                    // chỉ dùng khi không có segments
  "roster":       ["Nguyễn Văn A", "..."]   // danh sách tên ĐƯỢC PHÉP dùng
}

// Response 200
{
  "success": true,
  "data": { /* toàn bộ JSON biên bản */ },
  "model": "gpt-5.6-sol",
  "used_real_timeline": true,
  "timeline_mode": "clock" | "relative" | "none"
}
```

JSON biên bản AI trả về:

```jsonc
{
  "title": "...", "meeting_date": "YYYY-MM-DD",
  "start_time": "HH:MM", "end_time": "HH:MM",
  "location": "...", "secretary": "...",
  "attendees": ["..."], "project_name": "...", "package_name": "...",
  "transcript_clean": "...",
  "summary": "PHẦN 1: ... PHẦN 2: ...",
  "action_items": [
    { "stt": "A", "content": "MỤC ĐÍCH CUỘC HỌP", "assignee": "", "coop": "",
      "deadline": "", "ts": null, "is_header": true },
    { "stt": 1, "content": "...", "assignee": "P. QLDA", "coop": "",
      "deadline": "Trước 20/09/2026", "ts": 1247, "is_header": false }
  ]
}
```

`action_items` dùng cấu trúc **tiêu đề mục A/B/C/D + dòng chi tiết** để khớp mẫu
Word của công ty. `ts` là số giây trên trục cả cuộc họp — dùng cho nút tua.

### 6.3 `POST /api/meeting/export-docx`

```jsonc
// Request:  { "meetingId": "uuid" }
// Response: { "success": true, "documentUrl": "https://.../....docx?v=1789..." }
```

Placeholder trong file `.docx` mẫu (Docxtemplater):

```
{doc_number} {location_date} {meeting_date_text} {meeting_title}
{meeting_location} {start_time} {end_time}
{chair_name} {chair_role} {sec_name} {sec_role} {attendees_text}
{meeting_summary} {distribution}
{#tasks} {stt} {content} {assignee} {coop} {deadline} {/tasks}
```

> URL trả về có gắn `?v=<timestamp>` vì Supabase CDN cache object public khoảng
> 1 giờ — không version thì xuất lại vẫn tải về file cũ.

### 6.4 `POST /api/meeting/delete-audio`

```jsonc
// Request:  { "meetingId": "uuid" }
// Response: { "success": true, "deleted_count": 6, "message": "..." }
```

**Hai chốt chặn ở server, không bỏ qua được từ giao diện:**

1. `status` phải là `confirmed` — bản nháp chưa chốt thì có thể còn phải nghe lại
2. `transcript_raw` phải còn nội dung — để không bao giờ mất cả audio lẫn bản gỡ băng

Xoá file khỏi Storage → `audio_url = ''`, ghi `audio_deleted_at` + `audio_deleted_by`.
Giữ nguyên `audio_paths` làm dấu vết đã xoá những gì.

---

## 7. MODEL AI — THAM SỐ ĐÃ KIỂM CHỨNG THỰC TẾ

### 7.1 Gỡ băng — `gpt-4o-transcribe-diarize`

```ts
await openai.audio.transcriptions.create({
  file:              fileStream,
  model:             "gpt-4o-transcribe-diarize",
  response_format:   "diarized_json",   // BẮT BUỘC để có speaker + start/end
  chunking_strategy: "auto",            // BẮT BUỘC với audio > 30 giây
  known_speaker_names:      ["Nguyễn Văn A"],          // tối đa 4
  known_speaker_references: ["data:audio/webm;base64,..."], // mỗi mẫu 2–10 giây
});
```

**Ràng buộc thật (đã va phải, không phải suy đoán):**

| Ràng buộc | Chi tiết |
|---|---|
| **KHÔNG được truyền `prompt`** | API trả `400 Prompt is not supported for diarization models`. Gợi ý từ vựng phải chuyển sang khâu dựng biên bản. |
| **25MB mỗi request** | Áp dụng cho MỌI model gỡ băng, kể cả mới nhất. Không có endpoint nhận URL hay chạy async. |
| `timestamp_granularities` | Chỉ `whisper-1` hỗ trợ. Bản diarize không cần vì `diarized_json` đã có `start`/`end`. |
| Mẫu giọng | Tối đa **4**, mỗi mẫu **2–10 giây**, truyền dạng **data URL**. |
| SDK types | Các tham số này mới hơn type của `openai@6.32.0` → phải ép `as any`, payload vẫn chuẩn. |

### 7.2 Dựng biên bản — `gpt-5.6-sol` (mặc định) / `gpt-5.6-terra`

```ts
await openai.chat.completions.create({
  model:            "gpt-5.6-sol",
  messages:         [{ role: "system", ... }, { role: "user", ... }],
  reasoning_effort: "high",                  // none|low|medium|high|xhigh|max
  response_format:  { type: "json_object" },
  // KHÔNG truyền temperature — dòng 5.6 là model suy luận
});
```

| Model | Tầng | Giá in/out (1M token) | Dùng cho |
|---|---|---|---|
| `gpt-5.6-sol` | flagship | $4 / $20 | **Mặc định** — họp 1–2 tiếng, nhiều số liệu |
| `gpt-5.6-terra` | mini | $2 / $12 | Họp nội bộ ngắn |
| `gpt-5.6-luna` | nano | $0.20 / $1.20 | **Không dùng cho biên bản họp** |

Cả ba đều có cửa sổ **1.05 triệu token**, output tối đa 128K. Transcript 2 tiếng
chỉ khoảng 40K token nên không cần map-reduce.

### 7.3 Chi phí thực tế

| Khoản | 1 tiếng họp | 2 tiếng họp |
|---|---|---|
| Gỡ băng (có diarization) | $0.6 – 2.0 | $1.2 – 4.0 |
| Dựng biên bản (`sol`) | $0.34 | ~$0.44 |
| **Tổng** | **≈ $1 – 2.5** | **≈ $1.6 – 4.5** |

Gỡ băng đắt gấp nhiều lần khâu phân tích — nên tiết kiệm bằng cách hạ model
phân tích là sai chỗ.

---

## 8. QUY TẮC CHỐNG BỊA TRONG PROMPT

Đây là phần quyết định độ chính xác, quan trọng hơn cả việc chọn model.

1. **Danh sách tên đóng.** Truyền `roster` (người dự đã xác nhận) vào prompt.
   AI chỉ được dùng tên trong danh sách. Không chắc thì ghi theo bộ phận
   ("Đại diện P. QLDA"), **cấm tự nghĩ ra tên nghe hợp lý**.
2. **Số liệu lấy nguyên văn.** Không làm tròn, không suy diễn.
3. **Thiếu thì để trống.** Cấm điền giá trị phỏng đoán để lấp chỗ.
   *(Bản gốc từng điền cứng `09:00`/`10:30` — đã bỏ hẳn.)*
4. **Ba chế độ timeline** — nói dối model ở đây là sinh ra đúng loại bịa cần dẹp:

   | Chế độ | Khi nào | Nói gì với AI |
   |---|---|---|
   | `clock` | Ghi trong app, có `recording_started_at` | `[09:14:05]` là giờ đồng hồ thật, dùng đúng các mốc này |
   | `relative` | Tải file lên | `[00:00:00]` là **phút thứ 0 của file**, KHÔNG phải 0 giờ. Timeline ghi "Phút 00:00 – 00:37". **Cấm suy ra giờ họp.** |
   | `none` | Transcript text thuần | Trình bày theo trình tự "1., 2., 3.", cấm bịa giờ |

   Kèm chốt chặn ở server: ở chế độ `relative`, nếu AI vẫn trả giờ họp dạng
   `00:01` thì regex `/^0?0:\d{2}$/` bắt được và xoá đi.
5. **Bắt buộc điền `ts`** cho mọi dòng không phải tiêu đề (trừ chế độ `none`).

---

## 9. COMPONENT GIAO DIỆN

### 9.1 `MeetingRecorder.tsx`

```tsx
<MeetingRecorder
  disabled={...}
  onFinish={({ startedAt, segments }) => { /* segments: RecordedSegment[] */ }}
/>
```

```ts
type RecordedSegment = {
  index: number; path: string;
  offsetSec: number; durationSec: number; sizeBytes: number;
  status: "uploading" | "done" | "error"; error?: string;
};
```

**Cơ chế cắt đoạn — điểm dễ làm sai nhất khi port:**

> KHÔNG dùng `timeslice` của MediaRecorder. Các mảnh nó cắt ra **không tự giải mã
> được** — chỉ mảnh đầu mang header container, gửi mảnh thứ hai lên API là lỗi
> file hỏng. Phải **dừng hẳn recorder rồi tạo recorder mới**, mỗi đoạn khi đó là
> một file webm hoàn chỉnh độc lập.

Thông số: opus mono `audioBitsPerSecond: 32000`, cắt mỗi **20 phút**.

| Bitrate | 1 phút | Chạm 25MB ở |
|---|---|---|
| 32 kbps | 240 KB | ~87 phút |
| 24 kbps | 180 KB | ~116 phút |

Đoạn 20 phút ≈ 4.8MB — cách xa trần kể cả khi nói liên tục.

Tính năng khác: tạm dừng/ghi tiếp (khoảng dừng **không** tính vào offset, nhờ đó
mốc giờ đoạn sau vẫn khớp file), vạch mức âm thanh (phát hiện micro câm ngay từ
phút đầu thay vì họp xong 2 tiếng mới biết), chặn đóng tab, trạng thái upload
từng đoạn.

> **Yêu cầu môi trường:** `getUserMedia` chỉ chạy trên **HTTPS hoặc localhost**.
> Mở qua IP LAN dạng `http://192.168.x.x:3000` sẽ bị trình duyệt chặn micro.

### 9.2 `VoiceSampleManager.tsx`

Ghi mẫu giọng 2–10 giây, tự dừng ở 10s, từ chối mẫu < 2s. Lưu
`voice_samples/<employeeId>.webm` + cập nhật `employees.voice_sample_path`.

### 9.3 `DialogProvider.tsx`

Thay toàn bộ `alert()`/`confirm()` của trình duyệt (~40 chỗ). API giữ nguyên
hình dạng cũ, chỉ thêm `await`:

```tsx
const dialog = useDialog();
await dialog.alert("...", { title: "Lỗi", tone: "danger" });
const ok = await dialog.confirm("...", { tone: "danger", confirmText: "Xoá" });
```

`tone`: `info` | `success` | `warning` | `danger`. Giữ nguyên xuống dòng của
thông báo nhiều đoạn — thứ `alert()` gốc không làm được.

> Trang phải tách làm 2 component: một hàm bọc `<DialogProvider>`, một hàm chứa
> nội dung gọi `useDialog()`. Component không dùng được context do chính nó tạo.

### 9.4 Trang `/meeting-team`

- **Hồ sơ biên bản họp:** danh sách, lọc nháp/đã xác nhận, tìm kiếm, xoá
- **Trung tâm Xử lý AI:** chọn chủ trì · chọn người dự (kèm dấu có mẫu giọng) ·
  chọn model · nhập API key · tab Ghi âm / Tải file · nhật ký tiến trình
- **Màn Review:** metadata sửa tay · gán tên người nói · bảng phân công (ô nhiều
  dòng, có nút mốc giờ tua lại) · transcript · tóm tắt · trình phát tự chọn đúng
  đoạn chứa mốc `ts`

---

## 10. NHỮNG BẪY ĐÃ VA PHẢI

Ghi lại để hệ đích không vấp lại:

| Bẫy | Hậu quả | Cách xử lý |
|---|---|---|
| Truyền `prompt` cho model diarization | `400 Prompt is not supported` — hỏng cả lần chạy | Bỏ hẳn `prompt` |
| Supabase UPDATE bị RLS chặn | Trả về **0 dòng mà KHÔNG báo lỗi** → client tưởng đã lưu | Luôn `.select("id")` rồi kiểm tra mảng rỗng |
| View dựng động (`employees_directory`) | Thêm cột vào bảng gốc làm `CREATE OR REPLACE VIEW` gãy ("cannot change name of view column") vì cột mới chen vào trước cột tính toán ở cuối | `DROP VIEW` rồi tạo lại, **và cấp lại GRANT** (drop làm mất hết quyền) |
| GRANT trên view | View **không chịu RLS**; Supabase cấp sẵn cho `anon`/PUBLIC → hở ra toàn Internet | `revoke all from public, anon` trước, `grant select to authenticated` sau |
| Ghi đè transcript mỗi đoạn | Tiến trình chết giữa chừng chỉ còn đoạn cuối | Server **nối thêm**; khi chạy lại thì dọn sạch trước để không nhân đôi |
| Vứt đoạn bị nghi lặp vòng | Mất 20 phút họp mà chỉ hiện một dòng log nhỏ | Chỉ cảnh báo, luôn giữ nội dung |
| Xoá biên bản nháp khi lỗi | Mất luôn phần đã gỡ băng, phải họp lại | Giữ nháp + có nút "Gỡ băng lại" và "Phân tích lại" |
| `onFinish` gọi trong hàm cập nhật state | React StrictMode gọi 2 lần ở dev → chạy pipeline 2 lần | Đọc danh sách từ `useRef`, không đọc trong updater |
| MediaRecorder `timeslice` | Mảnh thứ 2 trở đi không giải mã được | Dừng hẳn rồi tạo recorder mới |
| Thiếu `audio/webm` trong bucket | Upload bị Storage chặn | Thêm vào `allowed_mime_types` |
| `<input>` cho nội dung 2–4 câu | Chữ bị cắt cụt, không soát được biên bản | Dùng `<textarea>` |

---

## 11. CHECKLIST ĐẤU NỐI

1. **CSDL** — chạy `069_meeting_recording_diarization.sql` (hoặc dựng bảng
   `meetings` đầy đủ theo mục 5 nếu là hệ mới)
2. **Storage** — tạo bucket `meetings`, thêm đủ mime types, đặc biệt `audio/webm`
3. **Biến môi trường** — Supabase URL/key; OpenAI key
4. **Thay helper dùng chung** — auth, client CSDL, cấu hình công ty (mục 4)
5. **Trần thời gian chạy** — route gỡ băng cần ≥ 300s; nền tảng nào giới hạn 60s
   thì phải chuyển sang chạy nền + webhook
6. **HTTPS** — bắt buộc cho chức năng ghi âm
7. **Template Word** — đặt `.docx` vào `public/templates/`, đúng bộ placeholder
   ở mục 6.3
8. **Mẫu giọng** — ghi cho người chủ trì + 3 người phát biểu nhiều nhất
9. **Chạy thử** — họp thử **5–10 phút** trước, đừng thử thẳng cuộc họp 2 tiếng

---

## 12. HẠN CHẾ & CÒN NỢ

| Việc | Trạng thái |
|---|---|
| **Bucket `meetings` đang `public = true`** | Ai có link đều tải được file ghi âm họp mà không cần đăng nhập. **Cần chuyển sang private + signed URL**, khi đó phải sửa mọi chỗ dùng `getPublicUrl` (trang meeting-team, VoiceSampleManager, export-docx). Đã thống nhất hoãn sang đợt sau. |
| Tự động dọn ghi âm sau N ngày | Chưa làm — hiện chỉ có nút thủ công + nhắc sau khi xuất Word |
| Sửa người chủ trì ở màn Review | Chỉ hiển thị, chưa sửa được (các trường khác đều sửa được) |
| Map-reduce 2 lượt cho họp rất dài | Chưa cần vì cửa sổ 1.05M token; bổ sung nếu thấy sót chi tiết |
| Nhiều template Word | Đang hard-code `bien_ban_hop_template_1.docx` |
| API key OpenAI | Người dùng tự dán, lưu `localStorage` (quyết định có chủ đích, không phải bỏ sót) |
| Timeline cho file tải lên | Chỉ là khoảng thời gian, không phải giờ đồng hồ — ghi âm trực tiếp mới có giờ thật |

---

## 13. GHI CHÚ VỀ ĐỘ CHÍNH XÁC

Đo thực tế trên file 2 phút: **≈ 90% nội dung đúng**. Các yếu tố ảnh hưởng, xếp
theo mức tác động:

1. **Chất lượng thu âm** — quyết định nhiều nhất. Micro đặt gần người nói.
2. **Có mẫu giọng hay không** — có thì AI gọi thẳng tên thật, không thì ra nhãn
   `Speaker 1/2/3` phải gán tay.
3. **Danh sách người dự** — không truyền `roster` thì AI ghi theo bộ phận.
4. **Model** — `sol` so với `terra` chênh khoảng $0.15/cuộc họp.
5. **Ghi âm trực tiếp so với tải file** — chỉ đường ghi trực tiếp mới có giờ
   đồng hồ thật cho timeline.
