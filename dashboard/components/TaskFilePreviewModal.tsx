"use client";

// ============================================================
// TaskFilePreviewModal — khung xem ảnh / PDF NGAY GIỮA MÀN HÌNH.
//
// Tách riêng vì hai nơi cùng cần: form Tạo/Sửa công việc và ô cập nhật của bảng
// "Danh sách việc theo dõi". Đang gõ dở mà nhảy sang tab khác thì mất mạch,
// quay lại còn phải đi tìm đúng cửa sổ.
//
// Link truyền vào phải là link ĐÃ KÝ (bucket `task-files` riêng tư) — nơi gọi
// ký trước rồi mới mở khung, để lỗi hết quyền / tệp đã xoá báo ngay chứ không
// hiện ra khung trắng.
// ============================================================

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip, X } from "lucide-react";
import { TaskFile, isImageName } from "@/lib/taskFiles";

type Props = {
  file: TaskFile;
  /** Link ký có hạn trỏ sang Supabase Storage. */
  url: string;
  onClose: () => void;
};

export default function TaskFilePreviewModal({ file, url, onClose }: Props) {
  // Esc để đóng. Chỉ gắn khi khung đang mở nên không đụng tới modal nằm dưới.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // BẮT BUỘC treo vào <body> qua portal, không để nằm tại chỗ trong cây DOM.
  // Bảng "Danh sách việc theo dõi" bọc trong khối `.glass` có backdrop-filter,
  // mà backdrop-filter biến khối đó thành gốc toạ độ của mọi con `position:
  // fixed` — để nguyên tại chỗ thì khung xem bị nhốt trong bảng và còn bị
  // overflow-hidden cắt cụt, không ra giữa màn hình được.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal((
    <div
      className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 shrink-0">
          <Paperclip size={14} className="text-slate-400 shrink-0" />
          <h3 className="font-heading font-extrabold text-xs text-slate-800 truncate flex-1 min-w-0">
            {file.name}
          </h3>
          {/* Vẫn giữ đường mở tab mới: ảnh bản vẽ khổ lớn xem trong khung này
              vẫn bé, có người cần phóng to hết cỡ hoặc tải về. */}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            Mở tab mới
          </a>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-slate-50 flex items-center justify-center p-3">
          {isImageName(file.name) ? (
            // Thẻ <img> thường, KHÔNG dùng next/image: đây là link ký có hạn trỏ
            // sang miền Supabase, đưa qua bộ tối ưu ảnh của Next chỉ tổ hỏng link
            // và tốn thêm một chặng mạng.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={file.name}
              className="max-w-full max-h-[78vh] object-contain rounded-lg"
            />
          ) : (
            <iframe
              src={url}
              title={file.name}
              className="w-full h-[78vh] rounded-lg bg-white"
            />
          )}
        </div>
      </div>
    </div>
  ), document.body);
}
