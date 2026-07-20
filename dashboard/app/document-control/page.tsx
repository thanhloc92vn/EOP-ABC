"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { fetchApprovalPermissions, ApprovalPermissions, NO_APPROVAL_PERMISSIONS } from "@/lib/approvers";
import {
  FileDown,
  FileUp,
  Search,
  Plus,
  RefreshCw,
  Settings,
  Brain,
  Upload,
  X,
  Save,
  Trash2,
  Edit,
  FileText,
  AlertCircle,
  CheckCircle,
  Eye,
  Download,
  ShieldAlert,
  Loader2
} from "lucide-react";

interface ClericalDoc {
  id?: string;
  created_at?: string;
  type: "incoming" | "outgoing_1" | "outgoing_2" | "outgoing_hdqt";
  stt: number;
  receive_send_date: string;
  doc_number: string;
  doc_date: string;
  summary: string;
  sender_receiver: string;
  signer_recipient: string;
  has_scan: boolean;
  has_original: boolean;
  file_name: string;
  scan_file_url?: string;
  original_file_url?: string;
  ai_analysis?: any;
}

interface BatchItem {
  id: string;
  file: File;
  fileName: string;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  type: "incoming" | "outgoing_1" | "outgoing_2" | "outgoing_hdqt";
  stt: number;
  receive_send_date: string;
  doc_number: string;
  doc_date: string;
  summary: string;
  sender_receiver: string;
  signer_recipient: string;
  has_scan: boolean;
  has_original: boolean;
  scan_file_url?: string;
  original_file_url?: string;
  saved: boolean;
}

