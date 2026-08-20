"use client";

// ============================================================
// TransferRequestPreview — xem trước + xuất Giấy đề nghị chuyển tiền
// (biểu mẫu HC-BM021/ĐNCT).
//
// CHÉP TỪ Hành chính & VPP > Hồ sơ thanh toán định kỳ, KHÔNG tách dùng chung
// với màn hình đó — user chốt 20/08/2026: chấp nhận hai bản mã để đổi lấy việc
// KHÔNG đụng vào app/administration/page.tsx (trang đang chạy thật, hơn 9000
// dòng, sửa nhầm là ảnh hưởng dữ liệu thanh toán hành chính).
//
// Hệ quả phải nhớ: sửa mẫu giấy thì PHẢI sửa cả hai nơi. Bản kia nằm inline
// trong app/administration/page.tsx, tìm theo chuỗi "HC-BM021/ĐNCT".
//
// File Word thì KHÔNG chép lại: cả hai cùng gọi /api/export-invoice-payment với
// templateType "transfer", cùng ra một mẫu phieu_de_nghi_chuyen_tien_templated.docx.
// ============================================================

import { useState } from "react";
import { createPortal } from "react-dom";
import { Eye, X, Download, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { docSoVietNam } from "@/lib/wordExporter";

export type TransferRequestData = {
  employeeName: string;
  employeeDept: string;
  /** Lý do xin đề nghị chuyển tiền — chính là nội dung thanh toán. */
  reason: string;
  projectName: string;
  supplierName: string;
  bankAccount: string;
  bankNameBranch: string;
  amount: number;
};

/**
 * Gọi đúng route mà màn hình Hành chính đang dùng. Không dựng route mới:
 * payload của nó vốn đã chung chung, không dính gì tới nghiệp vụ hành chính.
 */
export async function exportTransferRequestDocx(d: TransferRequestData): Promise<void> {
  const res = await apiFetch("/api/export-invoice-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employeeName: d.employeeName,
      employeeDept: d.employeeDept,
      mission: d.reason,
      projectName: d.projectName,
      supplierName: d.supplierName,
      bankAccount: d.bankAccount,
      bankNameBranch: d.bankNameBranch,
      templateType: "transfer",
      items: [
        {
          number: "",
          // Ngày trên giấy là NGÀY XUẤT FILE (chốt với user), không phải ngày
          // thanh toán dự kiến của dòng kế hoạch.
          date: new Date().toISOString().slice(0, 10),
          desc: d.reason,
          amount: d.amount,
        },
      ],
    }),
  });

  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    throw new Error(
      info?.error === "template_not_found"
        ? "Không tìm thấy mẫu phieu_de_nghi_chuyen_tien_templated.docx trong public/templates."
        : info?.error || "Máy chủ không xuất được giấy đề nghị."
    );
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Giay_De_Nghi_Chuyen_Tien_${(d.supplierName || "NCC").replace(/\s+/g, "_")}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function TransferRequestPreview({ data, onClose }: {
  data: TransferRequestData;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const today = new Date();
  const tai = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await exportTransferRequestDocx(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // z-[60]: cửa sổ này mở ĐÈ LÊN modal nhập dòng kế hoạch (z-50), không thay thế nó.
  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 flex flex-col space-y-5 relative">
        <button type="button" onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-full cursor-pointer">
          <X size={16} />
        </button>

        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-[#005BAC]">
            <Eye size={15} />
          </div>
          <div>
            <h3 className="font-heading font-extrabold text-slate-800 text-sm">
              Xem trước Giấy đề nghị chuyển tiền
            </h3>
            <p className="text-slate-400 text-[10px] font-semibold mt-0.5">
              Biểu mẫu HC-BM021/ĐNCT (Xem trước nội dung điền tự động)
            </p>
          </div>
        </div>

        {err && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-[11px] font-bold text-rose-700">
            {err}
          </div>
        )}

        {/* ─── Tờ giấy ─── */}
        {/* `paper-sheet` (khai trong globals.css) ghim nền trắng + mực đen cho cả
            dark mode. KHÔNG dùng `bg-white` / `text-[#1e293b]` ở đây nữa: dark
            mode remap `bg-white` thành nền tối trong khi chữ vẫn tối, nhìn ra tờ
            giấy trắng trơn chỉ còn khung bảng. */}
        <div
          className="paper-sheet border shadow p-8 rounded-xl leading-relaxed max-w-2xl mx-auto w-full select-none font-medium"
          style={{ fontFamily: "'Times New Roman', Times, serif" }}
        >
          <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-4">
            <div className="text-left font-sans">
              <div className="text-base font-black text-[#005BAC]">
                TRUNG <span className="text-red-500">N</span>AM{" "}
                <span className="text-sky-400 text-xs font-normal italic">E&amp;C</span>
              </div>
              <div className="text-[7.5px] font-bold text-slate-800 mt-0.5">
                CÔNG TY CP XÂY DỰNG VÀ LẮP MÁY TRUNG NAM
              </div>
              <div className="text-[6.5px] text-slate-500 mt-1 leading-tight">
                A: Tầng trệt tòa nhà Safomec, 7/1 Thành Thái, Phường 14, Quận 10, TPHCM<br />
                T: (+84) 834 70 75 79 &nbsp; E: info.tnec@trungnamgroup.com.vn
              </div>
            </div>
            <div className="text-center font-sans">
              <div className="text-[13px] font-bold tracking-wide">GIẤY ĐỀ NGHỊ CHUYỂN TIỀN</div>
              <div className="text-[9.5px] font-bold underline mt-0.5">HC-BM021/ĐNCT</div>
            </div>
          </div>

          <div className="mb-4 text-xs font-bold leading-normal">
            Kính gửi: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - Ban lãnh đạo Công ty CP XD và LM Trung Nam;<br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - Phòng Kế toán công ty,
          </div>

          <div className="space-y-1.5 text-xs mb-4">
            <div>
              <span className="underline">Họ và tên người đề nghị</span>:{" "}
              <span className="font-bold">{data.employeeName}</span>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              <span className="underline">Bộ phận</span>:{" "}
              <span className="font-bold">{data.employeeDept}</span>
            </div>
            <div>
              <span className="underline">Lý do xin đề nghị chuyển tiền</span>: <span>{data.reason}</span>
            </div>
            <div>
              <span className="underline">Tên dự án</span>:{" "}
              <span className="font-bold">{data.projectName}</span>
            </div>
            <div>
              <span className="underline">Tên đơn vị thụ hưởng</span>:{" "}
              <span className="font-bold">{data.supplierName}</span>
            </div>
            <div>
              <span className="underline">Số tài khoản</span>:{" "}
              <span className="font-bold">{data.bankAccount || "…………………"}</span>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; tại Ngân hàng{" "}
              <span className="font-bold">{data.bankNameBranch || "…………………"}</span>
            </div>
          </div>

          <table className="w-full border-collapse border border-slate-900 text-[10px] mb-4 text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-900 font-bold border-b border-slate-900 text-center font-sans">
                <th className="border border-slate-900 p-1 text-center" rowSpan={2}>TT</th>
                <th className="border border-slate-900 p-1 text-center" colSpan={2}>HÓA ĐƠN</th>
                <th className="border border-slate-900 p-1 text-center" rowSpan={2}>NỘI DUNG THANH TOÁN</th>
                <th className="border border-slate-900 p-1 text-center" rowSpan={2}>SỐ TIỀN (VNĐ)</th>
                <th className="border border-slate-900 p-1 text-center" rowSpan={2}>GHI CHÚ</th>
              </tr>
              <tr className="bg-slate-50 text-slate-900 font-bold border-b border-slate-900 text-center font-sans">
                <th className="border border-slate-900 p-1 text-center">SỐ</th>
                <th className="border border-slate-900 p-1 text-center">NGÀY</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-900">
                <td className="border border-slate-900 p-1 text-center">1</td>
                <td className="border border-slate-900 p-1 font-mono font-bold text-center">—</td>
                <td className="border border-slate-900 p-1 text-center">
                  {today.toLocaleDateString("vi-VN")}
                </td>
                <td className="border border-slate-900 p-1">{data.reason}</td>
                <td className="border border-slate-900 p-1 text-right font-mono font-bold">
                  {data.amount.toLocaleString("vi-VN")}
                </td>
                <td className="border border-slate-900 p-1"></td>
              </tr>
              <tr className="font-bold border-b border-slate-900">
                <td className="border border-slate-900 p-1 text-center" colSpan={4}>Tổng cộng</td>
                <td className="border border-slate-900 p-1 text-right font-mono font-bold">
                  {data.amount.toLocaleString("vi-VN")}
                </td>
                <td className="border border-slate-900 p-1"></td>
              </tr>
            </tbody>
          </table>

          <div className="text-xs space-y-1.5 mb-6 leading-relaxed">
            <div className="italic">
              <span className="font-bold">Bằng chữ: </span>
              {docSoVietNam(data.amount)}
            </div>
            <div>Tôi xin chịu trách nhiệm về nội dung thanh toán và các hóa đơn chứng từ kèm theo.</div>
            <div><i>(Kèm theo .................................................... chứng từ gốc).</i></div>
          </div>

          <table className="w-full text-center text-[10px] leading-normal font-sans">
            <tbody>
              <tr>
                <td colSpan={3} className="text-right italic pr-6 pb-2">
                  Tp.HCM, ngày {today.getDate()} tháng {today.getMonth() + 1} năm {today.getFullYear()}
                </td>
              </tr>
              <tr className="font-bold">
                <td className="w-1/3">BAN GIÁM ĐỐC</td>
                <td className="w-1/3">KẾ TOÁN TRƯỞNG</td>
                <td className="w-1/3">NGƯỜI ĐỀ NGHỊ</td>
              </tr>
              <tr className="h-16">
                <td></td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer">
            Đóng lại
          </button>
          <button type="button" onClick={tai} disabled={busy}
            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow cursor-pointer disabled:opacity-50">
            {busy
              ? <><Loader2 size={13} className="animate-spin" /> Đang tải...</>
              : <><Download size={13} /> Tải xuống file Word</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
