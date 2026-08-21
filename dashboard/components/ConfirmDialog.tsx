"use client";

// ============================================================
// ConfirmDialog — hộp hỏi "có chắc không" căn GIỮA màn hình.
//
// Thay cho window.confirm(): hộp của trình duyệt luôn dính mép trên, hiện tên
// miền "www.nhansutrungnamec.com cho biết" và không theo được giao diện chung.
// Mẫu thiết kế bê từ hộp đã dùng ở trang Lịch (app/calendar) cho đồng bộ.
//
// createPortal xuống document.body: các panel của /bao-cao nằm trong thẻ có
// backdrop-filter, mà phần tử `fixed` bên trong khối đó bị nhốt lại chứ không
// căn theo màn hình nữa.
//
// z-[90]: phải nổi trên CẢ modal sửa đối tác / xem hồ sơ (z-50, z-[60]) vì nút
// xoá nằm ngay trong mấy modal đó.
//
// CÁCH DÙNG:
//   const { ask, confirmNode } = useConfirmBox();
//   ...
//   ask({ title: "Xoá phiếu ABC?", message: "...", onConfirm: () => doDelete() });
//   ...
//   return (<>...{confirmNode}</>);
//
// Khác window.confirm ở một điểm PHẢI nhớ: hàm này KHÔNG dừng luồng chạy. Việc
// cần làm đặt hết trong onConfirm, đừng viết tiếp ở dòng dưới ask().
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, AlertTriangle } from "lucide-react";

export type ConfirmRequest = {
  title: string;
  message?: string;
  /** Chữ trên nút xác nhận. Mặc định "Xoá". */
  confirmLabel?: string;
  /** "danger" (mặc định) = nút đỏ + biểu tượng thùng rác. */
  tone?: "danger" | "normal";
  onConfirm: () => void;
};

export function ConfirmDialog({ box, onClose }: { box: ConfirmRequest; onClose: () => void }) {
  // Esc để thoát — hộp này che cả màn hình, không nên bắt buộc phải rê chuột.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Không cần chốt "đã mount": hộp chỉ dựng lên sau một cú bấm của người dùng,
  // lúc đó chắc chắn đang ở trình duyệt (cùng lối với ModalShell trong repo).
  const danger = (box.tone ?? "danger") === "danger";

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm p-7 shadow-2xl border border-slate-100 text-center space-y-5 animate-in fade-in-50 zoom-in-95 duration-200"
      >
        <div className="flex justify-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center ring-8 ${
              danger
                ? "bg-rose-50 text-rose-500 ring-rose-500/10"
                : "bg-amber-50 text-amber-500 ring-amber-500/10"
            }`}
          >
            {danger
              ? <Trash2 size={32} strokeWidth={2.2} />
              : <AlertTriangle size={32} strokeWidth={2.2} />}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-heading font-extrabold text-sm text-slate-800">{box.title}</h3>
          {box.message && (
            <p className="text-[11px] font-semibold text-slate-500 leading-relaxed whitespace-pre-line">
              {box.message}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            Huỷ bỏ
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => { const run = box.onConfirm; onClose(); run(); }}
            className={`flex-1 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer ${
              danger
                ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20"
                : "bg-[#005BAC] hover:bg-blue-700 shadow-blue-500/20"
            }`}
          >
            {box.confirmLabel || "Xoá"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Gói sẵn state cho component dùng: trả về hàm hỏi + phần tử cần render. */
export function useConfirmBox() {
  const [box, setBox] = useState<ConfirmRequest | null>(null);
  const ask = useCallback((req: ConfirmRequest) => setBox(req), []);
  const close = useCallback(() => setBox(null), []);
  return {
    ask,
    confirmNode: box ? <ConfirmDialog box={box} onClose={close} /> : null,
  };
}
