"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useDepartments } from "@/lib/departments";
import { useTenantConfig } from "@/lib/tenantConfig";
import { 
  Send, 
  User, 
  UserCheck, 
  Building, 
  FileText, 
  Image as ImageIcon, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  X
} from "lucide-react";

export default function SuggestionsPublicForm() {
  // Phòng ban đọc từ bảng `departments` (form công khai dùng policy anon),
  // bọc giữa các nhóm gộp thô cố định của form Góp ý.
  const { phongBan } = useDepartments();
  const tenantCfg = useTenantConfig();
  const DEPARTMENTS = ["Ban Giám Đốc", ...phongBan, "Ban Điều Hành Dự Án", "Khác"];
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [department, setDepartment] = useState("Khác");
  const [senderName, setSenderName] = useState("");
  const [senderContact, setSenderContact] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Kích thước tệp vượt quá giới hạn 10MB.");
      return;
    }

    // Check file type
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Hệ thống chỉ hỗ trợ đính kèm tệp hình ảnh.");
      return;
    }

    setErrorMessage(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setErrorMessage("Vui lòng điền đầy đủ Tiêu đề và Nội dung góp ý.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      let attachmentUrl = "";

      // 1. Upload image to Supabase Storage if present
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop();
        const fileName = `suggest_${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
        const filePath = `suggestions/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("clerical-documents")
          .upload(filePath, imageFile, {
            cacheControl: "3600",
            upsert: false
          });

        if (uploadError) {
          throw new Error(`Lỗi khi tải ảnh lên: ${uploadError.message}`);
        }

        // Get public URL
        const { data } = supabase.storage
          .from("clerical-documents")
          .getPublicUrl(filePath);

        attachmentUrl = data.publicUrl;
      }

      // 2. Insert suggestion record
      const { error: insertError } = await supabase
        .from("suggestions")
        .insert({
          title: title.trim(),
          content: content.trim(),
          department,
          sender_name: isAnonymous ? "Ẩn danh" : senderName.trim() || "Nặc danh",
          sender_contact: isAnonymous ? "" : senderContact.trim(),
          attachment_url: attachmentUrl || null,
          status: "pending"
        });

      if (insertError) {
        throw insertError;
      }

      setSubmitSuccess(true);
    } catch (err: any) {
      console.error("Error submitting suggestion:", err);
      setErrorMessage(err.message || "Đã xảy ra lỗi hệ thống khi gửi góp ý. Vui lòng thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setTitle("");
    setContent("");
    setDepartment("Khác");
    setSenderName("");
    setSenderContact("");
    setImageFile(null);
    setImagePreview(null);
    setSubmitSuccess(false);
    setErrorMessage(null);
    setIsAnonymous(true);
  };

  if (submitSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[#090D1A] to-[#121E36]">
        {/* Glow Spheres */}
        <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-cyan-600/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl backdrop-blur-xl">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center ring-8 ring-emerald-500/5 animate-bounce">
              <CheckCircle2 size={44} />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Gửi Góp Ý Thành Công!</h2>
            <p className="text-slate-400 text-xs leading-relaxed px-2">
              Chân thành cảm ơn bạn đã gửi ý kiến đóng góp. Mọi ý kiến đều góp phần xây dựng môi trường làm việc tốt hơn tại {tenantCfg.company_name}.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={handleReset}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-3 px-6 rounded-2xl transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-blue-500/20 text-xs"
            >
              Gửi thêm ý kiến khác
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gradient-to-br from-[#090D1A] to-[#121E36]">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Title Header */}
      <div className="text-center mb-8 max-w-md px-4 relative">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center font-heading font-extrabold text-white text-xl shadow-lg shadow-blue-500/20 mx-auto mb-4">
          {tenantCfg.logo_text}
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-350 bg-clip-text text-transparent">
          HỘP THƯ GÓP Ý ONLINE
        </h1>
        <p className="text-xs text-slate-400 font-medium tracking-wide mt-1.5 uppercase leading-relaxed">
          {tenantCfg.company_name} • Ban điều hành dự án
        </p>
      </div>

      {/* Main Form Card */}
      <div className="relative max-w-lg w-full bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* Identity Toggle */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">Hình thức gửi ý kiến</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsAnonymous(true)}
                className={`flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold transition-all border ${
                  isAnonymous
                    ? "bg-blue-600/15 border-blue-500/40 text-blue-400 shadow-md shadow-blue-500/5"
                    : "bg-slate-800/40 border-slate-800 text-slate-400 hover:bg-slate-800/60"
                }`}
              >
                <User size={14} />
                Ẩn danh bảo mật
              </button>
              <button
                type="button"
                onClick={() => setIsAnonymous(false)}
                className={`flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold transition-all border ${
                  !isAnonymous
                    ? "bg-blue-600/15 border-blue-500/40 text-blue-400 shadow-md shadow-blue-500/5"
                    : "bg-slate-800/40 border-slate-800 text-slate-400 hover:bg-slate-800/60"
                }`}
              >
                <UserCheck size={14} />
                Công khai danh tính
              </button>
            </div>
          </div>

          {/* Contact Details (Conditional) */}
          {!isAnonymous && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fadeIn">
              <div className="space-y-1">
                <label className="text-[11px] font-black text-slate-450 uppercase tracking-wider block">Họ và Tên</label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Nhập họ và tên..."
                  className="w-full px-4 py-3 bg-slate-800/40 border border-slate-800 rounded-2xl outline-none focus:border-blue-500/50 text-white text-xs font-medium placeholder-slate-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-black text-slate-455 uppercase tracking-wider block">SĐT hoặc Email liên hệ</label>
                <input
                  type="text"
                  value={senderContact}
                  onChange={(e) => setSenderContact(e.target.value)}
                  placeholder="Nhập SĐT hoặc Email..."
                  className="w-full px-4 py-3 bg-slate-800/40 border border-slate-800 rounded-2xl outline-none focus:border-blue-500/50 text-white text-xs font-medium placeholder-slate-500"
                />
              </div>
            </div>
          )}

          {/* Department Select */}
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">Bộ phận góp ý</label>
            <div className="relative">
              <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-800/40 border border-slate-800 rounded-2xl outline-none focus:border-blue-500/50 text-white text-xs font-medium appearance-none cursor-pointer"
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept} className="bg-slate-900 text-white">
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title Input */}
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">Tiêu đề góp ý</label>
            <div className="relative">
              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ví dụ: Đề xuất cung cấp thêm tủ thuốc y tế..."
                className="w-full pl-11 pr-4 py-3 bg-slate-800/40 border border-slate-800 rounded-2xl outline-none focus:border-blue-500/50 text-white text-xs font-medium placeholder-slate-500"
                required
              />
            </div>
          </div>

          {/* Content Textarea */}
          <div className="space-y-1">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">Chi tiết nội dung góp ý / kiến nghị</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Vui lòng trình bày rõ ràng kiến nghị của bạn..."
              rows={5}
              className="w-full px-4 py-3 bg-slate-800/40 border border-slate-800 rounded-2xl outline-none focus:border-blue-500/50 text-white text-xs font-medium placeholder-slate-500 resize-none leading-relaxed"
              required
            />
          </div>

          {/* Attachment upload */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">Hình ảnh đính kèm (nếu có)</label>
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
                ref={fileInputRef}
              />
              {!imagePreview ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-4 border border-dashed border-slate-800 hover:border-blue-500/50 rounded-2xl bg-slate-800/10 hover:bg-slate-800/20 text-slate-400 transition-all text-xs cursor-pointer font-bold"
                >
                  <ImageIcon size={14} />
                  Chọn hình ảnh tải lên (Tối đa 10MB)
                </button>
              ) : (
                <div className="relative border border-slate-800 rounded-2xl p-2 bg-slate-850/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={imagePreview} 
                      alt="Xem trước" 
                      className="w-10 h-10 object-cover rounded-lg border border-slate-800" 
                    />
                    <div className="min-w-0">
                      <p className="text-white text-[11px] font-bold truncate max-w-[200px] sm:max-w-[300px]">
                        {imageFile?.name}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {imageFile ? `${(imageFile.size / (1024 * 1024)).toFixed(2)} MB` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeImage}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3.5 rounded-2xl text-[11px] font-bold leading-normal">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold py-3.5 rounded-2xl transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-blue-500/15 cursor-pointer text-xs"
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" size={15} />
                  Đang xử lý gửi góp ý...
                </>
              ) : (
                <>
                  <Send size={14} />
                  Gửi ý kiến đóng góp
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
