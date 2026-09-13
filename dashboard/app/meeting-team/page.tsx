"use client";

import { apiFetch } from "@/lib/apiClient";
import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { fetchTenantConfig } from "@/lib/tenantConfig";
import { isResignedRow } from "@/lib/resigned";
import MeetingRecorder, { type RecordedSegment } from "@/components/MeetingRecorder";
import VoiceSampleManager from "@/components/VoiceSampleManager";
import DialogProvider, { useDialog } from "@/components/DialogProvider";
import {
  MEETING_MODELS,
  MEETING_MODEL_DEFAULT,
  MAX_KNOWN_SPEAKERS,
  OPENAI_AUDIO_MAX_BYTES,
  type MeetingModelId,
} from "@/lib/meetingModels";
import {
  Mic,
  Calendar,
  User,
  Clock,
  MapPin,
  UploadCloud,
  FileAudio,
  FileText,
  Trash2,
  Edit,
  Plus,
  Check,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Briefcase,
  Users,
  Search,
  ExternalLink,
  ChevronRight,
  Archive,
  Brain,
  FileDown,
  FileCheck,
  FileEdit,
  Download,
  Play,
  Sparkles,
  Volume2,
  Trash,
  CheckCircle2
} from "lucide-react";

// Đọc response an toàn: khi server bị timeout/quá tải (Vercel trả text
// "A server error has occurred..." thay vì JSON), báo lỗi tiếng Việt dễ hiểu
// thay vì crash "Unexpected token 'A' ... is not valid JSON".
async function readJsonSafe(res: Response, context: string): Promise<any> {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    if (res.status === 504 || res.status === 502 || raw.toLowerCase().includes("timeout") || raw.startsWith("A server error")) {
      throw new Error(`${context}: Máy chủ xử lý quá thời gian cho phép (timeout). File ghi âm có thể quá dài/quá nặng — hãy thử chia nhỏ file (< 15 phút hoặc < 15MB mỗi file) rồi tải lên lại.`);
    }
    throw new Error(`${context}: Máy chủ trả về phản hồi không hợp lệ (HTTP ${res.status}). Vui lòng thử lại sau ít phút.`);
  }
}

/** Một đoạn audio trong kho lưu trữ, kèm vị trí của nó trong cả cuộc họp. */
type AudioPart = { path: string; offsetSec: number; durationSec: number };

/**
 * Đo thời lượng file audio ngay trên trình duyệt để xếp các file tải lên vào
 * đúng vị trí trên trục thời gian. Không đọc được thì trả 0 — biên bản vẫn chạy,
 * chỉ là timeline kém chính xác hơn so với ghi âm trực tiếp trong app.
 */
function estimateDurationSec(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      const done = (value: number) => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
      };
      audio.onloadedmetadata = () => done(audio.duration);
      audio.onerror = () => done(0);
      // Một số định dạng không bao giờ bắn sự kiện -> đừng treo luồng xử lý
      setTimeout(() => done(audio.duration), 5000);
      audio.src = url;
    } catch {
      resolve(0);
    }
  });
}

interface Meeting {
  id: string;
  created_at: string;
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  location: string;
  chairperson: string;
  secretary: string;
  attendees: string[];
  project_name: string;
  package_name: string;
  audio_url: string;
  audio_segments: AudioPart[];
  transcript_raw: string;
  transcript_clean: string;
  summary: string;
  action_items: ActionItem[];
  document_url: string;
  status: "draft" | "confirmed";
  distribution: string;
  // ─── Bổ sung cho ghi âm trong app + tách người nói (migration 069) ───
  audio_paths: string[];
  recording_started_at: string | null;
  transcript_segments: TranscriptSegment[];
  speaker_map: Record<string, string>;
  audio_deleted_at: string | null;
  audio_deleted_by: string | null;
  ai_model: string | null;
}

interface TranscriptSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

interface ActionItem {
  stt: number | string;
  content: string;
  assignee: string;
  coop: string;
  deadline: string;
  is_header?: boolean;
  /** Giây tính từ lúc bắt đầu ghi — để tua lại đúng đoạn kiểm chứng. */
  ts?: number | null;
}

// Trang thật nằm trong DialogProvider để mọi thông báo/xác nhận dùng hộp thoại
// giữa màn hình thay cho alert()/confirm() của trình duyệt. Phải tách làm 2 hàm
// vì một component không dùng được context do chính nó tạo ra.
export default function MeetingTeamPage() {
  return (
    <DialogProvider>
      <MeetingTeamContent />
    </DialogProvider>
  );
}

