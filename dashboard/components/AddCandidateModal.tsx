"use client";

import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { addCandidate } from "@/lib/api";

const DEPARTMENTS = [
    "Ban Lãnh Đạo",
    "Phòng Kỹ Thuật", "Phòng Dự Án", "Phòng Kế Hoạch", "Phòng Vật Tư Thiết Bị",
    "Phòng Hành Chính Nhân Sự", "Phòng Tài Chính Kế Toán", "Phòng Thư Ký, Trợ Lý", "Phòng QLCC", "Phòng ATLĐ"
];
const SOURCES = ["TopCV", "LinkedIn", "Facebook", "Giới thiệu", "Khác"];
const DEGREES = ["ĐH", "CĐ", "Thạc sĩ", "THPT"];

interface Props { onClose: () => void; onSuccess: () => void; }

export default function AddCandidateModal({ onClose, onSuccess }: Props) {
    const today = new Date().toISOString().split("T")[0];
    const [form, setForm] = useState({
        ngay: today, ten: "", email: "", sdt: "", bang_cap: "ĐH",
        chuyen_nganh: "", kinh_nghiem: "", chuc_danh_gan_nhat: "", cong_ty_gan_nhat: "",
        khu_vuc: "", phong_ban: "", vi_tri: "",
        nguon: "TopCV", nguoi_danh_gia: "",
    });
    const [saving, setSaving] = useState(false);

    const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

    const handleSubmit = async () => {
        if (!form.ten || !form.phong_ban || !form.vi_tri) {
            alert("Vui lòng điền đủ: Tên, Phòng Ban, Vị trí!");
            return;
        }
        setSaving(true);
        // row order: Ngày, Tên, Email, SĐT, Bằng cấp, Chuyên ngành, Kinh nghiệm, Chức danh gần nhất, Công ty gần nhất, Khu vực, Phòng Ban, Vị trí, Trạng thái, Nguồn, Người đánh giá
        const row = [
            form.ngay, form.ten, form.email, form.sdt,
            form.bang_cap, form.chuyen_nganh,
            form.kinh_nghiem, form.chuc_danh_gan_nhat, form.cong_ty_gan_nhat,
            form.khu_vuc,
            form.phong_ban, form.vi_tri, "FAIL",
            form.nguon, form.nguoi_danh_gia,
        ];
        await addCandidate(row);
        setSaving(false);
        onSuccess();
    };

    const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );

    const inputCls = "w-full px-3 py-2.5 text-sm bg-white/60 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400/30 placeholder:text-slate-400 placeholder:italic";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <div className="glass rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200/50">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#005088] rounded-xl flex items-center justify-center">
                            <Plus className="text-white" size={16} />
                        </div>
                        <div>
                            <h2 className="font-heading font-bold text-[#005088]">Thêm ứng viên mới</h2>
                            <p className="text-slate-500 text-xs">Thêm vào sheet Tổng Hợp</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500">
                        <X size={16} />
                    </button>
                </div>

                {/* Form */}
                <div className="p-6 grid grid-cols-2 gap-4">
                    <Field label="Tên ứng viên" required>
                        <input value={form.ten} onChange={e => set("ten", e.target.value)} placeholder="Nguyễn Văn A" className={inputCls} />
                    </Field>
                    <Field label="Email" required>
                        <input value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@gmail.com" className={inputCls} />
                    </Field>

                    <Field label="SĐT" required>
                        <input value={form.sdt} onChange={e => set("sdt", e.target.value)} placeholder="0901 234 567" className={inputCls} />
                    </Field>
                    <Field label="Ngày">
                        <input type="date" value={form.ngay} onChange={e => set("ngay", e.target.value)} className={inputCls} />
                    </Field>

                    <Field label="Bằng cấp">
                        <select value={form.bang_cap} onChange={e => set("bang_cap", e.target.value)} className={inputCls}>
                            {DEGREES.map(d => <option key={d}>{d}</option>)}
                        </select>
                    </Field>
                    <Field label="Chuyên ngành">
                        <input value={form.chuyen_nganh} onChange={e => set("chuyen_nganh", e.target.value)} placeholder="Kỹ thuật xây dựng..." className={inputCls} />
                    </Field>

                    <Field label="Kinh nghiệm">
                        <input value={form.kinh_nghiem} onChange={e => set("kinh_nghiem", e.target.value)} placeholder="5 năm" className={inputCls} />
                    </Field>
                    <Field label="Chức danh gần nhất">
                        <input value={form.chuc_danh_gan_nhat} onChange={e => set("chuc_danh_gan_nhat", e.target.value)} placeholder="Kỹ sư kết cấu" className={inputCls} />
                    </Field>
                    <Field label="Công ty gần nhất">
                        <input value={form.cong_ty_gan_nhat} onChange={e => set("cong_ty_gan_nhat", e.target.value)} placeholder="Công ty TNHH ABC" className={inputCls} />
                    </Field>

                    <Field label="Khu vực">
                        <input value={form.khu_vuc} onChange={e => set("khu_vuc", e.target.value)} placeholder="Hồ Chí Minh" className={inputCls} />
                    </Field>
                    <Field label="Phòng Ban" required>
                        <select value={form.phong_ban} onChange={e => set("phong_ban", e.target.value)} className={inputCls}>
                            <option value="">-- Chọn phòng ban --</option>
                            {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                        </select>
                    </Field>

                    <div className="col-span-2">
                        <Field label="Vị trí ứng tuyển" required>
                            <input value={form.vi_tri} onChange={e => set("vi_tri", e.target.value)} placeholder="Kỹ sư kết cấu" className={inputCls} />
                        </Field>
                    </div>

                    <Field label="Nguồn CV">
                        <select value={form.nguon} onChange={e => set("nguon", e.target.value)} className={inputCls}>
                            {SOURCES.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </Field>
                    <Field label="Người đánh giá">
                        <input value={form.nguoi_danh_gia} onChange={e => set("nguoi_danh_gia", e.target.value)} placeholder="Tự động từ phòng ban" className={inputCls} />
                    </Field>
                </div>

                {/* Status note */}
                <div className="px-6 pb-2">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700 flex items-center gap-2">
                        <span className="badge-fail px-2 py-0.5 rounded-full text-xs">FAIL</span>
                        Trạng thái mặc định ban đầu. AI sẽ chấm điểm và cập nhật tự động khi xử lý qua ứng dụng Python.
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-5 border-t border-slate-200/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors text-slate-600">
                        Hủy
                    </button>
                    <button onClick={handleSubmit} disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 text-sm bg-gradient-to-r from-[#005088] to-blue-500 text-white rounded-xl hover:brightness-110 transition-all active:scale-95 shadow-md disabled:opacity-70">
                        <Sparkles size={14} />
                        {saving ? "Đang lưu..." : "Lưu vào Google Sheets"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// fix: missing import for Plus
function Plus({ className, size }: { className?: string; size?: number }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>;
}
