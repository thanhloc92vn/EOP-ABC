"use client";

// ============================================================
// GpsCheckinList — "DANH SÁCH NHÂN VIÊN CHẤM CÔNG GPS" (khối Ban Điều hành).
//
// Cặp đôi với bảng "nhận diện từ Excel" (khối Văn phòng) — cùng đầu mối cho HCNS.
//   • "Tổng hợp ngày công" (GĐ2): quy đổi lượt chấm -> Tổng công / Trễ / Sớm /
//     Tăng ca theo CA CHUẨN của từng BĐH (project_locations.shift_in/out).
//   • "Chi tiết lượt chấm": bản ghi thô theo ngày (vào/ra/khoảng cách/ảnh).
//   • Gửi email báo cáo (GĐ3): DÙNG CHUNG cấu hình SMTP + API /send-attendance-email
//     với bảng Văn phòng — gửi từng người hoặc gửi tất cả ngay tại card này.
//
// Chỉ lượt HỢP LỆ mới tính công. Người BĐH đã đăng nhập nên user_email là email
// thật -> gửi báo cáo về đó. Ảnh nằm bucket private -> signed URL khi bấm xem.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/apiClient";
import { MapPin, RefreshCw, Loader2, CheckCircle2, XCircle, Image as ImageIcon, Search, Download, LayoutList, Table2, Mail, AlertCircle } from "lucide-react";

type SmtpConfig = { user: string; pass: string; provider: string; host: string; port: number; secure: boolean };

type Row = {
  id: string;
  user_email: string;
  employee_name: string | null;
  bdh_name: string;
  kind: "in" | "out";
  captured_at: string;
  distance_m: number | null;
  radius_m: number | null;
  is_valid: boolean;
  photo_path: string | null;
};

type Shift = { in: string; out: string };
type EmailStatus = "idle" | "sending" | "success" | "error";

// ─── Thời gian theo giờ Việt Nam (dữ liệu lưu UTC) ───
const VN = "Asia/Ho_Chi_Minh";
const vnDayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: VN, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const vnHHMM = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: VN, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const fmtT = (iso?: string) => (iso ? vnHHMM(iso) : "—");
const fmtDayVN = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: VN, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const weekdayVN = (dayKey: string) => new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: VN }).format(new Date(`${dayKey}T12:00:00+07:00`));
const ddmmyyyy = (dayKey: string) => { const [y, m, d] = dayKey.split("-"); return `${d}/${m}/${y}`; };

// Dòng chi tiết theo ngày dùng cho email (khớp payload /api/send-attendance-email).
type Detail = { date: string; dayOfWeek: string; checkin: string; checkout: string; hours: number; late: number; early: number; status: string };
type DayGroup = { key: string; name: string; bdh: string; dateIso: string; in?: Row; out?: Row };
type Summary = {
  email: string; name: string; bdh: string; employeeCode: string;
  totalDays: number; totalLate: number; totalEarly: number; totalOvertime: number; validSessions: number;
  details: Detail[];
};

