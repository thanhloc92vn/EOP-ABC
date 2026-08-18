"use client";

// ============================================================
// TaskAttachmentField — ô "Tệp đính kèm" của form Tạo / Sửa công việc.
//
// Nằm ngay dưới ô "Link sản phẩm đính kèm": hai thứ cùng một mục đích (gửi kèm
// tài liệu), khác nhau ở chỗ một bên là link Drive/OneDrive tự dán, một bên là
// tệp nằm trong kho riêng của hệ thống (bucket `task-files`, migration 043).
//
// Chỉ lo phần HIỂN THỊ. Tải lên / xoá / ký link đều do trang cha làm, vì hai
// form dùng chung một bộ hàm và trang cha mới biết tệp thuộc form nào.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Paperclip, Upload, FileText, ImageIcon, Eye, X, Loader2 } from "lucide-react";
import { TaskFile, isImageName } from "@/lib/taskFiles";

type Props = {
  files: TaskFile[];
  uploading: boolean;
  /** Lỗi của lần chọn tệp gần nhất (quá nặng, sai định dạng, hỏng mạng). */
  error: string;
  onPick: (files: FileList | null) => void;
  onRemove: (file: TaskFile) => void;
  onOpen: (file: TaskFile) => void;
};

export default function TaskAttachmentField({
  files, uploading, error, onPick, onRemove, onOpen,
}: Props) {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave bắn cả khi con trỏ đi qua từng phần tử con bên trong ô,
  // nên đếm vào/ra thay vì bật tắt trực tiếp — không thì viền cứ nhấp nháy.
  const dragDepth = useRef(0);

  // Thả trượt ra NGOÀI ô: trình duyệt mặc định mở luôn tệp đó, tức là rời khỏi
  // trang và mất trắng cả form đang điền dở. Chặn ở cấp tài liệu trong lúc ô này
  // còn hiển thị (chỉ nằm trong modal Tạo/Sửa công việc nên không đụng nơi khác).
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault();
    document.addEventListener("dragover", swallow);
    document.addEventListener("drop", swallow);
    return () => {
      document.removeEventListener("dragover", swallow);
      document.removeEventListener("drop", swallow);
    };
  }, []);

  const hasFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types || []).includes("Files");

  const handleDragEnter = (e: React.DragEvent) => {
    if (uploading || !hasFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (uploading || !hasFileDrag(e)) return;
    // BẮT BUỘC: không chặn dragover thì sự kiện drop không bao giờ bắn.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (uploading) return;
    // Cùng đường với nút bấm chọn tệp: onPick lo kiểm dung lượng và định dạng.
    onPick(e.dataTransfer.files);
  };

  return (
    <div className="space-y-1">
      <label className="text-slate-500">
        Tệp đính kèm
        <span className="ml-1 text-[11px] font-semibold text-slate-400">
          (ảnh hoặc PDF, mỗi tệp tối đa 2MB)
        </span>
      </label>

      {/* Nhãn bọc input file: input file gốc của trình duyệt không tô kiểu được,
          nên giấu đi và bấm vào cả khối này. Khối để cao hơn hẳn các ô khác vì
          đính kèm hay bị bỏ quên — mũi tên nhấp nháy theo vòng lặp để nhắc. */}
      <label
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full border-2 border-dashed rounded-xl px-4 py-6 flex flex-col items-center justify-center gap-2 transition-colors ${
          uploading
            ? "border-slate-300 bg-slate-50 text-slate-400 cursor-wait"
            : dragging
            ? "border-blue-500 bg-blue-50 text-blue-600 cursor-copy"
            : "border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 cursor-pointer"
        }`}
      >
        {/* Con trỏ đang rê tệp qua thì mọi thứ bên trong phải "trong suốt" với
            chuột, không thì dragleave bắn loạn khi đi qua icon/chữ. */}
        <span
          className={`w-11 h-11 rounded-full flex items-center justify-center ${dragging ? "pointer-events-none" : ""} ${
            uploading
              ? "bg-slate-100 text-slate-400"
              : dragging
              ? "bg-blue-100 text-blue-600"
              : "bg-blue-50 text-blue-600 upload-nudge-ring"
          }`}
        >
          {uploading
            ? <Loader2 size={20} className="animate-spin" />
            : <Upload size={20} className={dragging ? "" : "upload-nudge-icon"} />}
        </span>
        <span className={`text-[13px] font-bold ${dragging ? "pointer-events-none" : ""}`}>
          {uploading
            ? "Đang tải tệp lên..."
            : dragging
            ? "Thả tệp vào đây"
            : "Chọn ảnh / PDF để đính kèm"}
        </span>
        {!uploading && (
          <span className={`text-[11px] font-semibold ${dragging ? "text-blue-500 pointer-events-none" : "text-slate-400"}`}>
            {dragging
              ? "Ảnh hoặc PDF, mỗi tệp tối đa 2MB"
              : "Kéo thả tệp vào đây hoặc bấm để chọn — nhớ đính kèm tài liệu liên quan nhé!"}
          </span>
        )}
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          disabled={uploading}
          onChange={(e) => {
            onPick(e.target.files);
            // Dọn giá trị để chọn LẠI đúng tệp vừa gỡ vẫn kích hoạt onChange.
            e.target.value = "";
          }}
          className="hidden"
        />
      </label>

      {error && (
        <p className="text-[11px] font-bold text-rose-600 leading-relaxed">{error}</p>
      )}

      {files.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {files.map((f) => (
            <div
              key={f.path}
              className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
            >
              {isImageName(f.name)
                ? <ImageIcon size={13} className="text-blue-500 shrink-0" />
                : <FileText size={13} className="text-rose-500 shrink-0" />}
              <span className="flex-1 min-w-0 truncate text-[11px] font-bold text-slate-700">{f.name}</span>
              {/* Con mắt = xem ngay giữa màn hình, không nhảy sang tab khác. */}
              <button
                type="button"
                title="Xem tệp"
                onClick={() => onOpen(f)}
                className="shrink-0 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <Eye size={14} />
              </button>
              <button
                type="button"
                title="Gỡ tệp"
                onClick={() => onRemove(f)}
                className="shrink-0 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
            <Paperclip size={10} /> {files.length} tệp đính kèm
          </p>
        </div>
      )}
    </div>
  );
}
