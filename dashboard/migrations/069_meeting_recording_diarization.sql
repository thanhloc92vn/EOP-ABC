-- ============================================================
-- 069_meeting_recording_diarization.sql — Nâng cấp module Biên bản họp
--
-- Phục vụ 4 thay đổi lớn của module Biên bản họp:
--
--   (1) GHI ÂM TRỰC TIẾP TRONG APP — trình duyệt ghi bằng MediaRecorder, cắt
--       đoạn 20 phút, upload từng đoạn ngay trong lúc họp. Cần lưu DANH SÁCH
--       đường dẫn các đoạn (`audio_paths`) chứ không chỉ 1 URL như trước, và
--       cần giờ bắt đầu ghi (`recording_started_at`) để dựng timeline giờ thật.
--
--   (2) TÁCH NGƯỜI NÓI (diarization) — model gpt-4o-transcribe-diarize trả về
--       từng đoạn kèm speaker + start/end. Lưu nguyên vào `transcript_segments`
--       để về sau tua lại đúng chỗ, và lưu bảng ánh xạ "Speaker 1 -> tên thật"
--       do thư ký gán vào `speaker_map`.
--
--   (3) XOÁ FILE GHI ÂM CHỦ ĐỘNG — sau khi xuất biên bản Word, người dùng bấm
--       dọn file ghi âm cho đỡ tốn dung lượng. `audio_deleted_at` /
--       `audio_deleted_by` để biết ai đã dọn, lúc nào; transcript giữ nguyên
--       vĩnh viễn nên vẫn phân tích lại được mà không cần gỡ băng lần nữa.
--
--   (4) GHI NHẬN MODEL ĐÃ DÙNG — `ai_model` để biết biên bản này do model nào
--       dựng, phục vụ so sánh chất lượng giữa gpt-5.6-sol và gpt-5.6-terra.
--
-- Cộng thêm: `employees.voice_sample_path` lưu mẫu giọng 2-10 giây, nạp vào
-- tham số known_speaker_references của API để AI gọi thẳng tên thật thay vì
-- "Speaker 1". OpenAI cho tối đa 4 mẫu giọng mỗi lần gỡ băng.
--
-- CÁCH CHẠY: Supabase SQL Editor > dán > Run. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Bảng `meetings`: các cột mới ───

alter table public.meetings
  add column if not exists audio_paths text[] default '{}'::text[];

alter table public.meetings
  add column if not exists audio_segments jsonb default '[]'::jsonb;

alter table public.meetings
  add column if not exists recording_started_at timestamptz;

alter table public.meetings
  add column if not exists transcript_segments jsonb default '[]'::jsonb;

alter table public.meetings
  add column if not exists speaker_map jsonb default '{}'::jsonb;

alter table public.meetings
  add column if not exists audio_deleted_at timestamptz;

alter table public.meetings
  add column if not exists audio_deleted_by text;

alter table public.meetings
  add column if not exists ai_model text;

comment on column public.meetings.audio_paths is
  'Đường dẫn trong bucket `meetings` của TẤT CẢ đoạn ghi âm (mỗi đoạn ~20 phút). Trước đây chỉ có audio_url của đoạn đầu nên các đoạn sau không có đường xoá.';
comment on column public.meetings.audio_segments is
  'Bản đồ đoạn ghi âm: [{path, offsetSec, durationSec}]. Cần để bấm vào mốc trích dẫn của một đầu việc là mở đúng ĐOẠN chứa mốc đó rồi tua tới giây tương ứng — audio_paths thuần không biết đoạn nào chứa giây thứ mấy.';
comment on column public.meetings.recording_started_at is
  'Giờ đồng hồ lúc bấm Bắt đầu ghi. Cộng với offset của từng đoạn + mốc start/end do diarization trả về = timeline giờ thật trong biên bản.';
comment on column public.meetings.transcript_segments is
  'Mảng đoạn hội thoại đã tách người nói: [{speaker, start, end, text, abs_time}]. Dùng để tua lại đúng chỗ khi kiểm chứng một đầu việc.';
comment on column public.meetings.speaker_map is
  'Ánh xạ nhãn máy sang tên thật do thư ký gán: {"Speaker 1": "Huỳnh Giáp Nhân"}.';
comment on column public.meetings.audio_deleted_at is
  'Thời điểm dọn file ghi âm. Khác NULL = audio đã xoá, transcript vẫn còn.';

