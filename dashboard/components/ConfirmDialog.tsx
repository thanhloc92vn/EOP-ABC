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

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, AlertTriangle, CheckCircle2, XCircle, Info, MessageSquareText } from "lucide-react";

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

// ============================================================
// AlertDialog — hộp thông báo MỘT nút (thay cho window.alert()).
//
// Cùng khuôn với ConfirmDialog để đồng bộ giao diện: căn giữa màn hình, nền mờ,
// bo góc, biểu tượng tròn ở giữa. Khác ở chỗ chỉ có một nút "Đã hiểu" và màu +
// icon đổi theo sắc thái (thành công / lỗi / cảnh báo / thông tin).
// ============================================================

export type AlertTone = "success" | "error" | "warning" | "info";

export type AlertRequest = {
  message: string;
  /** Tự suy ra từ nội dung nếu không truyền. */
  tone?: AlertTone;
  /** Tiêu đề in đậm phía trên. Mặc định theo sắc thái. */
  title?: string;
  confirmLabel?: string;
};

// Suy ra sắc thái từ nội dung để không phải sửa từng lời gọi alert() cũ.
function inferTone(msg: string): AlertTone {
  const m = (msg || "").toLowerCase();
  if (/(lỗi|không thể|không được|không tìm|không nhận|không tải|không lưu|không mở|không xóa|không đăng|không có quyền|thất bại|thiếu|quá lớn|không hợp lệ|vượt quá)/.test(m))
    return "error";
  if (/(thành công|đã lưu|đã xóa|đã xoá|đã thêm|đã cập nhật|đã gửi|đã nạp|đã nhận diện|đã hoàn thành|đã tải|đã phê duyệt)/.test(m))
    return "success";
  if (/(vui lòng|chưa có|chưa nhập|hãy |bắt buộc)/.test(m))
    return "warning";
  return "info";
}

const TONE_TITLE: Record<AlertTone, string> = {
  success: "Thành công",
  error: "Có lỗi xảy ra",
  warning: "Lưu ý",
  info: "Thông báo",
};

