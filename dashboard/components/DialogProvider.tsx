"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

// ============================================================
// HỘP THOẠI TRONG APP (thay cho alert/confirm của trình duyệt)
//
// alert()/confirm() mặc định dán ở mép trên trình duyệt, mang nhãn
// "localhost:3000 says", không xuống dòng được và không theo giao diện hệ thống
// — nội dung dài kiểu hướng dẫn khắc phục lỗi đọc rất khó.
//
// Provider này cung cấp hai hàm dùng y hệt bản gốc nhưng trả về Promise:
//   await dialog.alert("...")            -> hộp thoại 1 nút
//   const ok = await dialog.confirm(...) -> true/false
// nên chỗ gọi chỉ cần thêm `await`, không phải viết lại luồng.
// ============================================================

type Tone = "info" | "success" | "warning" | "danger";

type DialogOptions = {
  title?: string;
  tone?: Tone;
  confirmText?: string;
  cancelText?: string;
};

type DialogContextValue = {
  alert: (message: string, options?: DialogOptions) => Promise<void>;
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog phải được dùng bên trong <DialogProvider>.");
  return ctx;
}

type DialogState = {
  message: string;
  title: string;
  tone: Tone;
  confirmText: string;
  cancelText: string | null;
};

const TONE_STYLES: Record<Tone, { icon: ReactNode; ring: string; button: string }> = {
  info: {
    icon: <Info size={20} className="text-[#005BAC]" />,
    ring: "bg-blue-50 border-blue-100",
    button: "bg-gradient-to-r from-[#005BAC] to-[#00AEEF] hover:brightness-110",
  },
  success: {
    icon: <CheckCircle2 size={20} className="text-emerald-600" />,
    ring: "bg-emerald-50 border-emerald-100",
    button: "bg-emerald-600 hover:bg-emerald-700",
  },
  warning: {
    icon: <AlertTriangle size={20} className="text-amber-600" />,
    ring: "bg-amber-50 border-amber-100",
    button: "bg-amber-600 hover:bg-amber-700",
  },
  danger: {
    icon: <XCircle size={20} className="text-rose-600" />,
    ring: "bg-rose-50 border-rose-100",
    button: "bg-rose-600 hover:bg-rose-700",
  },
};

export default function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const open = useCallback((state: DialogState) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState(state);
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setState(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(value);
  }, []);

  const alert = useCallback(
    async (message: string, options?: DialogOptions) => {
      await open({
        message,
        title: options?.title ?? "Thông báo",
        tone: options?.tone ?? "info",
        confirmText: options?.confirmText ?? "Đã hiểu",
        cancelText: null,
      });
    },
    [open]
  );

  const confirm = useCallback(
    (message: string, options?: DialogOptions) =>
      open({
        message,
        title: options?.title ?? "Xác nhận",
        tone: options?.tone ?? "warning",
        confirmText: options?.confirmText ?? "Đồng ý",
        cancelText: options?.cancelText ?? "Huỷ",
      }),
    [open]
  );

  const tone = state ? TONE_STYLES[state.tone] : null;

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}

      {state && tone && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onKeyDown={(e) => {
            if (e.key === "Escape") close(false);
            if (e.key === "Enter") close(true);
          }}
onClick={(e) => { if (e.target === e.currentTarget && state.cancelText) close(false); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start gap-3 p-5">
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${tone.ring}`}>
                {tone.icon}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h3 className="text-sm font-extrabold text-slate-800">{state.title}</h3>
                {/* whitespace-pre-line: giữ nguyên xuống dòng của thông báo nhiều
                    đoạn (hướng dẫn khắc phục lỗi), thứ alert() gốc không làm được. */}
                <p className="mt-1.5 max-h-[50vh] overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-slate-600">
                  {state.message}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5">
              {state.cancelText && (
                <button
                  onClick={() => close(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  {state.cancelText}
                </button>
              )}
              <button
                autoFocus
                onClick={() => close(true)}
                className={`rounded-xl px-5 py-2 text-xs font-bold text-white shadow-sm transition active:scale-[0.97] ${tone.button}`}
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
