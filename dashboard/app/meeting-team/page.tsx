"use client";

import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
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
  Info,
  Archive,
  Brain,
  FileDown,
  FileCheck,
  FileEdit,
  Download,
  Play,
  Sparkles
} from "lucide-react";

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
  transcript_raw: string;
  transcript_clean: string;
  summary: string;
  action_items: ActionItem[];
  document_url: string;
  status: "draft" | "confirmed";
  distribution: string;
}

interface ActionItem {
  stt: number;
  content: string;
  assignee: string;
  coop: string;
  deadline: string;
}

export default function MeetingTeamPage() {
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
  const [audioFile, setAudioFile] = useState<File | null>(null);
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
      const { data, error } = await supabase
        .from("employees")
        .select("name, role, department")
        .order("name", { ascending: true });
      if (error) throw error;
      setEmployees(data || []);
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
          .from("employees")
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setAudioFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0]);
    }
  };

  // Simplified Intake: Only Chairperson + Audio Upload
  const handleIntakeAndProcess = async () => {
    if (!audioFile) {
      alert("Vui lòng kéo thả hoặc chọn file ghi âm cuộc họp!");
      return;
    }
    if (!openaiKey) {
      alert("Vui lòng cấu hình OpenAI API Key ở góc trên bên phải trước khi xử lý!");
      return;
    }
    if (!chairperson) {
      alert("Vui lòng chọn người chủ trì cuộc họp!");
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setProcessingStep("stt");
    setProcessingLog(["[1/5] Bắt đầu tải file ghi âm lên private storage...", `File: ${audioFile.name} (${(audioFile.size / (1024 * 1024)).toFixed(2)} MB)`]);

    try {
      // 1. Upload audio to Storage
      const cleanName = audioFile.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const filePath = `recordings/${Date.now()}_${cleanName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("meetings")
        .upload(filePath, audioFile, {
          cacheControl: "3600",
          upsert: true
        });

      if (uploadError) throw new Error(`Lỗi upload file âm thanh: ${uploadError.message}`);
      
      setUploadProgress(100);
      setProcessingLog(prev => [...prev, "[2/5] Upload file ghi âm thành công!", "Khởi tạo biên bản nháp trong cơ sở dữ liệu..."]);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage.from("meetings").getPublicUrl(filePath);

      // Create draft meeting
      const today = new Date().toISOString().split("T")[0];
      const { data: draftMeeting, error: dbError } = await supabase
        .from("meetings")
        .insert([{
          title: `Biên bản họp ngày ${today} (Đang xử lý)`,
          meeting_date: today,
          chairperson,
          audio_url: publicUrl,
          status: "draft",
          distribution: "P. KHĐT, P. QLDA, P. VTTB; Lưu: HCNS."
        }])
        .select()
        .single();

      if (dbError) throw dbError;
      
      setProcessingLog(prev => [...prev, `[3/5] Khởi tạo biên bản nháp thành công (ID: ${draftMeeting.id}).`, "Bắt đầu gỡ băng tự động bằng Whisper API..."]);

      // 2. Call Whisper transcribe API
      const transcribeRes = await fetch("/api/meeting/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          meetingId: draftMeeting.id,
          audioPath: filePath
        })
      });

      const transcribeData = await transcribeRes.json();
      if (!transcribeRes.ok) throw new Error(transcribeData.error || "Gặp lỗi khi Whisper gỡ băng âm thanh.");

      const rawTranscript = transcribeData.text;
      setProcessingLog(prev => [...prev, `[4/5] Gỡ băng thành công. Trích xuất được ${rawTranscript.length} ký tự văn bản thô.`, "Bắt đầu chạy AI phân tích nội dung cuộc họp..."]);
      setProcessingStep("ai");

      // 3. Call AI process API
      const processRes = await fetch("/api/meeting/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          meetingId: draftMeeting.id,
          transcriptRaw: rawTranscript
        })
      });

      const processData = await processRes.json();
      if (!processRes.ok) throw new Error(processData.error || "Gặp lỗi khi GPT phân tích biên bản.");

      setProcessingLog(prev => [...prev, "[5/5] Xử lý AI hoàn thành thành công!", "Tự động điền metadata, bản tóm tắt và phân công công việc...", "Đang điều hướng sang màn hình Review biên bản..."]);
      setProcessingStep("done");

      // Fetch the fully updated meeting
      const { data: finalMeeting } = await supabase
        .from("meetings")
        .select("*")
        .eq("id", draftMeeting.id)
        .single();

      fetchMeetings();
      
      if (finalMeeting) {
        setTimeout(() => {
          handleViewDetail(finalMeeting);
          setAudioFile(null);
          setChairperson("");
          setProcessingStep("idle");
          setProcessingLog([]);
        }, 1200);
      }
    } catch (err: any) {
      console.error(err);
      setProcessingLog(prev => [...prev, `❌ LỖI: ${err.message}`]);
      setProcessingStep("idle");
      alert(err.message || "Đã xảy ra lỗi trong quy trình xử lý tự động.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleViewDetail = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    
    // Set editable states
    setEditableTitle(meeting.title || "");
    setEditableDate(meeting.meeting_date || "");
    setEditableStartTime(meeting.start_time || "09:00");
    setEditableEndTime(meeting.end_time || "10:30");
    setEditableLocation(meeting.location || "");
    setEditableSecretary(meeting.secretary || "");
    setEditableAttendees(meeting.attendees || []);
    setEditableProject(meeting.project_name || "");
    setEditablePackage(meeting.package_name || "");
    setEditableDistribution(meeting.distribution || "P. KHĐT, P. QLDA, P. VTTB; Lưu: HCNS.");
    setEditableTranscript(meeting.transcript_clean || meeting.transcript_raw || "");
    setEditableSummary(meeting.summary || "");
    setEditableActionItems(meeting.action_items || []);
    
    setReviewTab("tasks");
    setCurrentView("detail");
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
      alert("Đã lưu chỉnh sửa bản nháp thành công!");
      fetchMeetings();
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi lưu bản nháp: " + err.message);
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
      const docxRes = await fetch("/api/meeting/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: selectedMeeting.id })
      });
      
      const docxData = await docxRes.json();
      if (!docxRes.ok) throw new Error(docxData.error || "Không thể biên dịch file Word.");

      const documentUrl = docxData.documentUrl;

      // Update selected meeting local state
      setSelectedMeeting({ ...selectedMeeting, document_url: documentUrl });

      // Trigger browser download
      const safeFilename = `Bien_Ban_Hop_${editableTitle.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
      await downloadFile(documentUrl, safeFilename);

      alert("File Word biên bản họp đã được xuất và tải xuống thành công!");
      fetchMeetings();
    } catch (err: any) {
      console.error("Export Word error:", err);
      alert("Lỗi khi xuất file Word: " + err.message);
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
    
    const confirm = window.confirm("Xác nhận khóa biên bản họp? Hệ thống sẽ tạo Task tự động cho các bộ phận và xuất file Word biên bản họp.");
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
      const docxRes = await fetch("/api/meeting/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: selectedMeeting.id })
      });
      const docxData = await docxRes.json();
      if (!docxRes.ok) throw new Error(docxData.error || "Không thể biên dịch file Word.");

      const documentUrl = docxData.documentUrl;

      // 3. Create database tasks
      if (editableActionItems.length > 0) {
        const tasksToInsert = editableActionItems.map(item => {
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
          alert("Biên bản được xác nhận nhưng gặp lỗi khi tự động tạo Task.");
        }
      }

      // Download docx file automatically
      const safeFilename = `Bien_Ban_Hop_${editableTitle.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
      await downloadFile(documentUrl, safeFilename);

      alert("Biên bản họp đã được xác nhận và khóa thành công! Các Task công việc đã được tự động phân bổ.");
      
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
      alert("Lỗi khi xác nhận biên bản: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMeeting = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirm = window.confirm("Bạn có chắc muốn xóa cuộc họp này cùng toàn bộ tệp đính kèm?");
    if (!confirm) return;

    try {
      setLoading(true);
      const meetingToDelete = meetings.find(m => m.id === id);
      
      if (meetingToDelete?.audio_url) {
        const audioUrl = meetingToDelete.audio_url;
        const audioPath = audioUrl.substring(audioUrl.indexOf("/meetings/") + "/meetings/".length);
        await supabase.storage.from("meetings").remove([audioPath]);
      }

      if (meetingToDelete?.document_url) {
        const docUrl = meetingToDelete.document_url;
        const docPath = docUrl.substring(docUrl.indexOf("/meetings/") + "/meetings/".length);
        await supabase.storage.from("meetings").remove([docPath]);
      }

      const { error } = await supabase
        .from("meetings")
        .delete()
        .eq("id", id);

      if (error) throw error;
      alert("Đã xóa cuộc họp thành công!");
      fetchMeetings();
      if (selectedMeeting?.id === id) {
        setCurrentView("list");
        setSelectedMeeting(null);
      }
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi xóa cuộc họp: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Action Items Edit Logic
  const handleAddActionItem = () => {
    const nextStt = editableActionItems.length > 0 
      ? Math.max(...editableActionItems.map(item => item.stt)) + 1 
      : 1;
    
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
        <Header title="Biên bản họp (Meeting Team)" subtitle="Quản lý hồ sơ biên bản họp & Trợ lý AI gỡ băng ghi âm tự động" />

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
              <p className="text-xs text-slate-500">
                Gỡ băng ghi âm cuộc họp, tự động bóc tách công việc & xuất file biên bản họp Word (.docx) chuẩn mẫu công ty.
              </p>

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

            {/* Quick API Key Setup */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider">OpenAI API Key</span>
                <input
                  type="password"
                  placeholder="Nhập mã OpenAI API Key..."
                  value={openaiKey}
                  onChange={(e) => {
                    setOpenaiKey(e.target.value);
                    localStorage.setItem("openai_api_key_hanh_chinh", e.target.value);
                  }}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 w-56 placeholder-slate-400 shadow-inner"
                />
              </div>
            </div>
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

                      <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-xl text-xs text-slate-600 space-y-2">
                        <h4 className="font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                          <Info size={13} className="text-[#005BAC]" /> Hướng dẫn tự động
                        </h4>
                        <ul className="list-disc pl-4 space-y-1 text-slate-600 leading-relaxed text-[11px]">
                          <li>Bạn không cần nhập tiêu đề hay danh sách tham dự. AI sẽ tự đọc tên dự án, thư ký, và thành viên từ file ghi âm.</li>
                          <li>Tải lên các file âm thanh ghi âm cuộc họp (.mp3, .wav, .m4a).</li>
                          <li>Sau khi xử lý xong, bạn có thể kiểm tra lại thông tin và bấm **"Xuất biên bản Word (.docx)"**.</li>
                        </ul>
                      </div>
                    </div>

                    {/* Right Panel: Drag & Drop Zone */}
                    <div className="md:col-span-2 flex flex-col justify-between">
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
                            disabled={isUploading || processingStep !== "idle"}
                            className="hidden"
                          />
                          <UploadCloud className="text-slate-400 group-hover:text-[#005BAC] group-hover:scale-110 transition-all duration-300" size={44} />
                          
                          {audioFile ? (
                            <div className="space-y-1">
                              <span className="text-[#005BAC] text-xs font-bold flex items-center justify-center gap-1.5">
                                <FileAudio size={16} /> {audioFile.name}
                              </span>
                              <p className="text-[11px] text-slate-500">{(audioFile.size / (1024 * 1024)).toFixed(2)} MB - Click để chọn file khác</p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-slate-700 text-xs font-bold">Thả file âm thanh họp vào đây, hoặc nhấp để tải file</p>
                              <p className="text-[11px] text-slate-400">Hỗ trợ MP3, WAV, M4A dưới 100MB.</p>
                            </div>
                          )}
                        </div>
                      </div>

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

                      {/* Action Button */}
                      {processingStep === "idle" && (
                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                          <button
                            type="button"
                            onClick={() => {
                              setAudioFile(null);
                              setChairperson("");
                            }}
                            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                          >
                            Xóa chọn
                          </button>
                          <button
                            type="button"
                            onClick={handleIntakeAndProcess}
                            disabled={!audioFile || !chairperson}
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
                </div>
              </div>

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

                  {selectedMeeting.audio_url && (
                    <div className="pt-3 border-t border-slate-100 text-xs space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Audio Ghi Âm</span>
                      <audio controls src={selectedMeeting.audio_url} className="w-full h-8 mt-1 rounded bg-slate-50" />
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
                                {editableActionItems.map((item, index) => (
                                  <tr key={`item_${index}`} className="hover:bg-slate-50/50">
                                    <td className="px-3 py-2.5 text-center font-bold text-slate-500">{item.stt}</td>
                                    <td className="px-4 py-2.5">
                                      {selectedMeeting.status === "draft" ? (
                                        <input
                                          type="text"
                                          value={item.content}
                                          onChange={(e) => handleUpdateActionItemField(index, "content", e.target.value)}
                                          className="w-full bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-none text-slate-800"
                                        />
                                      ) : (
                                        <span className="text-slate-800 block">{item.content}</span>
                                      )}
                                    </td>
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
                                ))}
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

        </main>
      </div>
    </div>
  );
}