export function AlertDialog({ box, onClose }: { box: AlertRequest; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tone = box.tone ?? inferTone(box.message);
  const ring = {
    success: "bg-emerald-50 text-emerald-500 ring-emerald-500/10",
    error: "bg-rose-50 text-rose-500 ring-rose-500/10",
    warning: "bg-amber-50 text-amber-500 ring-amber-500/10",
    info: "bg-sky-50 text-sky-500 ring-sky-500/10",
  }[tone];
  const btn = {
    success: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20",
    error: "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20",
    warning: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20",
    info: "bg-[#005BAC] hover:bg-blue-700 shadow-blue-500/20",
  }[tone];
  const Icon = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }[tone];

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[95] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm p-7 shadow-2xl border border-slate-100 text-center space-y-5 animate-in fade-in-50 zoom-in-95 duration-200"
      >
        <div className="flex justify-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ring-8 ${ring}`}>
            <Icon size={32} strokeWidth={2.2} />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-heading font-extrabold text-sm text-slate-800">{box.title ?? TONE_TITLE[tone]}</h3>
          <p className="text-[11px] font-semibold text-slate-500 leading-relaxed whitespace-pre-line">
            {box.message}
          </p>
        </div>

        <button
          type="button"
          autoFocus
          onClick={onClose}
          className={`w-full text-white text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer ${btn}`}
        >
          {box.confirmLabel || "Đã hiểu"}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ============================================================
// PromptDialog — hộp NHẬP LIỆU căn giữa (thay cho window.prompt()).
//
// Dùng cho những chỗ cần một dòng chữ trước khi tiếp tục (VD: lý do từ chối).
// Trả chuỗi đã nhập, hoặc null nếu người dùng bấm Huỷ / Esc.
// ============================================================

export type PromptRequest = {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  /** Bắt buộc nhập: nút xác nhận mờ đi khi ô trống. */
  required?: boolean;
  /** Ô nhiều dòng (textarea) thay vì một dòng. */
  multiline?: boolean;
  tone?: "danger" | "normal";
};

export function PromptDialog({
  box,
  onSubmit,
  onCancel,
}: {
  box: PromptRequest;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(box.defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    // Đưa con trỏ vào ô ngay khi mở để gõ được luôn.
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const danger = (box.tone ?? "normal") === "danger";
  const canSubmit = !box.required || value.trim().length > 0;
  const submit = () => { if (canSubmit) onSubmit(value); };

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[92] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md p-7 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in-50 zoom-in-95 duration-200"
      >
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center ring-8 ${
            danger ? "bg-rose-50 text-rose-500 ring-rose-500/10" : "bg-sky-50 text-sky-500 ring-sky-500/10"
          }`}>
            <MessageSquareText size={22} strokeWidth={2.2} />
          </div>
          <div className="space-y-1 pt-0.5">
            <h3 className="font-heading font-extrabold text-sm text-slate-800">{box.title}</h3>
            {box.message && (
              <p className="text-[11px] font-semibold text-slate-500 leading-relaxed whitespace-pre-line">
                {box.message}
              </p>
            )}
          </div>
        </div>

        {box.multiline ? (
          <textarea
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={box.placeholder}
            rows={3}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-semibold text-slate-800 text-xs bg-white transition-all resize-none"
          />
        ) : (
          <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder={box.placeholder}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-semibold text-slate-800 text-xs bg-white transition-all"
          />
        )}

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            Huỷ bỏ
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={`flex-1 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              danger
                ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20"
                : "bg-[#005BAC] hover:bg-blue-700 shadow-blue-500/20"
            }`}
          >
            {box.confirmLabel || "Xác nhận"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Gói hai hộp căn giữa cho một trang, thay hẳn window.alert / window.confirm:
 *   const { notify, confirm, dialogsNode } = useDialogs();
 *   notify("Đã lưu thành công!");                    // thay alert()
 *   if (!(await confirm("Xoá mục này?"))) return;    // thay confirm(), giữ nguyên luồng
 *   return (<>...{dialogsNode}</>);
 */
export function useDialogs() {
  const [alertBox, setAlertBox] = useState<AlertRequest | null>(null);
  const [confirmBox, setConfirmBox] = useState<ConfirmRequest | null>(null);
  const [promptBox, setPromptBox] = useState<PromptRequest | null>(null);
  // Giữ hàm resolve của Promise để nút Huỷ/Xoá trả kết quả về đúng lời gọi await.
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const promptResolver = useRef<((value: string | null) => void) | null>(null);

  const notify = useCallback((arg: string | AlertRequest) => {
    setAlertBox(typeof arg === "string" ? { message: arg } : arg);
  }, []);

  const prompt = useCallback(
    (arg: string | PromptRequest): Promise<string | null> =>
      new Promise<string | null>((resolve) => {
        promptResolver.current = resolve;
        setPromptBox(typeof arg === "string" ? { title: arg } : arg);
      }),
    []
  );

  const settlePrompt = useCallback((value: string | null) => {
    const resolve = promptResolver.current;
    if (!resolve) return;
    promptResolver.current = null;
    setPromptBox(null);
    resolve(value);
  }, []);

  const confirm = useCallback(
    (arg: string | Omit<ConfirmRequest, "onConfirm">): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        const base = typeof arg === "string" ? { title: arg } : arg;
        setConfirmBox({
          confirmLabel: "Xác nhận",
          ...base,
          onConfirm: () => {}, // Kết quả xử lý ở settleConfirm bên dưới.
        });
      }),
    []
  );

  // Chốt kết quả một lần (lời gọi đầu tiên thắng), rồi đóng hộp.
  const settleConfirm = useCallback((ok: boolean) => {
    const resolve = resolver.current;
    if (!resolve) return;
    resolver.current = null;
    setConfirmBox(null);
    resolve(ok);
  }, []);

  return {
    notify,
    confirm,
    prompt,
    dialogsNode: (
      <>
        {confirmBox && (
          <ConfirmDialog
            // ConfirmDialog chạy onClose() TRƯỚC rồi mới onConfirm(). Đẩy nhánh
            // "huỷ" sang microtask để nếu là cú bấm Xác nhận thì onConfirm (true)
            // kịp chốt trước, còn bấm Huỷ / nền / Esc thì microtask trả về false.
            box={{ ...confirmBox, onConfirm: () => settleConfirm(true) }}
            onClose={() => queueMicrotask(() => settleConfirm(false))}
          />
        )}
        {promptBox && (
          <PromptDialog
            box={promptBox}
            onSubmit={(v) => settlePrompt(v)}
            onCancel={() => settlePrompt(null)}
          />
        )}
        {alertBox && <AlertDialog box={alertBox} onClose={() => setAlertBox(null)} />}
      </>
    ),
  };
}