export default function DocumentControlPage() {
  const [activeTab, setActiveTab] = useState<string>("incoming"); // incoming, outgoing_1, outgoing_2, outgoing_hdqt, settings
  const [docs, setDocs] = useState<ClericalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ClericalDoc | null>(null);

  // Preview Modal State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");

  // Handle open preview
  const handleOpenPreview = (url: string, title: string) => {
    setPreviewUrl(url);
    setPreviewTitle(title);
    setShowPreviewModal(true);
  };

  // Immediate download helper (CORS-friendly download bypass)
  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      
      let downloadName = filename;
      if (!filename.toLowerCase().endsWith(".pdf") && url.toLowerCase().includes(".pdf")) {
        downloadName += ".pdf";
      }
      link.download = downloadName;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download error:", error);
      window.open(url, "_blank");
    }
  };
  
  // Form Values
  const [docType, setDocType] = useState<"incoming" | "outgoing_1" | "outgoing_2" | "outgoing_hdqt">("incoming");
  const [stt, setStt] = useState<number | string>("");
  const [receiveSendDate, setReceiveSendDate] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState("");
  const [summary, setSummary] = useState("");
  const [senderReceiver, setSenderReceiver] = useState("");
  const [signerRecipient, setSignerRecipient] = useState("");
  const [hasScan, setHasScan] = useState(false);
  const [hasOriginal, setHasOriginal] = useState(false);
  const [fileName, setFileName] = useState("");
  const [scanFileUrl, setScanFileUrl] = useState("");
  const [originalFileUrl, setOriginalFileUrl] = useState("");

  // AI Analysis State
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Upload States
  const [uploadingScan, setUploadingScan] = useState(false);
  const [uploadingOriginal, setUploadingOriginal] = useState(false);
  const [autoUploadOnAnalyze, setAutoUploadOnAnalyze] = useState(true);

  // Helper upload function
  const uploadFileToSupabase = async (file: File): Promise<string | null> => {
    try {
      // Giới hạn 5MB
      if (file.size > 5 * 1024 * 1024) {
        alert("File lớn hơn 5MB. Hãy dán link OneDrive/Drive gốc vào ô nhập.");
        return null;
      }

      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `${Date.now()}_${cleanFileName}`;

      const { data, error } = await supabase.storage
        .from("clerical-documents")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from("clerical-documents")
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (e) {
      console.error("Upload error:", e);
      alert("Lỗi khi tải file lên Supabase: " + (e as Error).message);
      return null;
    }
  };

  // Batch AI Processing State
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [processingBatch, setProcessingBatch] = useState(false);
  const [batchDragOver, setBatchDragOver] = useState(false);
  
  // API Settings State
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Current logged in user state
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);
  const [approvalPerms, setApprovalPerms] = useState<ApprovalPermissions>(NO_APPROVAL_PERMISSIONS);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const user = session.user;
      const email = user.email || "";

      // 1. Check allowed_users
      const { data: allowedData } = await supabase
        .from("allowed_users")
        .select("role")
        .ilike("email", email)
        .maybeSingle();

      const isAdmin = allowedData?.role === "Admin";

      // 2. Check employees
      const { data: empData } = await supabase
        .from("employees")
        .select("name, role, department")
        .like("email", `%${email}%`)
        .maybeSingle();

      setCurrentUser({
        email,
        name: empData?.name || user.user_metadata?.full_name || user.user_metadata?.name || "Người dùng",
        role: empData?.role || (isAdmin ? "Admin" : "Nhân viên"),
        department: empData?.department || "Chưa xếp phòng",
        isAdmin
      });

      // Per-user grant xem Văn Thư (cờ can_view_documents trong approval_permissions)
      setApprovalPerms(await fetchApprovalPermissions(email));
    } catch (err) {
      console.error("Error fetching current user info:", err);
    }
  }, []);

  // Chỉ Admin hoặc người được cấp cờ can_view_documents (bảng approval_permissions —
  // cấp/thu quyền trong Supabase Table Editor, không cần sửa code) mới được vào trang
  // Văn Thư. Khớp đúng RLS trên bảng clerical_documents.
  const canView = !!(currentUser && (currentUser.isAdmin || approvalPerms.canViewDocuments));

  const canManage = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.isAdmin) return true;
    if (approvalPerms.canViewDocuments) return true;

    const roleLower = (currentUser.role || "").toLowerCase();
    const deptLower = (currentUser.department || "").toLowerCase();

    return (
      deptLower.includes("hành chính") ||
      deptLower.includes("nhân sự") ||
      deptLower.includes("văn thư") ||
      roleLower.includes("văn thư") ||
      roleLower.includes("trưởng phòng") ||
      roleLower.includes("phó phòng") ||
      roleLower.includes("giám đốc")
    );
  }, [currentUser, approvalPerms]);

  // Load API Settings & Current User & Active Tab on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("openai_api_key_van_thu") || "");
      setModel(localStorage.getItem("openai_model_van_thu") || "gpt-4o-mini");

      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam && ["incoming", "outgoing_1", "outgoing_2", "outgoing_hdqt", "settings"].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    }
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("openai_api_key_van_thu", apiKey.trim());
      localStorage.setItem("openai_model_van_thu", model);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    }
  };

  // Fetch Documents
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clerical_documents")
        .select("*")
        .order("stt", { ascending: false });
      if (error) throw error;
      setDocs(data || []);
    } catch (e) {
      console.error("Fetch docs error:", e);
      alert("Lỗi tải dữ liệu công văn: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Batch AI Processing Functions
  const handleBatchFileSelect = (files: File[]) => {
    const newItems: BatchItem[] = files.map((file, idx) => ({
      id: `${file.name}-${Date.now()}-${idx}-${Math.random()}`,
      file,
      fileName: file.name,
      status: "pending",
      type: "incoming",
      stt: 0,
      receive_send_date: new Date().toISOString().slice(0, 10),
      doc_number: "",
      doc_date: new Date().toISOString().slice(0, 10),
      summary: "",
      sender_receiver: "",
      signer_recipient: "",
      has_scan: true,
      has_original: false,
      saved: false
    }));
    setBatchItems((prev) => [...prev, ...newItems]);
  };

  const runBatchAnalysis = async () => {
    if (batchItems.length === 0) return;
    setProcessingBatch(true);

    const itemsToProcess = batchItems.filter(item => item.status === "pending" || item.status === "error");

    for (const item of itemsToProcess) {
      setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, status: "processing" } : p));

      try {
        const customKey = localStorage.getItem("openai_api_key_van_thu") || localStorage.getItem("openai_api_key");
        const customModel = localStorage.getItem("openai_model_van_thu") || "gpt-4o-mini";
        
        const headers: Record<string, string> = {};
        if (customKey) {
          headers["Authorization"] = `Bearer ${customKey}`;
        }
        headers["x-openai-model"] = customModel;

        const formData = new FormData();
        formData.append("original_filename", item.fileName);
        
        if (item.file.type === "application/pdf" || item.file.name.toLowerCase().endsWith(".pdf")) {
          try {
            const base64DataUrl = await convertPdfToImage(item.file);
            const resBlob = await fetch(base64DataUrl);
            const blob = await resBlob.blob();
            formData.append("document_file", blob, "scanned_page.jpg");
          } catch (err) {
            console.warn("Failed to render PDF to image, uploading direct:", err);
            formData.append("document_file", item.file);
          }
        } else {
          formData.append("document_file", item.file);
        }

        const res = await fetch("/api/analyze-document", {
          method: "POST",
          headers,
          body: formData
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const aiType = data.type || "incoming";

        // Query max STT
        const activeDocs = docs.filter((d) => d.type === aiType);
        const maxStt = activeDocs.reduce((max, d) => (d.stt > max ? d.stt : max), 0);
        const nextStt = maxStt + 1;

        // Auto-upload file to Supabase Storage in parallel if size <= 5MB
        let uploadedUrl = "";
        if (item.file.size <= 5 * 1024 * 1024) {
          try {
            const cleanFileName = item.file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
            const filePath = `${Date.now()}_${cleanFileName}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("clerical-documents")
              .upload(filePath, item.file, {
                cacheControl: "3600",
                upsert: true,
              });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
              .from("clerical-documents")
              .getPublicUrl(filePath);
            
            uploadedUrl = publicUrl;
          } catch (uploadErr) {
            console.error("Batch upload error for file:", item.fileName, uploadErr);
          }
        }

        setBatchItems(prev => prev.map(p => p.id === item.id ? {
          ...p,
          status: "success",
          type: aiType,
          stt: nextStt,
          doc_number: data.doc_number || "",
          doc_date: data.doc_date || new Date().toISOString().slice(0, 10),
          receive_send_date: p.receive_send_date, // Giữ nguyên ngày upload của file
          sender_receiver: data.sender_receiver || "",
          signer_recipient: data.signer_recipient || "",
          summary: data.summary || "",
          scan_file_url: uploadedUrl || "",
          original_file_url: uploadedUrl || "", // Điền cả vào link bản gốc để xem trực tiếp bằng con mắt
          has_scan: uploadedUrl ? true : p.has_scan,
          has_original: uploadedUrl ? true : p.has_original // Điền cả vào trạng thái có bản gốc
        } : p));

      } catch (err: any) {
        console.error("Batch item error:", err);
        setBatchItems(prev => prev.map(p => p.id === item.id ? { 
          ...p, 
          status: "error", 
          error: err.message || "Lỗi xử lý" 
        } : p));
      }
    }
    setProcessingBatch(false);
  };

  const saveBatchItemToSupabase = async (item: BatchItem) => {
    try {
      const docPayload = {
        type: item.type,
        stt: item.stt || 1,
        receive_send_date: item.receive_send_date,
        doc_number: item.doc_number,
        doc_date: item.doc_date || null as any,
        summary: item.summary,
        sender_receiver: item.sender_receiver,
        signer_recipient: item.signer_recipient,
        has_scan: item.has_scan,
        has_original: item.has_original,
        file_name: item.fileName,
        scan_file_url: item.scan_file_url || "",
        original_file_url: item.original_file_url || ""
      };

      const { error } = await supabase.from("clerical_documents").insert([docPayload]);
      if (error) throw error;

      setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, saved: true } : p));
      fetchDocuments();
    } catch (e) {
      alert("Lỗi khi lưu công văn: " + (e as Error).message);
    }
  };

  const saveAllBatchItems = async () => {
    const readyItems = batchItems.filter(item => item.status === "success" && !item.saved);
    if (readyItems.length === 0) {
      alert("Không có công văn nào đã xử lý thành công để lưu.");
      return;
    }

    let successCount = 0;
    for (const item of readyItems) {
      try {
        const docPayload = {
          type: item.type,
          stt: item.stt || 1,
          receive_send_date: item.receive_send_date,
          doc_number: item.doc_number,
          doc_date: item.doc_date || null as any,
          summary: item.summary,
          sender_receiver: item.sender_receiver,
          signer_recipient: item.signer_recipient,
          has_scan: item.has_scan,
          has_original: item.has_original,
          file_name: item.fileName,
          scan_file_url: item.scan_file_url || "",
          original_file_url: item.original_file_url || ""
        };

        const { error } = await supabase.from("clerical_documents").insert([docPayload]);
        if (error) throw error;

        setBatchItems(current => current.map(p => p.id === item.id ? { ...p, saved: true } : p));
        successCount++;
      } catch (e) {
        console.error("Save all error for item:", item.fileName, e);
      }
    }
    fetchDocuments();
    alert(`Đã lưu thành công ${successCount}/${readyItems.length} công văn vào Supabase.`);
  };

  // browser-side PDF to Image converter
  const convertPdfToImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async function () {
        try {
          const typedarray = new Uint8Array(this.result as ArrayBuffer);
          const pdfjsLib = (window as any).pdfjsLib;
          if (!pdfjsLib) {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = async () => {
              const pdfjs = (window as any).pdfjsLib;
              pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
              try {
                const imgData = await renderPdfPageToDataUrl(pdfjs, typedarray);
                resolve(imgData);
              } catch (err) {
                reject(err);
              }
            };
            script.onerror = () => reject(new Error("Không thể tải thư viện xử lý PDF.js"));
            document.head.appendChild(script);
          } else {
            const imgData = await renderPdfPageToDataUrl(pdfjsLib, typedarray);
            resolve(imgData);
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Không thể đọc tệp PDF"));
      reader.readAsArrayBuffer(file);
    });
  };

  const renderPdfPageToDataUrl = async (pdfjs: any, typedarray: Uint8Array): Promise<string> => {
    const pdf = await pdfjs.getDocument({ data: typedarray }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Không thể tạo canvas context");
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.85);
  };

  // Open Modal and auto-analyze with dropped/selected file
  const openNewDocModalWithFile = async (file: File) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setEditingDoc(null);
    const targetType = activeTab && ["incoming", "outgoing_1", "outgoing_2", "outgoing_hdqt"].includes(activeTab) ? (activeTab as any) : "incoming";
    setDocType(targetType);
    setReceiveSendDate(todayStr);
    setDocNumber("");
    setDocDate(todayStr);
    setSummary("");
    setSenderReceiver("");
    setSignerRecipient("");
    setHasScan(true);
    setHasOriginal(false);
    setFileName(file.name);
    setScanFileUrl("");
    setOriginalFileUrl("");
    setAiFile(file);
    
    // Auto-calculate STT
    const activeDocs = docs.filter((d) => d.type === targetType);
    const maxStt = activeDocs.reduce((max, d) => (d.stt > max ? d.stt : max), 0);
    setStt(maxStt + 1);
    
    setShowModal(true);

    setIsAnalyzing(true);
    try {
      const customKey = localStorage.getItem("openai_api_key_van_thu") || localStorage.getItem("openai_api_key");
      const customModel = localStorage.getItem("openai_model_van_thu") || "gpt-4o-mini";
      
      const headers: Record<string, string> = {};
      if (customKey) {
        headers["Authorization"] = `Bearer ${customKey}`;
      }
      headers["x-openai-model"] = customModel;

      const formData = new FormData();
      formData.append("original_filename", file.name);
      
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        try {
          const base64DataUrl = await convertPdfToImage(file);
          const resBlob = await fetch(base64DataUrl);
          const blob = await resBlob.blob();
          formData.append("document_file", blob, "scanned_page.jpg");
        } catch (err) {
          console.warn("Failed to render PDF to image, falling back to direct PDF upload:", err);
          formData.append("document_file", file);
        }
      } else {
        formData.append("document_file", file);
      }

      formData.append("doc_type", targetType === "incoming" ? "incoming" : "outgoing");

      const res = await fetch("/api/analyze-document", {
        method: "POST",
        headers,
        body: formData
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.doc_number) setDocNumber(data.doc_number);
      if (data.doc_date) setDocDate(data.doc_date);
      // Ngày/Tháng là ngày upload lên, không ghi đè bằng kết quả AI phân tích
      if (data.sender_receiver) setSenderReceiver(data.sender_receiver);
      if (data.summary) setSummary(data.summary);
      if (data.signer_recipient) setSignerRecipient(data.signer_recipient);

      // Auto-upload file to Supabase Storage in parallel if selected
      if (autoUploadOnAnalyze) {
        setUploadingScan(true);
        const publicUrl = await uploadFileToSupabase(file);
        if (publicUrl) {
          setScanFileUrl(publicUrl);
          setOriginalFileUrl(publicUrl); // Điền cả vào link bản gốc để xem trực tiếp bằng con mắt
          setHasScan(true);
          setHasOriginal(true); // Điền cả vào trạng thái có bản gốc
        }
        setUploadingScan(false);
      }
      
    } catch (e) {
      console.error(e);
      alert("Lỗi phân tích AI: " + (e as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Set default dates when opening modal for new document
  const openNewDocModal = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setEditingDoc(null);
    setDocType(activeTab && ["incoming", "outgoing_1", "outgoing_2", "outgoing_hdqt"].includes(activeTab) ? (activeTab as any) : "incoming");
    setReceiveSendDate(todayStr);
    setDocNumber("");
    setDocDate(todayStr);
    setSummary("");
    setSenderReceiver("");
    setSignerRecipient("");
    setHasScan(false);
    setHasOriginal(false);
    setFileName("");
    setScanFileUrl("");
    setOriginalFileUrl("");
    setAiFile(null);
    
    // Auto-calculate STT
    const activeDocs = docs.filter((d) => d.type === (activeTab && ["incoming", "outgoing_1", "outgoing_2", "outgoing_hdqt"].includes(activeTab) ? activeTab : "incoming"));
    const maxStt = activeDocs.reduce((max, d) => (d.stt > max ? d.stt : max), 0);
    setStt(maxStt + 1);
    
    setShowModal(true);
  };

  // Open Edit Modal
  const openEditDocModal = (doc: ClericalDoc) => {
    setEditingDoc(doc);
    setDocType(doc.type);
    setStt(doc.stt);
    setReceiveSendDate(doc.receive_send_date || "");
    setDocNumber(doc.doc_number || "");
    setDocDate(doc.doc_date || "");
    setSummary(doc.summary || "");
    setSenderReceiver(doc.sender_receiver || "");
    setSignerRecipient(doc.signer_recipient || "");
    setHasScan(doc.has_scan || false);
    setHasOriginal(doc.has_original || false);
    setFileName(doc.file_name || "");
    setScanFileUrl(doc.scan_file_url || "");
    setOriginalFileUrl(doc.original_file_url || "");
    setAiFile(null);
    setShowModal(true);
  };

  // Delete Document
  const handleDeleteDoc = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xoá công văn này không? Dữ liệu sẽ bị xoá vĩnh viễn trên Supabase.")) return;
    try {
      const { error } = await supabase.from("clerical_documents").delete().eq("id", id);
      if (error) throw error;
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      alert("Lỗi khi xoá: " + (e as Error).message);
    }
  };

  // File Upload drag/drop handlers
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setAiFile(file);
      setFileName(file.name);
      setHasScan(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAiFile(file);
      setFileName(file.name);
      setHasScan(true);
    }
  };

  // Render helpers moved to top

  // Trigger AI analysis
  const analyzeWithAI = async () => {
    if (!aiFile) {
      alert("Vui lòng tải lên hoặc kéo thả tệp văn bản (PDF, DOCX, Hình ảnh) trước.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const customKey = localStorage.getItem("openai_api_key_van_thu") || localStorage.getItem("openai_api_key");
      const customModel = localStorage.getItem("openai_model_van_thu") || "gpt-4o-mini";
      
      const headers: Record<string, string> = {};
      if (customKey) {
        headers["Authorization"] = `Bearer ${customKey}`;
      }
      headers["x-openai-model"] = customModel;

      const formData = new FormData();
      formData.append("original_filename", aiFile.name);
      
      // If PDF, render to image in browser first so AI Vision can read scanned PDF!
      if (aiFile.type === "application/pdf" || aiFile.name.toLowerCase().endsWith(".pdf")) {
        try {
          const base64DataUrl = await convertPdfToImage(aiFile);
          const resBlob = await fetch(base64DataUrl);
          const blob = await resBlob.blob();
          formData.append("document_file", blob, "scanned_page.jpg");
        } catch (err) {
          console.warn("Failed to render PDF to image, falling back to direct PDF upload:", err);
          formData.append("document_file", aiFile);
        }
      } else {
        formData.append("document_file", aiFile);
      }

      // Simplify to incoming/outgoing for AI prompt structure
      formData.append("doc_type", docType === "incoming" ? "incoming" : "outgoing");

      const res = await fetch("/api/analyze-document", {
        method: "POST",
        headers,
        body: formData
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Auto fill form fields
      if (data.doc_number) setDocNumber(data.doc_number);
      if (data.doc_date) setDocDate(data.doc_date);
      // Ngày/Tháng là ngày upload lên, không ghi đè bằng kết quả AI phân tích
      if (data.sender_receiver) setSenderReceiver(data.sender_receiver);
      if (data.summary) setSummary(data.summary);
      if (data.signer_recipient) setSignerRecipient(data.signer_recipient);

      // Auto-upload file to Supabase Storage in parallel if selected
      if (autoUploadOnAnalyze) {
        setUploadingScan(true);
        const publicUrl = await uploadFileToSupabase(aiFile);
        if (publicUrl) {
          setScanFileUrl(publicUrl);
          setOriginalFileUrl(publicUrl); // Điền cả vào link bản gốc để xem trực tiếp bằng con mắt
          setHasScan(true);
          setHasOriginal(true); // Điền cả vào trạng thái có bản gốc
        }
        setUploadingScan(false);
      }
      
    } catch (e) {
      console.error(e);
      alert("Lỗi phân tích AI: " + (e as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save/Update handler
  const handleSaveDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveSendDate || !docNumber || !senderReceiver) {
      alert("Vui lòng nhập đầy đủ các trường thông tin bắt buộc: Ngày nhận/gửi, Số văn bản, Đơn vị gửi/nhận.");
      return;
    }

    const docPayload: Partial<ClericalDoc> = {
      type: docType,
      stt: Number(stt) || 1,
      receive_send_date: receiveSendDate,
      doc_number: docNumber,
      doc_date: docDate || null as any,
      summary: summary,
      sender_receiver: senderReceiver,
      signer_recipient: signerRecipient,
      has_scan: hasScan,
      has_original: hasOriginal,
      file_name: fileName,
      scan_file_url: scanFileUrl,
      original_file_url: originalFileUrl
    };

    try {
      if (editingDoc && editingDoc.id) {
        // Update
        const { error } = await supabase
          .from("clerical_documents")
          .update(docPayload)
          .eq("id", editingDoc.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from("clerical_documents")
          .insert([docPayload]);
        if (error) throw error;
      }
      setShowModal(false);
      fetchDocuments();
    } catch (e) {
      alert("Lỗi khi lưu dữ liệu: " + (e as Error).message);
    }
  };

  // Filters
  const filteredDocs = docs.filter((d) => {
    if (d.type !== activeTab) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (d.doc_number || "").toLowerCase().includes(q) ||
      (d.summary || "").toLowerCase().includes(q) ||
      (d.sender_receiver || "").toLowerCase().includes(q) ||
      (d.signer_recipient || "").toLowerCase().includes(q) ||
      (d.file_name || "").toLowerCase().includes(q)
    );
  });

  // Màn chặn truy cập (giống Góp ý & Kiến nghị): tài khoản không có quyền thấy
  // thông báo từ chối, không thấy bất kỳ dữ liệu công văn nào. RLS trên bảng
  // clerical_documents là lớp chặn thật ở database.
  if (!currentUser) {
    return (
      <div className="flex min-h-screen bg-[#F7F9FC]">
        <Sidebar />
        <div className="ml-60 flex-1 flex flex-col min-w-0">
          <Header title="Văn Thư" subtitle="Quản lý và số hóa công văn đi/đến, tự động phân tích trích xuất dữ liệu bằng AI" />
          <main className="flex-1 p-8 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </main>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex min-h-screen bg-[#F7F9FC]">
        <Sidebar />
        <div className="ml-60 flex-1 flex flex-col min-w-0">
          <Header title="Văn Thư" subtitle="Quản lý và số hóa công văn đi/đến, tự động phân tích trích xuất dữ liệu bằng AI" />
          <main className="flex-1 p-8 flex flex-col items-center justify-center max-w-4xl">
            <div className="glass bg-white rounded-2xl p-8 border border-slate-200/50 shadow-premium text-center space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
                <ShieldAlert size={32} />
              </div>
              <h2 className="font-heading font-extrabold text-slate-800 text-lg">Truy cập bị từ chối</h2>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                Tài khoản của bạn ({currentUser.email}) không có quyền xem nội dung Văn Thư. Chỉ Admin và cán bộ được cấp quyền riêng (Phòng HCNS) mới truy cập được mục này.
              </p>
              <div className="pt-2">
                <a
                  href="/"
                  className="inline-block px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow active:scale-95"
                >
                  Quay lại Dashboard
                </a>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Văn Thư" subtitle="Quản lý và số hóa công văn đi/đến, tự động phân tích trích xuất dữ liệu bằng AI" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Sub Navigator */}
          <div className="flex border-b border-slate-200">
            {[
              { id: "incoming", label: "Công văn đến", icon: FileDown },
              { id: "outgoing_1", label: "Công văn đi 1", icon: FileUp },
              { id: "outgoing_2", label: "Công văn đi 2", icon: FileUp },
              { id: "outgoing_hdqt", label: "Công văn HĐQT", icon: FileText },
              { id: "settings", label: "Cấu hình API", icon: Settings },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-all ${
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* AI Quick Upload Dropzone removed from main views */}

          {/* Search bar & Action */}
          {activeTab !== "settings" && (
            <div className="flex justify-between items-center gap-4">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm số VB, đơn vị, trích yếu..."
                  className="w-full pl-9 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm font-medium"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={fetchDocuments}
                  className="flex items-center justify-center p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all text-slate-500 bg-white"
                  title="Tải lại dữ liệu"
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
                {canManage && (
                  <button
                    onClick={openNewDocModal}
                    className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md"
                  >
                    <Plus size={14} /> Lưu công văn mới
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Document Content Panels */}
          {["incoming", "outgoing_1", "outgoing_2", "outgoing_hdqt"].includes(activeTab) && (
            <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-bold text-slate-800 text-sm">
                  {activeTab === "incoming" && "Nhật ký Công văn đến văn phòng"}
                  {activeTab === "outgoing_1" && "Nhật ký Công văn đi 1"}
                  {activeTab === "outgoing_2" && "Nhật ký Công văn đi 2"}
                  {activeTab === "outgoing_hdqt" && "Nhật ký Công văn đi 1 - HĐQT"}
                </h3>
                <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-3 py-1 rounded-lg">
                  Tổng số: {filteredDocs.length} bản ghi
                </span>
              </div>
              
              <div className="overflow-x-auto min-h-[300px]">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="pb-3 pr-2">STT</th>
                      <th className="pb-3 whitespace-nowrap">Ngày/Tháng</th>
                      <th className="pb-3 whitespace-nowrap">Số văn bản</th>
                      <th className="pb-3 whitespace-nowrap">Ngày VB</th>
                      <th className="pb-3 min-w-[200px]">Tóm tắt nội dung chính</th>
                      <th className="pb-3 whitespace-nowrap">
                        {activeTab === "incoming" ? "Đơn vị gửi đến" : "Đơn vị nhận"}
                      </th>
                      <th className="pb-3 whitespace-nowrap">
                        {activeTab === "incoming" ? "Người nhận" : "Người ký"}
                      </th>
                      <th className="pb-3 text-center">Bản Scan</th>
                      <th className="pb-3 text-center">Bản gốc</th>
                      <th className="pb-3 whitespace-nowrap">Tên file CV</th>
                      {canManage && <th className="pb-3 text-right">Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                    {loading ? (
                      <tr>
                        <td colSpan={canManage ? 11 : 10} className="py-20 text-center text-slate-400 italic">
                          <div className="flex flex-col items-center gap-2">
                            <RefreshCw size={24} className="animate-spin text-blue-600" />
                            <span>Đang tải dữ liệu từ Supabase...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredDocs.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 11 : 10} className="py-20 text-center text-slate-400 font-normal">
                          {search ? "Không tìm thấy công văn phù hợp." : "Chưa có công văn nào được lưu trong mục này."}
                        </td>
                      </tr>
                    ) : (
                      filteredDocs.map((doc, idx) => (
                        <tr key={doc.id || idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 pr-2 font-mono text-slate-400">{doc.stt}</td>
                          <td className="py-4 whitespace-nowrap">{doc.receive_send_date ? new Date(doc.receive_send_date).toLocaleDateString("vi-VN") : "–"}</td>
                          <td className="py-4 font-mono font-bold text-slate-800 whitespace-nowrap">{doc.doc_number}</td>
                          <td className="py-4 whitespace-nowrap">{doc.doc_date ? new Date(doc.doc_date).toLocaleDateString("vi-VN") : "–"}</td>
                          <td className="py-4 max-w-[300px] break-words pr-4 whitespace-normal" title={doc.summary}>
                            {doc.summary || "–"}
                          </td>
                          <td className="py-4 max-w-[180px] break-words pr-4 whitespace-normal" title={doc.sender_receiver}>
                            {doc.sender_receiver || "–"}
                          </td>
                          <td className="py-4 max-w-[140px] break-words pr-4 whitespace-normal" title={doc.signer_recipient}>
                            {doc.signer_recipient || "–"}
                          </td>
                          <td className="py-4 text-center">
                            {doc.has_scan ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600">✓</span>
                            ) : (
                              <span className="text-slate-300 font-normal">–</span>
                            )}
                          </td>
                          <td className="py-4 text-center">
                            {doc.original_file_url ? (
                              <button 
                                onClick={() => handleOpenPreview(doc.original_file_url!, doc.file_name || "Bản gốc")}
                                className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-all inline-flex items-center justify-center cursor-pointer bg-transparent border-none"
                                title="Xem bản gốc"
                              >
                                <Eye size={15} />
                              </button>
                            ) : (
                              <span
                                className="p-1 text-slate-300 inline-flex items-center justify-center cursor-default"
                                title="Chưa có link bản gốc – mở sửa để thêm link"
                              >
                                <Eye size={15} />
                              </span>
                            )}
                          </td>
                          <td className="py-4 max-w-[160px] pr-2 truncate text-slate-400 font-normal whitespace-nowrap" title={doc.file_name}>
                            {doc.scan_file_url ? (
                              <button 
                                onClick={() => handleOpenPreview(doc.scan_file_url!, doc.file_name || "Bản scan")}
                                className="text-blue-600 hover:underline font-semibold text-left truncate max-w-full block cursor-pointer bg-transparent border-none p-0"
                              >
                                {doc.file_name || "Xem đính kèm"}
                              </button>
                            ) : (
                              doc.file_name || "–"
                            )}
                          </td>
                          {canManage && (
                            <td className="py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => openEditDocModal(doc)}
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-all"
                                  title="Sửa đổi"
                                >
                                  <Edit size={14} />
                                </button>
                                {(doc.scan_file_url || doc.original_file_url) ? (
                                  <button
                                    onClick={() => downloadFile(doc.scan_file_url || doc.original_file_url!, doc.file_name || "cong_van")}
                                    className="p-1 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-all inline-flex items-center justify-center cursor-pointer bg-transparent border-none"
                                    title="Tải tệp đính kèm"
                                  >
                                    <Download size={14} />
                                  </button>
                                ) : (
                                  <span
                                    className="p-1 text-slate-300 inline-flex items-center justify-center cursor-default"
                                    title="Chưa có file đính kèm – mở sửa để thêm link"
                                  >
                                    <Download size={14} />
                                  </span>
                                )}
                                <button
                                  onClick={() => doc.id && handleDeleteDoc(doc.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition-all"
                                  title="Xoá"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}



          {/* API Configuration & Batch AI Upload Tab */}
          {activeTab === "settings" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: API Settings */}
              <div className="lg:col-span-1 glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-6 self-start">
                <div className="flex items-center gap-3 border-b border-slate-150 pb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Settings size={20} />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-slate-800 text-sm">Cấu hình API Văn thư</h3>
                    <p className="text-slate-400 text-[11px] font-medium">Thiết lập kết nối OpenAI</p>
                  </div>
                </div>

                <form onSubmit={saveSettings} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">OpenAI API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-proj-..."
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-semibold text-slate-700 bg-slate-50/30"
                    />
                    <p className="text-[10px] text-slate-400 font-medium">
                      Nhập khoá OpenAI API Key dành riêng cho nhân viên Văn thư để chủ động sử dụng. Để trống hệ thống sẽ dùng khoá chung.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mô hình AI sử dụng</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer text-xs font-semibold text-slate-700 bg-white"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (Nhanh chóng & Rất tiết kiệm)</option>
                      <option value="gpt-4o">gpt-4o (Độ chính xác cao & Đọc ảnh scan tốt hơn)</option>
                    </select>
                  </div>

                  {settingsSaved && (
                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2.5 rounded-xl border border-emerald-100 text-xs font-semibold">
                      <CheckCircle size={14} /> Cấu hình đã được lưu!
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <button
                      type="submit"
                      className="flex items-center gap-2 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-all active:scale-95 shadow-md"
                    >
                      <Save size={14} /> Lưu cấu hình
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: Batch AI Document processing */}
              <div className="lg:col-span-2 glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-150 pb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Brain size={20} />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-slate-800 text-sm">Tải lên & Phân tích Công văn hàng loạt</h3>
                    <p className="text-slate-400 text-[11px] font-medium">Kéo thả hàng loạt file để AI tự động nhận dạng, phân loại và lưu trữ</p>
                  </div>
                </div>

                {/* Batch Dropzone */}
                <div 
                  onDragOver={(e) => { e.preventDefault(); setBatchDragOver(true); }}
                  onDragLeave={() => setBatchDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setBatchDragOver(false);
                    if (e.dataTransfer.files) {
                      handleBatchFileSelect(Array.from(e.dataTransfer.files));
                    }
                  }}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3 transition-all min-h-[160px] ${
                    batchDragOver ? "border-blue-500 bg-blue-50/50 animate-pulse" : "border-slate-200 bg-slate-50/30 hover:border-blue-400"
                  }`}
                >
                  <Upload className="text-slate-400 animate-bounce" size={28} />
                  <div>
                    <label className="text-[#005BAC] hover:underline cursor-pointer font-bold text-xs">
                      Kéo thả hàng loạt file PDF/Ảnh/Word vào đây hoặc Chọn tệp
                      <input 
                        type="file" 
                        multiple 
                        onChange={(e) => {
                          if (e.target.files) {
                            handleBatchFileSelect(Array.from(e.target.files));
                          }
                        }} 
                        className="hidden" 
                        accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.txt" 
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">Hỗ trợ trích xuất, tự phân loại AI (Đến, Đi 1, Đi 2, HĐQT)</p>
                  </div>
                </div>

                {/* Batch controls */}
                {batchItems.length > 0 && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <span className="text-xs font-bold text-slate-700">Đã chọn: {batchItems.length} file công văn</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={runBatchAnalysis}
                          disabled={processingBatch || batchItems.filter(item => item.status === "pending" || item.status === "error").length === 0}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow ${
                            processingBatch || batchItems.filter(item => item.status === "pending" || item.status === "error").length === 0
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 shadow-none"
                              : "bg-[#005BAC] hover:bg-blue-700 text-white active:scale-95"
                          }`}
                        >
                          {processingBatch ? (
                            <>
                              <RefreshCw size={13} className="animate-spin" />
                              <span>Đang phân tích...</span>
                            </>
                          ) : (
                            <>
                              <Brain size={13} />
                              <span>Phân tích bằng AI</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={saveAllBatchItems}
                          disabled={processingBatch || batchItems.filter(item => item.status === "success" && !item.saved).length === 0}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow ${
                            processingBatch || batchItems.filter(item => item.status === "success" && !item.saved).length === 0
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 shadow-none"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95"
                          }`}
                        >
                          <Save size={13} />
                          <span>Lưu tất cả hợp lệ</span>
                        </button>
                        <button
                          onClick={() => setBatchItems([])}
                          disabled={processingBatch}
                          className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 transition-all"
                        >
                          Xoá danh sách
                        </button>
                      </div>
                    </div>

                    {/* Batch Items list */}
                    <div className="overflow-x-auto border border-slate-150 rounded-xl max-h-[400px]">
                      <table className="w-full text-xs text-left min-w-[1300px]">
                        <thead className="bg-[#005BAC] text-white">
                          <tr>
                            <th className="p-3">Tên file</th>
                            <th className="p-3 w-32">Loại công văn</th>
                            <th className="p-3 w-16">STT</th>
                            <th className="p-3 w-32">Số VB</th>
                            <th className="p-3 w-32">Ngày/Tháng</th>
                            <th className="p-3 w-32">Ngày VB</th>
                            <th className="p-3 w-40">Đơn vị gửi/nhận</th>
                            <th className="p-3 w-36">Người ký/nhận</th>
                            <th className="p-3 min-w-[180px]">Trích yếu nội dung chính</th>
                            <th className="p-3 w-40">Link bản quét (scan)</th>
                            <th className="p-3 w-40">Link bản gốc</th>
                            <th className="p-3 text-center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white font-semibold text-slate-700">
                          {batchItems.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/50">
                              <td className="p-3 max-w-[120px] truncate text-slate-500" title={item.fileName}>
                                <p className="truncate font-semibold text-slate-800">{item.fileName}</p>
                                {item.status === "processing" && (
                                  <div className="flex items-center gap-1 text-blue-600 text-[10px] mt-1 font-bold">
                                    <RefreshCw size={10} className="animate-spin" />
                                    <span>Đang xử lý...</span>
                                  </div>
                                )}
                                {item.status === "error" && (
                                  <p className="text-rose-500 text-[9px] mt-1 font-medium leading-tight break-all max-w-[120px]">
                                    Lỗi: {item.error}
                                  </p>
                                )}
                                {item.status === "success" && (
                                  item.scan_file_url ? (
                                    <p className="text-emerald-600 text-[9px] mt-1 font-bold">
                                      ✓ Đã upload Supabase
                                    </p>
                                  ) : (
                                    <p className="text-amber-600 text-[9px] mt-1 font-bold" title="Dung lượng > 5MB, vui lòng dán link ngoài">
                                      ⚠ File &gt; 5MB. Hãy dán link.
                                    </p>
                                  )
                                )}
                              </td>
                              <td className="p-3">
                                <select
                                  value={item.type}
                                  disabled={item.saved || item.status !== "success"}
                                  onChange={(e) => {
                                    const newType = e.target.value as any;
                                    const activeDocs = docs.filter((d) => d.type === newType);
                                    const maxStt = activeDocs.reduce((max, d) => (d.stt > max ? d.stt : max), 0);
                                    setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, type: newType, stt: maxStt + 1 } : p));
                                  }}
                                  className="px-2 py-1 border border-slate-200 rounded-lg w-full bg-white text-[11px] font-bold text-slate-700"
                                >
                                  <option value="incoming">Công văn đến</option>
                                  <option value="outgoing_1">Công văn đi 1</option>
                                  <option value="outgoing_2">Công văn đi 2</option>
                                  <option value="outgoing_hdqt">Công văn HĐQT</option>
                                </select>
                              </td>
                              <td className="p-3">
                                <input
                                  type="number"
                                  value={item.stt}
                                  disabled={item.saved || item.status !== "success"}
                                  onChange={(e) => setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, stt: Number(e.target.value) } : p))}
                                  className="px-2 py-1 border border-slate-200 rounded-lg w-full text-[11px] font-mono text-center font-bold text-slate-700"
                                />
                              </td>
                              <td className="p-3">
                                <input
                                  type="text"
                                  value={item.doc_number}
                                  disabled={item.saved || item.status !== "success"}
                                  onChange={(e) => setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, doc_number: e.target.value } : p))}
                                  className="px-2 py-1 border border-slate-200 rounded-lg w-full text-[11px] font-mono font-bold text-slate-800"
                                />
                              </td>
                              <td className="p-3">
                                <input
                                  type="date"
                                  value={item.receive_send_date}
                                  disabled={item.saved || item.status !== "success"}
                                  onChange={(e) => setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, receive_send_date: e.target.value } : p))}
                                  className="px-2 py-1 border border-slate-200 rounded-lg w-full text-[11px] font-medium text-slate-600"
                                />
                              </td>
                              <td className="p-3">
                                <input
                                  type="date"
                                  value={item.doc_date}
                                  disabled={item.saved || item.status !== "success"}
                                  onChange={(e) => setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, doc_date: e.target.value } : p))}
                                  className="px-2 py-1 border border-slate-200 rounded-lg w-full text-[11px] font-medium text-slate-600"
                                />
                              </td>
                              <td className="p-3">
                                <input
                                  type="text"
                                  value={item.sender_receiver}
                                  disabled={item.saved || item.status !== "success"}
                                  onChange={(e) => setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, sender_receiver: e.target.value } : p))}
                                  className="px-2 py-1 border border-slate-200 rounded-lg w-full text-[11px] font-bold text-slate-700"
                                />
                              </td>
                              <td className="p-3">
                                <input
                                  type="text"
                                  value={item.signer_recipient}
                                  disabled={item.saved || item.status !== "success"}
                                  onChange={(e) => setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, signer_recipient: e.target.value } : p))}
                                  className="px-2 py-1 border border-slate-200 rounded-lg w-full text-[11px] font-semibold text-slate-600"
                                />
                              </td>
                              <td className="p-3">
                                <textarea
                                  rows={1}
                                  value={item.summary}
                                  disabled={item.saved || item.status !== "success"}
                                  onChange={(e) => setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, summary: e.target.value } : p))}
                                  className="px-2 py-1 border border-slate-200 rounded-lg w-full text-[11px] leading-relaxed text-slate-600 font-medium"
                                />
                              </td>
                              <td className="p-3">
                                <input
                                  type="text"
                                  value={item.scan_file_url || ""}
                                  disabled={item.saved || item.status !== "success"}
                                  placeholder="Dán link hoặc tự sinh"
                                  onChange={(e) => setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, scan_file_url: e.target.value } : p))}
                                  className="px-2 py-1 border border-slate-200 rounded-lg w-full text-[11px] font-semibold text-slate-700"
                                />
                              </td>
                              <td className="p-3">
                                <input
                                  type="text"
                                  value={item.original_file_url || ""}
                                  disabled={item.saved || item.status !== "success"}
                                  placeholder="Dán link bản gốc"
                                  onChange={(e) => setBatchItems(prev => prev.map(p => p.id === item.id ? { ...p, original_file_url: e.target.value } : p))}
                                  className="px-2 py-1 border border-slate-200 rounded-lg w-full text-[11px] font-semibold text-slate-700"
                                />
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {item.saved ? (
                                    <span className="inline-flex items-center justify-center bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-1 rounded-lg border border-emerald-100">
                                      ✓ Đã lưu
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => saveBatchItemToSupabase(item)}
                                      disabled={item.status !== "success"}
                                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                        item.status === "success" 
                                          ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" 
                                          : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                                      }`}
                                    >
                                      Lưu
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setBatchItems(prev => prev.filter(p => p.id !== item.id))}
                                    disabled={item.saved}
                                    className={`p-1.5 rounded transition-all ${
                                      item.saved 
                                        ? "text-slate-300 cursor-not-allowed" 
                                        : "text-slate-400 hover:text-rose-600 hover:bg-slate-100"
                                    }`}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Save/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-150 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#005BAC] flex items-center justify-center">
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-slate-800 text-sm">
                    {editingDoc ? `Chỉnh sửa công văn #${stt}` : "Thêm mới công văn"}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Phân hệ văn thư</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* Left side: AI File Upload & Processing */}
              <div className="lg:col-span-2 space-y-4 border-r border-slate-100 pr-6">
                <div className="flex items-center gap-2 text-[#005BAC] font-bold text-xs uppercase tracking-wider">
                  <Brain size={14} />
                  <span>Trợ lý AI Phân tích</span>
                </div>
                
                {/* Drag Drop Area */}
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-3 min-h-[160px] relative transition-all ${
                    isDragging ? "border-blue-500 bg-blue-50/50" : "border-slate-200 bg-slate-50/50 hover:border-blue-400"
                  }`}
                >
                  <Upload className="text-slate-400 animate-bounce" size={24} />
                  <div>
                    <label className="text-[#005BAC] hover:underline cursor-pointer font-bold text-xs">
                      Tải file lên để phân tích
                      <input type="file" onChange={handleFileChange} className="hidden" accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.txt" />
                    </label>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">Hỗ trợ PDF, DOCX, Hình ảnh công văn</p>
                  </div>
                  {aiFile && (
                    <div className="absolute inset-0 bg-white/95 rounded-2xl p-4 flex flex-col justify-center items-center gap-2">
                      <FileText className="text-emerald-500" size={24} />
                      <span className="text-[11px] font-bold text-slate-700 truncate w-full px-4">{aiFile.name}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setAiFile(null); setFileName(""); }}
                          className="px-2.5 py-1 border border-slate-200 rounded-lg text-[10px] text-slate-500 hover:bg-slate-50 font-bold"
                        >
                          Huỷ bỏ
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Actions */}
                <button
                  type="button"
                  onClick={analyzeWithAI}
                  disabled={isAnalyzing || !aiFile}
                  className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow ${
                    isAnalyzing 
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                      : !aiFile 
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/50 shadow-none" 
                        : "bg-[#005BAC] hover:bg-blue-700 text-white active:scale-95 cursor-pointer"
                  }`}
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw size={14} className="animate-spin text-blue-500" />
                      <span>Đang trích xuất dữ liệu bằng AI...</span>
                    </>
                  ) : (
                    <>
                      <Brain size={14} />
                      <span>Trích xuất thông tin tự động bằng AI</span>
                    </>
                  )}
                </button>

                {/* Auto-upload Checkbox */}
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-150">
                  <input
                    type="checkbox"
                    id="autoUploadOnAnalyzeCheckbox"
                    checked={autoUploadOnAnalyze}
                    onChange={(e) => setAutoUploadOnAnalyze(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="autoUploadOnAnalyzeCheckbox" className="text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                    Tự động tải lên Supabase làm Bản quét (scan)
                  </label>
                </div>

                <div className="text-[10px] text-slate-400 bg-blue-50/40 p-3.5 rounded-xl border border-blue-100/50 leading-relaxed font-medium space-y-1">
                  <div className="flex items-center gap-1.5 text-blue-600 font-bold">
                    <AlertCircle size={12} />
                    <span>Lưu ý:</span>
                  </div>
                  <p>AI sẽ tự động đọc file và điền thông tin vào form bên phải (Số VB, trích yếu, ngày tháng, bên gửi/nhận). Bạn nên rà soát lại thông tin trước khi nhấn lưu.</p>
                </div>
              </div>

              {/* Right side: Detailed Form */}
              <form onSubmit={handleSaveDoc} className="lg:col-span-3 space-y-4">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">
                  <span>Thông tin công văn</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Category select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Phân loại</label>
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white"
                    >
                      <option value="incoming">Công văn đến</option>
                      <option value="outgoing_1">Công văn đi 1</option>
                      <option value="outgoing_2">Công văn đi 2</option>
                      <option value="outgoing_hdqt">Công văn HĐQT</option>
                    </select>
                  </div>

                  {/* STT */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Số thứ tự (STT)</label>
                    <input
                      type="number"
                      value={stt}
                      onChange={(e) => setStt(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Receive Send Date */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Ngày/Tháng (Gửi/Nhận)</label>
                    <input
                      type="date"
                      value={receiveSendDate}
                      onChange={(e) => setReceiveSendDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                      required
                    />
                  </div>

                  {/* Doc Date */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Ngày văn bản (Ký ban hành)</label>
                    <input
                      type="date"
                      value={docDate}
                      onChange={(e) => setDocDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Doc Number */}
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Số văn bản <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value)}
                      placeholder="Ví dụ: 1577/BQLDAGT-DA5"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 placeholder-slate-300"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Sender / Receiver */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      {docType === "incoming" ? "Đơn vị gửi đến" : "Đơn vị nhận"} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={senderReceiver}
                      onChange={(e) => setSenderReceiver(e.target.value)}
                      placeholder={docType === "incoming" ? "Ví dụ: Sở Xây dựng TP.HCM" : "Ví dụ: UBND Quận 2"}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder-slate-300"
                      required
                    />
                  </div>

                  {/* Signer / Recipient */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      {docType === "incoming" ? "Người nhận / Đơn vị tiếp nhận" : "Người ký duyệt"}
                    </label>
                    <input
                      type="text"
                      value={signerRecipient}
                      onChange={(e) => setSignerRecipient(e.target.value)}
                      placeholder={docType === "incoming" ? "Ví dụ: Ban Chỉ đạo dự án" : "Ví dụ: Giám đốc Dự án"}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder-slate-300"
                    />
                  </div>
                </div>

                {/* Summary (Trích yếu) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Tóm nội dung chính (Trích yếu)</label>
                  <textarea
                    rows={3}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Tóm tắt ngắn gọn nội dung công văn..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* File scan status checkbox */}
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="hasScanCheckbox"
                      checked={hasScan}
                      onChange={(e) => setHasScan(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <label htmlFor="hasScanCheckbox" className="text-[11px] font-bold text-slate-600 uppercase cursor-pointer">Bản Scan (Có)</label>
                  </div>

                  {/* File original status checkbox */}
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="hasOriginalCheckbox"
                      checked={hasOriginal}
                      onChange={(e) => setHasOriginal(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <label htmlFor="hasOriginalCheckbox" className="text-[11px] font-bold text-slate-600 uppercase cursor-pointer">Bản gốc (Có)</label>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {/* File Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tên file công văn</label>
                    <input
                      type="text"
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="Ví dụ: cv_den_1577.pdf"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder-slate-300"
                    />
                  </div>

                  {/* Scan File URL */}
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center justify-between">
                      <span>Link bản quét (scan) – Google Drive, OneDrive...</span>
                      {uploadingScan && <span className="text-[9px] text-[#005BAC] animate-pulse normal-case font-bold">Đang tải lên...</span>}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={scanFileUrl}
                        onChange={(e) => setScanFileUrl(e.target.value)}
                        placeholder="https://drive.google.com/..."
                        className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder-slate-300"
                      />
                      <label className={`flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 bg-white hover:bg-slate-50 cursor-pointer active:scale-95 transition-all shadow-sm ${uploadingScan ? "opacity-50 pointer-events-none" : ""}`}>
                        <Upload size={13} className={uploadingScan ? "animate-bounce" : ""} />
                        <span>Tải file</span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={async (e) => {
                            if (e.target.files && e.target.files[0]) {
                              setUploadingScan(true);
                              const publicUrl = await uploadFileToSupabase(e.target.files[0]);
                              if (publicUrl) {
                                setScanFileUrl(publicUrl);
                                setHasScan(true);
                                if (!fileName) setFileName(e.target.files[0].name);
                              }
                              setUploadingScan(false);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Original File URL */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center justify-between">
                    <span>Link bản gốc (xem trực tiếp khi click icon 👁) – Google Drive, OneDrive...</span>
                    {uploadingOriginal && <span className="text-[9px] text-[#005BAC] animate-pulse normal-case font-bold">Đang tải lên...</span>}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={originalFileUrl}
                      onChange={(e) => setOriginalFileUrl(e.target.value)}
                      placeholder="https://drive.google.com/file/d/.../view"
                      className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder-slate-300"
                    />
                    <label className={`flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 bg-white hover:bg-slate-50 cursor-pointer active:scale-95 transition-all shadow-sm ${uploadingOriginal ? "opacity-50 pointer-events-none" : ""}`}>
                      <Upload size={13} className={uploadingOriginal ? "animate-bounce" : ""} />
                      <span>Tải file</span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={async (e) => {
                          if (e.target.files && e.target.files[0]) {
                            setUploadingOriginal(true);
                            const publicUrl = await uploadFileToSupabase(e.target.files[0]);
                            if (publicUrl) {
                              setOriginalFileUrl(publicUrl);
                              setHasOriginal(true);
                            }
                            setUploadingOriginal(false);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    Đóng lại
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-all active:scale-95 shadow-md"
                  >
                    <Save size={14} /> {editingDoc ? "Cập nhật thay đổi" : "Lưu vào Supabase"}
                  </button>
                </div>
              </form>

            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
          <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-blue-50 text-[#005BAC] rounded-lg">
                  <FileText size={18} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-heading font-bold text-slate-800 text-xs truncate max-w-md" title={previewTitle}>
                    {previewTitle}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold truncate">Xem tài liệu trực tuyến</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold shadow-sm transition-all cursor-pointer"
                >
                  Mở tab mới
                </a>
                <button
                  onClick={() => downloadFile(previewUrl, previewTitle)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-sm transition-all cursor-pointer border-none"
                >
                  <Download size={12} /> Tải về
                </button>
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    setPreviewUrl("");
                    setPreviewTitle("");
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all cursor-pointer bg-transparent border-none"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="flex-1 bg-slate-100 p-4 flex items-center justify-center relative">
              {previewUrl ? (
                (() => {
                  const isImage = /\.(jpeg|jpg|gif|png|webp|svg)/i.test(previewUrl.split(/[?#]/)[0]);
                  if (isImage) {
                    return (
                      <div className="w-full h-full overflow-auto flex items-center justify-center bg-white rounded-xl shadow-inner p-4">
                        <img 
                          src={previewUrl} 
                          alt={previewTitle} 
                          className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                        />
                      </div>
                    );
                  }
                  
                  let iframeSrc = previewUrl;
                  if (previewUrl.toLowerCase().includes("drive.google.com")) {
                    iframeSrc = previewUrl.replace("/view", "/preview").replace("usp=sharing", "");
                  }
                  
                  return (
                    <iframe 
                      src={iframeSrc} 
                      className="w-full h-full border-none bg-white rounded-xl shadow-inner" 
                      title="Document Preview"
                    />
                  );
                })()
              ) : (
                <div className="text-slate-400 text-xs font-semibold">Không tìm thấy tài liệu</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
