"use client";

import { apiFetch } from "@/lib/apiClient";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { isManagerRole, normalizeName } from "@/lib/approvers";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { isHrDept } from "@/lib/access";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  ShieldAlert,
  Search,
  Plus,
  ArrowUpDown,
  Mail,
  Phone,
  Calendar,
  Layers,
  MoreHorizontal,
  Upload,
  FileText,
  FileDown,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
  RotateCcw,
  AlertCircle,
  Settings,
  Key,
  Info,
  Database,
  X
} from "lucide-react";

// ─── TYPES FOR CV SCORER ──────────────────────────────────────────────────────
type ScoreBreakdownItem = { diem: number; toi_da: number; ly_do: string; phan_tram_dap_ung?: number };
type ScoreBreakdown = {
  kinh_nghiem?: ScoreBreakdownItem;
  ky_nang?: ScoreBreakdownItem;
  hoc_van?: ScoreBreakdownItem;
  soft_skill?: ScoreBreakdownItem;
  phat?: ScoreBreakdownItem;
};
type JdRequirements = {
  bat_buoc?: string[];
  uu_tien?: string[];
  hoc_van?: string;
  kinh_nghiem_yeu_cau?: string;
};
type CvEvidence = {
  dap_ung?: string[];
  khong_dap_ung?: string[];
};

type ScoringResult = {
  file_name: string;
  score: number;
  recommendation: "Interview" | "Hold" | "Reject" | "Error";
  trang_thai: string;
  matching_skills: string[];
  missing_skills: string[];
  summary: string;
  score_breakdown?: ScoreBreakdown;
  jd_requirements?: JdRequirements;
  cv_evidence?: CvEvidence;
  extracted_info: Record<string, string>;
  submitted?: boolean;
  saved_db?: boolean;
  error?: string;
};

type FileItem = { file: File; id: string };

const NGUON_OPTIONS = ["TopCV", "LinkedIn", "Email", "Referral", "Nội bộ", "Khác"];

const DEPT_OPTIONS = [
  "Ban Lãnh Đạo",
  "Phòng Hành Chính Nhân Sự",
  "P. TÀI CHÍNH KẾ TOÁN",
  "P. VẬT TƯ THIẾT BỊ",
  "P. THỊ TRƯỜNG",
  "P. KẾ HOẠCH",
  "P. ĐẤU THẦU",
  "P. KỸ THUẬT",
  "P. QUẢN LÍ DỰ ÁN",
  "P. ATLĐ",
  "DA. RẠCH XUYÊN TÂM - HCM",
  "DA.ĐIỆN MẶT TRỜI TV GĐ 2",
  "DA.TỈNH LỘ 8 - CỦ CHI",
  "DA.THƯỜNG PHƯỚC",
  "DA.CẦU MÃ ĐÀ - ĐỒNG NAI",
  "DA.CỐNG VÀM LẼO - BẠC LIÊU",
  "DA.CHỐNG HẠN - NINH THUẬN",
  "DA.XỬ LÝ NƯỚC THẢI TÂY NINH"
];

// ─── SCORE COLOR HELPERS ─────────────────────────────────────────────────────
function scoreColor(score: number) {
  if (score >= 75) return { text: "text-emerald-600", bg: "bg-emerald-500", bar: "bg-emerald-400" };
  if (score >= 50) return { text: "text-amber-500", bg: "bg-amber-400", bar: "bg-amber-400" };
  return { text: "text-rose-500", bg: "bg-rose-500", bar: "bg-rose-400" };
}

const COLUMNS = [
  { id: "new", title: "CV Mới", color: "border-t-slate-400" },
  { id: "screening", title: "Sàng lọc", color: "border-t-cyan-500" },
  { id: "interview", title: "Phỏng vấn", color: "border-t-blue-500" },
  { id: "offer", title: "Đề nghị", color: "border-t-purple-500" },
  { id: "hired", title: "Đã tuyển", color: "border-t-emerald-500" },
  { id: "rejected", title: "Từ chối", color: "border-t-rose-500" }
];