-- ─── 2. Backfill `audio_paths` từ `audio_url` cũ ───
-- audio_url là public URL dạng .../storage/v1/object/public/meetings/<path>.
-- Cắt lấy phần <path> để các biên bản cũ cũng có đường xoá file ghi âm.

update public.meetings
set audio_paths = array[
  substring(audio_url from '/object/public/meetings/(.*)$')
]
where audio_url is not null
  and audio_url <> ''
  and coalesce(array_length(audio_paths, 1), 0) = 0
  and substring(audio_url from '/object/public/meetings/(.*)$') is not null;

-- ─── 3. Bảng `employees`: mẫu giọng ───
-- Chỉ là đường dẫn tới file trong bucket `meetings` (thư mục voice_samples/),
-- không lưu dữ liệu nhị phân trong bảng.

alter table public.employees
  add column if not exists voice_sample_path text;

comment on column public.employees.voice_sample_path is
  'Mẫu giọng 2-10 giây trong bucket meetings/voice_samples/. Nạp vào known_speaker_references để AI gỡ băng gọi đúng tên. OpenAI giới hạn 4 mẫu mỗi lần gỡ băng.';

-- ─── 3b. Dựng lại view `employees_directory` để có cột mới ───
--
-- BẪY PHẢI TRÁNH: view này dựng động từ information_schema (xem 011 và 031) và
-- có cột tính toán `is_resigned` ĐẶT Ở CUỐI. Cột `voice_sample_path` vừa thêm
-- vào bảng gốc sẽ chen vào TRƯỚC `is_resigned` theo ordinal_position, tức là
-- đổi thứ tự cột của view — mà `create or replace view` chỉ cho phép THÊM cột
-- vào cuối, đổi thứ tự là lỗi "cannot change name of view column".
-- Vì vậy phải DROP rồi CREATE lại, và cấp lại quyền ngay sau đó.
--
-- Không dùng CASCADE: nếu có object nào phụ thuộc thì thà báo lỗi để biết,
-- còn hơn âm thầm xoá mất thứ khác.

drop view if exists public.employees_directory;

do $$
declare
  cols text;
  has_notes boolean;
  resigned_expr text;
begin
  -- Bộ cột "không PII" — giữ nguyên đúng danh sách của migration 011.
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'employees'
    and column_name not in (
      'cccd', 'cccd_date', 'cccd_place',
      'permanent_address', 'temporary_address',
      'emergency_contact_name', 'emergency_contact_relationship',
      'emergency_contact_phone',
      'notes'
    );

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'notes'
  ) into has_notes;

  resigned_expr :=
    '(lower(coalesce(status, '''')) like ''%nghỉ việc%'' or lower(coalesce(status, '''')) like ''%nghi viec%'')';

  if has_notes then
    resigned_expr := resigned_expr ||
      ' or (lower(coalesce(notes, '''')) like ''%nghỉ việc%'' or lower(coalesce(notes, '''')) like ''%nghi viec%'')';
  end if;

  execute format(
    'create or replace view public.employees_directory as select %s, (%s) as is_resigned from public.employees',
    cols, resigned_expr
  );
end $$;

-- Thu hồi trước, cấp sau — bẫy GRANT của view (xem 011): view KHÔNG chịu RLS,
-- ai được GRANT là đọc sạch, mà Supabase cấp sẵn cho `anon`/PUBLIC. Sau DROP +
-- CREATE thì quyền cũ mất hết nên bước này là BẮT BUỘC, không phải cho chắc.
revoke all on public.employees_directory from public;
revoke all on public.employees_directory from anon;
grant select on public.employees_directory to authenticated;

-- ─── 4. Bucket `meetings`: cho phép định dạng do trình duyệt ghi ra ───
-- MediaRecorder trên Chrome/Edge xuất audio/webm (codec opus), Firefox có thể
-- ra audio/ogg. Danh sách mime cũ chưa có 2 loại này -> upload sẽ bị chặn.

update storage.buckets
set allowed_mime_types = array[
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/webm',
  'audio/ogg',
  'video/webm',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
]
where id = 'meetings';

-- Ghi chú: bucket `meetings` hiện vẫn để public = true. Đã thống nhất chuyển
-- sang private + signed URL ở một đợt sau, không gộp vào migration này.