export default function GpsCheckinList({ smtpConfig, onNeedSmtp }: { smtpConfig: SmtpConfig; onNeedSmtp: () => void }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // yyyy-mm
  const [rows, setRows] = useState<Row[]>([]);
  const [shiftMap, setShiftMap] = useState<Record<string, Shift>>({});
  const [codeByEmail, setCodeByEmail] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"summary" | "detail">("summary");
  const [mailStatus, setMailStatus] = useState<Record<string, EmailStatus>>({});
  const [mailError, setMailError] = useState<Record<string, string>>({});
  const [sendingAll, setSendingAll] = useState(false);

  const monthLabel = useMemo(() => { const [y, m] = month.split("-"); return `${m}/${y}`; }, [month]); // MM/YYYY

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date(`${month}-01T00:00:00`);
      const end = new Date(start); end.setMonth(end.getMonth() + 1);
      const [ck, pl, dir] = await Promise.all([
        supabase
          .from("gps_checkins")
          .select("id, user_email, employee_name, bdh_name, kind, captured_at, distance_m, radius_m, is_valid, photo_path")
          .gte("captured_at", start.toISOString())
          .lt("captured_at", end.toISOString())
          .order("captured_at", { ascending: false }),
        supabase.from("project_locations").select("bdh_name, shift_in, shift_out"),
        supabase.from("employees_directory").select("email, employee_code"),
      ]);
      setRows((ck.data || []) as Row[]);
      const sm: Record<string, Shift> = {};
      (pl.data || []).forEach((p: any) => { sm[p.bdh_name] = { in: p.shift_in || "08:00", out: p.shift_out || "17:00" }; });
      setShiftMap(sm);
      // Bản đồ email(đăng nhập) -> mã NV để đính vào báo cáo (email có thể chứa nhiều địa chỉ).
      const cbe: Record<string, string> = {};
      (dir.data || []).forEach((e: any) => {
        String(e.email || "").split(/[,;]/).forEach(tok => { const k = tok.trim().toLowerCase(); if (k && e.employee_code) cbe[k] = e.employee_code; });
      });
      setCodeByEmail(cbe);
      setMailStatus({});
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const shiftOf = useCallback((bdh: string): Shift => shiftMap[bdh] || { in: "08:00", out: "17:00" }, [shiftMap]);

  // ── Chi tiết ──
  const groups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>();
    for (const r of rows) {
      const k = `${r.user_email}|${vnDayKey(r.captured_at)}`;
      let g = map.get(k);
      if (!g) { g = { key: k, name: r.employee_name || r.user_email, bdh: r.bdh_name, dateIso: r.captured_at }; map.set(k, g); }
      if (r.kind === "in" && (!g.in || (r.is_valid && !g.in.is_valid))) g.in = r;
      if (r.kind === "out" && (!g.out || (r.is_valid && !g.out.is_valid))) g.out = r;
    }
    const needle = q.trim().toLowerCase();
    return [...map.values()]
      .filter(g => !needle || g.name.toLowerCase().includes(needle) || g.bdh.toLowerCase().includes(needle))
      .sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1));
  }, [rows, q]);

  // ── Tổng hợp (GĐ2) — chỉ lượt HỢP LỆ tính công; kèm details cho email (GĐ3) ──
  const summaries = useMemo<Summary[]>(() => {
    const byEmp = new Map<string, { name: string; bdh: string; days: Map<string, { in?: Row; out?: Row }> }>();
    for (const r of rows) {
      if (!r.is_valid) continue;
      let e = byEmp.get(r.user_email);
      if (!e) { e = { name: r.employee_name || r.user_email, bdh: r.bdh_name, days: new Map() }; byEmp.set(r.user_email, e); }
      const dk = vnDayKey(r.captured_at);
      const d = e.days.get(dk) || {}; d[r.kind] = r; e.days.set(dk, d);
    }

    const out: Summary[] = [];
    for (const [email, e] of byEmp) {
      const sh = shiftOf(e.bdh);
      const shIn = toMin(sh.in), shOut = toMin(sh.out);
      let totalDays = 0, late = 0, early = 0, ot = 0, sessions = 0;
      const details: Detail[] = [];
      for (const dk of [...e.days.keys()].sort()) {
        const d = e.days.get(dk)!;
        const hasIn = !!d.in, hasOut = !!d.out;
        sessions += (hasIn ? 1 : 0) + (hasOut ? 1 : 0);
        totalDays += hasIn && hasOut ? 1 : (hasIn || hasOut ? 0.5 : 0);
        const inMin = hasIn ? toMin(vnHHMM(d.in!.captured_at)) : null;
        const outMin = hasOut ? toMin(vnHHMM(d.out!.captured_at)) : null;
        const dLate = inMin !== null && inMin > shIn ? inMin - shIn : 0;
        const dEarly = outMin !== null && outMin < shOut ? shOut - outMin : 0;
        const dOt = outMin !== null && outMin > shOut ? (outMin - shOut) / 60 : 0;
        late += dLate; early += dEarly; ot += dOt;
        details.push({
          date: ddmmyyyy(dk), dayOfWeek: weekdayVN(dk),
          checkin: hasIn ? vnHHMM(d.in!.captured_at) : "",
          checkout: hasOut ? vnHHMM(d.out!.captured_at) : "",
          hours: inMin !== null && outMin !== null ? Math.round(((outMin - inMin) / 60) * 10) / 10 : 0,
          late: dLate, early: dEarly,
          status: hasIn && hasOut ? "Hợp lệ (GPS)" : "Thiếu buổi",
        });
      }
      out.push({
        email, name: e.name, bdh: e.bdh, employeeCode: codeByEmail[email.toLowerCase()] || "",
        totalDays, totalLate: late, totalEarly: early, totalOvertime: Math.round(ot * 100) / 100, validSessions: sessions, details,
      });
    }
    const needle = q.trim().toLowerCase();
    return out
      .filter(s => !needle || s.name.toLowerCase().includes(needle) || s.bdh.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [rows, q, shiftOf, codeByEmail]);

  const stats = useMemo(() => {
    const people = new Set(rows.map(r => r.user_email)).size;
    const valid = rows.filter(r => r.is_valid).length;
    return { people, valid, invalid: rows.length - valid };
  }, [rows]);

  async function viewPhoto(path: string | null) {
    if (!path) return;
    const { data, error } = await supabase.storage.from("gps-checkins").createSignedUrl(path, 120);
    if (error || !data?.signedUrl) { alert("Không mở được ảnh minh chứng."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  // ── GĐ3: gửi email báo cáo (dùng chung SMTP + API với Văn phòng) ──
  async function sendOne(s: Summary): Promise<boolean> {
    if (!smtpConfig.user || !smtpConfig.pass) { onNeedSmtp(); return false; }
    setMailStatus(p => ({ ...p, [s.email]: "sending" }));
    setMailError(p => ({ ...p, [s.email]: "" }));
    try {
      const res = await apiFetch("/api/send-attendance-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpConfig,
          recipient: { email: s.email, name: s.name, employeeCode: s.employeeCode || "—" },
          summary: { totalDays: s.totalDays, totalLate: s.totalLate, totalEarly: s.totalEarly, totalOvertime: s.totalOvertime },
          details: s.details,
          month: monthLabel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMailStatus(p => ({ ...p, [s.email]: "success" }));
      return true;
    } catch (e: any) {
      const msg = e?.message || "Gửi thất bại";
      console.error("[GPS email]", s.email, msg);
      setMailStatus(p => ({ ...p, [s.email]: "error" }));
      setMailError(p => ({ ...p, [s.email]: msg }));
      return false;
    }
  }

  async function sendAll() {
    if (!smtpConfig.user || !smtpConfig.pass) { onNeedSmtp(); return; }
    const ready = summaries.filter(s => mailStatus[s.email] !== "success");
    if (ready.length === 0) return;
    setSendingAll(true);
    for (const s of ready) await sendOne(s);
    setSendingAll(false);
  }

  // Xuất CSV (BOM UTF-8) — đầu mối cho HCNS tổng hợp.
  function exportCsv() {
    const header = ["Họ và tên", "Ban điều hành", "Tổng công (ngày)", "Trễ (phút)", "Sớm (phút)", "Tăng ca (giờ)", "Số buổi hợp lệ"];
    const lines = summaries.map(s => [s.name, s.bdh, s.totalDays, s.totalLate, s.totalEarly, s.totalOvertime, s.validSessions]);
    const csv = "﻿" + [header, ...lines].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `cham-cong-gps-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const pendingCount = summaries.filter(s => mailStatus[s.email] !== "success").length;

  return (
    <div className="glass bg-white rounded-2xl border border-slate-200/50 shadow-premium overflow-hidden">
      {/* Header */}
      <div className="p-5 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#059669 0%,#0ea5e9 60%,#2563eb 100%)" }}>
        <div className="absolute -right-5 -top-6 opacity-15 pointer-events-none select-none"><MapPin size={120} /></div>
        <div className="relative">
          <h3 className="font-heading font-black text-base leading-tight">Danh sách nhân viên chấm công GPS</h3>
          <p className="text-white/80 text-xs font-medium mt-0.5">Khối Ban Điều hành dự án — chấm công tại công trường bằng vị trí & ảnh</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Thanh công cụ */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex bg-slate-100 rounded-xl p-0.5 shrink-0">
            <button onClick={() => setView("summary")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === "summary" ? "bg-white text-[#005BAC] shadow-sm" : "text-slate-500"}`}>
              <Table2 size={13} /> Tổng hợp ngày công
            </button>
            <button onClick={() => setView("detail")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === "detail" ? "bg-white text-[#005BAC] shadow-sm" : "text-slate-500"}`}>
              <LayoutList size={13} /> Chi tiết lượt chấm
            </button>
          </div>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#005BAC] outline-none" />
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input placeholder="Tìm nhân viên / dự án…" value={q} onChange={e => setQ(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:border-[#005BAC] outline-none" />
          </div>
          {view === "summary" && summaries.length > 0 && (
            <>
              <button onClick={sendAll} disabled={sendingAll || pendingCount === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 disabled:opacity-40">
                {sendingAll ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Gửi tất cả ({pendingCount})
              </button>
              <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 font-bold rounded-xl text-xs active:scale-95">
                <Download size={12} /> Xuất CSV
              </button>
            </>
          )}
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs active:scale-95">
            <RefreshCw size={12} /> Làm mới
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Nhân sự chấm" value={stats.people} tone="blue" />
          <Stat label="Lượt hợp lệ" value={stats.valid} tone="green" />
          <Stat label="Lượt ngoài vùng" value={stats.invalid} tone="amber" />
        </div>

        {!smtpConfig.user && view === "summary" && summaries.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-[11px] font-semibold px-3 py-2 flex items-center gap-2">
            <AlertCircle size={13} /> Chưa cấu hình SMTP. Gửi email sẽ mở cấu hình — dùng chung cấu hình gửi email của bảng Văn phòng.
          </div>
        )}

        {loading ? (
          <div className="py-10 flex flex-col items-center text-slate-400"><Loader2 className="animate-spin text-[#005BAC]" size={26} /><p className="text-xs font-semibold mt-2">Đang tải…</p></div>
        ) : view === "summary" ? (
          summaries.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Họ và tên</th>
                    <th className="py-2.5 px-3">Ban điều hành</th>
                    <th className="py-2.5 px-3 text-center">Tổng công</th>
                    <th className="py-2.5 px-3 text-center">Trễ (phút)</th>
                    <th className="py-2.5 px-3 text-center">Sớm (phút)</th>
                    <th className="py-2.5 px-3 text-center">Tăng ca (giờ)</th>
                    <th className="py-2.5 px-3 text-center">Ca chuẩn</th>
                    <th className="py-2.5 px-3 text-center">Gửi báo cáo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {summaries.map(s => {
                    const sh = shiftOf(s.bdh);
                    const st = mailStatus[s.email] || "idle";
                    return (
                      <tr key={s.email} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800">{s.name}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{s.email}</div>
                        </td>
                        <td className="py-3 px-3">{s.bdh}</td>
                        <td className="py-3 px-3 text-center font-black text-slate-800">{s.totalDays} ngày</td>
                        <td className={`py-3 px-3 text-center font-bold ${s.totalLate ? "text-amber-600" : "text-slate-300"}`}>{s.totalLate || 0}</td>
                        <td className={`py-3 px-3 text-center font-bold ${s.totalEarly ? "text-orange-600" : "text-slate-300"}`}>{s.totalEarly || 0}</td>
                        <td className={`py-3 px-3 text-center font-bold ${s.totalOvertime ? "text-emerald-600" : "text-slate-300"}`}>{s.totalOvertime || 0}</td>
                        <td className="py-3 px-3 text-center text-[10px] font-mono text-slate-400">{sh.in}–{sh.out}</td>
                        <td className="py-3 px-3 text-center">
                          <button onClick={() => sendOne(s)} disabled={st === "sending"}
                            title={st === "error" ? mailError[s.email] : `Gửi báo cáo cho ${s.email}`}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold active:scale-95 transition-all ${
                              st === "success" ? "bg-emerald-100 text-emerald-700"
                              : st === "error" ? "bg-rose-100 text-rose-700"
                              : "bg-blue-50 text-[#005BAC] hover:bg-blue-100"}`}>
                            {st === "sending" ? <Loader2 size={11} className="animate-spin" />
                              : st === "success" ? <><CheckCircle2 size={11} /> Đã gửi</>
                              : st === "error" ? <><XCircle size={11} /> Lỗi, gửi lại</>
                              : <><Mail size={11} /> Gửi</>}
                          </button>
                          {st === "error" && mailError[s.email] && (
                            <div className="mt-1 text-[9px] text-rose-500 font-semibold max-w-[180px] mx-auto leading-tight break-words" title={mailError[s.email]}>
                              {mailError[s.email]}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                Tổng công tính theo lượt chấm <b>hợp lệ</b> (đủ vào+ra = 1 ngày, thiếu buổi = 0,5). Trễ/Sớm/Tăng ca so với <b>ca chuẩn</b> của từng BĐH. Email báo cáo gửi về địa chỉ đăng nhập của nhân sự, dùng chung mẫu & cấu hình SMTP với bảng Văn phòng.
              </p>
            </div>
          )
        ) : (
          groups.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Họ và tên</th>
                    <th className="py-2.5 px-3">Ban điều hành</th>
                    <th className="py-2.5 px-3">Ngày</th>
                    <th className="py-2.5 px-3 text-center">Vào</th>
                    <th className="py-2.5 px-3 text-center">Ra</th>
                    <th className="py-2.5 px-3 text-center">Khoảng cách</th>
                    <th className="py-2.5 px-3 text-center">Trạng thái</th>
                    <th className="py-2.5 px-3 text-center">Ảnh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {groups.map(g => {
                    const anyInvalid = (g.in && !g.in.is_valid) || (g.out && !g.out.is_valid);
                    const bothValid = g.in?.is_valid && g.out?.is_valid;
                    const maxDist = Math.max(g.in?.distance_m ?? 0, g.out?.distance_m ?? 0);
                    return (
                      <tr key={g.key} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-bold text-slate-800">{g.name}</td>
                        <td className="py-3 px-3">{g.bdh}</td>
                        <td className="py-3 px-3 font-semibold">{fmtDayVN(g.dateIso)}</td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-emerald-600">{fmtT(g.in?.captured_at)}</td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-[#005BAC]">{fmtT(g.out?.captured_at)}</td>
                        <td className="py-3 px-3 text-center">{maxDist ? `~${Math.round(maxDist)}m` : "—"}</td>
                        <td className="py-3 px-3 text-center">
                          {bothValid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800"><CheckCircle2 size={10} /> Hợp lệ</span>
                          ) : anyInvalid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-800"><XCircle size={10} /> Ngoài vùng</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800">Thiếu buổi</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {g.in?.photo_path && <button onClick={() => viewPhoto(g.in!.photo_path)} title="Ảnh chấm vào" className="p-1 text-slate-400 hover:text-emerald-600"><ImageIcon size={13} /></button>}
                            {g.out?.photo_path && <button onClick={() => viewPhoto(g.out!.photo_path)} title="Ảnh chấm ra" className="p-1 text-slate-400 hover:text-[#005BAC]"><ImageIcon size={13} /></button>}
                            {!g.in?.photo_path && !g.out?.photo_path && "—"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="text-slate-400 text-xs italic py-8 text-center bg-slate-50 rounded-2xl border border-slate-100">Chưa có nhân sự BĐH nào chấm công GPS trong tháng này.</div>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "blue" | "green" | "amber" }) {
  const c = { blue: "from-blue-500 to-indigo-500", green: "from-emerald-500 to-teal-500", amber: "from-amber-500 to-orange-500" }[tone];
  return (
    <div className={`rounded-2xl p-3 text-white bg-gradient-to-br ${c} shadow-sm`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/80">{label}</div>
      <div className="text-2xl font-black mt-0.5">{value}</div>
    </div>
  );
}