// ─── RESULT CARD SUBCOMPONENT ────────────────────────────────────────────────
function ResultCard({
  result,
  onSubmit,
  onSaveDb,
}: {
  result: ScoringResult;
  onSubmit: (r: ScoringResult) => Promise<void>;
  onSaveDb: (r: ScoringResult) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const c = scoreColor(result.score);

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit(result);
    setSubmitting(false);
  };

  const handleSaveDb = async () => {
    setSaving(true);
    await onSaveDb(result);
    setSaving(false);
  };

  if (result.error) {
    return (
      <div className="glass rounded-2xl p-5 border border-rose-200">
        <div className="flex items-center gap-3">
          <AlertCircle className="text-rose-500 shrink-0" size={20} />
          <div>
            <p className="font-semibold text-rose-600 text-sm">{result.file_name}</p>
            <p className="text-rose-400 text-xs mt-0.5">{result.error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Breakdown tiêu chí hiển thị
  const breakdownItems = result.score_breakdown ? [
    { 
      key: "kinh_nghiem", 
      label: result.score_breakdown.kinh_nghiem?.toi_da === 25 ? "Kinh nghiệm trợ lý/thư ký" : "Kinh nghiệm liên quan", 
      icon: "💼", 
      color: "bg-blue-500",    
      data: result.score_breakdown.kinh_nghiem 
    },
    { 
      key: "ky_nang",     
      label: result.score_breakdown.ky_nang?.toi_da === 30 && result.score_breakdown.kinh_nghiem?.toi_da === 25 ? "Kỹ năng văn phòng & tổng hợp" : "Kỹ năng chuyên môn",   
      icon: "🛠️", 
      color: "bg-violet-500", 
      data: result.score_breakdown.ky_nang 
    },
    { 
      key: "hoc_van",     
      label: result.score_breakdown.hoc_van?.toi_da === 25 ? "Hiểu biết & kinh nghiệm xây dựng" : "Học vấn & Bằng cấp",   
      icon: "🎓", 
      color: "bg-amber-500",  
      data: result.score_breakdown.hoc_van 
    },
    { 
      key: "soft_skill",  
      label: result.score_breakdown.soft_skill?.toi_da === 20 ? "Soft skills & ưu tiên" : "Soft skills",           
      icon: "🤝", 
      color: "bg-teal-500",  
      data: result.score_breakdown.soft_skill 
    },
    { 
      key: "phat",        
      label: "Điểm trừ (phạt)",       
      icon: "⚠️", 
      color: "bg-rose-500",  
      data: result.score_breakdown.phat 
    },
  ] : [];

  return (
    <div className="glass rounded-2xl overflow-hidden border border-slate-200/40 hover:shadow-lg transition-all">
      {/* Header row */}
      <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
          {/* Score circle */}
          <div className={`w-16 h-16 rounded-2xl ${c.bg} flex flex-col items-center justify-center shrink-0 shadow`}>
            <span className="text-white font-bold text-xl leading-none">{result.score}</span>
            <span className="text-white/70 text-xs">/100</span>
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="font-heading font-semibold text-[#005BAC] truncate">
              {result.extracted_info?.ten_ung_vien || result.file_name}
            </p>
            <p className="text-slate-500 text-xs mt-0.5 truncate">
              {result.extracted_info?.vi_tri || "N/A"} · {result.extracted_info?.kinh_nghiem || "N/A"} · {result.extracted_info?.khu_vuc || "N/A"}
            </p>
            {/* Progress bar */}
            <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden w-full max-w-[200px]">
              <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${result.score}%` }} />
            </div>
          </div>
        </div>

        {/* Status + buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 w-full sm:w-auto">
          {result.trang_thai === "PASS CV" ? (
            <span className="badge-pass px-3 py-1 rounded-full text-xs font-semibold">✓ PASS CV</span>
          ) : (
            <span className="badge-fail px-3 py-1 rounded-full text-xs font-semibold">✗ FAIL</span>
          )}

          {/* Chi tiết toggle button */}
          <button
            onClick={() => setExpanded(!expanded)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all active:scale-95 ${
              expanded
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600"
            }`}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Chi tiết
          </button>
          
          {/* Supabase Save Button */}
          {!result.saved_db ? (
            <button
              onClick={handleSaveDb}
              disabled={saving}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
              Lưu Database
            </button>
          ) : (
            <span className="flex items-center gap-1 text-blue-600 text-xs font-medium px-2">
              <CheckCircle size={13} /> Đã lưu DB
            </span>
          )}

          {/* Sheets Save Button */}
          {!result.submitted ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs px-3 py-1.5 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Ghi Sheets
            </button>
          ) : (
            <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
              <CheckCircle size={13} /> Đã ghi Sheets
            </span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-200/40 px-5 pb-6 pt-5 space-y-5">

          {/* Score Breakdown - chỉ hiện nếu có dữ liệu */}
          {breakdownItems.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">📊 Phân tích điểm chi tiết</p>
              <div className="space-y-2.5">
                {breakdownItems.map(({ key, label, icon, color, data }) => {
                  if (!data) return null;
                  const isPenalty = key === "phat";
                  const pct = isPenalty
                    ? 0 // penalty bar always shown as 0 (red badge)
                    : Math.max(0, Math.min(100, data.toi_da > 0 ? (data.diem / data.toi_da) * 100 : 0));
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-600">{icon} {label}</span>
                        <span className={`text-xs font-bold ${
                          isPenalty ? "text-rose-600" :
                          data.diem >= data.toi_da * 0.8 ? "text-emerald-600" :
                          data.diem >= data.toi_da * 0.5 ? "text-amber-500" : "text-rose-500"
                        }`}>
                          {isPenalty ? (data.diem < 0 ? data.diem : `-${Math.abs(data.diem)}`) : `${data.diem}/${data.toi_da}`}
                        </span>
                      </div>
                      {!isPenalty && (
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1">
                          <div
                            className={`h-full ${color} rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                      <p className="text-[11px] text-slate-500 leading-relaxed">{data.ly_do}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left: skills */}
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-emerald-600 mb-1.5 text-xs">✅ Kỹ năng tương thích</p>
                <ul className="space-y-1">
                  {result.matching_skills.length ? result.matching_skills.map((s, i) => (
                    <li key={i} className="text-slate-600 text-[11px] flex items-start gap-1.5"><span className="text-emerald-400 mt-0.5">•</span>{s}</li>
                  )) : <li className="text-slate-400 text-xs italic">Không có</li>}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-rose-500 mb-1.5 text-xs">❌ Kỹ năng còn thiếu</p>
                <ul className="space-y-1">
                  {result.missing_skills.length ? result.missing_skills.map((s, i) => (
                    <li key={i} className="text-slate-600 text-[11px] flex items-start gap-1.5"><span className="text-rose-300 mt-0.5">•</span>{s}</li>
                  )) : <li className="text-slate-400 text-xs italic">Không có</li>}
                </ul>
              </div>
            </div>

            {/* Right: info + summary */}
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-slate-600 mb-1.5 text-xs">📋 Thông tin trích xuất</p>
                <div className="space-y-1 text-[11px] text-slate-500">
                  {[
                    ["Email", result.extracted_info?.email],
                    ["SĐT", result.extracted_info?.sdt],
                    ["Bằng cấp", result.extracted_info?.bang_cap],
                    ["Chuyên ngành", result.extracted_info?.chuyen_nganh],
                    ["Phòng ban", result.extracted_info?.phong_ban],
                    ["Người đánh giá", result.extracted_info?.nguoi_danh_gia],
                  ].map(([label, val]) => (
                    <div key={label} className="flex gap-2">
                      <span className="text-slate-400 w-24 shrink-0">{label}:</span>
                      <span className="text-slate-600">{val || "N/A"}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-semibold text-slate-600 mb-1 text-xs">📝 Nhận xét AI</p>
                <p className="text-slate-500 text-[11px] leading-relaxed">{result.summary}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Khuyến nghị:</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    result.recommendation === "Interview"
                      ? "bg-emerald-100 text-emerald-700"
                      : result.recommendation === "Hold"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-rose-100 text-rose-600"
                  }`}>
                    {result.recommendation === "Interview" ? "✓ Phỏng vấn" :
                     result.recommendation === "Hold" ? "⏸ Giữ lại" : "✗ Từ chối"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Đối chiếu yêu cầu JD & Bằng chứng CV */}
          {(result.jd_requirements || result.cv_evidence) && (
            <div className="border-t border-slate-200/40 pt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">🔍 Chi tiết đối chiếu JD vs CV</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* JD Requirements */}
                <div className="bg-slate-50/50 rounded-xl p-3.5 border border-slate-100/60">
                  <p className="text-xs font-bold text-[#005BAC] mb-2.5 flex items-center gap-1.5">
                    📋 Tiêu chuẩn tuyển dụng (JD)
                  </p>
                  <div className="space-y-3 text-[11px] text-slate-600">
                    {result.jd_requirements?.bat_buoc && result.jd_requirements.bat_buoc.length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-700">Yêu cầu bắt buộc (Must-have):</span>
                        <ul className="list-disc pl-4 mt-1 space-y-1">
                          {result.jd_requirements.bat_buoc.map((req, idx) => (
                            <li key={idx} className="leading-relaxed">{req}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.jd_requirements?.uu_tien && result.jd_requirements.uu_tien.length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-700">Ưu tiên (Nice-to-have):</span>
                        <ul className="list-disc pl-4 mt-1 space-y-1">
                          {result.jd_requirements.uu_tien.map((req, idx) => (
                            <li key={idx} className="leading-relaxed">{req}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.jd_requirements?.hoc_van && (
                      <div className="pt-1 border-t border-slate-200/40">
                        <span className="font-semibold text-slate-700">Học vấn tối thiểu: </span>
                        <span className="text-slate-600">{result.jd_requirements.hoc_van}</span>
                      </div>
                    )}
                    {result.jd_requirements?.kinh_nghiem_yeu_cau && (
                      <div className="pt-1">
                        <span className="font-semibold text-slate-700">Kinh nghiệm tối thiểu: </span>
                        <span className="text-slate-600">{result.jd_requirements.kinh_nghiem_yeu_cau}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* CV Evidence */}
                <div className="bg-slate-50/50 rounded-xl p-3.5 border border-slate-100/60">
                  <p className="text-xs font-bold text-[#005BAC] mb-2.5 flex items-center gap-1.5">
                    🔎 Bằng chứng đối chiếu từ CV
                  </p>
                  <div className="space-y-3 text-[11px] text-slate-600">
                    {result.cv_evidence?.dap_ung && result.cv_evidence.dap_ung.length > 0 && (
                      <div>
                        <span className="font-semibold text-emerald-600">Các điểm ĐÁP ỨNG:</span>
                        <ul className="list-disc pl-4 mt-1 space-y-1">
                          {result.cv_evidence.dap_ung.map((ev, idx) => (
                            <li key={idx} className="text-slate-600 leading-relaxed">{ev}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.cv_evidence?.khong_dap_ung && result.cv_evidence.khong_dap_ung.length > 0 && (
                      <div>
                        <span className="font-semibold text-rose-500">Các điểm CHƯA ĐÁP ỨNG:</span>
                        <ul className="list-disc pl-4 mt-1 space-y-1">
                          {result.cv_evidence.khong_dap_ung.map((ev, idx) => (
                            <li key={idx} className="text-slate-500 leading-relaxed">{ev}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── HELPERS FOR TABLE VIEW ──────────────────────────────────────────────────
function formatDateForDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function isOneDayBefore(dateStr: string): boolean {
  if (!dateStr) return false;
  let year = 0, month = 0, day = 0;
  
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    }
  } else if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        year = parseInt(parts[2], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[0], 10);
      } else if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      }
    }
  }
  
  if (year === 0 || isNaN(year) || isNaN(month) || isNaN(day)) return false;
  
  const targetDate = new Date(year, month, day, 0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = targetDate.getTime() - today.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  return Math.round(diffTime / oneDayMs) === 1;
}

function isToday(dateStr: string): boolean {
  if (!dateStr) return false;
  let year = 0, month = 0, day = 0;
  
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    }
  } else if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        year = parseInt(parts[2], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[0], 10);
      } else if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      }
    }
  }
  
  if (year === 0 || isNaN(year) || isNaN(month) || isNaN(day)) return false;
  
  const targetDate = new Date(year, month, day, 0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return targetDate.getTime() === today.getTime();
}

function EditableCell({
  value,
  onSave,
  type = "text",
  readOnly = false,
  className = ""
}: {
  value: string;
  onSave: (val: string) => void;
  type?: string;
  readOnly?: boolean;
  className?: string;
}) {
  const [val, setVal] = useState(value);

  useEffect(() => {
    setVal(value);
  }, [value]);

  const handleBlur = () => {
    if (!readOnly && val !== value) {
      onSave(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  if (readOnly) {
    const displayVal = type === "date" ? formatDateForDisplay(value) : value;
    return <span className={`px-2 py-1 text-xs text-slate-700 block w-full whitespace-nowrap overflow-hidden text-ellipsis ${className}`}>{displayVal}</span>;
  }

  return (
    <input
      type={type}
      value={val || ""}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={`w-full bg-transparent px-2 py-1 outline-none border border-transparent hover:bg-slate-100/50 focus:border-blue-500 focus:bg-white rounded transition-all text-xs font-normal text-slate-700 ${className}`}
    />
  );
}

const normalizeDepartment = (dept: string): string => {
  if (!dept) return "Chưa xác định";
  const trim = dept.trim();
  const lower = trim.toLowerCase();
  
  if (
    lower === "atld" || 
    lower === "atlđ" || 
    lower.includes("atlđ") || 
    lower.includes("atld") || 
    lower.includes("an toàn")
  ) {
    return "ATLĐ";
  }
  if (lower === "kỹ thuật" || lower.includes("kỹ thuật")) {
    return "Kỹ thuật";
  }
  if (
    lower === "phòng hành chính nhân sự" || 
    lower === "hcns" || 
    lower === "phòng hcns" || 
    lower.includes("hành chính") || 
    lower.includes("nhân sự")
  ) {
    return "HCNS";
  }
  if (
    lower === "vt-tb" || 
    lower === "vt_tb" || 
    lower.includes("vật tư") || 
    lower.includes("thiết bị")
  ) {
    return "VT-TB";
  }
  if (lower === "kế toán" || lower.includes("kế toán") || lower.includes("tài chính")) {
    return "Kế toán";
  }
  if (lower === "kế hoạch" || lower.includes("kế hoạch")) {
    return "Kế hoạch";
  }
  if (lower === "đấu thầu" || lower.includes("đấu thầu")) {
    return "Đấu thầu";
  }
  if (lower === "thị trường" || lower.includes("thị trường")) {
    return "Thị trường";
  }
  if (
    lower === "quản lý dự án" || 
    lower.includes("qlda") || 
    lower.includes("quản lí dự án") || 
    lower.includes("quản lý dự án")
  ) {
    return "Phòng QLDA";
  }
  
  return trim.charAt(0).toUpperCase() + trim.slice(1);
};

const isProjectBlock = (deptName: string): boolean => {
  const name = (deptName || "").trim().toUpperCase();
  
  // Direct project indicators (DA., DA , DỰ ÁN, DA)
  if (
    name.startsWith("DA.") || 
    name.startsWith("DA ") || 
    name.startsWith("DỰ ÁN") || 
    name.startsWith("DA") ||
    name.includes("DỰ ÁN") ||
    name.includes("CÔNG TRƯỜNG") ||
    name.includes("BAN ĐIỀU HÀNH") ||
    name.includes("BDH")
  ) {
    return true;
  }
  
  // Specific project keywords/names (RXT, Vàm Lẽo, Mã Đà, Trà Vinh, Thường Phước, Tỉnh Lộ 8, Chống Hạn, Tây Ninh, ĐMT)
  const projectKeywords = [
    "VÀM LẼO", "RXT", "RẠCH XUYÊN TÂM", "MÃ ĐÀ", "TRÀ VINH", 
    "THƯỜNG PHƯỚC", "TỈNH LỘ", "CHỐNG HẠN", "TÂY NINH", "ĐMT"
  ];
  
  return projectKeywords.some(keyword => name.includes(keyword));
};


const getColumnsForTab = (tab: string) => {
  if (tab === "tong_hop") {
    return [
      { key: "stt", label: "STT", width: "60px" },
      { key: "created_at", label: "Ngày tạo", width: "110px", readOnly: true },
      { key: "name", label: "Tên ứng viên", width: "180px" },
      { key: "email", label: "Email", width: "180px" },
      { key: "phone", label: "SĐT", width: "110px" },
      { key: "education", label: "Bằng cấp", width: "100px" },
      { key: "major", label: "Chuyên ngành", width: "150px" },
      { key: "experience", label: "Kinh nghiệm", width: "120px" },
      { key: "last_position", label: "Chức danh gần nhất", width: "160px" },
      { key: "last_company", label: "Công ty gần nhất", width: "160px" },
      { key: "region", label: "Khu vực", width: "100px" },
      { key: "department", label: "Phòng Ban", width: "180px", type: "department" },
      { key: "role", label: "Vị trí", width: "140px" },
      { key: "status", label: "Trạng thái", width: "120px", type: "status" },
      { key: "source", label: "Nguồn", width: "110px" },
      { key: "reviewer", label: "Người đánh giá", width: "130px" },
      { key: "notes", label: "Ghi chú", width: "180px" }
    ];
  }
  if (tab === "vong_1") {
    return [
      { key: "stt", label: "STT", width: "60px" },
      { key: "v1_date", label: "Ngày Vòng 1", width: "110px" },
      { key: "name", label: "Tên ứng viên", width: "180px" },
      { key: "email", label: "Email", width: "180px" },
      { key: "phone", label: "SĐT", width: "110px" },
      { key: "education", label: "Bằng cấp", width: "100px" },
      { key: "major", label: "Chuyên ngành", width: "150px" },
      { key: "region", label: "Khu vực", width: "100px" },
      { key: "department", label: "Phòng Ban", width: "180px", type: "department" },
      { key: "role", label: "Vị trí", width: "140px" },
      { key: "source", label: "Nguồn", width: "110px" },
      { key: "v1_interviewer", label: "Người PV V1", width: "130px" },
      { key: "v1_result", label: "Kết quả V1", width: "120px", type: "v1_result" },
      { key: "v1_interview_date", label: "Ngày PV", width: "110px", type: "date" },
      { key: "v1_notes", label: "Ghi chú", width: "180px" }
    ];
  }
  if (tab === "vong_2") {
    return [
      { key: "stt", label: "STT", width: "60px" },
      { key: "v2_date", label: "Ngày Vòng 2", width: "110px" },
      { key: "name", label: "Tên ứng viên", width: "180px" },
      { key: "email", label: "Email", width: "180px" },
      { key: "phone", label: "SĐT", width: "110px" },
      { key: "education", label: "Bằng cấp", width: "100px" },
      { key: "major", label: "Chuyên ngành", width: "150px" },
      { key: "region", label: "Khu vực", width: "100px" },
      { key: "department", label: "Phòng Ban", width: "180px", type: "department" },
      { key: "role", label: "Vị trí", width: "140px" },
      { key: "v1_result", label: "KQ Vòng 1", width: "110px", type: "v1_result_readonly" },
      { key: "source", label: "Nguồn", width: "110px" },
      { key: "v2_interviewer", label: "Người PV V2", width: "130px" },
      { key: "v2_result", label: "Kết quả V2", width: "120px", type: "v2_result" },
      { key: "v2_interview_date", label: "Ngày PV", width: "110px", type: "date" },
      { key: "v2_notes", label: "Ghi chú", width: "180px" }
    ];
  }
  // Thử việc
  return [
    { key: "stt", label: "STT", width: "60px" },
    { key: "v2_date", label: "Ngày Vòng 2", width: "110px" },
    { key: "name", label: "Tên ứng viên", width: "180px" },
    { key: "email", label: "Email", width: "180px" },
    { key: "phone", label: "SĐT", width: "110px" },
    { key: "education", label: "Bằng cấp", width: "100px" },
    { key: "major", label: "Chuyên ngành", width: "150px" },
    { key: "region", label: "Khu vực", width: "100px" },
    { key: "department", label: "Phòng Ban", width: "180px", type: "department" },
    { key: "role", label: "Vị trí", width: "140px" },
    { key: "v2_result", label: "KQ Vòng 2", width: "110px", type: "v2_result_readonly" },
    { key: "source", label: "Nguồn", width: "110px" },
    { key: "v2_interviewer", label: "Người PV V2", width: "130px" },
    { key: "probation_result", label: "Kết quả nhận việc", width: "130px", type: "probation_result" },
    { key: "ai_recommendation", label: "HĐ Chính thức", width: "120px", type: "probation_contract" },
    { key: "onboard_date", label: "ONBOARD", width: "110px" },
    { key: "probation_end_date", label: "Hết hạn TV", width: "110px" },
    { key: "probation_salary", label: "Mức lương TV", width: "120px" },
    { key: "official_salary", label: "MỨC lương CT", width: "120px" },
    { key: "thuviec_notes", label: "Ghi chú", width: "180px" }
  ];
};

// ─── MAIN RECRUITMENT PAGE ────────────────────────────────────────────────────
export default function RecruitmentPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "table_view" | "scorer" | "settings">("dashboard");
  const [tableSubTab, setTableSubTab] = useState<"tong_hop" | "vong_1" | "vong_2" | "thu_viec">("tong_hop");
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Manual recruitment needs state — lưu THEO THÁNG (id dạng office_manual_needs_YYYY-MM).
  // Tháng hiện tại đồng thời ghi về bản ghi cũ (office_manual_needs) để Dashboard trang chủ
  // và các nơi khác đang đọc id cũ vẫn thấy đúng số của tháng hiện tại.
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [needsMonth, setNeedsMonth] = useState<string>(currentMonthKey);
  const [officeManualNeeds, setOfficeManualNeeds] = useState<Record<string, number>>({});
  const [projectManualNeeds, setProjectManualNeeds] = useState<Record<string, number>>({});

  // Load needs của tháng đang chọn từ Supabase (nguồn chân lý), fallback localStorage.
  useEffect(() => {
    const loadNeeds = async () => {
      const isCurrent = needsMonth === currentMonthKey;
      const officeId = `office_manual_needs_${needsMonth}`;
      const projectId = `project_manual_needs_${needsMonth}`;
      try {
        const ids = [officeId, projectId, ...(isCurrent ? ["office_manual_needs", "project_manual_needs"] : [])];
        const { data, error } = await supabase
          .from("recruitment_needs")
          .select("id, data")
          .in("id", ids);

        if (!error && data) {
          // Tháng hiện tại chưa có bản ghi theo tháng → dùng bản ghi cũ (di trú mềm).
          const officeRow = data.find(r => r.id === officeId) || (isCurrent ? data.find(r => r.id === "office_manual_needs") : null);
          const projectRow = data.find(r => r.id === projectId) || (isCurrent ? data.find(r => r.id === "project_manual_needs") : null);
          setOfficeManualNeeds(officeRow?.data || {});
          setProjectManualNeeds(projectRow?.data || {});
          // Keep localStorage in sync so offline fallback is fresh
          localStorage.setItem(`officeManualNeeds_${needsMonth}`, JSON.stringify(officeRow?.data || {}));
          localStorage.setItem(`projectManualNeeds_${needsMonth}`, JSON.stringify(projectRow?.data || {}));
          return;
        }

        if (error) {
          console.warn("Supabase fetch failed, falling back to localStorage:", error.message);
        }
      } catch (err) {
        console.error("Error fetching recruitment needs from Supabase:", err);
      }

      // Fallback: use localStorage only when Supabase is unreachable
      const savedOffice = localStorage.getItem(`officeManualNeeds_${needsMonth}`) || (isCurrent ? localStorage.getItem("officeManualNeeds") : null);
      try { setOfficeManualNeeds(savedOffice ? JSON.parse(savedOffice) : {}); } catch (e) { setOfficeManualNeeds({}); }
      const savedProject = localStorage.getItem(`projectManualNeeds_${needsMonth}`) || (isCurrent ? localStorage.getItem("projectManualNeeds") : null);
      try { setProjectManualNeeds(savedProject ? JSON.parse(savedProject) : {}); } catch (e) { setProjectManualNeeds({}); }
    };

    loadNeeds();
  }, [needsMonth]);

  const saveNeedsToSupabase = async (id: "office_manual_needs" | "project_manual_needs", data: Record<string, number>) => {
    try {
      const updated_at = new Date().toISOString();
      const rows: { id: string; data: Record<string, number>; updated_at: string }[] = [
        { id: `${id}_${needsMonth}`, data, updated_at }
      ];
      // Đang sửa tháng hiện tại → đồng bộ luôn bản ghi cũ cho Dashboard trang chủ.
      if (needsMonth === currentMonthKey) rows.push({ id, data, updated_at });
      const { error } = await supabase.from("recruitment_needs").upsert(rows);

      if (error) {
        console.warn(`Could not save ${id} to Supabase:`, error.message);
      }
    } catch (err) {
      console.error(`Error saving ${id} to Supabase:`, err);
    }
  };

  const handleOfficeNeedChange = (dept: string, val: number) => {
    if (val < 0) return;
    const next = { ...officeManualNeeds, [dept]: val };
    setOfficeManualNeeds(next);
    localStorage.setItem(`officeManualNeeds_${needsMonth}`, JSON.stringify(next));
    saveNeedsToSupabase("office_manual_needs", next);
  };

  const handleProjectNeedChange = (proj: string, val: number) => {
    if (val < 0) return;
    const next = { ...projectManualNeeds, [proj]: val };
    setProjectManualNeeds(next);
    localStorage.setItem(`projectManualNeeds_${needsMonth}`, JSON.stringify(next));
    saveNeedsToSupabase("project_manual_needs", next);
  };

  const removeOfficeDept = (dept: string) => {
    const next = { ...officeManualNeeds };
    delete next[dept];
    setOfficeManualNeeds(next);
    localStorage.setItem(`officeManualNeeds_${needsMonth}`, JSON.stringify(next));
    saveNeedsToSupabase("office_manual_needs", next);
  };

  const removeProjectDept = (proj: string) => {
    const next = { ...projectManualNeeds };
    delete next[proj];
    setProjectManualNeeds(next);
    localStorage.setItem(`projectManualNeeds_${needsMonth}`, JSON.stringify(next));
    saveNeedsToSupabase("project_manual_needs", next);
  };

  const [newOfficeDept, setNewOfficeDept] = useState("");
  const [newProjectDept, setNewProjectDept] = useState("");

  const addOfficeDept = () => {
    const val = newOfficeDept.trim();
    if (!val) return;
    const next = { ...officeManualNeeds, [val]: 1 };
    setOfficeManualNeeds(next);
    localStorage.setItem(`officeManualNeeds_${needsMonth}`, JSON.stringify(next));
    saveNeedsToSupabase("office_manual_needs", next);
    setNewOfficeDept("");
  };

  const addProjectDept = () => {
    const val = newProjectDept.trim();
    if (!val) return;
    const next = { ...projectManualNeeds, [val]: 1 };
    setProjectManualNeeds(next);
    localStorage.setItem(`projectManualNeeds_${needsMonth}`, JSON.stringify(next));
    saveNeedsToSupabase("project_manual_needs", next);
    setNewProjectDept("");
  };

  // Danh tính người dùng — hook chung (thay khối allowed_users + employees +
  // fetchApprovalPermissions từng copy-paste ở mỗi trang).
  const user = useCurrentUser();
  const currentUser = user.authenticated ? user : null;
  const approvalPerms = user.perms;

  // Tầng (b) — kiểm soát mịn: chỉ Admin hoặc người được cấp cờ can_view_candidates
  // mới XEM nội dung Tuyển dụng (khớp RLS candidates + recruitment_needs). GIỮ nguyên,
  // KHÔNG nới theo gói.
  const canView = !!(currentUser && (currentUser.isAdmin || approvalPerms.canViewCandidates));

  const canManage = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.isAdmin || approvalPerms.canViewCandidates) return true;
    const role = currentUser.role || "";
    const dept = currentUser.department || "";
    // Thay danh sách email/tên hardcode + so chuỗi phòng ban bằng helper trung tâm.
    // Người phụ trách tuyển dụng cấp quyền bằng cờ can_view_candidates (User Permissions).
    return (
      isHrDept(dept) ||
      isManagerRole(role) ||
      normalizeName(role).includes("tuyen dung")
    );
  }, [currentUser, approvalPerms]);

  // Update candidate field directly
  const handleUpdateCandidateField = async (id: string, field: string, val: any) => {
    if (!canManage) {
      alert("Bạn không có quyền thực hiện thao tác này.");
      return;
    }
    try {
      // Optimistic update
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c));

      const { error } = await supabase
        .from("candidates")
        .update({ [field]: val })
        .eq("id", id);

      if (error) throw error;
    } catch (err) {
      console.error("Error updating candidate field:", err);
      fetchCandidates();
    }
  };

  // Update multiple candidate fields
  const handleUpdateCandidateFields = async (id: string, updates: Record<string, any>) => {
    if (!canManage) {
      alert("Bạn không có quyền thực hiện thao tác này.");
      return;
    }
    try {
      // Optimistic update
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));

      const { error } = await supabase
        .from("candidates")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    } catch (err) {
      console.error("Error updating candidate fields:", err);
      fetchCandidates();
    }
  };

  // Handle dropdown value changes for spreadsheet view
  const handleDropdownChange = async (candidateId: string, type: string, value: string) => {
    if (type === "status") {
      const newStatus = value === "FAIL" ? "rejected" : value === "LƯU CV" ? "new" : "screening";
      await handleUpdateCandidateField(candidateId, "status", newStatus);
    } else if (type === "v1_result") {
      const updates: any = { v1_result: value };
      if (value === "ĐẠT") {
        updates.status = "interview";
      } else if (value === "LOẠI" || value === "TC PV") {
        updates.status = "rejected";
      }
      await handleUpdateCandidateFields(candidateId, updates);
    } else if (type === "v2_result") {
      const updates: any = { v2_result: value };
      if (value === "ĐẠT") {
        updates.status = "offer";
      } else if (value === "LOẠI" || value === "TC PV") {
        updates.status = "rejected";
      }
      await handleUpdateCandidateFields(candidateId, updates);
    } else if (type === "probation_result") {
      const updates: any = { probation_result: value };
      if (value === "NHẬN" || value === "ĐẠT") {
        updates.status = "hired";
      } else if (value === "TC") {
        updates.status = "rejected";
      }
      await handleUpdateCandidateFields(candidateId, updates);
    }
  };

  // Filter and sort candidates for the spreadsheet view
  const getFilteredTableCandidates = (subTab: string) => {
    const sorted = [...candidates]
      .filter(c => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (c.name || "").toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q) ||
          (c.role || "").toLowerCase().includes(q) ||
          (c.department || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    if (subTab === "tong_hop") return sorted;
    if (subTab === "vong_1") {
      // Logic: Chỉ hiện ứng viên PASS CV (tức là status khác "rejected")
      return sorted.filter(c => c.status !== "rejected");
    }
    if (subTab === "vong_2") {
      // Logic: Chỉ hiện ứng viên có Kết quả V1 = ĐẠT
      return sorted.filter(c => c.v1_result === "ĐẠT");
    }
    if (subTab === "thu_viec") {
      // Logic: CHỈ ứng viên có Kết quả V2 = ĐẠT mới vào Thử việc
      // Chờ đánh giá / LOẠI / TC PV đều không vào
      return sorted.filter(c => c.v2_result === "ĐẠT");
    }
    return sorted;
  };

  // Scorer Tab states
  const [jdText, setJdText] = useState("");
  const [nguon, setNguon] = useState("TopCV");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [results, setResults] = useState<ScoringResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // API & Webhook Configuration states
  const [apiKey, setApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [saved, setSaved] = useState(false);

  // Drag State
  const [draggedCandidateId, setDraggedCandidateId] = useState<string | null>(null);

  // Modal Add Candidate State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPosition, setAddPosition] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addSource, setAddSource] = useState("TopCV");

  // Modal Weekly Report State
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportStartDate, setReportStartDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  });
  const [reportEndDate, setReportEndDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [exportingReport, setExportingReport] = useState(false);

  // Fetch candidates from Supabase
  const fetchCandidates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      if (data) {
        setCandidates(data);
      }
    } catch (err) {
      console.error("Error fetching candidates:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("openai_api_key") || "");
      setWebhookUrl(localStorage.getItem("apps_script_url") || "");
      setModel(localStorage.getItem("openai_model") || "gpt-4o-mini");
    }
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("openai_api_key", apiKey.trim());
      localStorage.setItem("apps_script_url", webhookUrl.trim());
      localStorage.setItem("openai_model", model);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const ACCEPTED = ".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg";

  // Search filter for pipeline
  const filteredPipeline = candidates.filter(c => 
    (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.role || c.last_position || "").toLowerCase().includes(search.toLowerCase())
  );

  // Scorer dropzone handlers
  const addFiles = useCallback((newFiles: File[]) => {
    const items: FileItem[] = newFiles.map((f) => ({ file: f, id: `${f.name}-${Date.now()}-${Math.random()}` }));
    setFiles((prev) => {
      const existing = new Set(prev.map((x) => x.file.name));
      return [...prev, ...items.filter((x) => !existing.has(x.file.name))];
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    addFiles(dropped);
  }, [addFiles]);

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  // Start CV AI Scoring
  const startScoring = async () => {
    if (!jdText.trim()) { alert("Vui lòng nhập mô tả công việc (JD)."); return; }
    if (files.length === 0) { alert("Vui lòng chọn ít nhất 1 file CV."); return; }

    setProcessing(true);
    setResults([]);
    setProgress({ done: 0, total: files.length });

    const newResults: ScoringResult[] = [];

    for (const item of files) {
      // Kiểm tra dung lượng file trước khi gửi lên server (tránh lỗi Payload Too Large 413)
      if (item.file.size > 4.5 * 1024 * 1024) {
        newResults.push({
          file_name: item.file.name,
          score: 0,
          recommendation: "Error",
          trang_thai: "FAIL",
          matching_skills: [],
          missing_skills: [],
          summary: "",
          extracted_info: {},
          submitted: false,
          saved_db: false,
          error: "Dung lượng file CV quá lớn (tối đa 4MB). Vui lòng nén file trước khi chấm."
        });
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        continue;
      }

      const formData = new FormData();
      formData.append("cv_file", item.file);
      formData.append("jd_text", jdText);
      formData.append("nguon", nguon);

      try {
        const customKey = localStorage.getItem("openai_api_key");
        const headers: Record<string, string> = {};
        if (customKey) {
          headers["Authorization"] = `Bearer ${customKey}`;
        }

        const res = await apiFetch("/api/score-cv", { 
          method: "POST", 
          body: formData,
          headers
        });

        // Kiểm tra phản hồi trước khi giải mã JSON để tránh lỗi parsing text/html error
        if (!res.ok) {
          const errorText = await res.text();
          if (res.status === 413 || errorText.includes("Payload Too Large") || errorText.includes("Request Entity Too Large")) {
            throw new Error("Dung lượng file CV vượt quá giới hạn của máy chủ. Vui lòng nén file dưới 4MB.");
          }
          throw new Error(errorText || `Lỗi kết nối máy chủ (Mã lỗi: ${res.status})`);
        }

        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const r: ScoringResult = {
          file_name: item.file.name,
          score: data.score ?? 0,
          recommendation: data.recommendation ?? "Reject",
          trang_thai: data.extracted_info?.trang_thai ?? "FAIL",
          matching_skills: data.matching_skills ?? [],
          missing_skills: data.missing_skills ?? [],
          summary: data.summary ?? "",
          score_breakdown: data.score_breakdown ?? undefined,
          jd_requirements: data.jd_requirements ?? undefined,
          cv_evidence: data.cv_evidence ?? undefined,
          extracted_info: data.extracted_info ?? {},
          submitted: false,
          saved_db: false
        };
        newResults.push(r);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        newResults.push({
          file_name: item.file.name, score: 0, recommendation: "Error",
          trang_thai: "FAIL", matching_skills: [], missing_skills: [],
          summary: "", extracted_info: {}, submitted: false, saved_db: false, error: msg,
        });
      }

      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    // Sort by score desc
    newResults.sort((a, b) => b.score - a.score);
    setResults(newResults);
    setProcessing(false);
  };

  // Submit CV score to Google Sheets (legacy workflow supported)
  const submitToSheets = async (result: ScoringResult) => {
    try {
      const customUrl = localStorage.getItem("apps_script_url");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (customUrl) {
        headers["x-apps-script-url"] = customUrl;
      }

      const res = await apiFetch("/api/submit-to-sheets", {
        method: "POST",
        headers,
        body: JSON.stringify({ extracted_info: result.extracted_info }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults((prev) =>
        prev.map((r) => r.file_name === result.file_name ? { ...r, submitted: true } : r)
      );
    } catch (e) {
      alert("Lỗi ghi Sheets: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Save CV score to Supabase Database (new primary workflow)
  const saveToSupabase = async (result: ScoringResult) => {
    if (!canManage) {
      alert("Bạn không có quyền thực hiện thao tác này.");
      return;
    }
    try {
      const info = result.extracted_info || {};
      const { error } = await supabase
        .from("candidates")
        .insert([{
          name: info.ten_ung_vien || result.file_name.split(".")[0],
          email: info.email || null,
          phone: info.sdt || null,
          education: info.bang_cap || null,
          major: info.chuyen_nganh || null,
          experience: info.kinh_nghiem || null,
          last_position: info.chuc_danh_gan_nhat || null,
          last_company: info.cong_ty_gan_nhat || null,
          region: info.khu_vuc || null,
          department: info.phong_ban || null,
          role: info.vi_tri || null,
          status: (info.trang_thai === "PASS CV" || result.score >= 70) ? "screening" : "rejected",
          v1_date: new Date().toLocaleDateString('sv-SE'),
          source: nguon,
          reviewer: info.nguoi_danh_gia || "AI Auto",
          ai_score: result.score,
          ai_recommendation: result.recommendation,
          ai_analysis: result.summary
        }]);

      if (error) throw error;

      setResults((prev) =>
        prev.map((r) => r.file_name === result.file_name ? { ...r, saved_db: true } : r)
      );
      
      // Refresh pipeline list
      fetchCandidates();
    } catch (err) {
      console.error("Error saving to database:", err);
      const errMsg = err && typeof err === "object" && "message" in err ? String((err as any).message) : String(err);
      alert("Lỗi khi lưu vào database: " + errMsg);
    }
  };

  // Save all un-saved candidates to DB
  const saveAllToDb = async () => {
    if (!canManage) {
      alert("Bạn không có quyền thực hiện thao tác này.");
      return;
    }
    const unsaved = results.filter((r) => !r.saved_db && !r.error);
    for (const r of unsaved) await saveToSupabase(r);
  };

  const submitAll = async () => {
    const unsubmitted = results.filter((r) => !r.submitted && !r.error);
    for (const r of unsubmitted) await submitToSheets(r);
  };

  const reset = () => { setFiles([]); setResults([]); setProgress({ done: 0, total: 0 }); };

  const passCount = results.filter((r) => r.trang_thai === "PASS CV").length;

  // Handle Pipeline Drag Start
  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!canManage) {
      e.preventDefault();
      return;
    }
    setDraggedCandidateId(id);
    e.dataTransfer.setData("text/plain", id);
  };

  // Handle Pipeline Drop
  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (!canManage) {
      alert("Bạn không có quyền thực hiện thao tác này.");
      return;
    }
    const candidateId = draggedCandidateId || e.dataTransfer.getData("text/plain");
    if (!candidateId) return;

    // Optimistic UI update
    const updatedCandidates = candidates.map(c => c.id === candidateId ? { ...c, status: columnId } : c);
    setCandidates(updatedCandidates);

    // Update in Supabase
    try {
      const { error } = await supabase
        .from("candidates")
        .update({ status: columnId })
        .eq("id", candidateId);

      if (error) throw error;
    } catch (err) {
      console.error("Error updating candidate pipeline status:", err);
      fetchCandidates(); // Rollback
    } finally {
      setDraggedCandidateId(null);
    }
  };

  // Create Manual Candidate
  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) {
      alert("Bạn không có quyền thực hiện thao tác này.");
      return;
    }
    if (!addName.trim()) return;

    try {
      const { error } = await supabase
        .from("candidates")
        .insert([{
          name: addName,
          role: addPosition,
          email: addEmail || null,
          phone: addPhone || null,
          source: addSource,
          status: "new",
          v1_date: new Date().toLocaleDateString('sv-SE'),
          ai_score: 0,
          reviewer: "Tự tạo"
        }]);

      if (error) throw error;

      setAddName("");
      setAddPosition("");
      setAddEmail("");
      setAddPhone("");
      setIsAddOpen(false);
      
      fetchCandidates();
    } catch (err) {
      console.error("Error creating candidate:", err);
      const errMsg = err && typeof err === "object" && "message" in err ? String((err as any).message) : String(err);
      alert("Lỗi khi thêm ứng viên: " + errMsg);
    }
  };

  // Add Blank Candidate Row (Dòng điền tay)
  const handleAddBlankRow = async () => {
    if (!canManage) {
      alert("Bạn không có quyền thực hiện thao tác này.");
      return;
    }
    
    // Calculate next STT
    const maxStt = candidates.reduce((max, c) => ((c.stt || 0) > max ? (c.stt || 0) : max), 0);
    const nextStt = maxStt + 1;
    
    // Determine initial values based on current table sub-tab
    let initialStatus = "new";
    let initialV1Result = null;
    let initialV2Result = null;
    let initialOnboardDate = null;
    let initialV1Date = null;
    
    if (tableSubTab === "vong_1") {
      initialStatus = "screening";
      initialV1Date = new Date().toLocaleDateString('sv-SE');
    } else if (tableSubTab === "vong_2") {
      initialStatus = "interview";
      initialV1Result = "ĐẠT";
      initialV1Date = new Date().toLocaleDateString('sv-SE');
    } else if (tableSubTab === "thu_viec") {
      initialStatus = "hired";
      initialV1Result = "ĐẠT";
      initialV2Result = "ĐẠT";
      initialV1Date = new Date().toLocaleDateString('sv-SE');
      initialOnboardDate = new Date().toLocaleDateString('sv-SE');
    }
    
    try {
      const { error } = await supabase
        .from("candidates")
        .insert([{
          stt: nextStt,
          name: "Nhập tên...",
          role: "Nhập vị trí...",
          status: initialStatus,
          v1_result: initialV1Result,
          v2_result: initialV2Result,
          onboard_date: initialOnboardDate,
          created_at: new Date().toISOString(),
          v1_date: initialV1Date,
          ai_score: 0,
          reviewer: "Tự tạo"
        }]);
        
      if (error) throw error;
      
      // Refresh candidates list
      await fetchCandidates();
    } catch (err) {
      console.error("Error inserting blank row:", err);
      const errMsg = err && typeof err === "object" && "message" in err ? String((err as any).message) : String(err);
      alert("Lỗi khi thêm dòng trống: " + errMsg);
    }
  };

  // Delete Candidate
  const handleDeleteCandidate = async (id: string) => {
    if (!canManage) {
      alert("Bạn không có quyền thực hiện thao tác này.");
      return;
    }
    if (!confirm("Bạn có chắc chắn muốn xóa hồ sơ ứng viên này?")) return;
    try {
      const { error } = await supabase
        .from("candidates")
        .delete()
        .eq("id", id);
      if (error) throw error;
      fetchCandidates();
    } catch (err) {
      console.error("Error deleting candidate:", err);
    }
  };

  // Helper functions for normalization in UI
  const normalizeDeptUI = (deptName: string): string => {
    if (!deptName) return "";
    const d = deptName.toLowerCase().trim();
    if (d.includes("xuyên tâm") || d.includes("rxt")) return "rxt";
    if (d.includes("vàm lẽo") || d.includes("vàm lẻo")) return "vam_leo";
    if (d.includes("mã đà")) return "ma_da";
    if (d.includes("trà vinh") || d.includes("dmt")) return "dmt_tra_vinh";
    if (d.includes("tỉnh lộ 8") || d.includes("tl8")) return "tl8";
    if (d.includes("tây ninh")) return "tay_ninh";
    if (d.includes("chống hạn")) return "chong_han";
    if (d.includes("cà ná")) return "ca_na";
    if (d.includes("quản lý dự án") || d.includes("qlda")) return "phong_qlda";
    if (d.includes("hành chính") || d.includes("hcns") || d.includes("nhân sự")) return "phong_hcns";
    if (d.includes("kế hoạch") || d.includes("đấu thầu")) return "phong_ke_hoach";
    if (d.includes("an toàn") || d.includes("atld") || d.includes("atlđ")) return "phong_atld";
    if (d.includes("vật tư") || d.includes("vt-tb") || d.includes("vt tb") || d.includes("vt_tb")) return "phong_vt_tb";
    if (d.includes("kỹ thuật") || d.includes("ktht")) return "phong_ktht";
    return d;
  };

  const normalizeRoleUI = (roleName: string): string => {
    if (!roleName) return "";
    const r = roleName.toLowerCase().trim();
    if (r.includes("tuyển dụng")) return "tuyen_dung";
    if (r.includes("media")) return "media";
    if (r.includes("designer")) return "designer";
    if (r.includes("tổ trưởng") && r.includes("nhân sự")) return "to_truong_ns";
    if (r.includes("phó phòng") && (r.includes("hành chính") || r.includes("hc"))) return "pp_hanh_chinh";
    if (r.includes("hành chính") || r.includes("hành chánh") || r.includes("hcns") || r.includes("nhân sự")) return "hanh_chinh";
    if (r.includes("an toàn") || r.includes("atld") || r.includes("atlđ") || r.includes("hse") || r.includes("môi trường")) return "atld";
    if (r.includes("qlda") || r.includes("quản lý dự án") || r.includes("tổng hợp p qlda")) return "cv_qlda";
    if (r.includes("qs")) return "qs";
    if (r.includes("đấu thầu")) return "dau_thau";
    if (r.includes("kế hoạch") || r.includes("kinh tế")) return "ke_hoach";
    if (r.includes("vật tư") || r.includes("vt-tb")) return "vt_tb";
    if (r.includes("trưởng phòng") && r.includes("ktht")) return "tp_ktht";
    if (r.includes("phó phòng") && r.includes("ktht")) return "pp_ktht";
    if (r.includes("kỹ thuật") || r.includes("ktht") || r.includes("kỹ sư")) return "ktht";
    return r;
  };

  const parseDateUI = (dStr: string): Date | null => {
    if (!dStr) return null;
    const match = dStr.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (match) {
      return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    // Dữ liệu nhập tay lưu dạng DD/MM/YYYY (vd "15/06/2026" — cột ONBOARD)
    const dmy = dStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) {
      return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
    }
    return null;
  };

  const { reportPreviewData, totalReportHired } = useMemo(() => {
    const start = reportStartDate ? parseDateUI(reportStartDate) : null;
    const end = reportEndDate ? parseDateUI(reportEndDate) : null;
    
    // Filter hired candidates within date range
    const filteredHired = candidates.filter(c => {
      const status = (c.status || "").toLowerCase();
      const v2 = (c.v2_result || "").toLowerCase();
      const prob = (c.probation_result || "").toLowerCase();
      
      const isHired = status === "hired" || status === "offer" || v2 === "đạt" || v2 === "pass" || prob === "x" || prob === "đạt" || c.onboard_date != null;
      if (!isHired) return false;
      
      const cDateStr = c.onboard_date || c.v2_interview_date || c.created_at || c.v1_date;
      const cDate = parseDateUI(cDateStr);
      if (cDate) {
        if (start && cDate < start) return false;
        if (end && cDate > end) return false;
      }
      return true;
    });

    const generateRowsForDept = (deptName: string, totalDemand: number) => {
      const deptCandidates = candidates.filter(c => normalizeDeptUI(c.department) === normalizeDeptUI(deptName));
      const deptHiredInRange = filteredHired.filter(c => normalizeDeptUI(c.department) === normalizeDeptUI(deptName));
      const rows: any[] = [];
      
      if (deptHiredInRange.length > 0) {
        const roleGroups: Record<string, any[]> = {};
        deptHiredInRange.forEach(c => {
          const role = c.role || "Nhân sự";
          if (!roleGroups[role]) roleGroups[role] = [];
          roleGroups[role].push(c);
        });
        
        let hiredTotal = 0;
        Object.entries(roleGroups).forEach(([roleName, cands]) => {
          const hired = cands.length;
          hiredTotal += hired;
          const demand = hired; 
          const remaining = 0;
          const progress = "Hoàn thành";
          const notes = cands.map(c => {
            const name = c.name || "";
            if (c.onboard_date) {
              const oDate = parseDateUI(c.onboard_date);
              return oDate ? `${name} ${oDate.getDate()}/${oDate.getMonth() + 1}` : `${name} ${c.onboard_date}`;
            }
            return name;
          }).join(", ");
          
          rows.push({
            dept: deptName,
            role: roleName,
            demand,
            hired,
            remaining,
            progress,
            notes
          });
        });
        
        if (hiredTotal < totalDemand) {
          const remainingDemand = totalDemand - hiredTotal;
          const otherRoles = Array.from(new Set(deptCandidates.map(c => c.role).filter(Boolean)));
          const activeHiredRoles = Object.keys(roleGroups);
          const unusedRoles = otherRoles.filter(r => !activeHiredRoles.includes(r));
          const fallbackRole = unusedRoles[0] || otherRoles[0] || "";
          
          rows.push({
            dept: deptName,
            role: fallbackRole,
            demand: remainingDemand,
            hired: 0,
            remaining: remainingDemand,
            progress: "Chưa hoàn thành",
            notes: ""
          });
        }
      } else {
        const deptRoles = Array.from(new Set(deptCandidates.map(c => c.role).filter(Boolean)));
        const primaryRole = deptRoles[0] || "";
        
        rows.push({
          dept: deptName,
          role: primaryRole,
          demand: totalDemand,
          hired: 0,
          remaining: totalDemand,
          progress: totalDemand > 0 ? "Chưa hoàn thành" : "",
          notes: ""
        });
      }
      
      return rows;
    };

    const previewData: any[] = [];
    
    // KHỐI DỰ ÁN header
    previewData.push({ dept: "KHỐI DỰ ÁN", role: "", demand: 0, isHeader: true });
    Object.entries(projectManualNeeds).forEach(([projName, demand]) => {
      const deptRows = generateRowsForDept(projName, demand);
      previewData.push(...deptRows);
    });
    
    // KHỐI VĂN PHÒNG header
    previewData.push({ dept: "KHỐI VĂN PHÒNG", role: "", demand: 0, isHeader: true });
    Object.entries(officeManualNeeds).forEach(([deptName, demand]) => {
      const deptRows = generateRowsForDept(deptName, demand);
      previewData.push(...deptRows);
    });

    return {
      reportPreviewData: previewData,
      totalReportHired: filteredHired.length
    };
  }, [candidates, reportStartDate, reportEndDate, projectManualNeeds, officeManualNeeds]);

  const handleExportReport = async () => {
    try {
      setExportingReport(true);
      const res = await apiFetch("/api/export-recruitment-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: reportStartDate,
          endDate: reportEndDate,
          candidates,
          officeManualNeeds,
          projectManualNeeds
        })
      });

      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bao_Cao_Tuyen_Dung_Tuan_${reportStartDate}_den_${reportEndDate}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("Lỗi xuất báo cáo: " + (e.message || e));
    } finally {
      setExportingReport(false);
    }
  };

  // Màn chặn truy cập (giống Văn Thư / Góp ý & Kiến nghị): tài khoản không có quyền
  // thấy thông báo từ chối, không thấy dữ liệu tuyển dụng nào. RLS trên bảng
  // candidates + recruitment_needs là lớp chặn thật ở database.
  if (!currentUser) {
    return (
      <div className="flex min-h-screen bg-[#F7F9FC]">
        <Sidebar />
        <div className="ml-60 flex-1 flex flex-col min-w-0">
          <Header title="Quy trình Tuyển dụng" subtitle="Hệ thống quản lý quy trình ứng tuyển và chấm điểm CV bằng AI" />
          <main className="flex-1 p-8 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </main>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex min-h-screen bg-[#F7F9FC]">
        <Sidebar />
        <div className="ml-60 flex-1 flex flex-col min-w-0">
          <Header title="Quy trình Tuyển dụng" subtitle="Hệ thống quản lý quy trình ứng tuyển và chấm điểm CV bằng AI" />
          <main className="flex-1 p-8 flex flex-col items-center justify-center max-w-4xl">
            <div className="glass bg-white rounded-2xl p-8 border border-slate-200/50 shadow-premium text-center space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
                <ShieldAlert size={32} />
              </div>
              <h2 className="font-heading font-extrabold text-slate-800 text-lg">Truy cập bị từ chối</h2>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                Tài khoản của bạn ({currentUser.email}) không có quyền xem nội dung Tuyển dụng. Chỉ Admin và cán bộ được cấp quyền riêng (Phòng HCNS) mới truy cập được mục này.
              </p>
              <div className="pt-2">
                <a
                  href="/"
                  className="inline-block px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow active:scale-95"
                >
                  Quay lại Dashboard
                </a>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Quy trình Tuyển dụng" subtitle="Hệ thống quản lý quy trình ứng tuyển và chấm điểm CV bằng AI" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === "dashboard"
                  ? "border-[#005BAC] text-[#005BAC]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <ArrowUpDown size={14} />
              Tổng quan (Dashboard)
            </button>
            <button
              onClick={() => setActiveTab("table_view")}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === "table_view"
                  ? "border-[#005BAC] text-[#005BAC]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <FileText size={14} />
              Bảng danh sách chi tiết (Sheets) {candidates.length > 0 && `(${candidates.length})`}
            </button>
            <button
              onClick={() => setActiveTab("scorer")}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === "scorer"
                  ? "border-[#005BAC] text-[#005BAC]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <Upload size={14} />
              Chấm điểm CV (AI Scorer)
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === "settings"
                  ? "border-[#005BAC] text-[#005BAC]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <Settings size={14} />
              Cấu hình hệ thống (Settings)
            </button>
            <button
              onClick={() => setIsReportOpen(true)}
              className="flex items-center gap-2 ml-auto px-4 py-2 my-1.5 mr-4 text-xs font-bold text-white bg-[#005BAC] hover:bg-blue-700 rounded-xl shadow-md transition-all active:scale-95 shrink-0"
            >
              <FileDown size={14} />
              Báo cáo tuần
            </button>
          </div>

          {/* TAB 0: EXECUTIVE DASHBOARD */}
          {activeTab === "dashboard" && (() => {
            const total = candidates.length;
            const byStatus = (status: string) => candidates.filter(c => (c.status || "new") === status).length;
            const newCount = byStatus("new");
            const screeningCount = byStatus("screening");
            const interviewCount = byStatus("interview");
            const offerCount = byStatus("offer");
            const hiredCount = byStatus("hired");
            const rejectedCount = candidates.filter(c => c.status === "rejected").length;
            
            // Counts aligned with the 4 detail sheets
            const sortedCandidates = [...candidates].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
            const vong1Count = sortedCandidates.filter(c => c.status !== "rejected").length;
            const vong2Count = sortedCandidates.filter(c => c.v1_result === "ĐẠT").length;
            const thuViecCount = sortedCandidates.filter(c => c.v2_result === "ĐẠT").length;
            const passRate = total > 0 ? Math.round((vong1Count / total) * 100) : 0;

            // "ĐÃ TUYỂN trong tháng" = Kết quả nhận việc (tab thử việc) là NHẬN
            // và ngày ONBOARD thuộc đúng tháng đang chọn ở bộ lọc nhu cầu tuyển dụng.
            const isHiredInMonth = (c: any) => {
              const res = String(c.probation_result || "").toUpperCase().trim();
              if (res !== "NHẬN" && res !== "ĐẠT") return false;
              const d = parseDateUI(c.onboard_date || "");
              if (!d) return false;
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === needsMonth;
            };

            const byDept: Record<string, { total: number; hired: number; interview: number; rejected: number }> = {};
            candidates.forEach(c => {
              const dept = normalizeDepartment(c.department);
              if (!byDept[dept]) byDept[dept] = { total: 0, hired: 0, interview: 0, rejected: 0 };
              byDept[dept].total++;
              if (isHiredInMonth(c)) byDept[dept].hired++;
              else if (c.v1_result === "ĐẠT") byDept[dept].interview++;
              if (c.status === "rejected") byDept[dept].rejected++;
            });
            const deptEntries = Object.entries(byDept).sort((a, b) => b[1].total - a[1].total);
            const officeEntries = deptEntries.filter(([dept]) => !isProjectBlock(dept));
            const projectEntries = deptEntries.filter(([dept]) => isProjectBlock(dept));
            
            const officeChartData = officeEntries.filter(([, v]) => v.hired > 0).map(([name, v]) => ({ name, value: v.hired }));
            const officeTotalHired = officeEntries.reduce((sum, [, v]) => sum + v.hired, 0);
            const officePieData = officeChartData.length > 0 ? officeChartData : [{ name: "Chưa có nhân sự", value: 1 }];
            
            const projectChartData = projectEntries.filter(([, v]) => v.hired > 0).map(([name, v]) => ({ name, value: v.hired }));
            const projectTotalHired = projectEntries.reduce((sum, [, v]) => sum + v.hired, 0);
            const projectPieData = projectChartData.length > 0 ? projectChartData : [{ name: "Chưa có nhân sự", value: 1 }];
            
            const officeTotalNeed = Object.values(officeManualNeeds).reduce((a, b) => a + b, 0);
            const officeToRecruit = Math.max(0, officeTotalNeed - officeTotalHired);
            
            const projectTotalNeed = Object.values(projectManualNeeds).reduce((a, b) => a + b, 0);
            const projectToRecruit = Math.max(0, projectTotalNeed - projectTotalHired);
            
            const CHART_COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#06B6D4", "#EC4899", "#34D399", "#A78BFA", "#F472B6"];
            const PLACEHOLDER_COLOR = "#E2E8F0";

            const bySource: Record<string, number> = {};
            candidates.forEach(c => {
              const src = c.source || "Khác";
              bySource[src] = (bySource[src] || 0) + 1;
            });
            const sourceEntries = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 6);

            const byMonth: Record<string, number> = {};
            candidates.forEach(c => {
              if (c.created_at) {
                const d = new Date(c.created_at);
                const key = `T${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
                byMonth[key] = (byMonth[key] || 0) + 1;
              }
            });
            const monthEntries = Object.entries(byMonth).slice(-6);
            const monthTotalCount = monthEntries.reduce((sum, [, v]) => sum + v, 0);

            const funnelPieData = [
              { name: "CV Mới", value: newCount, color: "#94A3B8", textClass: "text-slate-600 bg-slate-50", pct: total > 0 ? Math.round((newCount/total)*100) : 0 },
              { name: "Sàng lọc", value: screeningCount, color: "#06B6D4", textClass: "text-cyan-600 bg-cyan-50", pct: total > 0 ? Math.round((screeningCount/total)*100) : 0 },
              { name: "Phỏng vấn", value: interviewCount, color: "#3B82F6", textClass: "text-blue-600 bg-blue-50", pct: total > 0 ? Math.round((interviewCount/total)*100) : 0 },
              { name: "Đề nghị", value: offerCount, color: "#8B5CF6", textClass: "text-purple-600 bg-purple-50", pct: total > 0 ? Math.round((offerCount/total)*100) : 0 },
              { name: "Đã tuyển", value: hiredCount, color: "#10B981", textClass: "text-emerald-600 bg-emerald-50", pct: total > 0 ? Math.round((hiredCount/total)*100) : 0 },
              { name: "Từ chối", value: rejectedCount, color: "#F43F5E", textClass: "text-rose-600 bg-rose-50", pct: total > 0 ? Math.round((rejectedCount/total)*100) : 0 },
            ];
            const hasFunnelData = total > 0;
            const funnelChartData = hasFunnelData
              ? funnelPieData.filter(d => d.value > 0)
              : [{ name: "Chưa có ứng viên", value: 1, color: "#E2E8F0", pct: 0, textClass: "" }];

            const monthPieData = monthEntries.map(([month, count], index) => ({
              name: month,
              value: count,
              color: CHART_COLORS[index % CHART_COLORS.length],
              pct: monthTotalCount > 0 ? Math.round((count/monthTotalCount)*100) : 0
            }));
            const hasMonthData = monthTotalCount > 0;
            const monthChartData = hasMonthData
              ? monthPieData.filter(d => d.value > 0)
              : [{ name: "Chưa có dữ liệu", value: 1, color: "#E2E8F0", pct: 0 }];

            return (
              <div className="space-y-6">
                {/* KPI Row */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    { label: "Tổng ứng viên", value: total, icon: "👥", bgStyle: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", shadow: "shadow-blue-500/10", sub: "Toàn bộ hồ sơ" },
                    { label: "Vòng 1 (Sàng lọc)", value: vong1Count, icon: "📋", bgStyle: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)", shadow: "shadow-cyan-500/10", sub: "Đạt sàng lọc hồ sơ" },
                    { label: "Vòng 2 (Phỏng vấn)", value: vong2Count, icon: "🎯", bgStyle: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)", shadow: "shadow-purple-500/10", sub: "Đạt phỏng vấn V1" },
                    { label: "Thử việc / Nhận việc", value: thuViecCount, icon: "✅", bgStyle: "linear-gradient(135deg, #10b981 0%, #059669 100%)", shadow: "shadow-emerald-500/10", sub: "Đạt phỏng vấn V2" },
                    { label: "Từ chối / Loại", value: rejectedCount, icon: "❌", bgStyle: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)", shadow: "shadow-rose-500/10", sub: `${total>0?Math.round((rejectedCount/total)*100):0}% tổng số` },
                    { label: "Tỉ lệ Pass CV", value: `${passRate}%`, icon: "📊", bgStyle: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", shadow: "shadow-amber-500/10", sub: "Không bị loại" },
                  ].map((kpi, i) => (
                    <div key={i} style={{ background: kpi.bgStyle }} className={`rounded-2xl p-4 text-white shadow-lg ${kpi.shadow} relative overflow-hidden`}>
                      <div className="absolute top-2 right-3 text-2xl opacity-20 select-none">{kpi.icon}</div>
                      <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wider leading-tight">{kpi.label}</p>
                      <p className="text-3xl font-extrabold font-heading mt-1 leading-none">{kpi.value}</p>
                      <p className="text-[9px] opacity-70 mt-1.5">{kpi.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Row 2: Nhu cầu tuyển dụng thực tế (Full-width) */}
                <div className="glass bg-white/80 rounded-3xl p-6 shadow border border-slate-100 space-y-6 relative overflow-hidden">
                  <div className="relative flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                      <h3 className="font-heading font-black text-[#005BAC] text-sm flex items-center gap-2">
                        <Layers className="text-[#005BAC]" size={16} />
                        Nhu cầu tuyển dụng thực tế
                      </h3>
                      <p className="text-[10px] text-slate-500 font-bold mt-0.5">Số lượng nhân sự cần bổ sung theo từng khối bộ phận (nhập tay trực tiếp, lưu riêng theo từng tháng)</p>
                    </div>

                    {/* Bộ lọc theo tháng — nhu cầu tuyển dụng lưu riêng từng tháng */}
                    <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-2xl shadow-sm shrink-0">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Tháng:</span>
                      <input
                        type="month"
                        value={needsMonth}
                        onChange={(e) => setNeedsMonth(e.target.value || currentMonthKey)}
                        className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
                      />
                      {needsMonth !== currentMonthKey && (
                        <button
                          onClick={() => setNeedsMonth(currentMonthKey)}
                          className="text-[10px] font-black text-[#005BAC] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded-lg transition-colors"
                        >
                          Về tháng này
                        </button>
                      )}
                    </div>

                    {/* Tỷ lệ tuyển dụng THEO THÁNG = đã tuyển trong tháng (NHẬN + onboard) / nhu cầu tuyển trong tháng */}
                    <div className="sm:absolute sm:left-1/2 sm:-translate-x-1/2 flex items-center gap-3 bg-emerald-50 border-2 border-emerald-200 px-6 py-2 rounded-3xl shadow-sm hover:shadow-md hover:bg-emerald-100/40 transition-all duration-300 shrink-0">
                      <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <span className="text-lg font-black text-emerald-800 uppercase tracking-wider">Tỷ lệ tuyển dụng T{parseInt(needsMonth.slice(5), 10)}:</span>
                      <span className="text-3xl font-black text-emerald-600 leading-none">
                        {(officeTotalNeed + projectTotalNeed) > 0
                          ? Math.round(((officeTotalHired + projectTotalHired) / (officeTotalNeed + projectTotalNeed)) * 100)
                          : 0}%
                      </span>
                      <span className="text-xs font-bold text-emerald-700/70">
                        ({officeTotalHired + projectTotalHired}/{officeTotalNeed + projectTotalNeed} người)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    {/* Khối Văn Phòng */}
                    <div className="bg-gradient-to-br from-amber-50/50 to-orange-50/30 border border-amber-200/60 rounded-2xl p-5 space-y-4 hover:border-amber-300 transition-all duration-300 shadow-sm">
                      <div className="flex items-center justify-between border-b border-amber-200/50 pb-3">
                        <span className="font-heading font-black text-sm text-amber-800 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                          Khối Văn Phòng
                        </span>
                        <span className="text-xs font-black text-amber-900 bg-amber-100 border border-amber-200/80 px-3 py-1 rounded-xl">
                          Cần tuyển: {Object.values(officeManualNeeds).reduce((a, b) => a + b, 0)} người
                        </span>
                      </div>

                      <div className="space-y-2 pr-1">
                        {Object.entries(officeManualNeeds).map(([dept, qty]) => (
                          <div key={dept} className="flex items-center justify-between text-sm bg-white hover:bg-amber-50/20 rounded-xl p-3 border border-slate-150 shadow-sm transition-all duration-200 group">
                            <span className="font-bold text-slate-700 truncate max-w-[120px] min-[380px]:max-w-[160px] min-[480px]:max-w-[200px] sm:max-w-[250px]">{dept}</span>
                            <div className="flex items-center gap-3">
                              {/* Quantity Counter */}
                              <div className="flex items-center bg-amber-50/85 border border-amber-200 rounded-lg p-1">
                                <button
                                  onClick={() => handleOfficeNeedChange(dept, qty - 1)}
                                  className="p-1 hover:bg-amber-200 rounded text-amber-700 hover:text-amber-900 transition-colors"
                                >
                                  <ChevronDown size={14} />
                                </button>
                                <span className="w-8 text-center text-sm font-black text-amber-900">{qty}</span>
                                <button
                                  onClick={() => handleOfficeNeedChange(dept, qty + 1)}
                                  className="p-1 hover:bg-amber-200 rounded text-amber-700 hover:text-amber-900 transition-colors"
                                >
                                  <ChevronUp size={14} />
                                </button>
                              </div>
                              {/* Delete button */}
                              <button
                                onClick={() => removeOfficeDept(dept)}
                                className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                        {Object.keys(officeManualNeeds).length === 0 && (
                          <p className="text-xs text-slate-400 italic text-center py-4">Chưa có nhu cầu</p>
                        )}
                      </div>

                      {/* Add new office form */}
                      <div className="flex items-center gap-2 pt-2 border-t border-amber-200/30">
                        <input
                          type="text"
                          value={newOfficeDept}
                          onChange={(e) => setNewOfficeDept(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addOfficeDept();
                            }
                          }}
                          placeholder="Thêm bộ phận..."
                          className="flex-1 bg-white border border-amber-200 rounded-xl px-4 py-2 text-sm outline-none text-slate-700 placeholder-slate-400 focus:ring-1 focus:ring-amber-500/20 focus:border-amber-400/60"
                        />
                        <button
                          type="button"
                          onClick={addOfficeDept}
                          className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl p-2 shadow-md shadow-amber-500/10 active:scale-95 transition-all cursor-pointer"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Khối Dự Án */}
                    <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/30 border border-blue-200/60 rounded-2xl p-5 space-y-4 hover:border-blue-300 transition-all duration-300 shadow-sm">
                      <div className="flex items-center justify-between border-b border-blue-200/50 pb-3">
                        <span className="font-heading font-black text-sm text-blue-800 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                          Khối Dự Án
                        </span>
                        <span className="text-xs font-black text-blue-900 bg-blue-100 border border-blue-200/80 px-3 py-1 rounded-xl">
                          Cần tuyển: {Object.values(projectManualNeeds).reduce((a, b) => a + b, 0)} người
                        </span>
                      </div>

                      <div className="space-y-2 pr-1">
                        {Object.entries(projectManualNeeds).map(([proj, qty]) => (
                          <div key={proj} className="flex items-center justify-between text-sm bg-white hover:bg-blue-50/20 rounded-xl p-3 border border-slate-150 shadow-sm transition-all duration-200 group">
                            <span className="font-bold text-slate-700 truncate max-w-[120px] min-[380px]:max-w-[160px] min-[480px]:max-w-[200px] sm:max-w-[250px]">{proj}</span>
                            <div className="flex items-center gap-3">
                              {/* Quantity Counter */}
                              <div className="flex items-center bg-blue-50/85 border border-blue-200 rounded-lg p-1">
                                <button
                                  onClick={() => handleProjectNeedChange(proj, qty - 1)}
                                  className="p-1 hover:bg-blue-200 rounded text-blue-700 hover:text-blue-900 transition-colors"
                                >
                                  <ChevronDown size={14} />
                                </button>
                                <span className="w-8 text-center text-sm font-black text-blue-900">{qty}</span>
                                <button
                                  onClick={() => handleProjectNeedChange(proj, qty + 1)}
                                  className="p-1 hover:bg-blue-200 rounded text-blue-700 hover:text-blue-900 transition-colors"
                                >
                                  <ChevronUp size={14} />
                                </button>
                              </div>
                              {/* Delete button */}
                              <button
                                onClick={() => removeProjectDept(proj)}
                                className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                        {Object.keys(projectManualNeeds).length === 0 && (
                          <p className="text-xs text-slate-400 italic text-center py-4">Chưa có nhu cầu</p>
                        )}
                      </div>

                      {/* Add new project form */}
                      <div className="flex items-center gap-2 pt-2 border-t border-blue-200/30">
                        <input
                          type="text"
                          value={newProjectDept}
                          onChange={(e) => setNewProjectDept(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addProjectDept();
                            }
                          }}
                          placeholder="Thêm dự án..."
                          className="flex-1 bg-white border border-blue-200 rounded-xl px-4 py-2 text-sm outline-none text-slate-700 placeholder-slate-400 focus:ring-1 focus:ring-blue-500/20 focus:border-blue-400/60"
                        />
                        <button
                          type="button"
                          onClick={addProjectDept}
                          className="bg-blue-500 hover:bg-blue-600 text-white rounded-xl p-2 shadow-md shadow-blue-500/10 active:scale-95 transition-all cursor-pointer"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 3: Office Block vs Project Block side-by-side circular donut charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Office Block */}
                  <div className="glass bg-white/80 rounded-2xl p-6 shadow border border-slate-100 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-heading font-black text-slate-800 text-sm">Khối Văn Phòng</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Đã tuyển (NHẬN việc + onboard) trong tháng {parseInt(needsMonth.slice(5), 10)}/{needsMonth.slice(0, 4)} và cần tuyển thêm</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      {/* Stats Bubble + Donut Chart Cluster */}
                      <div className="flex items-center gap-4 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-150 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] shrink-0 select-none">
                        {/* Tuyển thêm bubble */}
                        <div className={`w-24 h-24 rounded-full flex flex-col items-center justify-center shadow-lg transition-transform duration-300 hover:scale-105 shrink-0 border-2 ${
                          officeToRecruit > 0 
                            ? "bg-gradient-to-br from-rose-500 via-red-500 to-red-600 text-white shadow-red-500/25 border-red-400 ring-4 ring-red-500/10" 
                            : "bg-gradient-to-br from-emerald-500 via-emerald-500 to-teal-600 text-white shadow-emerald-500/25 border-emerald-400 ring-4 ring-emerald-500/10"
                        }`}>
                          <span className="text-3xl font-black font-heading leading-none">{officeToRecruit}</span>
                          <span className="text-[9px] font-black tracking-wider uppercase mt-1">Tuyển thêm</span>
                        </div>

                        {/* Donut Chart */}
                        <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={officePieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={28}
                                outerRadius={40}
                                paddingAngle={officeTotalHired > 0 ? 2 : 0}
                                dataKey="value"
                              >
                                {officePieData.map((entry, index) => (
                                  <Cell 
                                    key={`cell-${index}`} 
                                    fill={officeTotalHired > 0 ? CHART_COLORS[index % CHART_COLORS.length] : PLACEHOLDER_COLOR} 
                                  />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-xl font-black text-slate-800 leading-none">{officeTotalHired}</span>
                            <span className="text-[8px] font-black text-slate-400 mt-0.5 uppercase tracking-wider">Đã tuyển</span>
                          </div>
                        </div>
                      </div>

                      {/* Legend & Detail List */}
                      <div className="flex-1 space-y-2.5 w-full pr-1">
                        {officeEntries.map(([dept, stats]) => {
                          const hasHired = stats.hired > 0;
                          const mappedIndex = officeChartData.findIndex(x => x.name === dept);
                          const color = hasHired ? CHART_COLORS[mappedIndex % CHART_COLORS.length] : "#94A3B8";
                          return (
                            <div key={dept} className="flex items-center justify-between text-sm font-semibold">
                              <div className="flex items-center gap-2 min-w-0">
                                <span 
                                  className="w-2.5 h-2.5 rounded-full shrink-0" 
                                  style={{ backgroundColor: color }} 
                                />
                                <span className="text-slate-700 break-words leading-tight">{dept}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${hasHired ? "text-emerald-600 bg-emerald-50" : "text-slate-400 bg-slate-50"}`}>
                                  {stats.hired} đã tuyển
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">({stats.total} HS)</span>
                              </div>
                            </div>
                          );
                        })}
                        {officeEntries.length === 0 && (
                          <p className="text-slate-400 text-xs italic text-center py-8">Không có dữ liệu phòng ban</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Project Block */}
                  <div className="glass bg-white/80 rounded-2xl p-6 shadow border border-slate-100 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-heading font-black text-slate-800 text-sm">Khối Dự Án</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Đã tuyển (NHẬN việc + onboard) tại các dự án trong tháng {parseInt(needsMonth.slice(5), 10)}/{needsMonth.slice(0, 4)} và cần tuyển thêm</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      {/* Stats Bubble + Donut Chart Cluster */}
                      <div className="flex items-center gap-4 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-150 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] shrink-0 select-none">
                        {/* Tuyển thêm bubble */}
                        <div className={`w-24 h-24 rounded-full flex flex-col items-center justify-center shadow-lg transition-transform duration-300 hover:scale-105 shrink-0 border-2 ${
                          projectToRecruit > 0 
                            ? "bg-gradient-to-br from-rose-500 via-red-500 to-red-600 text-white shadow-red-500/25 border-red-400 ring-4 ring-red-500/10" 
                            : "bg-gradient-to-br from-emerald-500 via-emerald-500 to-teal-600 text-white shadow-emerald-500/25 border-emerald-400 ring-4 ring-emerald-500/10"
                        }`}>
                          <span className="text-3xl font-black font-heading leading-none">{projectToRecruit}</span>
                          <span className="text-[9px] font-black tracking-wider uppercase mt-1">Tuyển thêm</span>
                        </div>

                        {/* Donut Chart */}
                        <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={projectPieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={28}
                                outerRadius={40}
                                paddingAngle={projectTotalHired > 0 ? 2 : 0}
                                dataKey="value"
                              >
                                {projectPieData.map((entry, index) => (
                                  <Cell 
                                    key={`cell-${index}`} 
                                    fill={projectTotalHired > 0 ? CHART_COLORS[index % CHART_COLORS.length] : PLACEHOLDER_COLOR} 
                                  />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-xl font-black text-slate-800 leading-none">{projectTotalHired}</span>
                            <span className="text-[8px] font-black text-slate-400 mt-0.5 uppercase tracking-wider">Đã tuyển</span>
                          </div>
                        </div>
                      </div>

                      {/* Legend & Detail List */}
                      <div className="flex-1 space-y-2.5 w-full pr-1">
                        {projectEntries.map(([dept, stats]) => {
                          const hasHired = stats.hired > 0;
                          const mappedIndex = projectChartData.findIndex(x => x.name === dept);
                          const color = hasHired ? CHART_COLORS[mappedIndex % CHART_COLORS.length] : "#94A3B8";
                          return (
                            <div key={dept} className="flex items-center justify-between text-sm font-semibold">
                              <div className="flex items-center gap-2 min-w-0">
                                <span 
                                  className="w-2.5 h-2.5 rounded-full shrink-0" 
                                  style={{ backgroundColor: color }} 
                                />
                                <span className="text-slate-700 break-words leading-tight">{dept}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${hasHired ? "text-emerald-600 bg-emerald-50" : "text-slate-400 bg-slate-50"}`}>
                                  {stats.hired} đã tuyển
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">({stats.total} HS)</span>
                              </div>
                            </div>
                          );
                        })}
                        {projectEntries.length === 0 && (
                          <p className="text-slate-400 text-xs italic text-center py-8">Không có dữ liệu dự án</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 4: Candidate Source & Highlight Spotlight Units */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: By Candidate Source */}
                  <div className="glass bg-white/80 rounded-2xl p-6 shadow border border-slate-100 space-y-4">
                    <div>
                      <h3 className="font-heading font-bold text-slate-800 text-sm">Theo Nguồn Ứng Viên</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Kênh tuyển dụng hiệu quả nhất</p>
                    </div>
                    <div className="space-y-3">
                      {sourceEntries.map(([src, count], i) => {
                        const maxSrc = sourceEntries[0]?.[1] || 1;
                        const pct = Math.round((count / total) * 100);
                        const COLORS = [
                          "from-blue-400 to-blue-600",
                          "from-emerald-400 to-emerald-600",
                          "from-purple-400 to-purple-600",
                          "from-amber-400 to-amber-600",
                          "from-cyan-400 to-cyan-600",
                          "from-rose-400 to-rose-600",
                        ];
                        return (
                          <div key={src} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-700">{src}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">{count} UV</span>
                                <span className="text-blue-600 font-extrabold">{pct}%</span>
                              </div>
                            </div>
                            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full bg-gradient-to-r ${COLORS[i % COLORS.length]} rounded-full transition-all duration-700`}
                                style={{ width: `${Math.round((count / maxSrc) * 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Spotlight Units */}
                  <div className="glass bg-white/80 rounded-2xl p-6 shadow border border-slate-100 space-y-4 flex flex-col justify-between">
                    <div>
                      <h3 className="font-heading font-bold text-slate-800 text-sm">Đơn vị & Bộ phận nổi bật</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Các điểm sáng trong công tác thu hút nhân tài</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 flex-1 items-center">
                      <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-5 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Phòng nhiều UV nhất</p>
                        <p className="text-sm font-extrabold text-blue-800 mt-2 leading-snug">{deptEntries[0]?.[0] || "—"}</p>
                        <p className="text-[11px] text-blue-550 font-bold mt-1">{deptEntries[0]?.[1].total || 0} ứng viên</p>
                      </div>
                      
                      <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Phòng tuyển được nhiều</p>
                        <p className="text-sm font-extrabold text-emerald-800 mt-2 leading-snug">
                          {[...deptEntries].sort((a, b) => b[1].hired - a[1].hired)[0]?.[0] || "—"}
                        </p>
                        <p className="text-[11px] text-emerald-550 font-bold mt-1">{[...deptEntries].sort((a, b) => b[1].hired - a[1].hired)[0]?.[1].hired || 0} đã tuyển</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB 1: PIPELINE BOARD */}
          {(activeTab as string) === "pipeline" && (
            <div className="space-y-6">
              {/* Subheader Filters */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Search */}
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm ứng viên, vị trí tuyển..."
                      className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
                    />
                  </div>
                  <button 
                    onClick={fetchCandidates}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    Tải lại
                  </button>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsAddOpen(true)}
                      className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md shadow-blue-600/10"
                    >
                      <Plus size={14} /> Thêm ứng viên
                    </button>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center h-[350px] text-slate-400 gap-2">
                  <Loader2 className="animate-spin text-blue-600" size={26} />
                  <p className="text-xs font-medium">Đang tải phễu tuyển dụng...</p>
                </div>
              ) : (
                /* Pipeline Board */
                <div className="flex overflow-x-auto pb-4 gap-4 items-start md:grid md:grid-cols-3 lg:grid-cols-6 md:overflow-x-visible">
                  {COLUMNS.map((col) => {
                    const colCandidates = filteredPipeline.filter(c => (c.status || "new") === col.id);
                    return (
                      <div 
                        key={col.id} 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, col.id)}
                        className="flex flex-col gap-4 min-w-[200px] shrink-0 bg-slate-100/40 p-3 rounded-2xl border border-slate-200/40 min-h-[450px]"
                      >
                        {/* Column Header */}
                        <div className={`flex items-center justify-between border-t-2 ${col.color} pt-2`}>
                          <div className="flex items-center gap-2">
                            <span className="font-heading font-bold text-xs text-slate-700">{col.title}</span>
                            <span className="text-[9px] font-extrabold text-slate-400 bg-slate-200/80 px-2 py-0.5 rounded-full">{colCandidates.length}</span>
                          </div>
                        </div>

                        {/* Candidate Cards */}
                        <div className="space-y-3 flex-1">
                          {colCandidates.map((candidate) => (
                            <div
                              key={candidate.id}
                              draggable={canManage}
                              onDragStart={(e) => handleDragStart(e, candidate.id)}
                              className={`glass rounded-xl p-4 bg-white hover-elevate border border-slate-200/30 flex flex-col justify-between h-40 ${canManage ? "cursor-grab active:cursor-grabbing" : "cursor-default"} relative group`}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${
                                    candidate.ai_score >= 75 ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                                    candidate.ai_score >= 50 ? "bg-amber-100 text-amber-700 border border-amber-200" :
                                    "bg-rose-100 text-rose-700 border border-rose-200"
                                  }`}>
                                    Điểm AI: {candidate.ai_score || 0}
                                  </span>
                                  {canManage && (
                                    <button 
                                      onClick={() => handleDeleteCandidate(candidate.id)}
                                      className="text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                                
                                <p className="text-slate-800 font-heading font-bold text-xs truncate leading-snug">{candidate.name}</p>
                                <p className="text-slate-400 text-[10px] font-semibold truncate">{candidate.role || candidate.last_position || "Chưa cập nhật"}</p>
                              </div>

                              {/* Contact & Timeline Info */}
                              <div className="space-y-1.5 pt-2 border-t border-slate-100 text-[9px] text-slate-400 font-semibold">
                                <span className="flex items-center gap-1.5 text-slate-500"><Phone size={10} /> {candidate.phone || "Không có SĐT"}</span>
                                <span className="flex items-center gap-1.5 text-slate-500"><Mail size={10} /> {candidate.email || "Không có Email"}</span>
                                
                                <div className="flex items-center justify-between pt-1 text-[8px] text-slate-400">
                                  <span>Nguồn: <strong className="text-slate-600">{candidate.source || "Khác"}</strong></span>
                                  <span className="flex items-center gap-0.5">
                                    <Calendar size={9} /> {new Date(candidate.created_at).toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {colCandidates.length === 0 && (
                            <div className="h-28 border-2 border-dashed border-slate-200/50 rounded-xl flex items-center justify-center text-slate-300 text-[11px] italic">
                              Kéo thả vào đây
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SPREADSHEET TABLE VIEW */}
          {activeTab === "table_view" && (
            <div className="space-y-6">
              {/* Controls bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Sheets Subtabs */}
                <div className="flex bg-slate-200/50 p-1 rounded-xl gap-1 w-fit border border-slate-200 max-w-full overflow-x-auto scrollbar-none shrink-0">
                  {[
                    { id: "tong_hop", label: "Tổng Hợp" },
                    { id: "vong_1", label: "Vòng 1" },
                    { id: "vong_2", label: "Vòng 2" },
                    { id: "thu_viec", label: "Thử Việc" }
                  ].map(tab => {
                    const count = getFilteredTableCandidates(tab.id).length;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setTableSubTab(tab.id as any)}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                          tableSubTab === tab.id
                            ? "bg-[#005BAC] text-white shadow-sm font-bold"
                            : "text-slate-600 hover:bg-white/40"
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          tableSubTab === tab.id ? "bg-white/20 text-white" : "bg-slate-300/60 text-slate-600"
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Search & Refresh */}
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm theo tên, SĐT, vị trí..."
                      className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
                    />
                  </div>
                  <button 
                    onClick={fetchCandidates}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    Tải lại
                  </button>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsAddOpen(true)}
                        className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 shadow"
                      >
                        <Plus size={14} /> Thêm ứng viên
                      </button>
                      <button 
                        onClick={handleAddBlankRow}
                        className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 border border-slate-200/80 shadow-sm"
                      >
                        <Plus size={14} /> Thêm dòng trống
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Data Table */}
              <div className="glass rounded-2xl overflow-hidden border border-slate-200/40 shadow-xl bg-white/80">
                <div className="overflow-x-auto max-h-[70vh] overflow-y-auto custom-scrollbar-table">
                  <table className="w-full text-xs text-left border-collapse table-fixed min-w-[1500px]">
                    <thead className="bg-[#005088] text-white sticky top-0 z-10 font-heading text-[11px] uppercase tracking-wider">
                      <tr>
                        {getColumnsForTab(tableSubTab).map(col => (
                          <th
                            key={col.key}
                            style={{ width: col.width }}
                            className="px-3 py-3 border border-slate-200/80 font-semibold text-center whitespace-nowrap"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={getColumnsForTab(tableSubTab).length} className="py-20 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="animate-spin text-blue-600" size={24} />
                              <p className="text-slate-400 italic">Đang tải bảng dữ liệu...</p>
                            </div>
                          </td>
                        </tr>
                      ) : getFilteredTableCandidates(tableSubTab).length === 0 ? (
                        <tr>
                          <td colSpan={getColumnsForTab(tableSubTab).length} className="py-10 text-center text-slate-400 italic">
                            Không tìm thấy ứng viên nào phù hợp
                          </td>
                        </tr>
                      ) : (
                        getFilteredTableCandidates(tableSubTab).map((candidate, i) => {
                          const cols = getColumnsForTab(tableSubTab);
                          return (
                            <tr
                              key={candidate.id}
                              className={`border-b border-slate-100 transition-colors ${
                                i % 2 === 0 ? "bg-white/40" : "bg-blue-50/10"
                              } hover:bg-blue-100/10`}
                            >
                              {cols.map(col => {
                                const val = candidate[col.key];

                                // STT: luôn đánh số lại từ 1 theo thứ tự hiển thị trong tab hiện tại, rê chuột hiện nút xóa
                                if (col.key === "stt") {
                                  return (
                                    <td 
                                      key={col.key} 
                                      className="group px-3 py-2 border border-slate-100 text-center text-slate-500 font-medium text-xs relative cursor-pointer min-w-[50px] align-middle"
                                    >
                                      <span className="group-hover:hidden block">{i + 1}</span>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteCandidate(candidate.id);
                                        }}
                                        className="hidden group-hover:flex items-center justify-center w-full h-full text-rose-500 hover:text-rose-700 transition-colors mx-auto"
                                        title="Xóa ứng viên"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </td>
                                  );
                                }

                                // Format cell content based on type
                                if (col.readOnly) {
                                  let displayVal = val || "";
                                  if (col.key === "created_at" && val) {
                                    displayVal = new Date(val).toLocaleDateString('vi-VN');
                                  }
                                  return (
                                    <td key={col.key} className="px-3 py-2 border border-slate-100 text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
                                      {displayVal}
                                    </td>
                                  );
                                }

                                if (col.type === "status") {
                                  const displayStatus = val === "rejected" ? "FAIL" : val === "new" ? "LƯU CV" : "PASS CV";
                                  return (
                                    <td key={col.key} className="px-3 py-2 border border-slate-100 text-center">
                                      <select
                                        value={displayStatus}
                                        onChange={(e) => handleDropdownChange(candidate.id, "status", e.target.value)}
                                        disabled={!canManage}
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-none outline-none ${
                                          displayStatus === "FAIL"
                                            ? "bg-rose-100 text-rose-700"
                                            : displayStatus === "LƯU CV"
                                            ? "bg-amber-100 text-amber-700"
                                            : "bg-emerald-100 text-emerald-700"
                                        } ${canManage ? "cursor-pointer" : "cursor-default opacity-85"}`}
                                      >
                                        <option value="PASS CV">PASS CV</option>
                                        <option value="LƯU CV">LƯU CV</option>
                                        <option value="FAIL">FAIL</option>
                                      </select>
                                    </td>
                                  );
                                }

                                if (col.type === "v1_result_readonly" || col.type === "v2_result_readonly") {
                                  const displayRes = val || "Chờ đánh giá";
                                  return (
                                    <td key={col.key} className="px-3 py-2 border border-slate-100 text-center">
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg inline-block ${
                                        displayRes === "ĐẠT"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : displayRes === "LOẠI"
                                          ? "bg-[#FEF3C7] text-[#92400E]"
                                          : displayRes === "TC PV"
                                          ? "bg-rose-600 text-white"
                                          : "bg-slate-100 text-slate-500"
                                      }`}>
                                        {displayRes}
                                      </span>
                                    </td>
                                  );
                                }

                                if (col.type === "v1_result" || col.type === "v2_result") {
                                  const displayRes = val || "Chờ đánh giá";
                                  return (
                                    <td key={col.key} className="px-3 py-2 border border-slate-100 text-center">
                                      <select
                                        value={displayRes}
                                        onChange={(e) => handleDropdownChange(candidate.id, col.type!, e.target.value)}
                                        disabled={!canManage}
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border-none outline-none ${
                                          displayRes === "ĐẠT"
                                            ? "bg-emerald-100 text-emerald-700"
                                            : displayRes === "LOẠI"
                                            ? "bg-[#FEF3C7] text-[#92400E]"
                                            : displayRes === "TC PV"
                                            ? "bg-rose-600 text-white font-bold"
                                            : "bg-slate-100 text-slate-600"
                                        } ${canManage ? "cursor-pointer" : "cursor-default opacity-85"}`}
                                      >
                                        <option value="Chờ đánh giá">Chờ đánh giá</option>
                                        <option value="ĐẠT">ĐẠT</option>
                                        <option value="LOẠI">LOẠI</option>
                                        <option value="TC PV">TC PV</option>
                                      </select>
                                    </td>
                                  );
                                }

                                if (col.type === "probation_result") {
                                  const displayRes = val || "Chờ nhận việc";
                                  return (
                                    <td key={col.key} className="px-3 py-2 border border-slate-100 text-center">
                                      <select
                                        value={displayRes}
                                        onChange={(e) => handleDropdownChange(candidate.id, "probation_result", e.target.value)}
                                        disabled={!canManage}
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border-none outline-none ${
                                          displayRes === "NHẬN" || displayRes === "ĐẠT"
                                            ? "bg-emerald-100 text-emerald-700"
                                            : displayRes === "TC"
                                            ? "bg-rose-600 text-white font-bold"
                                            : "bg-slate-100 text-slate-600"
                                        } ${canManage ? "cursor-pointer" : "cursor-default opacity-85"}`}
                                      >
                                        <option value="Chờ nhận việc">Chờ nhận việc</option>
                                        <option value="NHẬN">NHẬN</option>
                                        <option value="TC">TC</option>
                                      </select>
                                    </td>
                                  );
                                }

                                if (col.type === "department") {
                                  const displayDept = val || "Chưa xếp phòng";
                                  const optionsList = [...DEPT_OPTIONS];
                                  if (val && val !== "Chưa xếp phòng" && !optionsList.includes(val)) {
                                    optionsList.push(val);
                                  }
                                  return (
                                    <td key={col.key} className="px-1.5 py-1 border border-slate-100 text-center select-container-dept max-w-[180px]">
                                      <select
                                        value={displayDept}
                                        onChange={(e) => handleUpdateCandidateField(candidate.id, "department", e.target.value)}
                                        disabled={!canManage}
                                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-slate-200 outline-none w-full bg-white text-slate-700 max-h-[30px] line-clamp-1 truncate ${canManage ? "cursor-pointer" : "cursor-default opacity-85"}`}
                                      >
                                        <option value="Chưa xếp phòng">Chưa xếp phòng</option>
                                        {optionsList.map((d) => (
                                          <option key={d} value={d}>{d}</option>
                                        ))}
                                      </select>
                                    </td>
                                  );
                                }

                                let cellValue = val || "";
                                if (col.key === "v1_date" && !val && candidate.created_at) {
                                  const d = new Date(candidate.created_at);
                                  const year = d.getFullYear();
                                  const month = String(d.getMonth() + 1).padStart(2, '0');
                                  const day = String(d.getDate()).padStart(2, '0');
                                  cellValue = `${year}-${month}-${day}`;
                                }

                                const isInterviewDate = col.key === "v1_interview_date" || col.key === "v2_interview_date";
                                const isWarning = isInterviewDate && isOneDayBefore(cellValue);
                                const isDanger = isInterviewDate && isToday(cellValue);

                                return (
                                  <td key={col.key} className={`p-0 border border-slate-100 ${
                                    isDanger ? "bg-[#FEE2E2] border-[#FCA5A5]" : 
                                    isWarning ? "bg-[#FFEDD5] border-[#FED7AA]" : ""
                                  }`}>
                                    <EditableCell
                                      value={cellValue}
                                      onSave={(newVal) => handleUpdateCandidateField(candidate.id, col.key, newVal)}
                                      readOnly={!canManage}
                                      type={col.type === "date" ? "date" : "text"}
                                      className={
                                        isDanger ? "bg-[#FEE2E2] text-[#B91C1C] font-semibold focus:bg-white" :
                                        isWarning ? "bg-[#FFEDD5] text-[#C2410C] font-semibold focus:bg-white" : ""
                                      }
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AI SCORER PANEL */}
          {activeTab === "scorer" && (
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Config Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* JD Input */}
                <div className="lg:col-span-2 glass rounded-2xl p-6 space-y-3">
                  <label className="font-heading font-semibold text-[#005BAC] flex items-center gap-2 text-xs uppercase tracking-wider">
                    <FileText size={16} /> Mô tả công việc (JD)
                  </label>
                  <textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    rows={12}
                    placeholder="Dán nội dung Job Description vào đây…&#10;Ví dụ: Vị trí Trợ lý Giám đốc, tốt nghiệp Cao đẳng/Đại học chuyên ngành Xây dựng cầu đường, kinh nghiệm 2 năm..."
                    className="w-full resize-none text-xs bg-white/50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400/20 text-slate-700 placeholder:text-slate-400 shadow-sm"
                  />
                </div>

                {/* Settings */}
                <div className="glass rounded-2xl p-6 space-y-4 flex flex-col justify-between border border-slate-200/40">
                  <div className="space-y-4">
                    <p className="font-heading font-bold text-[#005BAC] text-xs uppercase tracking-wider">⚙️ Cấu hình tuyển dụng</p>
                    
                    {/* Candidate Source */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nguồn ứng viên</label>
                      <select
                        value={nguon}
                        onChange={(e) => setNguon(e.target.value)}
                        className="w-full text-xs text-slate-600 font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        {NGUON_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="pt-6 space-y-2">
                    <button
                      id="btn-start-scoring"
                      onClick={startScoring}
                      disabled={processing || files.length === 0 || !jdText.trim() || !canManage}
                      className="w-full flex items-center justify-center gap-2 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-md shadow-blue-600/10 text-xs"
                    >
                      {processing ? <Loader2 size={16} className="animate-spin" /> : "🚀"}
                      {processing ? `Đang phân tích ${progress.done}/${progress.total}...` : "Bắt đầu chấm điểm"}
                    </button>
                    {results.length > 0 && (
                      <>
                        {canManage && (
                          <button
                            onClick={saveAllToDb}
                            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95 shadow"
                          >
                            <Database size={14} /> Lưu tất cả vào Database (Supabase)
                          </button>
                        )}
                        <button
                          onClick={submitAll}
                          className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold py-2 rounded-xl transition-all active:scale-95 shadow-sm"
                        >
                          <Send size={14} /> Ghi tất cả vào Google Sheets
                        </button>
                        <button
                          onClick={reset}
                          className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 text-xs font-semibold py-2 rounded-xl transition-colors"
                        >
                          <RotateCcw size={13} /> Làm lại
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Upload Zone */}
              {results.length === 0 && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`glass rounded-2xl border-2 border-dashed transition-all cursor-pointer p-10 text-center ${isDragging ? "border-[#005BAC] bg-blue-50/50 scale-[1.01]" : "border-slate-200 hover:border-[#005BAC]/50 hover:bg-blue-50/10"}`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED}
                    className="hidden"
                    onChange={(e) => addFiles(Array.from(e.target.files || []))}
                  />
                  <Upload size={32} className="mx-auto text-[#005BAC]/50 mb-3" />
                  <p className="font-heading font-bold text-[#005BAC] text-sm">Kéo thả hoặc click để tải lên CV</p>
                  <p className="text-slate-400 text-xs mt-1">Hỗ trợ các định dạng: PDF, DOCX, DOC, PNG, JPG, TXT · Nhiều tệp tin cùng lúc</p>
                </div>
              )}

              {/* File List */}
              {files.length > 0 && results.length === 0 && (
                <div className="glass rounded-2xl p-5 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-heading font-bold text-[#005BAC] text-xs uppercase tracking-wider">{files.length} tệp đã chọn</p>
                    <button onClick={() => setFiles([])} className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors">Xóa tất cả</button>
                  </div>
                  {files.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 text-xs border border-slate-100 shadow-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText size={14} className="text-[#005BAC] shrink-0" />
                        <span className="text-slate-700 truncate font-medium">{item.file.name}</span>
                        <span className="text-slate-400 text-[10px] shrink-0 font-medium">({(item.file.size / 1024).toFixed(0)} KB)</span>
                      </div>
                      <button onClick={() => removeFile(item.id)} className="p-1 hover:text-rose-500 text-slate-400 transition-colors shrink-0"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Progress */}
              {processing && (
                <div className="glass rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3 text-xs font-bold text-[#005BAC]">
                    <span>Đang tiến hành chấm điểm bằng AI...</span>
                    <span>{progress.done}/{progress.total}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#005BAC] rounded-full transition-all duration-500" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}

              {/* Results List */}
              {results.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-heading font-bold text-[#005BAC] text-sm uppercase tracking-wider">
                      Kết quả đánh giá – {results.length} ứng viên
                      {" "}· <span className="text-emerald-600">{passCount} PASS</span>
                      {" "}· <span className="text-rose-500">{results.length - passCount} FAIL</span>
                    </h2>
                    <button onClick={() => { setResults([]); }} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 font-semibold">
                      <RotateCcw size={12} /> Chấm lại
                    </button>
                  </div>
                  {results.map((r) => (
                    <ResultCard key={r.file_name} result={r} onSubmit={submitToSheets} onSaveDb={saveToSupabase} />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {results.length === 0 && files.length === 0 && !processing && (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <CheckCircle size={40} className="mx-auto text-slate-200" />
                  <p className="text-xs font-semibold italic">Tải lên tệp CV của ứng viên và dán JD công việc ở trên để bắt đầu chấm điểm tự động.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SYSTEM SETTINGS PANEL */}
          {activeTab === "settings" && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Toast Alert */}
              {saved && (
                <div className="fixed bottom-6 right-6 z-50 animate-bounce">
                  <div className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 font-semibold text-sm">
                     <CheckCircle className="w-5 h-5 text-emerald-200" />
                    Cập nhật cấu hình thành công!
                  </div>
                </div>
              )}

              {/* Setup Configuration Form */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
                  <Key size={18} className="text-[#005BAC]" /> Cấu hình bảo mật & Kết nối
                </h2>

                <form onSubmit={handleSaveSettings} className="space-y-5 text-xs text-slate-600 font-semibold">
                  {/* API Key */}
                  <div className="space-y-1">
                    <label className="text-slate-500">OpenAI API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-proj-..."
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-medium text-slate-700"
                    />
                    <p className="text-[10px] text-slate-400 font-normal mt-1">Khoá bảo mật API dùng để thực hiện chấm điểm và trích xuất dữ liệu CV bằng AI.</p>
                  </div>

                  {/* Google Apps Script Webhook URL */}
                  <div className="space-y-1">
                    <label className="text-slate-500">Google Apps Script Webhook URL</label>
                    <input
                      type="text"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-medium text-slate-700"
                    />
                    <p className="text-[10px] text-slate-400 font-normal mt-1">Đường dẫn Webhook Google Apps Script dùng để đồng bộ dữ liệu ứng viên từ Dashboard sang Google Sheets.</p>
                  </div>

                  {/* ChatGPT Model */}
                  <div className="space-y-1">
                    <label className="text-slate-500">ChatGPT Model</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer text-xs font-semibold text-slate-600 bg-white"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (Nhanh & Tối ưu chi phí)</option>
                      <option value="gpt-4o">gpt-4o (Độ chính xác cao hơn)</option>
                    </select>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all shadow"
                    >
                      Lưu cấu hình hệ thống
                    </button>
                  </div>
                </form>
              </div>

              {/* System Info */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-4">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Info size={18} className="text-[#005BAC]" /> Thông tin nền tảng
                </h2>
                <div className="text-xs font-semibold text-slate-600">
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5 w-fit min-w-[200px]">
                    <p className="text-slate-400 text-[10px]">Phiên bản</p>
                    <p className="text-[#005BAC] font-bold">HR Platform 1.0</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Manual Candidate Add Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in-50 zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-heading font-bold text-sm text-slate-800">Thêm ứng viên mới</h3>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateCandidate} className="space-y-4 font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="text-slate-500">Tên ứng viên</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Văn A..."
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Vị trí ứng tuyển</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Kỹ sư xây dựng..."
                  value={addPosition}
                  onChange={(e) => setAddPosition(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Email</label>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Số điện thoại</label>
                  <input
                    type="text"
                    placeholder="SĐT ứng viên..."
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Nguồn ứng viên</label>
                <select
                  value={addSource}
                  onChange={(e) => setAddSource(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                >
                  {NGUON_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl"
                >
                  Thêm mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Weekly Report Modal */}
      {isReportOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl p-6 shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] animate-in fade-in-50 zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <h3 className="font-heading font-black text-sm text-slate-800 flex items-center gap-2">
                <FileText size={16} className="text-[#005BAC]" />
                Báo cáo tuyển dụng tuần (Bản nháp xem trước)
              </h3>
              <button onClick={() => setIsReportOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            {/* Date Inputs */}
            <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-100 shrink-0 bg-slate-50/50 p-4 rounded-xl my-2">
              <div className="space-y-1">
                <label className="font-bold text-slate-600">Từ ngày (Start Date)</label>
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-slate-700"
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-600">Đến ngày (End Date)</label>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-slate-700"
                />
              </div>
            </div>

            {/* Preview Table */}
            <div className="flex-1 overflow-y-auto my-4 border border-slate-100 rounded-xl">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-700 select-none">
                    <th className="p-3 border-r border-slate-100">Dự án / Phòng ban</th>
                    <th className="p-3 border-r border-slate-100">Vị trí tuyển dụng</th>
                    <th className="p-3 border-r border-slate-100 text-center w-24">Nhu cầu</th>
                    <th className="p-3 border-r border-slate-100 text-center w-24">Đã tuyển</th>
                    <th className="p-3 border-r border-slate-100 text-center w-24">Đang tuyển</th>
                    <th className="p-3 border-r border-slate-100 text-center w-28">Tiến độ</th>
                    <th className="p-3">Ứng viên đã nhận việc (Ghi chú)</th>
                  </tr>
                </thead>
                <tbody>
                  {reportPreviewData.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${
                        row.isHeader ? "bg-blue-50/20 font-black text-[#005BAC]" : ""
                      }`}
                    >
                      <td className="p-3 border-r border-slate-100 font-semibold">
                        {idx > 0 && reportPreviewData[idx - 1].dept === row.dept && !reportPreviewData[idx - 1].isHeader
                          ? ""
                          : row.dept}
                      </td>
                      <td className="p-3 border-r border-slate-100">{row.role}</td>
                      <td className="p-3 border-r border-slate-100 text-center font-bold">
                        {row.isHeader ? "" : row.demand}
                      </td>
                      <td className="p-3 border-r border-slate-100 text-center font-bold text-emerald-600 bg-emerald-50/10">
                        {row.isHeader ? "" : (row.hired > 0 ? row.hired : "-")}
                      </td>
                      <td className="p-3 border-r border-slate-100 text-center font-bold text-orange-600">
                        {row.isHeader ? "" : (row.demand > 0 ? row.remaining : "-")}
                      </td>
                      <td className="p-3 border-r border-slate-100 text-center">
                        {row.isHeader ? "" : (
                          row.demand > 0 ? (
                            <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                              row.progress === "Hoàn thành" 
                                ? "bg-emerald-100 text-emerald-800" 
                                : "bg-orange-100 text-orange-800"
                            }`}>
                              {row.progress}
                            </span>
                          ) : ""
                        )}
                      </td>
                      <td className="p-3 text-slate-500 italic font-semibold">{row.isHeader ? "" : row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-100 shrink-0">
              <div className="text-slate-500 font-medium select-none">
                Tổng số ứng viên đã tuyển trong kỳ: <span className="font-bold text-emerald-600">{totalReportHired}</span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsReportOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={exportingReport}
                  onClick={handleExportReport}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#005BAC] hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
                >
                  {exportingReport ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang xuất báo cáo...
                    </>
                  ) : (
                    <>
                      <FileDown className="w-4 h-4" />
                      Tải báo cáo (.docx)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
