// ============================================================
// MODEL AI DÙNG CHO MODULE BIÊN BẢN HỌP
//
// Tách riêng khỏi dropdown model của trang Hành chính (localStorage key
// `openai_model_hanh_chinh`) vì hai việc có yêu cầu khác hẳn nhau: đọc hoá đơn
// là trích vài trường từ 1 trang ảnh, còn dựng biên bản là đọc transcript 1-2
// tiếng rồi bóc tách có cấu trúc — cần model mạnh hơn hẳn.
//
// VÌ SAO MẶC ĐỊNH LÀ SOL:
// Theo tài liệu OpenAI, trong dòng 5.6 thì sol tương đương tầng flagship, terra
// tương đương tầng "mini", luna tương đương tầng "nano". Biên bản họp Ban điều
// hành sai một dòng phân công là ảnh hưởng thật, nên mặc định đi tầng cao nhất.
// Chênh lệch chi phí giữa sol và terra chỉ khoảng 0,15 USD mỗi cuộc họp 1 tiếng,
// trong khi riêng khâu gỡ băng đã tốn gấp vài lần con số đó.
// ============================================================

export type MeetingModelId = "gpt-5.6-sol" | "gpt-5.6-terra";

export const MEETING_MODEL_DEFAULT: MeetingModelId = "gpt-5.6-sol";

export const MEETING_MODELS: {
  id: MeetingModelId;
  label: string;
  hint: string;
}[] = [
  {
    id: "gpt-5.6-sol",
    label: "gpt-5.6-sol — Chính xác nhất (khuyên dùng)",
    hint: "Họp giao ban, họp dự án 1-2 tiếng, nhiều số liệu và phân công.",
  },
  {
    id: "gpt-5.6-terra",
    label: "gpt-5.6-terra — Tiết kiệm",
    hint: "Họp nội bộ ngắn, nội dung đơn giản, ít đầu việc.",
  },
];

// Danh sách hợp lệ để server không nhận bừa tên model từ header client gửi lên.
export function normalizeMeetingModel(value: unknown): MeetingModelId {
  return MEETING_MODELS.some((m) => m.id === value)
    ? (value as MeetingModelId)
    : MEETING_MODEL_DEFAULT;
}

// ─── Model gỡ băng ───
// gpt-4o-transcribe-diarize là model duy nhất của OpenAI trả về nhãn người nói
// kèm mốc start/end (response_format: "diarized_json"), và nhận tối đa 4 mẫu
// giọng qua known_speaker_references để gọi thẳng tên thật.
export const TRANSCRIBE_MODEL = "gpt-4o-transcribe-diarize";

// Giới hạn cứng của OpenAI: 25MB mỗi lần gọi, áp dụng cho MỌI model gỡ băng
// kể cả các model mới nhất. Đây là lý do phải cắt đoạn khi ghi âm.
export const OPENAI_AUDIO_MAX_BYTES = 25 * 1024 * 1024;

// Số mẫu giọng tối đa OpenAI nhận mỗi lần gỡ băng.
export const MAX_KNOWN_SPEAKERS = 4;

// Độ dài mỗi đoạn ghi âm. 20 phút ở opus mono 32kbps ~ 4,8MB — cách xa trần
// 25MB, và đủ ngắn để mất nhiều nhất 20 phút nếu trình duyệt sập giữa chừng.
export const RECORDING_SEGMENT_MINUTES = 20;

// Opus mono 32kbps là chuẩn thoại: nghe rõ, mà 1 phút chỉ ~240KB.
export const RECORDING_BITS_PER_SECOND = 32000;
