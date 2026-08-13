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
  return (
    <div className="space-y-1">
      <label className="text-slate-500">
        Tệp đính kèm
        <span className="ml-1 text-[11px] font-semibold text-slate-400">
          (ảnh hoặc PDF, mỗi tệp tối đa 2MB)
        </span>
      </label>

      {/* Nhãn bọc input file: input file gốc của trình duyệt không tô kiểu được,
          nên giấu đi và bấm vào cả khối này. */}
      <label
        className={`w-full border border-dashed border-slate-300 rounded-xl p-3 flex items-center justify-center gap-2 text-xs font-bold transition-colors ${
          uploading
            ? "bg-slate-50 text-slate-400 cursor-wait"
            : "text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 cursor-pointer"
        }`}
      >
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {uploading ? "Đang tải tệp lên..." : "Chọn ảnh / PDF để đính kèm"}
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
