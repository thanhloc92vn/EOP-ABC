"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { 
  Search, 
  Filter, 
  Loader2, 
  Check, 
  MessageSquare, 
  Building, 
  Calendar, 
  User, 
  ExternalLink,
  QrCode,
  Download,
  AlertCircle,
  ImageIcon,
  CheckSquare,
  Archive,
  Hourglass,
  RefreshCw,
  Trash2
} from "lucide-react";

interface Suggestion {
  id: string;
  created_at: string;
  title: string;
  content: string;
  department: string;
  sender_name: string;
  sender_contact: string;
  status: "pending" | "processing" | "resolved" | "archived";
  response: string | null;
  attachment_url: string | null;
}

const STATUS_LABELS = {
  pending: { label: "Chờ xử lý", color: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/30", icon: Hourglass },
  processing: { label: "Đang xử lý", color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/30", icon: RefreshCw },
  resolved: { label: "Đã giải quyết", color: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30", icon: CheckSquare },
  archived: { label: "Lưu trữ", color: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-800/30", icon: Archive }
};

export default function AdminSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter state
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDept, setFilterDept] = useState<string>("all");

  // Selection & Details panel state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<Suggestion["status"]>("pending");
  const [editResponse, setEditResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // QR Code URL state
  const [qrUrl, setQrUrl] = useState("");

  // User auth state
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);

  const selectedSuggestion = suggestions.find(s => s.id === selectedId) || null;

  const canManage = !!(currentUser && (
    currentUser.isAdmin ||
    currentUser.role.toLowerCase() === "admin" ||
    currentUser.name === "Lê Thị Hoa Đào" ||
    currentUser.email.toLowerCase().trim() === "lehoadao2706@gmail.com" ||
    currentUser.name === "Lại Nguyễn Lan Phương" ||
    currentUser.name === "Dương Nhật Hoành Anh" ||
    currentUser.role === "CV Nhân sự" ||
    currentUser.role === "Tổ trưởng Nhân sự" ||
    (currentUser.role.toLowerCase().includes("trưởng phòng") && 
     (currentUser.department.toLowerCase().includes("hành chính") || currentUser.department.toLowerCase().includes("hcns"))) ||
    (currentUser.role.toLowerCase().includes("tổ trưởng") && 
     (currentUser.department.toLowerCase().includes("hành chính") || currentUser.department.toLowerCase().includes("hcns")))
  ));

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("suggestions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSuggestions(data || []);

      if (data && data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
        setEditStatus(data[0].status);
        setEditResponse(data[0].response || "");
      }
    } catch (err: any) {
      console.error("Error fetching suggestions:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) return;

      const user = session.user;
      const email = user.email || "";

      // 1. Check allowed_users for Admin
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
    } catch (err) {
      console.error("Error fetching current user info:", err);
    }
  };

  useEffect(() => {
    fetchSuggestions();
    fetchCurrentUser();
    
    // Set public QR link based on environment
    if (typeof window !== "undefined") {
      setQrUrl(`${window.location.origin}/gop-y`);
    }
  }, []);

  const handleSelectSuggestion = (s: Suggestion) => {
    setSelectedId(s.id);
    setEditStatus(s.status);
    setEditResponse(s.response || "");
    setErrorMsg(null);
  };

  const handleUpdateStatusAndResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase
        .from("suggestions")
        .update({
          status: editStatus,
          response: editResponse.trim() || null
        })
        .eq("id", selectedId);

      if (error) throw error;

      // Update local state
      setSuggestions(prev => prev.map(s => {
        if (s.id === selectedId) {
          return { ...s, status: editStatus, response: editResponse.trim() || null };
        }
        return s;
      }));

      alert("Cập nhật trạng thái xử lý góp ý thành công!");
    } catch (err: any) {
      console.error("Error updating suggestion:", err);
      setErrorMsg(err.message || "Không thể cập nhật thông tin.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSuggestion = async (id?: string) => {
    const targetId = id || selectedId;
    if (!targetId) return;
    
    const confirmDelete = window.confirm(
      "Bạn có chắc chắn muốn xóa ý kiến đóng góp này không? Hành động này không thể khôi phục lại."
    );
    if (!confirmDelete) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from("suggestions")
        .delete()
        .eq("id", targetId);

      if (error) throw error;

      // Update state
      const updatedList = suggestions.filter(s => s.id !== targetId);
      setSuggestions(updatedList);

      if (targetId === selectedId) {
        if (updatedList.length > 0) {
          setSelectedId(updatedList[0].id);
          setEditStatus(updatedList[0].status);
          setEditResponse(updatedList[0].response || "");
        } else {
          setSelectedId(null);
          setEditStatus("pending");
          setEditResponse("");
        }
      }
      
      alert("Đã xóa góp ý thành công!");
    } catch (err: any) {
      console.error("Error deleting suggestion:", err);
      alert("Lỗi khi xóa góp ý: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadQR = async () => {
    if (!qrUrl) return;
    try {
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrUrl)}`;
      const response = await fetch(qrApiUrl);
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "ma_qr_gop_y.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to download QR code image", err);
      alert("Lỗi khi tải xuống hình ảnh QR. Bạn có thể chuột phải vào ảnh và chọn Lưu ảnh.");
    }
  };

  // Filter list
  const filteredSuggestions = suggestions.filter(s => {
    const matchesSearch = s.title.toLowerCase().includes(search.toLowerCase()) || 
                          s.content.toLowerCase().includes(search.toLowerCase()) ||
                          s.sender_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || s.status === filterStatus;
    const matchesDept = filterDept === "all" || s.department === filterDept;

    return matchesSearch && matchesStatus && matchesDept;
  });

  const qrImageUrl = qrUrl 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrUrl)}`
    : "";

  return (
    <div className="flex min-h-screen bg-[#F7F9FC] relative">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header 
          title="Góp ý & Kiến nghị" 
          subtitle="Quản lý các đóng góp ý kiến xây dựng công ty từ khối văn phòng và các Ban điều hành" 
        />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Main list & Search Panel */}
          <div className="xl:col-span-2 space-y-4">
            
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-slate-200/60 rounded-2xl shadow-sm">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm theo tiêu đề, người gửi..."
                    className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all"
                  />
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-xl">
                  <Filter size={13} className="text-slate-400" />
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-transparent border-none text-xs outline-none cursor-pointer text-slate-600 font-medium"
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="pending">Chờ xử lý</option>
                    <option value="processing">Đang xử lý</option>
                    <option value="resolved">Đã giải quyết</option>
                    <option value="archived">Lưu trữ</option>
                  </select>
                </div>

                {/* Department Filter */}
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-xl">
                  <Building size={13} className="text-slate-400" />
                  <select
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                    className="bg-transparent border-none text-xs outline-none cursor-pointer text-slate-600 font-medium"
                  >
                    <option value="all">Tất cả phòng ban</option>
                    {Array.from(new Set(suggestions.map(s => s.department))).map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button 
                onClick={fetchSuggestions}
                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-all"
                title="Tải lại dữ liệu"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            {/* List */}
            {loading ? (
              <div className="flex flex-col items-center justify-center p-20 bg-white border border-slate-200/60 rounded-3xl gap-3 shadow-sm">
                <Loader2 className="animate-spin text-blue-600" size={32} />
                <p className="text-xs text-slate-500 font-semibold">Đang tải danh sách góp ý...</p>
              </div>
            ) : filteredSuggestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 bg-white border border-slate-200/60 rounded-3xl text-center space-y-3 shadow-sm">
                <MessageSquare className="text-slate-300" size={48} />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-700">Không tìm thấy góp ý nào</p>
                  <p className="text-xs text-slate-400">Không có dữ liệu đóng góp ý kiến nào khớp với bộ lọc hiện tại.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5">
                {filteredSuggestions.map((item) => {
                  const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.pending;
                  const StatusIcon = statusInfo.icon;
                  const isSelected = item.id === selectedId;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectSuggestion(item)}
                      className={`p-5 rounded-3xl border transition-all cursor-pointer text-left relative flex flex-col gap-3.5 ${
                        isSelected
                          ? "bg-white border-blue-500/80 shadow-md shadow-blue-500/5 ring-1 ring-blue-500/50"
                          : "bg-white border-slate-200/60 hover:border-slate-350 shadow-sm"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <h3 className="text-sm font-bold text-slate-800 leading-tight">
                            {item.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-slate-500 font-medium">
                            <span className="flex items-center gap-1">
                              <Building size={11} />
                              {item.department}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar size={11} />
                              {new Date(item.created_at).toLocaleDateString("vi-VN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric"
                              })}
                            </span>
                            <span className="flex items-center gap-1 font-semibold text-slate-600">
                              <User size={11} />
                              {item.sender_name}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.75 rounded-full border ${statusInfo.color}`}>
                            <StatusIcon size={10} />
                            {statusInfo.label}
                          </span>
                          {canManage && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSuggestion(item.id);
                              }}
                              className="p-1.5 text-slate-450 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-slate-100 hover:border-rose-100 cursor-pointer"
                              title="Xóa góp ý"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-550 leading-relaxed font-medium line-clamp-3">
                        {item.content}
                      </p>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-500 font-semibold">
                        <span className="flex items-center gap-1">
                          {item.attachment_url && (
                            <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                              <ImageIcon size={10} />
                              Có ảnh đính kèm
                            </span>
                          )}
                        </span>
                        {item.response && (
                          <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                            Đã phản hồi
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Details Panel & QR Generator */}
          <div className="space-y-6">
            
            {/* Suggestion Details Form */}
            {selectedSuggestion ? (
              <div className="bg-white p-6 border border-slate-200/60 rounded-3xl shadow-sm text-left space-y-5">
                <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                  <div>
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Chi Tiết Kiến Nghị</h2>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">ID: {selectedSuggestion.id}</p>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => handleDeleteSuggestion()}
                      className="p-2 text-rose-500 hover:text-white hover:bg-rose-600 rounded-xl transition-all border border-rose-100 hover:border-rose-650 cursor-pointer"
                      title="Xóa góp ý này"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Người gửi</span>
                    <p className="text-xs text-slate-800 font-bold">
                      {selectedSuggestion.sender_name} 
                      {selectedSuggestion.sender_contact ? ` (${selectedSuggestion.sender_contact})` : ""}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Nội dung góp ý</span>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium bg-slate-50 p-3.5 rounded-2xl border border-slate-100 whitespace-pre-wrap">
                      {selectedSuggestion.content}
                    </p>
                  </div>

                  {/* Attachment View */}
                  {selectedSuggestion.attachment_url && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Ảnh thực tế đính kèm</span>
                      <a 
                        href={selectedSuggestion.attachment_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="group relative block w-full aspect-video border border-slate-200 rounded-2xl overflow-hidden cursor-pointer bg-slate-50 hover:opacity-90 transition-all"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={selectedSuggestion.attachment_url} 
                          alt="Đính kèm" 
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                          <span className="bg-white/90 backdrop-blur text-slate-800 font-bold px-3 py-1.5 rounded-xl text-[10px] flex items-center gap-1 shadow">
                            <ExternalLink size={11} />
                            Mở ảnh tab mới
                          </span>
                        </div>
                      </a>
                    </div>
                  )}
                </div>

                {/* Read-Only Status & Response (for regular users) or Edit Form (for managers) */}
                {!canManage ? (
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Trạng thái xử lý</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full border ${STATUS_LABELS[selectedSuggestion.status]?.color || STATUS_LABELS.pending.color}`}>
                        {STATUS_LABELS[selectedSuggestion.status]?.label || STATUS_LABELS.pending.label}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Phản hồi của HCNS</span>
                      <p className="text-xs text-slate-705 leading-relaxed font-medium bg-slate-50 p-3.5 rounded-2xl border border-slate-100 whitespace-pre-wrap">
                        {selectedSuggestion.response || "Chưa có phản hồi từ Ban nhân sự."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleUpdateStatusAndResponse} className="space-y-4 pt-4 border-t border-slate-100">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Trạng thái xử lý</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as Suggestion["status"])}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-semibold text-slate-700 cursor-pointer"
                      >
                        <option value="pending">Chờ xử lý</option>
                        <option value="processing">Đang xử lý</option>
                        <option value="resolved">Đã giải quyết</option>
                        <option value="archived">Lưu trữ</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Ghi chú xử lý / Phản hồi của HCNS</label>
                      <textarea
                        value={editResponse}
                        onChange={(e) => setEditResponse(e.target.value)}
                        placeholder="Ghi nhận phương án xử lý tại đây..."
                        rows={4}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-medium resize-none placeholder-slate-400"
                      />
                    </div>

                    {errorMsg && (
                      <div className="flex items-start gap-2 text-rose-500 text-[10px] font-bold">
                        <AlertCircle size={13} className="shrink-0 mt-0.5" />
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-500/10 cursor-pointer"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="animate-spin" size={13} />
                          Đang cập nhật...
                        </>
                      ) : (
                        <>
                          <Check size={13} />
                          Cập nhật kết quả
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="bg-white p-6 border border-slate-200/60 rounded-3xl shadow-sm text-center py-12 text-slate-400 font-medium text-xs">
                Chọn một ý kiến đóng góp bên danh sách để xem chi tiết và phản hồi.
              </div>
            )}

            {/* suggestion QR Code Generator */}
            {canManage && (
              <div className="bg-white p-6 border border-slate-200/60 rounded-3xl shadow-sm text-left space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
                  <QrCode size={18} className="text-blue-600" />
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Mã QR Hộp Thư</h2>
                </div>

                <div className="space-y-3.5 flex flex-col items-center">
                  {qrImageUrl ? (
                    <div className="p-3 border border-slate-200 bg-white rounded-2xl shadow-inner">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={qrImageUrl} 
                        alt="QR Code Hộp Thư Góp Ý" 
                        className="w-44 h-44 object-contain" 
                      />
                    </div>
                  ) : (
                    <div className="w-44 h-44 border border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-300">
                      <Loader2 className="animate-spin text-slate-400" size={24} />
                    </div>
                  )}

                  <div className="w-full space-y-1.5 text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Đường dẫn quét QR</label>
                    <input
                      type="text"
                      value={qrUrl}
                      onChange={(e) => setQrUrl(e.target.value)}
                      placeholder="Nhập link (Ví dụ: http://10.0.7.198:3000/gop-y)"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-semibold text-slate-700"
                    />
                    <p className="text-[9px] text-slate-400 leading-normal">
                      * Mẹo: Để quét bằng điện thoại khi chạy local, hãy đổi <code className="bg-slate-150 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-650 dark:text-slate-300 font-bold">localhost</code> thành IP máy tính của bạn (ví dụ: <code className="bg-slate-150 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-650 dark:text-slate-300 font-bold">10.0.7.198</code>) và điện thoại cần kết nối cùng mạng Wifi.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadQR}
                    className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200/80 active:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-all border border-slate-200 cursor-pointer"
                  >
                    <Download size={13} />
                    Tải ảnh QR Code để in
                  </button>
                </div>
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