function MeetingTeamContent() {
  const dialog = useDialog();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Navigation Modules (Tài liệu vs Trung tâm AI)
  const [activeModule, setActiveModule] = useState<"archive" | "ai_center">("archive");
  // Sub-navigation for Archive (Tất cả / Bản nháp / Đã xác nhận)
  const [archiveFilter, setArchiveFilter] = useState<"all" | "draft" | "confirmed">("all");
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<"list" | "detail">("list");
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // AI Center Intake Fields
  const [chairperson, setChairperson] = useState("");
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  // Model phân tích biên bản — mặc định gpt-5.6-sol (xem lib/meetingModels.ts)
  const [meetingModel, setMeetingModel] = useState<MeetingModelId>(MEETING_MODEL_DEFAULT);
  // Người dự họp được xác nhận trước: vừa làm danh sách chặn AI bịa tên, vừa là
  // nguồn mẫu giọng nạp vào known_speaker_references khi gỡ băng.
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [intakeMode, setIntakeMode] = useState<"record" | "upload">("record");
  const [isDeletingAudio, setIsDeletingAudio] = useState(false);
  const [showVoiceSamples, setShowVoiceSamples] = useState(false);
  // Bản ghi đã lưu xong nhưng chưa đủ thông tin để chạy AI (thiếu chủ trì hoặc
  // API key). Giữ lại ở đây để không mất bản ghi — điền nốt rồi bấm chạy tiếp.
  const [pendingRecording, setPendingRecording] = useState<{ startedAt: string; segments: RecordedSegment[] } | null>(null);
  const [speakerMapDraft, setSpeakerMapDraft] = useState<Record<string, string>>({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [processingStep, setProcessingStep] = useState<"idle" | "stt" | "ai" | "done">("idle");
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  
  // Human Review Panel States
  const [reviewTab, setReviewTab] = useState<"transcript" | "summary" | "tasks">("tasks");
  const [editableTitle, setEditableTitle] = useState("");
  const [editableDate, setEditableDate] = useState("");
  const [editableStartTime, setEditableStartTime] = useState("");
  const [editableEndTime, setEditableEndTime] = useState("");
  const [editableLocation, setEditableLocation] = useState("");
  const [editableSecretary, setEditableSecretary] = useState("");
  const [editableAttendees, setEditableAttendees] = useState<string[]>([]);
  const [editableAttendeeInput, setEditableAttendeeInput] = useState("");
  const [editableProject, setEditableProject] = useState("");
  const [editablePackage, setEditablePackage] = useState("");
  const [editableDistribution, setEditableDistribution] = useState("");
  const [editableTranscript, setEditableTranscript] = useState("");
  const [editableSummary, setEditableSummary] = useState("");
  const [editableActionItems, setEditableActionItems] = useState<ActionItem[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch initial data
  useEffect(() => {
    fetchMeetings();
    fetchEmployees();
    fetchUserSession();
    
    if (typeof window !== "undefined") {
      const key = localStorage.getItem("openai_api_key_hanh_chinh") || localStorage.getItem("openai_api_key") || "";
      setOpenaiKey(key);

      // Model của module Biên bản họp lưu riêng, KHÔNG dùng chung key với trang
      // Hành chính — hai việc có yêu cầu khác hẳn nhau về độ mạnh của model.
      const savedModel = localStorage.getItem("openai_model_bien_ban_hop");
      if (MEETING_MODELS.some(m => m.id === savedModel)) {
        setMeetingModel(savedModel as MeetingModelId);
      }
    }
  }, []);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      console.error("Error fetching meetings:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      // Danh sách để chọn "Nhân viên tham dự" -> chịu công tắc ẩn nhân sự đã nghỉ.
      // (Chỗ tra danh tính người đăng nhập bên dưới thì KHÔNG lọc, lọc là mất tên.)
      const cfg = await fetchTenantConfig();
      const { data, error } = await supabase
        .from("employees_directory")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      const rows = cfg.hide_resigned_in_pickers ? (data || []).filter(e => !isResignedRow(e)) : (data || []);
      setEmployees(rows);
    } catch (err) {
      console.error("Error fetching employees:", err);
    }
  };

  const fetchUserSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const email = session.user.email || "";
        const { data: empData } = await supabase
          .from("employees_directory")
          .select("name")
          .like("email", `%${email}%`)
          .maybeSingle();
        setCurrentUser({
          email,
          name: empData?.name || session.user.user_metadata?.full_name || "Nhân sự",
        });
      }
    } catch (err) {
      console.error("Error fetching user session:", err);
    }
  };

  // Immediate download helper (CORS-friendly download bypass)
  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(url, "_blank");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("audio/"));
      if (newFiles.length === 0) {
        await dialog.alert("Vui lòng chọn file âm thanh (MP3, WAV, M4A).");
        return;
      }
      setAudioFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setAudioFiles(prev => [...prev, ...newFiles]);
      // Reset input so user can re-select same files if needed
      e.target.value = "";
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // QUY TRÌNH XỬ LÝ CHUNG
  //
  // Hai đường vào — ghi âm trực tiếp trong app và tải file lên — chỉ khác nhau
  // ở cách có được danh sách đoạn audio. Từ đó trở đi (tạo biên bản nháp -> gỡ
  // băng từng đoạn -> AI dựng biên bản) hoàn toàn giống nhau, nên gom về một
  // hàm để không phải sửa hai nơi mỗi lần đổi luồng.
  //
  // `offsetSec` của mỗi đoạn là vị trí của nó tính từ lúc bắt đầu ghi. Cộng với
  // mốc start/end do khâu gỡ băng trả về sẽ ra timeline giờ thật của cả cuộc
  // họp — thay cho việc AI phải tự nghĩ ra giờ như bản cũ.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // `existingMeetingId` dùng khi chạy lại trên một biên bản nháp đã có sẵn file
  // ghi âm (lần trước gỡ băng hỏng giữa chừng) — không tạo biên bản mới, tránh
  // sinh ra bản trùng cho cùng một cuộc họp.
  const runMeetingPipeline = async (
    parts: AudioPart[],
    recordingStartedAt: string | null,
    existingMeetingId?: string,
    rosterOverride?: string[]
  ) => {
    if (parts.length === 0) {
      await dialog.alert("Không có đoạn ghi âm nào để xử lý.");
      return;
    }

    setIsUploading(true);
    setProcessingStep("stt");

    // Danh sách người dự đã xác nhận -> chặn AI bịa tên người phát biểu.
    // Khi chạy lại trên biên bản có sẵn thì lấy danh sách của chính biên bản đó
    // (ô chọn người dự ở Trung tâm AI không còn trên màn hình).
    const roster = rosterOverride ?? (() => {
      const names = employees.filter(e => participantIds.includes(e.id)).map(e => e.name);
      if (chairperson && !names.includes(chairperson)) names.unshift(chairperson);
      return names;
    })();

    // Mẫu giọng suy ra TỪ danh sách người dự, không phải từ ô tick — nhờ vậy cả
    // luồng chạy lại cũng dùng được mẫu giọng mà không cần tick lại từ đầu.
    const knownSpeakerIds = employees
      .filter(e => e.voice_sample_path && roster.includes(e.name))
      .slice(0, MAX_KNOWN_SPEAKERS)
      .map(e => e.id);
    const voiceSampleCount = knownSpeakerIds.length;

    setProcessingLog([
      `[1/5] Chuẩn bị xử lý ${parts.length} đoạn ghi âm...`,
      roster.length > 0
        ? `Danh sách người dự đã xác nhận: ${roster.join(", ")}`
        : "⚠️ Chưa chọn người dự họp — AI sẽ ghi theo bộ phận thay vì tên riêng.",
      voiceSampleCount > 0
        ? `Có ${voiceSampleCount} mẫu giọng — AI sẽ gọi thẳng tên thật thay vì "Speaker 1".`
        : "Chưa có mẫu giọng nào: AI vẫn tách được người nói nhưng đánh nhãn Speaker 1/2/3, bạn gán tên sau.",
    ]);

    let draftMeetingId = "";

    try {
      // ─── 1. Biên bản nháp: dùng lại bản có sẵn, hoặc tạo mới ───
      if (existingMeetingId) {
        draftMeetingId = existingMeetingId;

        // Route gỡ băng NỐI THÊM vào transcript đang có (để tiến trình chết giữa
        // chừng không mất phần đã gỡ). Nên khi chạy lại phải dọn sạch trước, nếu
        // không nội dung cũ sẽ bị nhân đôi trong biên bản.
        const { error: resetError } = await supabase
          .from("meetings")
          .update({ transcript_raw: "", transcript_segments: [] })
          .eq("id", existingMeetingId);
        if (resetError) throw resetError;

        setProcessingLog(prev => [
          ...prev,
          `[2/5] Chạy lại trên biên bản nháp có sẵn (ID: ${existingMeetingId}).`,
          `Bắt đầu gỡ băng & tách người nói ${parts.length} đoạn...`,
        ]);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from("meetings")
          .getPublicUrl(parts[0].path);

        const today = new Date().toISOString().split("T")[0];
        const { data: draftMeeting, error: dbError } = await supabase
          .from("meetings")
          .insert([{
            title: `Biên bản họp ngày ${today} (Đang xử lý)`,
            meeting_date: today,
            chairperson,
            audio_url: publicUrl,
            audio_paths: parts.map(p => p.path),
            audio_segments: parts,
            recording_started_at: recordingStartedAt,
            status: "draft",
            distribution: "P. KHĐT, P. QLDA, P. VTTB; Lưu: HCNS."
          }])
          .select()
          .single();

        if (dbError) throw dbError;
        draftMeetingId = draftMeeting.id;

        setProcessingLog(prev => [
          ...prev,
          `[2/5] Đã khởi tạo biên bản nháp (ID: ${draftMeeting.id}).`,
          `Bắt đầu gỡ băng & tách người nói ${parts.length} đoạn...`,
        ]);
      }

      // ─── 2. Gỡ băng tuần tự từng đoạn ───
      // Server tự nối kết quả vào biên bản (không ghi đè), nên nếu tiến trình
      // chết giữa chừng thì phần đã gỡ vẫn còn trong CSDL.
      let totalChars = 0;
      const warnings: string[] = [];
      const speakersFound = new Set<string>();

      for (let i = 0; i < parts.length; i++) {
        setProcessingLog(prev => [...prev, `  🎙️ Đang gỡ băng đoạn ${i + 1}/${parts.length}...`]);

        const { data: { session: transcribeSession } } = await supabase.auth.getSession();
        const transcribeRes = await apiFetch("/api/meeting/transcribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`,
            "x-supabase-auth": transcribeSession?.access_token || ""
          },
          body: JSON.stringify({
            meetingId: draftMeetingId,
            audioPath: parts[i].path,
            offsetSec: parts[i].offsetSec,
            knownSpeakerIds,
          })
        });

        const transcribeData = await readJsonSafe(transcribeRes, `Lỗi gỡ băng đoạn ${i + 1}`);
        if (!transcribeRes.ok) throw new Error(transcribeData.error || `Lỗi gỡ băng đoạn ${i + 1}.`);

        totalChars += (transcribeData.text || "").length;
        (transcribeData.speakers || []).forEach((s: string) => speakersFound.add(s));

        // KHÁC BẢN CŨ: cảnh báo lặp vòng KHÔNG còn làm mất nội dung đoạn đó nữa.
        // Trước đây một đoạn bị gắn cờ là bị loại khỏi biên bản, tức là mất luôn
        // 20 phút họp mà chỉ hiện một dòng log nhỏ.
        if (transcribeData.is_hallucination) {
          warnings.push(`Đoạn ${i + 1}: ${transcribeData.hallucination_warning}`);
          setProcessingLog(prev => [...prev, `  ⚠️ Đoạn ${i + 1} có dấu hiệu nghe không rõ — nội dung VẪN được giữ để bạn kiểm tra.`]);
        } else {
          setProcessingLog(prev => [...prev, `  ✅ Đoạn ${i + 1}: ${(transcribeData.text || "").length} ký tự`]);
        }
      }

      if (totalChars === 0) {
        throw new Error(
          "Không gỡ được nội dung nào từ các đoạn ghi âm. Hãy mở nghe thử file gốc: nếu không nghe thấy tiếng nói thì micro đã không thu được âm thanh trong lúc họp."
        );
      }

      setProcessingLog(prev => [
        ...prev,
        `[3/5] Gỡ băng xong: ${totalChars} ký tự, nhận diện ${speakersFound.size} người nói.`,
        `Bắt đầu dựng biên bản bằng ${meetingModel}...`,
      ]);
      setProcessingStep("ai");

      // ─── 3. AI dựng biên bản ───
      const { data: { session: processSession } } = await supabase.auth.getSession();
      const processRes = await apiFetch("/api/meeting/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
          "x-supabase-auth": processSession?.access_token || "",
          "x-openai-model": meetingModel,
        },
        body: JSON.stringify({ meetingId: draftMeetingId, roster })
      });

      const processData = await readJsonSafe(processRes, "Lỗi AI phân tích biên bản");
      if (!processRes.ok) throw new Error(processData.error || "Gặp lỗi khi AI dựng biên bản.");

      setProcessingLog(prev => [
        ...prev,
        `[4/5] Dựng biên bản xong bằng ${processData.model || meetingModel}.`,
        processData.timeline_mode === "clock"
          ? "Timeline lấy từ giờ đồng hồ thật lúc ghi âm."
          : processData.timeline_mode === "relative"
          ? "Timeline theo khoảng thời gian của file (tải file lên nên không biết giờ đồng hồ). Ghi âm trực tiếp trong app sẽ có giờ thật."
          : "⚠️ Không có mốc thời gian — timeline trình bày theo trình tự phát biểu.",
        "[5/5] Đang mở màn hình kiểm tra biên bản...",
      ]);
      setProcessingStep("done");

      const { data: finalMeeting } = await supabase
        .from("meetings").select("*").eq("id", draftMeetingId).single();

      fetchMeetings();

      if (warnings.length > 0) {
        await dialog.alert(
          "Biên bản đã dựng xong, nhưng có đoạn nghe không rõ:\n\n" +
          warnings.join("\n\n") +
          "\n\nVui lòng đối chiếu lại các đoạn này trong tab Bản gỡ băng trước khi khoá biên bản."
        );
      }

      if (finalMeeting) {
        setTimeout(() => {
          handleViewDetail(finalMeeting);
          setAudioFiles([]);
          setChairperson("");
          setParticipantIds([]);
          setProcessingStep("idle");
          setProcessingLog([]);
        }, 1200);
      }
    } catch (err: any) {
      console.error(err);
      setProcessingLog(prev => [
        ...prev,
        `❌ LỖI: ${err.message}`,
        draftMeetingId
          ? "File ghi âm KHÔNG bị mất — vẫn nằm trên server cùng biên bản nháp. Vào Hồ sơ biên bản họp, mở bản nháp: nếu lỗi ở khâu gỡ băng thì bấm \"Gỡ băng lại\"; nếu đã gỡ băng xong mà lỗi ở khâu dựng biên bản thì bấm \"Phân tích lại bằng AI\" (không tốn tiền gỡ băng lần nữa)."
          : "",
      ].filter(Boolean));
      setProcessingStep("idle");
      await dialog.alert(
        (err.message || "Đã xảy ra lỗi trong quy trình xử lý tự động.") +
        (draftMeetingId
          ? "\n\nFile ghi âm KHÔNG bị mất. Vào Hồ sơ biên bản họp, mở bản nháp rồi bấm \"Gỡ băng lại\" (nếu lỗi ở khâu gỡ băng) hoặc \"Phân tích lại bằng AI\" (nếu đã gỡ băng xong)."
          : "")
      );
    } finally {
      setIsUploading(false);
    }
  };

  // ─── Đường vào 1: ghi âm trực tiếp trong app ───
  //
  // Ghi âm KHÔNG đòi hỏi phải chọn chủ trì hay nhập API key trước: cuộc họp bắt
  // đầu là bấm ghi được ngay, không mất mấy phút đầu vì loay hoay điền form.
  // Hai thứ đó chỉ cần khi gọi AI, tức là lúc kết thúc. Nếu lúc đó vẫn thiếu
  // thì bản ghi được giữ lại trong `pendingRecording` (file đã nằm an toàn trên
  // Storage rồi), điền nốt là chạy tiếp — không mất gì.
  const handleRecordingFinished = async (result: { startedAt: string; segments: RecordedSegment[] }) => {
    const usable = result.segments.filter(s => s.status === "done");
    const failed = result.segments.filter(s => s.status === "error");

    if (usable.length === 0) {
      await dialog.alert("Không có đoạn ghi âm nào tải lên thành công. Vui lòng kiểm tra kết nối mạng rồi ghi lại.", { title: "Lỗi", tone: "danger" });
      return;
    }
    if (failed.length > 0) {
      const ok = await dialog.confirm(
        `Có ${failed.length}/${result.segments.length} đoạn tải lên thất bại và sẽ bị thiếu trong biên bản.\n\n` +
        `Vẫn tiếp tục xử lý ${usable.length} đoạn còn lại?`
      );
      if (!ok) return;
    }

    if (!chairperson || !openaiKey) {
      setPendingRecording({ startedAt: result.startedAt, segments: usable });
      await dialog.alert(
        `Bản ghi đã được lưu an toàn (${usable.length} đoạn) — không mất gì cả.\n\n` +
        `Chỉ còn thiếu ${[!chairperson && "người chủ trì", !openaiKey && "OpenAI API Key"].filter(Boolean).join(" và ")} ` +
        `để chạy AI. Điền nốt ở cột bên trái rồi bấm "Chạy AI dựng biên bản".`
      );
      return;
    }

    await processRecording(result.startedAt, usable);
  };

  const processRecording = async (startedAt: string, usable: RecordedSegment[]) => {
    setPendingRecording(null);
    await runMeetingPipeline(
      usable.map(s => ({ path: s.path, offsetSec: s.offsetSec, durationSec: s.durationSec })),
      startedAt
    );
  };

  // ─── Đường vào 2: tải file ghi âm sẵn có lên ───
  const handleIntakeAndProcess = async () => {
    if (audioFiles.length === 0) {
      await dialog.alert("Vui lòng kéo thả hoặc chọn file ghi âm cuộc họp!");
      return;
    }
    if (!openaiKey) {
      await dialog.alert("Vui lòng cấu hình OpenAI API Key ở góc trên bên phải trước khi xử lý!");
      return;
    }
    if (!chairperson) {
      await dialog.alert("Vui lòng chọn người chủ trì cuộc họp!");
      return;
    }

    // Trần 25MB là giới hạn cứng của OpenAI cho MỌI model gỡ băng, không lách
    // được. File quá cỡ chắc chắn lỗi nên chặn hẳn thay vì chỉ cảnh báo.
    const oversized = audioFiles.filter(f => f.size > OPENAI_AUDIO_MAX_BYTES);
    if (oversized.length > 0) {
      await dialog.alert(
        `${oversized.length} file vượt trần 25MB mỗi lần gọi của OpenAI:\n` +
        oversized.map(f => `- ${f.name} (${(f.size / (1024 * 1024)).toFixed(1)} MB)`).join("\n") +
        `\n\nHãy cắt nhỏ dưới 20 phút mỗi file, hoặc dùng chức năng "Ghi âm trực tiếp" để hệ thống tự cắt đoạn.`
      );
      return;
    }

    setIsUploading(true);
    setUploadProgress(5);
    setProcessingLog([`[0/5] Đang tải ${audioFiles.length} file lên kho lưu trữ...`]);

    try {
      const sessionId = `${Date.now()}`;
      const parts: AudioPart[] = [];
      // File tải lên không có thông tin thời lượng thật, nên mốc offset chỉ là
      // ước lượng theo thứ tự file. Timeline sẽ kém chính xác hơn so với ghi âm
      // trực tiếp — đây là lý do nên ưu tiên ghi thẳng trong app.
      let cumulativeSec = 0;

      for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
        const filePath = `recordings/${sessionId}/${String(i).padStart(3, "0")}_${cleanName}`;

        setProcessingLog(prev => [...prev, `  📁 Tải file ${i + 1}/${audioFiles.length}: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`]);

        const { error: uploadError } = await supabase.storage
          .from("meetings")
          .upload(filePath, file, { cacheControl: "3600", upsert: true });

        if (uploadError) throw new Error(`Lỗi upload file ${file.name}: ${uploadError.message}`);

        const durationSec = await estimateDurationSec(file);
        parts.push({ path: filePath, offsetSec: cumulativeSec, durationSec });
        cumulativeSec += durationSec;
        setUploadProgress(Math.round(((i + 1) / audioFiles.length) * 100));
      }

      await runMeetingPipeline(parts, null);
    } catch (err: any) {
      console.error(err);
      setProcessingLog(prev => [...prev, `❌ LỖI: ${err.message}`]);
      setProcessingStep("idle");
      setIsUploading(false);
      await dialog.alert(err.message || "Lỗi khi tải file ghi âm lên.", { title: "Lỗi", tone: "danger" });
    }
  };

  const handleViewDetail = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    
    // Set editable states
    setEditableTitle(meeting.title || "");
    setEditableDate(meeting.meeting_date || "");
    // Để TRỐNG khi không có dữ liệu thật, thay vì điền sẵn 09:00/10:30 như bản
    // cũ — ô trống nhắc thư ký điền, còn giờ điền sẵn thì trôi thẳng vào biên
    // bản chính thức mà không ai để ý là nó bịa.
    setEditableStartTime(meeting.start_time || "");
    setEditableEndTime(meeting.end_time || "");
    setEditableLocation(meeting.location || "");
    setEditableSecretary(meeting.secretary || "");
    setEditableAttendees(meeting.attendees || []);
    setEditableProject(meeting.project_name || "");
    setEditablePackage(meeting.package_name || "");
    setEditableDistribution(meeting.distribution || "P. KHĐT, P. QLDA, P. VTTB; Lưu: HCNS.");
    setEditableTranscript(meeting.transcript_clean || meeting.transcript_raw || "");
    setEditableSummary(meeting.summary || "");
    setEditableActionItems(meeting.action_items || []);
    setSpeakerMapDraft((meeting.speaker_map as Record<string, string>) || {});
    setPlayingSegment(0);

    setReviewTab("tasks");
    setCurrentView("detail");
  };

  // ━━━ NGHE LẠI ĐÚNG ĐOẠN ĐỂ KIỂM CHỨNG ━━━
  // Mỗi đầu việc AI bóc ra đều mang mốc `ts` (giây tính từ lúc bắt đầu ghi).
  // Nhưng một cuộc họp 2 tiếng nằm rải trên 6 file 20 phút, nên phải dò xem
  // giây đó rơi vào FILE NÀO rồi mới tua trong file đó — đây là lý do cần bản đồ
  // `audio_segments` chứ danh sách đường dẫn thuần không đủ.
  const audioSegments: AudioPart[] = Array.isArray(selectedMeeting?.audio_segments)
    ? selectedMeeting.audio_segments
    : [];
  const [playingSegment, setPlayingSegment] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingSeekRef = useRef<number | null>(null);

  const segmentUrl = (path?: string) =>
    path ? supabase.storage.from("meetings").getPublicUrl(path).data.publicUrl : "";

  const seekToTs = (ts: number) => {
    if (audioSegments.length === 0) return;
    let target = audioSegments.findIndex(
      s => ts >= s.offsetSec && ts < s.offsetSec + (s.durationSec || Number.MAX_SAFE_INTEGER)
    );
    if (target < 0) target = audioSegments.length - 1;

    const local = Math.max(0, ts - (audioSegments[target]?.offsetSec || 0));
    if (target !== playingSegment) {
      // Đổi file thì phải đợi trình duyệt nạp xong mới tua được
      pendingSeekRef.current = local;
      setPlayingSegment(target);
    } else if (audioRef.current) {
      audioRef.current.currentTime = local;
      void audioRef.current.play();
    }
  };

  const handleAudioLoaded = () => {
    if (pendingSeekRef.current === null || !audioRef.current) return;
    audioRef.current.currentTime = pendingSeekRef.current;
    pendingSeekRef.current = null;
    void audioRef.current.play();
  };

  /** Giây -> mm:ss (hoặc h:mm:ss) để hiện trên nút mốc trích dẫn. */
  const formatTs = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };

  // ─── Gán tên thật cho các nhãn máy (Speaker 1/2/3) ───
  // Khâu gỡ băng tách được giọng ai ra giọng nấy nhưng chỉ đặt nhãn máy cho
  // người không có mẫu giọng. Thư ký nghe vài giây rồi chọn tên, sau đó bấm
  // "Phân tích lại" để AI viết biên bản với tên thật.
  const detectedSpeakers = (() => {
    const segs = selectedMeeting?.transcript_segments;
    if (!Array.isArray(segs)) return [] as string[];
    return Array.from(new Set(segs.map(s => s.speaker))).sort();
  })();

  const handleSaveSpeakerMap = async () => {
    if (!selectedMeeting) return;
    try {
      const { error } = await supabase
        .from("meetings")
        .update({ speaker_map: speakerMapDraft })
        .eq("id", selectedMeeting.id);
      if (error) throw error;
      setSelectedMeeting({ ...selectedMeeting, speaker_map: speakerMapDraft });
      await dialog.alert("Đã lưu tên người nói. Bấm \"Phân tích lại bằng AI\" để biên bản dùng tên thật.", { tone: "success" });
    } catch (err: any) {
      await dialog.alert("Lỗi khi lưu tên người nói: " + err.message, { title: "Lỗi", tone: "danger" });
    }
  };

  // ─── Gỡ băng lại từ file ghi âm đã có trên server ───
  //
  // Khi khâu gỡ băng hỏng giữa chừng (mạng rớt, API đổi tham số, hết hạn mức),
  // file ghi âm VẪN nằm nguyên trong kho lưu trữ. Không có nút này thì cách duy
  // nhất để cứu là họp lại từ đầu — điều không ai làm được với cuộc họp đã diễn ra.
  const [isRetranscribing, setIsRetranscribing] = useState(false);
  const handleRetranscribe = async () => {
    if (!selectedMeeting) return;
    if (!openaiKey) {
      await dialog.alert("Vui lòng nhập OpenAI API Key ở Trung tâm Xử lý AI trước khi gỡ băng lại.");
      return;
    }
    if (selectedMeeting.audio_deleted_at) {
      await dialog.alert("File ghi âm của biên bản này đã được dọn nên không gỡ băng lại được. Bản gỡ băng cũ vẫn dùng được với nút \"Phân tích lại bằng AI\".");
      return;
    }

    const stored = Array.isArray(selectedMeeting.audio_segments) ? selectedMeeting.audio_segments : [];
    const paths = Array.isArray(selectedMeeting.audio_paths) ? selectedMeeting.audio_paths : [];
    const segs: AudioPart[] = stored.length > 0
      ? stored
      : paths.map(p => ({ path: p, offsetSec: 0, durationSec: 0 }));

    if (segs.length === 0) {
      await dialog.alert("Biên bản này không lưu đường dẫn file ghi âm (biên bản cũ tạo trước bản nâng cấp), nên không gỡ băng lại tự động được.");
      return;
    }

    const approximateTimeline = stored.length === 0 && paths.length > 1;
    const ok = await dialog.confirm(
      `Gỡ băng lại toàn bộ ${segs.length} đoạn ghi âm?\n\n` +
      `Bản gỡ băng hiện tại sẽ bị thay thế, và thao tác này TÍNH PHÍ API theo độ dài bản ghi.` +
      (approximateTimeline
        ? `\n\nLưu ý: biên bản này không lưu bản đồ đoạn nên mốc giờ trong timeline sẽ chỉ gần đúng.`
        : "")
    );
    if (!ok) return;

    const roster = [
      chairperson || selectedMeeting.chairperson,
      ...editableAttendees,
    ].filter(Boolean);

    setIsRetranscribing(true);
    try {
      // Chuyển về Trung tâm Xử lý AI để nhìn được nhật ký tiến trình
      setCurrentView("list");
      setActiveModule("ai_center");
      await runMeetingPipeline(
        segs,
        selectedMeeting.recording_started_at,
        selectedMeeting.id,
        roster
      );
    } finally {
      setIsRetranscribing(false);
    }
  };

  // ─── Dọn file ghi âm sau khi đã có biên bản ───
  const handleDeleteAudio = async (meeting: Meeting, afterExport = false) => {
    const confirmText = afterExport
      ? `Đã xuất biên bản Word xong.\n\nDọn luôn ${meeting.audio_paths?.length || 0} file ghi âm của cuộc họp này để tiết kiệm dung lượng?\n\nBản gỡ băng và toàn bộ biên bản VẪN ĐƯỢC GIỮ — chỉ mất khả năng nghe lại file gốc.`
      : `Xoá vĩnh viễn ${meeting.audio_paths?.length || 0} file ghi âm của cuộc họp này?\n\nBản gỡ băng và biên bản vẫn giữ nguyên, nhưng sẽ KHÔNG nghe lại được file gốc nữa. Thao tác này không hoàn tác được.`;

    if (!await dialog.confirm(confirmText, { title: "Dọn file ghi âm", tone: "danger", confirmText: "Xoá file ghi âm" })) return;

    setIsDeletingAudio(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await apiFetch("/api/meeting/delete-audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-supabase-auth": session?.access_token || "",
        },
        body: JSON.stringify({ meetingId: meeting.id }),
      });
      const data = await readJsonSafe(res, "Lỗi dọn file ghi âm");
      if (!res.ok) throw new Error(data.error || "Không dọn được file ghi âm.");

      await dialog.alert(data.message || "Đã dọn file ghi âm.", { tone: "success" });
      const { data: refreshed } = await supabase
        .from("meetings").select("*").eq("id", meeting.id).single();
      if (refreshed) setSelectedMeeting(refreshed);
      fetchMeetings();
    } catch (err: any) {
      await dialog.alert("Lỗi: " + err.message, { title: "Lỗi", tone: "danger" });
    } finally {
      setIsDeletingAudio(false);
    }
  };

  // Chạy lại bước GPT phân tích từ transcript đã gỡ băng sẵn (không tốn Whisper
  // lần nữa) — cứu các biên bản nháp bị lỗi lưu metadata trước đây.
  const [isReprocessing, setIsReprocessing] = useState(false);
  const handleReAnalyze = async () => {
    if (!selectedMeeting) return;
    const transcript = selectedMeeting.transcript_raw || editableTranscript;
    if (!transcript || transcript.trim().length === 0) {
      await dialog.alert("Biên bản này chưa có bản gỡ băng (transcript). Vui lòng tải file ghi âm và xử lý lại từ đầu.");
      return;
    }
    if (!openaiKey) {
      await dialog.alert("Vui lòng nhập OpenAI API Key trước khi phân tích!");
      return;
    }
    if (!await dialog.confirm("Chạy lại AI phân tích từ bản gỡ băng hiện có? Metadata, tóm tắt và bảng phân công sẽ được điền lại tự động.")) return;

    setIsReprocessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const processRes = await apiFetch("/api/meeting/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
          "x-supabase-auth": session?.access_token || "",
          "x-openai-model": meetingModel,
        },
        body: JSON.stringify({
          meetingId: selectedMeeting.id,
          transcriptRaw: transcript,
          // Danh sách người dự đã xác nhận trên biên bản -> AI không được bịa
          // thêm tên nào ngoài danh sách này.
          roster: [
            ...(selectedMeeting.chairperson ? [selectedMeeting.chairperson] : []),
            ...editableAttendees,
          ].filter(Boolean),
        })
      });

      const processData = await readJsonSafe(processRes, "Lỗi AI phân tích biên bản");
      if (!processRes.ok) throw new Error(processData.error || "Gặp lỗi khi GPT phân tích biên bản.");

      const { data: refreshed } = await supabase
        .from("meetings")
        .select("*")
        .eq("id", selectedMeeting.id)
        .single();

      fetchMeetings();
      if (refreshed) handleViewDetail(refreshed);
      await dialog.alert("AI đã phân tích lại và điền nội dung biên bản thành công!", { tone: "success" });
    } catch (err: any) {
      console.error("Re-analyze error:", err);
      await dialog.alert("Lỗi phân tích lại: " + err.message, { title: "Lỗi", tone: "danger" });
    } finally {
      setIsReprocessing(false);
    }
  };

  const handleSaveDraftEdits = async () => {
    if (!selectedMeeting) return;

    try {
      const { error } = await supabase
        .from("meetings")
        .update({
          title: editableTitle,
          meeting_date: editableDate,
          start_time: editableStartTime,
          end_time: editableEndTime,
          location: editableLocation,
          secretary: editableSecretary,
          attendees: editableAttendees,
          project_name: editableProject,
          package_name: editablePackage,
          distribution: editableDistribution,
          transcript_clean: editableTranscript,
          summary: editableSummary,
          action_items: editableActionItems
        })
        .eq("id", selectedMeeting.id);

      if (error) throw error;
      await dialog.alert("Đã lưu chỉnh sửa bản nháp thành công!", { tone: "success" });
      fetchMeetings();
    } catch (err: any) {
      console.error(err);
      await dialog.alert("Lỗi khi lưu bản nháp: " + err.message, { title: "Lỗi", tone: "danger" });
    }
  };

  // EXPLICIT EXPORT WORD FUNCTION
  const handleExportWordDocx = async () => {
    if (!selectedMeeting) return;

    try {
      setIsExporting(true);

      // Save draft edits first
      await supabase
        .from("meetings")
        .update({
          title: editableTitle,
          meeting_date: editableDate,
          start_time: editableStartTime,
          end_time: editableEndTime,
          location: editableLocation,
          secretary: editableSecretary,
          attendees: editableAttendees,
          project_name: editableProject,
          package_name: editablePackage,
          distribution: editableDistribution,
          transcript_clean: editableTranscript,
          summary: editableSummary,
          action_items: editableActionItems
        })
        .eq("id", selectedMeeting.id);

      // Call backend to generate DOCX
      const { data: { session: docxSession } } = await supabase.auth.getSession();
      const docxRes = await apiFetch("/api/meeting/export-docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-supabase-auth": docxSession?.access_token || ""
        },
        body: JSON.stringify({ meetingId: selectedMeeting.id })
      });
      
      const docxData = await readJsonSafe(docxRes, "Lỗi xuất file Word");
      if (!docxRes.ok) throw new Error(docxData.error || "Không thể biên dịch file Word.");

      const documentUrl = docxData.documentUrl;

      // Update selected meeting local state
      setSelectedMeeting({ ...selectedMeeting, document_url: documentUrl });

      // Trigger browser download
      const safeFilename = `Bien_Ban_Hop_${editableTitle.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
      await downloadFile(documentUrl, safeFilename);

      await dialog.alert("File Word biên bản họp đã được xuất và tải xuống thành công!", { tone: "success" });
      fetchMeetings();

      // Biên bản đã ra file — đây là lúc hợp lý nhất để hỏi dọn ghi âm, vì công
      // việc đã xong mà dung lượng thì đang chiếm chỗ. Chỉ hỏi khi biên bản đã
      // khoá và file ghi âm còn tồn tại (server vẫn kiểm tra lại điều kiện này).
      const canOfferCleanup =
        selectedMeeting.status === "confirmed" &&
        !selectedMeeting.audio_deleted_at &&
        (selectedMeeting.audio_paths?.length || 0) > 0;

      if (canOfferCleanup) {
        await handleDeleteAudio({ ...selectedMeeting, document_url: documentUrl }, true);
      }
    } catch (err: any) {
      console.error("Export Word error:", err);
      await dialog.alert("Lỗi khi xuất file Word: " + err.message, { title: "Lỗi", tone: "danger" });
    } finally {
      setIsExporting(false);
    }
  };

  const parseVietnameseDate = (dateStr: string): string | null => {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
      const day = match[1].padStart(2, "0");
      const month = match[2].padStart(2, "0");
      const year = match[3];
      return `${year}-${month}-${day}`;
    }
    return null;
  };

  const handleConfirmMeeting = async () => {
    if (!selectedMeeting) return;
    
    const confirm = await dialog.confirm("Xác nhận khóa biên bản họp? Hệ thống sẽ tạo Task tự động cho các bộ phận và xuất file Word biên bản họp.", { title: "Khoá biên bản", confirmText: "Khoá & tạo Task" });
    if (!confirm) return;

    try {
      setLoading(true);

      // 1. Save current state & status
      const { error: saveError } = await supabase
        .from("meetings")
        .update({
          title: editableTitle,
          meeting_date: editableDate,
          start_time: editableStartTime,
          end_time: editableEndTime,
          location: editableLocation,
          secretary: editableSecretary,
          attendees: editableAttendees,
          project_name: editableProject,
          package_name: editablePackage,
          distribution: editableDistribution,
          transcript_clean: editableTranscript,
          summary: editableSummary,
          action_items: editableActionItems,
          status: "confirmed"
        })
        .eq("id", selectedMeeting.id);

      if (saveError) throw saveError;

      // 2. Export Word document
      const { data: { session: docxSession } } = await supabase.auth.getSession();
      const docxRes = await apiFetch("/api/meeting/export-docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-supabase-auth": docxSession?.access_token || ""
        },
        body: JSON.stringify({ meetingId: selectedMeeting.id })
      });
      const docxData = await readJsonSafe(docxRes, "Lỗi xuất file Word");
      if (!docxRes.ok) throw new Error(docxData.error || "Không thể biên dịch file Word.");

      const documentUrl = docxData.documentUrl;

      // 3. Create database tasks
      if (editableActionItems.length > 0) {
        const tasksToInsert = editableActionItems
          .filter(item => !item.is_header && item.assignee && item.assignee.trim() !== "")
          .map(item => {
            const parsedDueDate = parseVietnameseDate(item.deadline);
            
            return {
              title: `[Họp] ${item.content}`,
            assignee: item.assignee || "Nhân viên",
            priority: "Trung bình",
            due_date: parsedDueDate,
            progress: 0,
            status: "planning",
            description: `Đầu việc được phân công từ biên bản cuộc họp: "${editableTitle}".\n\nNội dung công việc: ${item.content}\nNgười chịu trách nhiệm: ${item.assignee}\nPhối hợp: ${item.coop || "Không"}\nHạn hoàn thành: ${item.deadline}\n\nTải biên bản Word: ${documentUrl}`,
            start_date: editableDate || new Date().toISOString().split("T")[0],
            link: documentUrl,
            notes: JSON.stringify({
              meetingId: selectedMeeting.id,
              origin: "meeting-team",
              stt: item.stt
            })
          };
        });

        const { error: taskError } = await supabase
          .from("tasks")
          .insert(tasksToInsert);

        if (taskError) {
          console.error("Error creating tasks:", taskError);
          await dialog.alert("Biên bản được xác nhận nhưng gặp lỗi khi tự động tạo Task.", { title: "Cảnh báo", tone: "warning" });
        }
      }

      // Download docx file automatically
      const safeFilename = `Bien_Ban_Hop_${editableTitle.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
      await downloadFile(documentUrl, safeFilename);

      await dialog.alert("Biên bản họp đã được xác nhận và khóa thành công! Các Task công việc đã được tự động phân bổ.", { tone: "success" });
      
      // Reload details
      const { data: updatedMeeting } = await supabase
        .from("meetings")
        .select("*")
        .eq("id", selectedMeeting.id)
        .single();
      if (updatedMeeting) setSelectedMeeting(updatedMeeting);

      fetchMeetings();
    } catch (err: any) {
      console.error(err);
      await dialog.alert("Lỗi khi xác nhận biên bản: " + err.message, { title: "Lỗi", tone: "danger" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMeeting = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirm = await dialog.confirm("Bạn có chắc muốn xóa cuộc họp này cùng toàn bộ tệp đính kèm?", { title: "Xoá cuộc họp", tone: "danger", confirmText: "Xoá" });
    if (!confirm) return;

    try {
      setLoading(true);
      const meetingToDelete = meetings.find(m => m.id === id);
      
      if (meetingToDelete?.audio_url) {
        const audioUrl = meetingToDelete.audio_url.split("?")[0];
        const audioPath = audioUrl.substring(audioUrl.indexOf("/meetings/") + "/meetings/".length);
        await supabase.storage.from("meetings").remove([audioPath]);
      }

      if (meetingToDelete?.document_url) {
        // document_url carries a ?v= cache-buster — strip it to get the storage path
        const docUrl = meetingToDelete.document_url.split("?")[0];
        const docPath = docUrl.substring(docUrl.indexOf("/meetings/") + "/meetings/".length);
        await supabase.storage.from("meetings").remove([docPath]);
      }

      const { error } = await supabase
        .from("meetings")
        .delete()
        .eq("id", id);

      if (error) throw error;
      await dialog.alert("Đã xóa cuộc họp thành công!", { tone: "success" });
      fetchMeetings();
      if (selectedMeeting?.id === id) {
        setCurrentView("list");
        setSelectedMeeting(null);
      }
    } catch (err: any) {
      console.error(err);
      await dialog.alert("Lỗi khi xóa cuộc họp: " + err.message, { title: "Lỗi", tone: "danger" });
    } finally {
      setLoading(false);
    }
  };

  // Action Items Edit Logic
  const handleAddActionItem = () => {
    const numericStts = editableActionItems
      .map(item => Number(item.stt))
      .filter(num => !isNaN(num));
    const nextStt = numericStts.length > 0 ? Math.max(...numericStts) + 1 : 1;
    
    setEditableActionItems([
      ...editableActionItems,
      { stt: nextStt, content: "", assignee: "", coop: "", deadline: "Nắm chủ trương thực hiện" }
    ]);
  };

  const handleUpdateActionItemField = (index: number, field: keyof ActionItem, value: any) => {
    const updated = [...editableActionItems];
    updated[index] = { ...updated[index], [field]: value };
    setEditableActionItems(updated);
  };

  const handleDeleteActionItem = (index: number) => {
    const updated = editableActionItems.filter((_, idx) => idx !== index);
    const reindexed = updated.map((item, idx) => ({ ...item, stt: idx + 1 }));
    setEditableActionItems(reindexed);
  };

  const addAttendeeTag = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !editableAttendees.includes(trimmed)) {
      setEditableAttendees([...editableAttendees, trimmed]);
    }
    setEditableAttendeeInput("");
  };

  const removeAttendeeTag = (name: string) => {
    setEditableAttendees(editableAttendees.filter(a => a !== name));
  };

  // Filter meetings for Archive module
  const filteredMeetings = meetings.filter(m => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      m.title.toLowerCase().includes(searchLower) ||
      (m.project_name || "").toLowerCase().includes(searchLower) ||
      m.meeting_date.includes(searchLower);
      
    if (!matchesSearch) return false;

    if (archiveFilter === "draft") return m.status === "draft";
    if (archiveFilter === "confirmed") return m.status === "confirmed";
    return true;
  });

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Biên bản họp (Meeting Team)" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          
          {/* Top Banner with Module Navigation - Light Theme Styled */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#005BAC] to-[#00AEEF] flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                  <Mic size={18} />
                </div>
                <h2 className="text-lg font-heading font-bold text-slate-900">Meeting Team</h2>
              </div>

              {/* Module selection buttons */}
              <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/60 mt-1">
                <button
                  onClick={() => {
                    setActiveModule("archive");
                    setCurrentView("list");
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                    activeModule === "archive"
                      ? "bg-white text-[#005BAC] shadow-sm font-extrabold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Archive size={14} /> Hồ sơ biên bản họp
                </button>
                <button
                  onClick={() => {
                    setActiveModule("ai_center");
                    setCurrentView("list");
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                    activeModule === "ai_center"
                      ? "bg-gradient-to-r from-[#005BAC] to-[#00AEEF] text-white shadow-md shadow-blue-500/15 font-extrabold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Sparkles size={14} /> Trung tâm Xử lý AI
                </button>
              </div>
            </div>

            {/* Ô nhập API Key đã chuyển xuống cùng chỗ chọn model trong Trung
                tâm Xử lý AI — hai thứ này đều là cấu hình của cùng một lần chạy,
                để cạnh nhau thì khỏi phải nhớ ngó lên góc màn hình. */}
          </div>

          {/* LIST VIEWS */}
          {currentView === "list" && (
            <>
              {/* MODULE 1: HỒ SƠ BIÊN BẢN HỌP (ARCHIVE) */}
              {activeModule === "archive" && (
                <div className="space-y-4">
                  {/* Search and Tab Filters */}
                  <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => setArchiveFilter("all")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          archiveFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Tất cả ({meetings.length})
                      </button>
                      <button
                        onClick={() => setArchiveFilter("draft")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          archiveFilter === "draft" ? "bg-amber-50 text-amber-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Bản nháp ({meetings.filter(m => m.status === "draft").length})
                      </button>
                      <button
                        onClick={() => setArchiveFilter("confirmed")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          archiveFilter === "confirmed" ? "bg-emerald-50 text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Đã xác nhận ({meetings.filter(m => m.status === "confirmed").length})
                      </button>
                    </div>

                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input
                        type="text"
                        placeholder="Tìm kiếm tiêu đề, dự án, ngày họp..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs placeholder-slate-400"
                      />
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                      <Loader2 className="animate-spin text-blue-600" size={32} />
                      <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Đang tải hồ sơ biên bản...</span>
                    </div>
                  ) : filteredMeetings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200/80 shadow-sm text-center">
                      <Archive className="text-slate-300 mb-3" size={44} />
                      <h3 className="text-slate-700 font-bold text-sm">Chưa có tài liệu biên bản họp nào</h3>
                      <p className="text-slate-500 text-xs mt-1 max-w-sm">Chuyển sang tab "Trung tâm Xử lý AI" để kéo thả file ghi âm cuộc họp mới.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredMeetings.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => handleViewDetail(m)}
                          className="bg-white hover:border-blue-300 border border-slate-200/80 rounded-2xl p-5 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between group"
                        >
                          <div className="space-y-3">
                            <div className="flex justify-between items-start">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider uppercase ${
                                m.status === "confirmed" 
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}>
                                {m.status === "confirmed" ? "Đã khóa biên bản" : "Bản nháp"}
                              </span>
                              
                              <button
                                onClick={(e) => handleDeleteMeeting(m.id, e)}
                                className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                title="Xoá biên bản"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            <h3 className="font-heading font-bold text-slate-800 group-hover:text-[#005BAC] transition-colors text-base line-clamp-2 leading-snug">
                              {m.title}
                            </h3>

                            {m.project_name && (
                              <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 text-[10px] text-slate-600 px-2 py-0.5 rounded font-mono font-bold">
                                <Briefcase size={10} /> {m.project_name}
                              </span>
                            )}

                            <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 pt-2 border-t border-slate-100 text-slate-600 text-xs">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={13} className="text-slate-400" />
                                <span>{m.meeting_date}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock size={13} className="text-slate-400" />
                                <span>{m.start_time} - {m.end_time}</span>
                              </div>
                              <div className="flex items-center gap-1.5 col-span-2 truncate">
                                <User size={13} className="text-slate-400 flex-shrink-0" />
                                <span className="truncate">Chủ trì: {m.chairperson || "Chưa chọn"}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                            {m.document_url ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadFile(m.document_url, `Bien_Ban_Hop_${m.title.replace(/[^a-zA-Z0-9]/g, "_")}.docx`);
                                }}
                                className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 hover:underline"
                              >
                                <FileDown size={13} /> Tải file Word (.docx)
                              </button>
                            ) : (
                              <span className="text-[11px] text-amber-600 italic font-medium">Chưa xuất file Word</span>
                            )}
                            
                            <div className="flex items-center text-[#005BAC] text-xs font-bold group-hover:translate-x-1 transition-transform">
                              <span>Xem hồ sơ</span>
                              <ChevronRight size={14} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* MODULE 2: TRUNG TÂM XỬ LÝ MEETING AI */}
              {activeModule === "ai_center" && (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Panel: Chairperson Selection */}
                    <div className="md:col-span-1 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Người chủ trì cuộc họp (Bắt buộc)</label>
                        <select
                          value={chairperson}
                          onChange={(e) => setChairperson(e.target.value)}
                          disabled={isUploading || processingStep !== "idle"}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs font-semibold"
                        >
                          <option value="">-- Chọn nhân sự chủ trì --</option>
                          {employees.map(emp => (
                            <option key={`ai_chair_${emp.name}`} value={emp.name}>{emp.name} ({emp.role})</option>
                          ))}
                        </select>
                      </div>

                      {/* Chọn người dự họp: vừa chặn AI bịa tên, vừa là nguồn mẫu giọng */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                            Người dự họp
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowVoiceSamples(true)}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50"
                          >
                            <Volume2 size={11} /> Mẫu giọng
                          </button>
                        </div>
                        <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-2">
                          {employees.map(emp => {
                            const checked = participantIds.includes(emp.id);
                            return (
                              <label
                                key={`participant_${emp.id}`}
                                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-white"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={isUploading || processingStep !== "idle"}
                                  onChange={() =>
                                    setParticipantIds(prev =>
                                      checked ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
                                    )
                                  }
                                  className="h-3.5 w-3.5 accent-[#005BAC]"
                                />
                                <span className="truncate font-semibold text-slate-700">{emp.name}</span>
                                <span className="truncate text-slate-400">{emp.role}</span>
                                {emp.voice_sample_path && (
                                  <Volume2 size={11} className="ml-auto flex-shrink-0 text-emerald-600" />
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Chọn model phân tích */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                          Model AI dựng biên bản
                        </label>
                        <select
                          value={meetingModel}
                          onChange={(e) => {
                            const value = e.target.value as MeetingModelId;
                            setMeetingModel(value);
                            localStorage.setItem("openai_model_bien_ban_hop", value);
                          }}
                          disabled={isUploading || processingStep !== "idle"}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
                        >
                          {MEETING_MODELS.map(m => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>

                        {/* Khoá API đứng ngay dưới model: cùng là cấu hình của
                            một lần chạy, và nếu thiếu khoá thì chọn model gì
                            cũng không chạy được. */}
                        <div className="pt-2">
                          <label className="mb-1 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                            <span>OpenAI API Key</span>
                            {openaiKey ? (
                              <span className="flex items-center gap-1 font-bold normal-case tracking-normal text-emerald-600">
                                <Check size={11} /> Đã lưu
                              </span>
                            ) : (
                              <span className="font-bold normal-case tracking-normal text-amber-600">Chưa có khoá</span>
                            )}
                          </label>
                          <input
                            type="password"
                            placeholder="sk-..."
                            value={openaiKey}
                            onChange={(e) => {
                              setOpenaiKey(e.target.value);
                              localStorage.setItem("openai_api_key_hanh_chinh", e.target.value);
                            }}
                            disabled={isUploading || processingStep !== "idle"}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none disabled:opacity-60"
                          />
                        </div>
                      </div>

                    </div>

                    {/* Right Panel: Ghi âm trực tiếp HOẶC tải file lên */}
                    <div className="md:col-span-2 flex flex-col justify-between">
                      {/* Chuyển giữa 2 đường vào */}
                      <div className="mb-3 flex gap-1 rounded-xl border border-slate-200 bg-slate-100/70 p-1">
                        {([
                          { id: "record" as const, label: "Ghi âm trực tiếp", icon: <Mic size={13} /> },
                          { id: "upload" as const, label: "Tải file có sẵn", icon: <UploadCloud size={13} /> },
                        ]).map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setIntakeMode(tab.id)}
                            disabled={isUploading || processingStep !== "idle"}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                              intakeMode === tab.id
                                ? "bg-white text-[#005BAC] shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            {tab.icon} {tab.label}
                          </button>
                        ))}
                      </div>

                      {intakeMode === "record" ? (
                        <div className="space-y-2">
                          {/* Bản ghi xong nhưng còn thiếu thông tin để chạy AI.
                              File đã nằm an toàn trên Storage — chỉ chờ điền nốt. */}
                          {pendingRecording && (
                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-900">
                              <div className="flex items-start gap-2">
                                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0 text-blue-600" />
                                <span>
                                  Đã lưu an toàn <b>{pendingRecording.segments.length} đoạn ghi âm</b>.
                                  {(!chairperson || !openaiKey) && (
                                    <> Còn thiếu
                                      {!chairperson && <b> người chủ trì</b>}
                                      {!chairperson && !openaiKey && " và"}
                                      {!openaiKey && <b> OpenAI API Key</b>}
                                      {" "}ở cột bên trái.</>
                                  )}
                                </span>
                              </div>
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => processRecording(pendingRecording.startedAt, pendingRecording.segments)}
                                  disabled={!chairperson || !openaiKey || isUploading}
                                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#005BAC] to-[#00AEEF] px-3 py-1.5 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Sparkles size={12} /> Chạy AI dựng biên bản
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (await dialog.confirm("Bỏ bản ghi này? File ghi âm sẽ nằm lại trong kho lưu trữ nhưng không có biên bản nào dùng tới.")) {
                                      setPendingRecording(null);
                                    }
                                  }}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600"
                                >
                                  Bỏ qua
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Nhắc nhẹ, KHÔNG khoá nút: cuộc họp bắt đầu là ghi
                              được ngay, hai mục này chỉ cần trước khi bấm Kết thúc. */}
                          {!pendingRecording && (!openaiKey || !chairperson) && (
                            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                              <span>
                                {!chairperson && !openaiKey
                                  ? "Hãy chọn người chủ trì cuộc họp và nhập OpenAI API Key"
                                  : !chairperson
                                  ? "Hãy chọn người chủ trì cuộc họp"
                                  : "Hãy nhập OpenAI API Key"}
                              </span>
                            </div>
                          )}

                          <MeetingRecorder
                            disabled={isUploading || processingStep !== "idle"}
                            onFinish={handleRecordingFinished}
                          />
                        </div>
                      ) : (
                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Kéo thả file ghi âm cuộc họp</label>
                        <div
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onClick={() => {
                            if (!isUploading && processingStep === "idle") {
                              fileInputRef.current?.click();
                            }
                          }}
                          className={`border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl p-10 text-center transition-all flex flex-col items-center justify-center space-y-3 group ${
                            isUploading || processingStep !== "idle" 
                              ? "cursor-not-allowed opacity-60" 
                              : "cursor-pointer hover:border-blue-500 hover:bg-blue-50/30"
                          }`}
                        >
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            accept="audio/*"
                            multiple
                            disabled={isUploading || processingStep !== "idle"}
                            className="hidden"
                          />
                          <UploadCloud className="text-slate-400 group-hover:text-[#005BAC] group-hover:scale-110 transition-all duration-300" size={44} />
                          
                          {audioFiles.length > 0 ? (
                            <div className="space-y-2 w-full">
                              <p className="text-[#005BAC] text-xs font-bold text-center">{audioFiles.length} file đã chọn ({(audioFiles.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(2)} MB)</p>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {audioFiles.map((file, idx) => (
                                  <div key={`file_${idx}`} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px]">
                                    <span className="flex items-center gap-1.5 text-slate-700 truncate">
                                      <FileAudio size={13} className="text-[#005BAC] flex-shrink-0" />
                                      <span className="truncate">{file.name}</span>
                                      <span className="text-slate-400 flex-shrink-0">({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setAudioFiles(prev => prev.filter((_, i) => i !== idx)); }}
                                      className="text-slate-400 hover:text-rose-500 ml-2 flex-shrink-0"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <p className="text-[10px] text-slate-400 text-center">Click để thêm file • Kéo thả nhiều file cùng lúc</p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-slate-700 text-xs font-bold">Thả file âm thanh họp vào đây, hoặc nhấp để tải file</p>
                              <p className="text-[11px] text-slate-400">Hỗ trợ MP3, WAV, M4A — mỗi file tối đa 25MB (trần cứng của OpenAI)</p>
                            </div>
                          )}
                        </div>
                      </div>
                      )}

                      {/* Processing status logs */}
                      {(isUploading || processingStep !== "idle") && (
                        <div className="mt-4 p-4 bg-slate-900 text-cyan-400 rounded-xl space-y-3 font-mono text-[10px]">
                          <div className="flex items-center gap-2 text-white font-bold pb-2 border-b border-slate-800 text-xs">
                            <Loader2 className="animate-spin text-cyan-400" size={14} /> Tiến trình xử lý AI...
                          </div>
                          <div className="space-y-1 max-h-36 overflow-y-auto">
                            {processingLog.map((log, i) => (
                              <div key={`console_${i}`}>&gt; {log}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Button — chỉ cho luồng tải file; luồng ghi âm
                          có nút "Kết thúc & gỡ băng" nằm trong chính bộ ghi âm */}
                      {processingStep === "idle" && intakeMode === "upload" && (
                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                          <button
                            type="button"
                            onClick={() => {
                              setAudioFiles([]);
                              setChairperson("");
                              setParticipantIds([]);
                            }}
                            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                          >
                            Xóa chọn
                          </button>
                          <button
                            type="button"
                            onClick={handleIntakeAndProcess}
                            disabled={audioFiles.length === 0 || !chairperson}
                            className="px-6 py-2.5 bg-gradient-to-r from-[#005BAC] to-[#00AEEF] hover:from-blue-700 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-blue-500/15"
                          >
                            <Sparkles size={14} /> Gửi & Bắt đầu AI Phân tích tự động
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ━━━ VIEW: DETAIL & HUMAN REVIEW LAYER ━━━ */}
          {currentView === "detail" && selectedMeeting && (
            <div className="space-y-6">
              
              {/* Review Header Banner with Explicit Word Export Button */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <button
                  onClick={() => {
                    setCurrentView("list");
                    setSelectedMeeting(null);
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors font-bold"
                >
                  <ArrowLeft size={15} /> Quay lại danh sách
                </button>

                {/* PROMINENT EXPORT WORD BUTTON & ACTIONS */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* EXPLICIT EXPORT WORD BUTTON */}
                  <button
                    onClick={handleExportWordDocx}
                    disabled={isExporting}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm active:scale-[0.97]"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="animate-spin" size={14} /> Đang xuất Word...
                      </>
                    ) : (
                      <>
                        <FileDown size={15} /> Xuất File Biên Bản Word (.docx)
                      </>
                    )}
                  </button>

                  {selectedMeeting.status === "draft" && (
                    <>
                      {/* Gỡ băng lại: cứu biên bản khi khâu gỡ băng hỏng giữa
                          chừng mà file ghi âm vẫn còn trên server */}
                      {!selectedMeeting.audio_deleted_at &&
                        ((selectedMeeting.audio_segments?.length || 0) > 0 ||
                          (selectedMeeting.audio_paths?.length || 0) > 0) && (
                          <button
                            onClick={handleRetranscribe}
                            disabled={isRetranscribing || isUploading}
                            title="Chạy lại khâu gỡ băng từ file ghi âm đã lưu trên server"
                            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.97] disabled:opacity-50"
                          >
                            {isRetranscribing ? (
                              <><Loader2 className="animate-spin" size={14} /> Đang gỡ băng...</>
                            ) : (
                              <><Mic size={14} /> Gỡ băng lại</>
                            )}
                          </button>
                        )}
                      <button
                        onClick={handleReAnalyze}
                        disabled={isReprocessing}
                        className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-[0.97] disabled:opacity-50"
                      >
                        {isReprocessing ? (
                          <>
                            <Loader2 className="animate-spin" size={14} /> Đang phân tích...
                          </>
                        ) : (
                          <>
                            <Brain size={14} /> Phân tích lại bằng AI
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleSaveDraftEdits}
                        className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        Lưu nháp
                      </button>
                      <button
                        onClick={handleConfirmMeeting}
                        className="px-4 py-2 bg-gradient-to-r from-[#005BAC] to-[#00AEEF] hover:from-blue-700 hover:to-cyan-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/15 active:scale-[0.97]"
                      >
                        <FileCheck size={14} /> Khóa biên bản & Tạo Task
                      </button>
                    </>
                  )}

                  {/* Dọn file ghi âm — chỉ hiện khi biên bản đã khoá và audio còn */}
                  {selectedMeeting.status === "confirmed" &&
                    !selectedMeeting.audio_deleted_at &&
                    (selectedMeeting.audio_paths?.length || 0) > 0 && (
                      <button
                        onClick={() => handleDeleteAudio(selectedMeeting)}
                        disabled={isDeletingAudio}
                        title="Xoá file ghi âm gốc, giữ nguyên bản gỡ băng và biên bản"
                        className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 shadow-sm transition-all hover:bg-amber-100 active:scale-[0.97] disabled:opacity-50"
                      >
                        {isDeletingAudio ? (
                          <><Loader2 className="animate-spin" size={14} /> Đang dọn...</>
                        ) : (
                          <><Trash size={14} /> Dọn file ghi âm ({selectedMeeting.audio_paths.length})</>
                        )}
                      </button>
                    )}

                  {selectedMeeting.audio_deleted_at && (
                    <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
                      Đã dọn ghi âm {new Date(selectedMeeting.audio_deleted_at).toLocaleDateString("vi-VN")}
                      {selectedMeeting.audio_deleted_by ? ` · ${selectedMeeting.audio_deleted_by}` : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* ━━━ GÁN TÊN NGƯỜI NÓI ━━━
                  Khâu gỡ băng tách được giọng ai ra giọng nấy, nhưng chỉ tự gọi
                  đúng tên với những người đã lưu mẫu giọng. Số còn lại mang nhãn
                  máy (Speaker 1/2/3) — thư ký nghe vài giây rồi gán tên, sau đó
                  bấm "Phân tích lại bằng AI" để biên bản dùng tên thật. */}
              {detectedSpeakers.length > 0 && selectedMeeting.status === "draft" && (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <h3 className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    <Users size={14} className="text-[#005BAC]" /> Gán tên người nói
                  </h3>
                  <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                    AI đã tách được {detectedSpeakers.length} giọng nói khác nhau. Gán tên xong hãy bấm
                    &quot;Phân tích lại bằng AI&quot; để biên bản ghi tên thật thay cho nhãn máy.
                  </p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {detectedSpeakers.map(sp => {
                      const sample = (selectedMeeting.transcript_segments || [])
                        .find(s => s.speaker === sp)?.text || "";
                      return (
                        <div key={`sp_${sp}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                              {sp}
                            </span>
                            <select
                              value={speakerMapDraft[sp] || ""}
                              onChange={(e) =>
                                setSpeakerMapDraft(prev => ({ ...prev, [sp]: e.target.value }))
                              }
                              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                            >
                              <option value="">-- Chưa rõ, giữ nhãn máy --</option>
                              {employees.map(emp => (
                                <option key={`sp_${sp}_${emp.id}`} value={emp.name}>
                                  {emp.name} ({emp.role})
                                </option>
                              ))}
                            </select>
                          </div>
                          <p className="line-clamp-2 text-[10px] italic leading-relaxed text-slate-500">
                            &ldquo;{sample.slice(0, 140)}{sample.length > 140 ? "..." : ""}&rdquo;
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={handleSaveSpeakerMap}
                    className="mt-3 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-900"
                  >
                    Lưu tên người nói
                  </button>
                </div>
              )}

              {/* Review Panel Body */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column: Metadata review */}
                <div className="lg:col-span-1 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <FileEdit size={14} className="text-[#005BAC]" /> Metadata cuộc họp
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider uppercase border ${
                      selectedMeeting.status === "confirmed" 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {selectedMeeting.status === "confirmed" ? "Đã khóa" : "Bản nháp"}
                    </span>
                  </div>

                  {selectedMeeting.status === "draft" ? (
                    <div className="space-y-3 text-xs">
                      {/* Tiêu đề */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Tên cuộc họp</label>
                        <input
                          type="text"
                          value={editableTitle}
                          onChange={(e) => setEditableTitle(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                        />
                      </div>
                      
                      {/* Ngày họp */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày họp</label>
                        <input
                          type="date"
                          value={editableDate}
                          onChange={(e) => setEditableDate(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                        />
                      </div>

                      {/* Giờ họp */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Giờ bắt đầu</label>
                          <input
                            type="text"
                            value={editableStartTime}
                            onChange={(e) => setEditableStartTime(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Giờ kết thúc</label>
                          <input
                            type="text"
                            value={editableEndTime}
                            onChange={(e) => setEditableEndTime(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                          />
                        </div>
                      </div>

                      {/* Địa điểm */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Địa điểm</label>
                        <input
                          type="text"
                          value={editableLocation}
                          onChange={(e) => setEditableLocation(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                        />
                      </div>

                      {/* Dự án & Gói thầu */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Dự án</label>
                          <input
                            type="text"
                            value={editableProject}
                            onChange={(e) => setEditableProject(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Gói thầu</label>
                          <input
                            type="text"
                            value={editablePackage}
                            onChange={(e) => setEditablePackage(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                          />
                        </div>
                      </div>

                      {/* Thư ký */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Thư ký</label>
                        <input
                          type="text"
                          value={editableSecretary}
                          onChange={(e) => setEditableSecretary(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                        />
                      </div>

                      {/* Thành phần tham dự tags */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Thành phần tham dự</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={editableAttendeeInput}
                            onChange={(e) => setEditableAttendeeInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addAttendeeTag(editableAttendeeInput);
                              }
                            }}
                            placeholder="Thêm người tham gia..."
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                          />
                        </div>
                        
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {editableAttendees.map(att => (
                            <span key={`review_att_${att}`} className="bg-blue-50 border border-blue-200 text-[#005BAC] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              {att}
                              <button type="button" onClick={() => removeAttendeeTag(att)} className="text-slate-400 hover:text-rose-600">×</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Confirmed metadata
                    <div className="space-y-3 text-xs text-slate-700">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Tiêu đề cuộc họp</span>
                        <span className="text-sm font-bold text-slate-900">{selectedMeeting.title}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Ngày họp</span>
                          <span>{selectedMeeting.meeting_date}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Thời gian</span>
                          <span>{selectedMeeting.start_time} - {selectedMeeting.end_time}</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Chủ trì</span>
                        <span className="font-bold text-[#005BAC]">{selectedMeeting.chairperson}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Thành viên tham dự</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedMeeting.attendees?.map(att => (
                            <span key={`det_att_lbl_${att}`} className="bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                              {att}
                            </span>
                          )) || <span className="italic">Không có</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {!selectedMeeting.audio_deleted_at && audioSegments.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 text-xs space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Audio ghi âm
                        {audioSegments.length > 1 && ` — đoạn ${playingSegment + 1}/${audioSegments.length}`}
                      </span>
                      <audio
                        ref={audioRef}
                        controls
                        onLoadedMetadata={handleAudioLoaded}
                        src={segmentUrl(audioSegments[playingSegment]?.path)}
                        className="w-full h-8 mt-1 rounded bg-slate-50"
                      />
                      <p className="text-[10px] text-slate-400">
                        Bấm mốc giờ ở cột bên phải để tua thẳng tới đoạn phát biểu tương ứng.
                      </p>
                    </div>
                  )}

                  {/* Biên bản cũ chưa có bản đồ đoạn -> vẫn cho nghe file gốc */}
                  {!selectedMeeting.audio_deleted_at && audioSegments.length === 0 && selectedMeeting.audio_url && (
                    <div className="pt-3 border-t border-slate-100 text-xs space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Audio Ghi Âm</span>
                      <audio controls src={selectedMeeting.audio_url} className="w-full h-8 mt-1 rounded bg-slate-50" />
                    </div>
                  )}

                  {selectedMeeting.audio_deleted_at && (
                    <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                      File ghi âm đã được dọn để tiết kiệm dung lượng. Bản gỡ băng và biên bản vẫn đầy đủ.
                    </div>
                  )}
                </div>

                {/* Right Column: Editable Tabs */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-5">
                    
                    {/* Navigation Tab */}
                    <div className="flex border-b border-slate-200 pb-2">
                      <button
                        onClick={() => setReviewTab("tasks")}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                          reviewTab === "tasks"
                            ? "bg-blue-50 text-[#005BAC] border border-blue-200"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Bảng phân công việc
                      </button>
                      <button
                        onClick={() => setReviewTab("transcript")}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                          reviewTab === "transcript"
                            ? "bg-blue-50 text-[#005BAC] border border-blue-200"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Nội dung chi tiết cuộc họp
                      </button>
                      <button
                        onClick={() => setReviewTab("summary")}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                          reviewTab === "summary"
                            ? "bg-blue-50 text-[#005BAC] border border-blue-200"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Tóm tắt AI
                      </button>
                    </div>

                    {/* TAB 1: ACTION ITEMS */}
                    {reviewTab === "tasks" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Bảng phân công nhiệm vụ chi tiết từ cuộc họp.</span>
                          
                          {selectedMeeting.status === "draft" && (
                            <button
                              type="button"
                              onClick={handleAddActionItem}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border border-slate-200"
                            >
                              <Plus size={13} /> Thêm việc
                            </button>
                          )}
                        </div>

                        {editableActionItems.length === 0 ? (
                          <div className="flex flex-col items-center justify-center p-12 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                            <AlertCircle className="text-slate-400 mb-2" size={32} />
                            <span className="text-slate-600 text-xs font-bold">Không tìm thấy đầu việc phân công nào.</span>
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-extrabold tracking-wider">
                                  <th className="px-3 py-3 text-center w-12">STT</th>
                                  <th className="px-4 py-3">Nội dung công việc</th>
                                  <th className="px-4 py-3 w-44">Người thực hiện</th>
                                  <th className="px-4 py-3 w-36">Phối hợp</th>
                                  <th className="px-4 py-3 w-32">Thời hạn</th>
                                  {selectedMeeting.status === "draft" && <th className="px-3 py-3 text-center w-12"></th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {editableActionItems.map((item, index) => {
                                  const isHeader = item.is_header || (typeof item.stt === "string" && isNaN(Number(item.stt)));
                                  return (
                                    <tr key={`item_${index}`} className={isHeader ? "bg-slate-100/80 font-bold border-t border-slate-200" : "hover:bg-slate-50/50"}>
                                      <td className="px-3 py-2.5 text-center font-bold text-slate-700">{item.stt}</td>
                                      <td className="px-4 py-2.5 text-xs text-slate-800" colSpan={isHeader ? 4 : 1}>
                                        {selectedMeeting.status === "draft" ? (
                                          isHeader ? (
                                            <input
                                              type="text"
                                              value={item.content}
                                              onChange={(e) => handleUpdateActionItemField(index, "content", e.target.value)}
                                              className="w-full bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-none font-extrabold text-[#005BAC]"
                                            />
                                          ) : (
                                            /* Nội dung công việc được yêu cầu viết 2-4 câu, nhét
                                               vào <input> một dòng thì bị cắt cụt — không đọc
                                               hết thì không soát được biên bản trước khi khoá. */
                                            <textarea
                                              value={item.content}
                                              onChange={(e) => handleUpdateActionItemField(index, "content", e.target.value)}
                                              rows={3}
                                              className="w-full min-w-[280px] resize-y rounded-lg border border-slate-200 bg-transparent px-2 py-1.5 text-xs leading-relaxed text-slate-800 focus:border-blue-500 focus:outline-none"
                                            />
                                          )
                                        ) : (
                                          <span className={`block ${isHeader ? "font-extrabold text-[#005BAC]" : "text-slate-800"}`}>{item.content}</span>
                                        )}

                                        {/* Mốc trích dẫn: bấm là tua thẳng tới đoạn
                                            phát biểu mà AI căn cứ để viết dòng này.
                                            Đây là thứ biến "AI có thể viết sai" thành
                                            "sai thì kiểm chứng được trong vài giây". */}
                                        {!isHeader &&
                                          typeof item.ts === "number" &&
                                          audioSegments.length > 0 &&
                                          !selectedMeeting.audio_deleted_at && (
                                            <button
                                              type="button"
                                              onClick={() => seekToTs(item.ts as number)}
                                              title="Nghe lại đoạn ghi âm gốc của nội dung này"
                                              className="mt-1 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                                            >
                                              <Play size={9} /> {formatTs(item.ts)}
                                            </button>
                                          )}
                                      </td>
                                      {!isHeader && (
                                        <>
                                          <td className="px-4 py-2.5">
                                            {selectedMeeting.status === "draft" ? (
                                              <select
                                                value={item.assignee}
                                                onChange={(e) => handleUpdateActionItemField(index, "assignee", e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 focus:outline-none text-slate-800 text-xs"
                                              >
                                                <option value="">Chọn nhân sự...</option>
                                                {employees.map(emp => (
                                                  <option key={`review_emp_${index}_${emp.name}`} value={emp.name}>{emp.name}</option>
                                                ))}
                                                <option value="BĐH">BĐH (Ban Điều Hành)</option>
                                                <option value="P. QLDA">P. QLDA</option>
                                                <option value="P. KHĐT">P. KHĐT</option>
                                                <option value="P. VTTB">P. VTTB</option>
                                                <option value="Tất cả">Tất cả</option>
                                              </select>
                                            ) : (
                                              <span className="font-bold text-[#005BAC]">{item.assignee}</span>
                                            )}
                                          </td>
                                          <td className="px-4 py-2.5">
                                            {selectedMeeting.status === "draft" ? (
                                              <input
                                                type="text"
                                                value={item.coop}
                                                onChange={(e) => handleUpdateActionItemField(index, "coop", e.target.value)}
                                                className="w-full bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-none text-slate-800"
                                              />
                                            ) : (
                                              <span className="text-slate-500">{item.coop || "-"}</span>
                                            )}
                                          </td>
                                          <td className="px-4 py-2.5">
                                            {selectedMeeting.status === "draft" ? (
                                              <input
                                                type="text"
                                                value={item.deadline}
                                                onChange={(e) => handleUpdateActionItemField(index, "deadline", e.target.value)}
                                                className="w-full bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-none text-slate-800 font-mono text-[11px]"
                                              />
                                            ) : (
                                              <span className="text-amber-700 font-bold font-mono">{item.deadline}</span>
                                            )}
                                          </td>
                                        </>
                                      )}
                                      {selectedMeeting.status === "draft" && (
                                        <td className="px-3 py-2.5 text-center">
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteActionItem(index)}
                                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 2: TRANSCRIPT */}
                    {reviewTab === "transcript" && (
                      <div className="space-y-4">
                        {selectedMeeting.status === "draft" ? (
                          <textarea
                            value={editableTranscript}
                            onChange={(e) => setEditableTranscript(e.target.value)}
                            rows={16}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs font-mono leading-relaxed resize-y"
                          />
                        ) : (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-[440px] overflow-y-auto text-xs font-mono leading-relaxed whitespace-pre-wrap text-slate-800">
                            {selectedMeeting.transcript_clean || selectedMeeting.transcript_raw || "Không có nội dung."}
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 3: SUMMARY */}
                    {reviewTab === "summary" && (
                      <div className="space-y-4">
                        {selectedMeeting.status === "draft" ? (
                          <textarea
                            value={editableSummary}
                            onChange={(e) => setEditableSummary(e.target.value)}
                            rows={14}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs leading-relaxed resize-y"
                          />
                        ) : (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-[380px] overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-slate-800">
                            {selectedMeeting.summary || "Không có tóm tắt cuộc họp."}
                          </div>
                        )}
                      </div>
                    )}
                    
                  </div>
                </div>

              </div>
            </div>
          )}

          {showVoiceSamples && (
            <VoiceSampleManager
              employees={employees}
              onClose={() => setShowVoiceSamples(false)}
              onChanged={fetchEmployees}
            />
          )}

        </main>
      </div>
    </div>
  );
}
