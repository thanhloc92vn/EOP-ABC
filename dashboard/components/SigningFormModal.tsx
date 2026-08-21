"use client";

// ============================================================
// SigningFormModal — lập / sửa PHIẾU TRÌNH KÝ HỒ SƠ/VĂN BẢN.
//
// Ba việc trong một màn hình:
//   1. Tải bộ hồ sơ lên kho riêng (bucket signing-dossiers, migration 051)
//   2. Bấm bóc tách -> api/analyze-signing-dossier đọc cả bộ, trả 13 trường
//   3. Người lập SOÁT LẠI rồi mới lưu — AI điền hộ, người chịu trách nhiệm ký
//
// VÌ SAO LUÔN CHO SỬA TAY MỌI Ô AI ĐIỀN: đây là số liệu tiền trình Giám đốc ký.
// Prompt đã cấm model bịa, trường nào không chắc nó trả null và ghi vào "thiếu",
// nhưng người lập vẫn phải là chốt chặn cuối.
//
// ⚠ Modal dùng createPortal ra document.body — panel cha nằm trong khối `.glass`
// và backdrop-filter tạo containing block mới, phần tử `fixed` sẽ bị nhốt lại.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/apiClient";
import { useProjectCatalog } from "@/lib/projectCatalog";
import {
  tinhDeNghi, tinhLuyKe, fmtMoney, uploadDossierFile, resolveDossierUrl, errText,
  downloadSigningForm, docxFileName,
  type SigningSubmission, type SigningFile,
  LOAI_META, SO_SANH_MAU,
  type SigningLoai, type SoSanhRow,
} from "@/lib/signingSubmissions";
import {
  X, Upload, Sparkles, Loader2, Save, Send, Trash2, FileText, Plus,
  AlertTriangle, Download, Calculator, ExternalLink, Settings,
} from "lucide-react";

const inputCls =
  "border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-semibold text-slate-800 text-xs bg-white transition-all w-full";
const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";

// Bản nháp trong form: mọi ô là chuỗi để người dùng gõ thoải mái (kể cả rỗng),
// chỉ đổi sang số đúng lúc lưu. Giữ number ngay từ ô nhập thì xoá hết ký tự sẽ
// thành NaN và React nhảy về 0 giữa lúc đang gõ.
type Draft = Record<string, string>;

const NUM_FIELDS = [
  "gia_tri_hd", "gia_tri_nghiem_thu", "giu_bao_hanh", "giu_lai_tung_lan",
  "khau_tru_tam_ung", "luy_ke_da_thanh_toan", "tam_ung_con_lai", "de_nghi_thanh_toan",
] as const;
const RATE_FIELDS = ["ty_le_giu_lai", "ty_le_thu_hoi"] as const;

const toNum = (s: string): number | null => {
  const t = (s || "").replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const toRate = (s: string): number | null => {
  const t = (s || "").replace(/%/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const showNum = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? new Intl.NumberFormat("vi-VN").format(v) : "";

function toDraft(s: SigningSubmission | null): Draft {
  if (!s) return { don_vi: "P. Kế hoạch Đấu thầu" };
  const d: Draft = {};
  for (const k of ["don_vi", "ve_viec", "noi_dung_trinh", "chu_dau_tu", "du_an",
    "hop_dong_so", "ngay_ky_hop_dong", "goi_thau", "project_code",
    // migration 060 — chỉ dùng cho phiếu hợp đồng
    "hang_muc", "ben_a", "ben_b"] as const) {
    d[k] = (s[k] as string) || "";
  }
  d.vat_percent = s.vat_percent != null ? String(s.vat_percent) : "";
  d.dot_so = s.dot_so != null ? String(s.dot_so) : "";
  for (const k of NUM_FIELDS) d[k] = showNum(s[k]);
  for (const k of RATE_FIELDS) d[k] = s[k] != null ? String(s[k]) : "";
  return d;
}

export default function SigningFormModal({
  existing, loai: loaiMoi, currentEmail, currentName, onClose, onSaved,
}: {
  existing: SigningSubmission | null;
  /** Loại phiếu khi LẬP MỚI. Sửa phiếu cũ thì lấy theo phiếu, không đổi được. */
  loai?: SigningLoai;
  currentEmail: string;
  currentName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { projects } = useProjectCatalog();
  // Loại phiếu KHÔNG cho đổi sau khi đã tạo: đổi giữa chừng thì nửa số trường
  // đang có dữ liệu bỗng thành trường của loại kia, và luồng duyệt đã đi được
  // vài bước lại nhảy sang luồng khác.
  const loai: SigningLoai = existing ? existing.loai : (loaiMoi || "ho_so");
  const laHopDong = loai === "hop_dong";
  const meta = LOAI_META[loai];
  const [d, setD] = useState<Draft>(() => toDraft(existing));
  // Bảng so sánh A-B ↔ B-B′ — mảng riêng, không nhét vào Draft (Draft toàn chuỗi).
  const [soSanh, setSoSanh] = useState<SoSanhRow[]>(
    () => (existing?.so_sanh?.length ? existing.so_sanh : SO_SANH_MAU).map((r) => ({ ...r }))
  );
  // MỘT danh sách duy nhất. Trước đây tách làm hai — `files` để hiển thị/lưu và
  // `pending` để gửi cho AI — nhưng nút thùng rác chỉ xoá khỏi `files`, nên tệp
  // đã xoá VẪN được gửi lên OpenAI ở lần bóc kế tiếp. Hậu quả thật: xoá một PDF
  // scan 39 trang rồi chọn 3 ảnh, lượt bóc sau vẫn kèm cả PDF đó -> ~43k token
  // -> OpenAI trả 429 "request too large", không phân tích gì cả.
  // `raw` chỉ có với tệp vừa chọn trong phiên này; tệp của phiếu cũ đọc từ CSDL
  // không có File object nên không bóc lại được (phải chọn lại từ máy).
  type LocalFile = SigningFile & { raw?: File };
  const [files, setFiles] = useState<LocalFile[]>(existing?.files || []);
  const pending = useMemo(() => files.filter((f) => f.raw).map((f) => f.raw as File), [files]);
  const [aiThieu, setAiThieu] = useState<string[]>(existing?.ai_thieu || []);
  const [aiGhiChu, setAiGhiChu] = useState(existing?.ai_ghi_chu || "");

  const [busy, setBusy] = useState<"" | "ai" | "save" | "submit" | "export">("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Cấu hình AI ───
  // Dùng CHUNG localStorage với trang Hành chính ("..._hanh_chinh") thay vì đẻ
  // khoá riêng: người dùng đã nhập khoá ở đó thì sang đây chạy được ngay, không
  // phải nhập lại lần hai và không phải nhớ có hai chỗ cấu hình.
  // Mặc định gpt-4o chứ KHÔNG phải mini như trang Hành chính — hợp đồng xây dựng
  // dài, nhiều bảng số, mini đọc sai điều khoản.
  const [showCfg, setShowCfg] = useState(false);
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("gpt-4o");
  const [cfgSaved, setCfgSaved] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAiKey(
      localStorage.getItem("openai_api_key_hanh_chinh") ||
      localStorage.getItem("openai_api_key") || ""
    );
    setAiModel(localStorage.getItem("openai_model_hanh_chinh") || "gpt-4o");
  }, []);

  const saveCfg = () => {
    localStorage.setItem("openai_api_key_hanh_chinh", aiKey.trim());
    localStorage.setItem("openai_model_hanh_chinh", aiModel);
    setCfgSaved(true);
    setTimeout(() => setCfgSaved(false), 2000);
  };

  const set = (k: string, v: string) => setD((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  // ─── A-B-C-D tự tính, hiện ngay khi gõ ───
  const abcd = useMemo(
    () => tinhDeNghi({
      gia_tri_nghiem_thu: toNum(d.gia_tri_nghiem_thu || ""),
      giu_bao_hanh: toNum(d.giu_bao_hanh || ""),
      giu_lai_tung_lan: toNum(d.giu_lai_tung_lan || ""),
      khau_tru_tam_ung: toNum(d.khau_tru_tam_ung || ""),
    }),
    [d.gia_tri_nghiem_thu, d.giu_bao_hanh, d.giu_lai_tung_lan, d.khau_tru_tam_ung]
  );
  // Ô "đề nghị thanh toán" bỏ trống = dùng số tự tính. Điền tay = ghi đè.
  const deNghiCuoi = toNum(d.de_nghi_thanh_toan || "") ?? abcd;

  const buildPayload = useCallback(() => {
    const p: Record<string, unknown> = {
      don_vi: d.don_vi?.trim() || null,
      ve_viec: d.ve_viec?.trim() || null,
      noi_dung_trinh: d.noi_dung_trinh?.trim() || null,
      dot_so: d.dot_so ? Number(d.dot_so) : null,
      chu_dau_tu: d.chu_dau_tu?.trim() || null,
      du_an: d.du_an?.trim() || null,
      hop_dong_so: d.hop_dong_so?.trim() || null,
      ngay_ky_hop_dong: d.ngay_ky_hop_dong?.trim() || null,
      goi_thau: d.goi_thau?.trim() || null,
      project_code: d.project_code || null,
      project_name: projects.find((x) => x.code === d.project_code)?.name || null,
      de_nghi_thanh_toan: deNghiCuoi,
      ai_ghi_chu: aiGhiChu || null,
      ai_thieu: aiThieu,
      // Lột bỏ File gốc trước khi lưu: cột `files` là jsonb, nhét File object
      // vào thì JSON.stringify ra {} và mất sạch đường dẫn tệp.
      files: files.map((f) => ({ path: f.path, name: f.name, size: f.size })),
      loai,
      hang_muc: d.hang_muc?.trim() || null,
      ben_a: d.ben_a?.trim() || null,
      ben_b: d.ben_b?.trim() || null,
      vat_percent: toRate(d.vat_percent || ""),
      // Bỏ dòng trống trước khi lưu — người lập hay để lại vài dòng mẫu chưa điền.
      so_sanh: soSanh.filter((r) => [r.muc, r.ab, r.bb].some((v) => (v || "").trim() !== "")),
    };
    for (const k of NUM_FIELDS) if (k !== "de_nghi_thanh_toan") p[k] = toNum(d[k] || "");
    for (const k of RATE_FIELDS) p[k] = toRate(d[k] || "");
    return p;
  }, [d, projects, deNghiCuoi, aiGhiChu, aiThieu, files, loai, soSanh]);

  // ─── Tải tệp lên kho ───
  const doUpload = async (picked: File[]) => {
    setErr(""); setInfo("");
    const done: LocalFile[] = [];
    for (const f of picked) {
      try {
        // Giữ kèm File gốc để bóc tách khỏi phải tải ngược từ kho về.
        done.push({ ...(await uploadDossierFile(f)), raw: f });
      } catch (e) {
        setErr(errText(e));
      }
    }
    if (done.length) setFiles((p) => [...p, ...done]);
  };

  // ─── Bóc tách bằng AI ───
  // Gửi tệp NGUYÊN BẢN từ máy người dùng, không tải ngược từ kho về: tệp vừa
  // upload xong đang có sẵn trong bộ nhớ, tải lại chỉ tốn thêm một vòng mạng.
  const runAI = async () => {
    if (pending.length === 0) {
      setErr("Chọn file hồ sơ trước khi bóc tách.");
      return;
    }
    setBusy("ai"); setErr(""); setInfo("");
    try {
      const fd = new FormData();
      pending.forEach((f) => fd.append("files", f));

      const headers: Record<string, string> = {};
      // Lấy từ ô cấu hình ngay trên màn hình này (đã đồng bộ localStorage).
      // Không có khoá thì server dùng OPENAI_API_KEY của môi trường.
      if (aiKey.trim()) headers["Authorization"] = `Bearer ${aiKey.trim()}`;
      headers["x-openai-model"] = aiModel || "gpt-4o";

      const res = await apiFetch("/api/analyze-signing-dossier", {
        method: "POST", headers, body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Lỗi máy chủ (${res.status})`);

      const a = json.data || {};
      setD((p) => ({
        ...p,
        // Chỉ ghi đè ô đang TRỐNG — người lập đã sửa tay thì AI không được đạp lên.
        chu_dau_tu: p.chu_dau_tu || a.chuDauTu || "",
        du_an: p.du_an || a.duAn || "",
        hop_dong_so: p.hop_dong_so || a.hopDongSo || "",
        ngay_ky_hop_dong: p.ngay_ky_hop_dong || a.ngayKyHopDong || "",
        goi_thau: p.goi_thau || a.goiThau || "",
        dot_so: p.dot_so || (a.dotSo != null ? String(a.dotSo) : ""),
        gia_tri_hd: p.gia_tri_hd || showNum(a.giaTriHD),
        gia_tri_nghiem_thu: p.gia_tri_nghiem_thu || showNum(a.giaTriNghiemThu),
        giu_bao_hanh: p.giu_bao_hanh || showNum(a.giuBaoHanh),
        giu_lai_tung_lan: p.giu_lai_tung_lan || showNum(a.giuLaiTungLan),
        ty_le_giu_lai: p.ty_le_giu_lai || (a.tyLeGiuLai != null ? String(a.tyLeGiuLai) : ""),
        khau_tru_tam_ung: p.khau_tru_tam_ung || showNum(a.khauTruTamUng),
        ty_le_thu_hoi: p.ty_le_thu_hoi || (a.tyLeThuHoi != null ? String(a.tyLeThuHoi) : ""),
        luy_ke_da_thanh_toan: p.luy_ke_da_thanh_toan || showNum(a.luyKeDaThanhToan),
        tam_ung_con_lai: p.tam_ung_con_lai || showNum(a.tamUngConLai),
      }));
      setAiThieu(Array.isArray(a.thieu) ? a.thieu : []);
      // Tạm ứng theo HỢP ĐỒNG: cố ý KHÔNG tự điền vào ô "Tạm ứng còn lại chưa
      // thu hồi" — hai con số khác nhau (một là tổng tạm ứng ban đầu, một là số
      // dư sau khi đã thu hồi vài đợt). Chỉ nêu ra làm căn cứ để người lập tự
      // quyết; tự điền vào ô tiền là cách nhanh nhất để sai số trình Giám đốc.
      const tuHopDong =
        a.giaTriTamUng != null
          ? `Hợp đồng ghi tạm ứng ${Number(a.giaTriTamUng).toLocaleString("vi-VN")} đồng`
            + (a.tyLeTamUng != null ? ` (${a.tyLeTamUng}%)` : "")
            + ". Ô “Tạm ứng còn lại” là số DƯ sau khi đã thu hồi — tự điền theo bảng theo dõi."
          : "";
      setAiGhiChu([a.ghiChu || "", tuHopDong].filter(Boolean).join(" · "));

      // Nhật ký đọc tệp: nói rõ mỗi tệp được đọc bằng cách nào và ra bao nhiêu
      // chữ. Đây là thứ phân biệt "PDF là bản scan nên không rút được chữ" với
      // "đọc được nhưng model bỏ sót" — thiếu nó thì AI bóc hụt là một hộp đen.
      type DiagRow = { ten: string; cach: string; kyTu?: number; trang?: number };
      const nk: DiagRow[] = Array.isArray(json.nhatKy) ? json.nhatKy : [];
      const parts = [`Model ${json.model || "?"} · đã đọc ${nk.length || (json.daDoc || []).length} tệp.`];
      for (const r of nk) {
        const so = r.kyTu != null ? ` — ${r.kyTu.toLocaleString("vi-VN")} ký tự` : "";
        const tr = r.trang ? `, ${r.trang} trang` : "";
        parts.push(`• ${r.ten}: ${r.cach}${so}${tr}`);
      }
      if (json.boQua?.length) parts.push(`Bỏ qua: ${json.boQua.join("; ")}.`);
      parts.push("Soát lại toàn bộ số liệu trước khi trình.");
      setInfo(parts.join("\n"));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy("");
    }
  };

  // ─── Luỹ kế: hỏi CSDL, không cộng ở máy người dùng ───
  const autoLuyKe = async () => {
    const hd = d.hop_dong_so?.trim();
    const dot = Number(d.dot_so);
    if (!hd || !dot) {
      setErr("Cần có Số hợp đồng và Đợt số để tính luỹ kế.");
      return;
    }
    setErr("");
    const v = await tinhLuyKe(hd, dot, deNghiCuoi);
    if (v == null) {
      setErr("Không tính được luỹ kế (chưa chạy migration 050 hoặc tài khoản chưa có quyền).");
      return;
    }
    set("luy_ke_da_thanh_toan", showNum(v));
    setInfo(`Luỹ kế = tổng các đợt trước của HĐ ${hd} + đợt này (${fmtMoney(deNghiCuoi)}).`);
  };

  // ─── Lưu ───
  const save = async (submit: boolean) => {
    setBusy(submit ? "submit" : "save"); setErr("");
    try {
      const payload = buildPayload();
      if (submit && !payload.hop_dong_so) throw new Error("Phải có Số hợp đồng trước khi trình.");
      // "Đợt số" là khái niệm của phiếu thanh toán. Phiếu hợp đồng trình MỘT
      // hợp đồng, không có đợt nào cả.
      if (submit && !laHopDong && !payload.dot_so) throw new Error("Phải có Đợt số trước khi trình.");

      if (existing) {
        const { error } = await supabase
          .from("signing_submissions")
          .update({ ...payload, ...(submit ? { status: "cho_pho_giam_doc" } : {}) })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("signing_submissions").insert([{
          ...payload,
          status: submit ? "cho_pho_giam_doc" : "nhap",
          created_by: currentEmail,
          created_by_name: currentName || null,
        }]);
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (e) {
      const m = errText(e);
      setErr(
        /duplicate key|uq_signing_hopdong_dot/i.test(m)
          ? "Hợp đồng này đã có phiếu cho đợt đó rồi. Mở phiếu cũ ra sửa thay vì tạo mới."
          : m
      );
    } finally {
      setBusy("");
    }
  };

  // ─── Xuất Word ───
  const exportDocx = async () => {
    setBusy("export"); setErr("");
    try {
      // Xuất theo BẢN NHÁP đang gõ (chưa cần lưu), nên dựng payload từ `d` chứ
      // không dùng docxPayloadFromRow — hàm đó đọc phiếu đã lưu trong CSDL.
      if (laHopDong) {
        await downloadSigningForm(
          {
            loai: "hop_dong",
            duAn: d.du_an,
            goiThau: d.goi_thau,
            hangMuc: d.hang_muc,
            hopDongSo: d.hop_dong_so,
            benA: d.ben_a,
            benB: d.ben_b,
            giaTriHD: toNum(d.gia_tri_hd || ""),
            vatPercent: toRate(d.vat_percent || ""),
            soSanh,
            ykienQLDA: existing?.ykien_qlda || "",
            ykienKHDT: existing?.ykien_khdt || "",
            ykienGiamDoc: existing?.ykien_giam_doc || "",
            nguoiTrinh: existing?.created_by_name || currentName || "",
          },
          docxFileName({ ...(existing || {}), hop_dong_so: d.hop_dong_so, loai: "hop_dong" })
        );
        return;
      }

      await downloadSigningForm(
        {
          donVi: d.don_vi, veViec: d.ve_viec, noiDungTrinh: d.noi_dung_trinh,
          dotSo: d.dot_so, chuDauTu: d.chu_dau_tu, duAn: d.du_an,
          hopDongSo: [d.hop_dong_so, d.ngay_ky_hop_dong ? `ký ngày ${d.ngay_ky_hop_dong}` : ""]
            .filter(Boolean).join(" "),
          goiThau: d.goi_thau,
          giaTriHD: toNum(d.gia_tri_hd || ""),
          giaTriNghiemThu: toNum(d.gia_tri_nghiem_thu || ""),
          giuBaoHanh: toNum(d.giu_bao_hanh || ""),
          giuLaiTungLan: toNum(d.giu_lai_tung_lan || ""),
          tyLeGiuLai: toRate(d.ty_le_giu_lai || ""),
          khauTruTamUng: toNum(d.khau_tru_tam_ung || ""),
          tyLeThuHoi: toRate(d.ty_le_thu_hoi || ""),
          deNghiThanhToan: deNghiCuoi,
          luyKeDaThanhToan: toNum(d.luy_ke_da_thanh_toan || ""),
          tamUngConLai: toNum(d.tam_ung_con_lai || ""),
          ykienQLDA: existing?.ykien_qlda || "",
          ykienKHDT: existing?.ykien_khdt || "",
          ykienGiamDoc: existing?.ykien_giam_doc || "",
        },
        docxFileName({ hop_dong_so: d.hop_dong_so, dot_so: d.dot_so ? Number(d.dot_so) : null })
      );
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy("");
    }
  };

  const openFile = async (f: SigningFile) => {
    const url = await resolveDossierUrl(f.path);
    if (url) window.open(url, "_blank", "noopener");
    else setErr(`Không mở được "${f.name}" — tệp đã bị xoá hoặc tài khoản hết quyền.`);
  };

  const num = (k: string, label: string, hint?: string) => (
    <label className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <input
        value={d[k] || ""}
        onChange={(e) => set(k, e.target.value)}
        placeholder={hint}
        inputMode="numeric"
        className={`${inputCls} font-mono text-right`}
      />
    </label>
  );

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[5vh] p-4">
      <div
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[88vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200/60 bg-slate-50/70 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-sm shrink-0">
            <FileText size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-heading font-extrabold text-slate-800 text-xs leading-tight truncate">
              {existing ? `Sửa phiếu ${existing.ma_phieu || ""}` : `Lập ${meta.label.toLowerCase()}`}
            </h4>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all cursor-pointer disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {err && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold text-rose-700 flex-1">{err}</p>
              <button type="button" onClick={() => setErr("")}
                className="p-0.5 text-rose-400 hover:text-rose-600 cursor-pointer"><X size={13} /></button>
            </div>
          )}
          {info && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <Sparkles size={15} className="text-blue-500 shrink-0 mt-0.5" />
              {/* whitespace-pre-line: nhật ký đọc tệp xuống dòng từng tệp một */}
              <p className="text-[11px] font-semibold text-blue-800 flex-1 whitespace-pre-line leading-relaxed">{info}</p>
              <button type="button" onClick={() => setInfo("")}
                className="p-0.5 text-blue-400 hover:text-blue-600 cursor-pointer"><X size={13} /></button>
            </div>
          )}

          {/* ─── 1. Hồ sơ + AI ─── */}
          <section className="space-y-3">
            <h5 className={labelCls}>1. Hồ sơ gốc</h5>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef} type="file" multiple hidden
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    doUpload(picked);
                    e.target.value = "";
                  }}
                />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 text-slate-600 font-bold rounded-xl text-[11px] transition-all cursor-pointer disabled:opacity-50">
                  <Upload size={13} /> Chọn file
                </button>
                <button type="button" onClick={runAI} disabled={!!busy || pending.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:opacity-90 disabled:opacity-40 text-white font-bold rounded-xl text-[11px] transition-all cursor-pointer">
                  {busy === "ai" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {busy === "ai"
                    ? "Đang đọc hồ sơ…"
                    : `Bóc tách ${pending.length || ""} tệp`.replace("  ", " ")}
                </button>
                <span className="text-[10px] font-semibold text-slate-400">
                  PDF · ảnh · Word · Excel — tối đa 8 tệp / 25MB
                </span>
                <button
                  type="button"
                  onClick={() => setShowCfg((v) => !v)}
                  title="Cấu hình model và API key"
                  className={`ml-auto flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                    showCfg
                      ? "bg-slate-100 border-slate-300 text-slate-700"
                      : "bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600"
                  }`}
                >
                  <Settings size={13} />
                  {aiModel}
                  {!aiKey.trim() && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Chưa nhập API key riêng" />
                  )}
                </button>
              </div>

              {showCfg && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2.5">
                    <label className="flex flex-col gap-1.5">
                      <span className={labelCls}>Model</span>
                      <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}
                        className={`${inputCls} cursor-pointer`}>
                        <option value="gpt-4o">gpt-4o (chính xác — nên dùng cho hợp đồng)</option>
                        <option value="gpt-4o-mini">gpt-4o-mini (rẻ, nhanh — dễ đọc sót điều khoản)</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className={labelCls}>OpenAI API key</span>
                      <input type="password" value={aiKey} onChange={(e) => setAiKey(e.target.value)}
                        placeholder="sk-… (để trống sẽ dùng khoá cấu hình sẵn trên máy chủ)"
                        className={`${inputCls} font-mono`} autoComplete="off" />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={saveCfg}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[11px] transition-all cursor-pointer">
                      Lưu cấu hình
                    </button>
                    {cfgSaved && (
                      <span className="text-[11px] font-bold text-emerald-600">Đã lưu.</span>
                    )}
                  </div>
                </div>
              )}

              {files.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">Chưa có tệp nào.</p>
              ) : (
                <div className="space-y-1.5">
                  {files.map((f, i) => (
                    <div key={f.path} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                      <FileText size={12} className="text-slate-400 shrink-0" />
                      <button type="button" onClick={() => openFile(f)}
                        className="flex-1 min-w-0 text-left text-[11px] font-semibold text-slate-700 hover:text-blue-600 truncate cursor-pointer">
                        {f.name}
                      </button>
                      <ExternalLink size={11} className="text-slate-300 shrink-0" />
                      <button type="button"
                        onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                        className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {(aiThieu.length > 0 || aiGhiChu) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-1">
                  {aiThieu.length > 0 && (() => {
                    // Tách hai loại "thiếu" — trước đây gộp chung một dòng dài
                    // nên nhìn như AI đọc hỏng, trong khi phần lớn là số liệu
                    // KHÔNG NẰM trong hợp đồng, phải có biên bản nghiệm thu.
                    const TU_NGHIEM_THU = new Set([
                      "dotSo", "giaTriNghiemThu", "giuLaiTungLan",
                      "khauTruTamUng", "luyKeDaThanhToan", "tamUngConLai",
                    ]);
                    const canHoSo = aiThieu.filter((f) => TU_NGHIEM_THU.has(f));
                    const doSot = aiThieu.filter((f) => !TU_NGHIEM_THU.has(f));
                    return (
                      <>
                        {canHoSo.length > 0 && (
                          <p className="text-[11px] font-bold text-amber-800">
                            Chưa có số liệu đợt thanh toán ({canHoSo.join(", ")}) — mấy số này
                            nằm ở <strong>biên bản nghiệm thu / bảng xác định giá trị đợt</strong>,
                            hợp đồng không có. Tải thêm hồ sơ đó rồi bóc lại, hoặc điền tay.
                          </p>
                        )}
                        {doSot.length > 0 && (
                          <p className="text-[11px] font-bold text-amber-800">
                            Không đọc ra từ hồ sơ đã tải: {doSot.join(", ")} — cần điền tay.
                          </p>
                        )}
                      </>
                    );
                  })()}
                  {aiGhiChu && <p className="text-[11px] font-medium text-amber-700">{aiGhiChu}</p>}
                </div>
              )}
            </div>
          </section>

          {/* ─── 2. Đầu phiếu ─── */}
          <section className="space-y-3">
            <h5 className={labelCls}>2. Đầu phiếu (tự gõ)</h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Đơn vị</span>
                <input value={d.don_vi || ""} onChange={(e) => set("don_vi", e.target.value)}
                  className={inputCls} />
              </label>
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className={labelCls}>Về việc</span>
                <input value={d.ve_viec || ""} onChange={(e) => set("ve_viec", e.target.value)}
                  placeholder='Kính trình BGĐ phê duyệt: "Hồ sơ thanh toán Đợt 02 (thanh toán A-B)".'
                  className={inputCls} />
              </label>
              <label className="flex flex-col gap-1.5 md:col-span-3">
                <span className={labelCls}>Nội dung trình</span>
                <input value={d.noi_dung_trinh || ""} onChange={(e) => set("noi_dung_trinh", e.target.value)}
                  className={inputCls} />
              </label>
            </div>
          </section>

          {/* ─── 3. Thông tin hợp đồng ─── */}
          <section className="space-y-3">
            <h5 className={labelCls}>3. Hợp đồng &amp; dự án</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Chủ đầu tư chỉ có trên phiếu hồ sơ/văn bản. Phiếu hợp đồng nói
                  vai bằng ô "Bên A / Bên B" bên dưới, vì tuỳ loại hợp đồng mà
                  chủ đầu tư đứng vai A hay Trung Nam đứng vai A. */}
              {!laHopDong && (
                <label className="flex flex-col gap-1.5 md:col-span-2">
                  <span className={labelCls}>Chủ đầu tư</span>
                  <input value={d.chu_dau_tu || ""} onChange={(e) => set("chu_dau_tu", e.target.value)} className={inputCls} />
                </label>
              )}
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className={labelCls}>Dự án</span>
                <input value={d.du_an || ""} onChange={(e) => set("du_an", e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Số hợp đồng *</span>
                <input value={d.hop_dong_so || ""} onChange={(e) => set("hop_dong_so", e.target.value)}
                  className={`${inputCls} font-mono`} />
              </label>
              {!laHopDong && (
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Ngày ký</span>
                  <input value={d.ngay_ky_hop_dong || ""} onChange={(e) => set("ngay_ky_hop_dong", e.target.value)}
                    placeholder="01/4/2026" className={inputCls} />
                </label>
              )}
              {/* Hạng mục — chỉ có trên tờ KHKT/BM/001 */}
              {laHopDong && (
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Hạng mục</span>
                  <input value={d.hang_muc || ""} onChange={(e) => set("hang_muc", e.target.value)}
                    className={inputCls} />
                </label>
              )}
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className={labelCls}>Gói thầu</span>
                <input value={d.goi_thau || ""} onChange={(e) => set("goi_thau", e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>Dự án trong danh mục</span>
                <select value={d.project_code || ""} onChange={(e) => set("project_code", e.target.value)}
                  className={`${inputCls} cursor-pointer`}>
                  <option value="">— Không gắn —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.code}>{p.code} — {p.name}</option>
                  ))}
                </select>
              </label>
              {!laHopDong && (
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Đợt số *</span>
                  <input value={d.dot_so || ""} onChange={(e) => set("dot_so", e.target.value)}
                    inputMode="numeric" placeholder="2" className={`${inputCls} font-mono`} />
                </label>
              )}
            </div>
          </section>

          {/* ─── 4b. Chủ thể + giá trị + bảng so sánh (chỉ phiếu hợp đồng) ─── */}
          {laHopDong && (
            <section className="space-y-3">
              <h5 className={labelCls}>4. Chủ thể &amp; giá trị hợp đồng</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* KHÔNG mặc định Trung Nam vào ô nào: hợp đồng A-B thì Bên A là
                    chủ đầu tư, hợp đồng B-B′ thì Bên A mới là Trung Nam. */}
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Bên A</span>
                  <input value={d.ben_a || ""} onChange={(e) => set("ben_a", e.target.value)}
                    className={inputCls} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Bên B</span>
                  <input value={d.ben_b || ""} onChange={(e) => set("ben_b", e.target.value)}
                    className={inputCls} />
                </label>
                <div className="grid grid-cols-[1fr_100px] gap-2">
                  {num("gia_tri_hd", "Giá trị hợp đồng")}
                  <label className="flex flex-col gap-1.5">
                    <span className={labelCls}>VAT %</span>
                    <input value={d.vat_percent || ""} onChange={(e) => set("vat_percent", e.target.value)}
                      inputMode="decimal" placeholder="8" className={`${inputCls} font-mono text-right`} />
                  </label>
                </div>
              </div>

              {/* ─── Bảng so sánh A-B ↔ B-B′ ───
                  Số dòng THÊM/BỚT được nên đây là danh sách động, không phải 6 ô
                  cố định. Mở phiếu mới thì có sẵn 6 dòng a–f theo tờ mẫu để khỏi
                  gõ lại tên mục. */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h5 className={labelCls}>Nội dung so sánh ({soSanh.length} dòng)</h5>
                  <button type="button" onClick={() => setSoSanh((v) => [...v, { stt: "", muc: "", ab: "", bb: "" }])}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 text-slate-600 font-bold rounded-lg text-[10px] transition-all cursor-pointer">
                    <Plus size={12} /> Thêm dòng
                  </button>
                </div>

                <div className="hidden md:grid grid-cols-[36px_1fr_1fr_1fr_28px] gap-2 px-1">
                  <span className={labelCls}>TT</span>
                  <span className={labelCls}>Nội dung</span>
                  <span className={labelCls}>Hợp đồng A-B</span>
                  <span className={labelCls}>Hợp đồng B-B′</span>
                  <span />
                </div>

                {soSanh.map((r, i) => {
                  const upd = (k: keyof SoSanhRow, v: string) =>
                    setSoSanh((prev) => prev.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
                  return (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-[36px_1fr_1fr_1fr_28px] gap-2 items-start">
                      <input value={r.stt} onChange={(e) => upd("stt", e.target.value)}
                        placeholder={`${String.fromCharCode(97 + i)})`}
                        className={`${inputCls} text-center font-mono px-1`} />
                      <input value={r.muc} onChange={(e) => upd("muc", e.target.value)}
                        placeholder="Tạm ứng" className={inputCls} />
                      <textarea value={r.ab} onChange={(e) => upd("ab", e.target.value)} rows={2}
                        className={`${inputCls} resize-y leading-relaxed`} />
                      <textarea value={r.bb} onChange={(e) => upd("bb", e.target.value)} rows={2}
                        className={`${inputCls} resize-y leading-relaxed`} />
                      <button type="button" onClick={() => setSoSanh((prev) => prev.filter((_, j) => j !== i))}
                        title="Xoá dòng"
                        className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer mt-0.5">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ─── 4. Số liệu (chỉ phiếu hồ sơ/văn bản) ─── */}
          {!laHopDong && (
          <section className="space-y-3">
            <h5 className={labelCls}>4. Số liệu đợt thanh toán</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {num("gia_tri_hd", "Giá trị HĐ")}
              {num("gia_tri_nghiem_thu", "Giá trị nghiệm thu đợt này (A)")}
              {num("giu_bao_hanh", "Giữ bảo hành (B)")}
              <div className="grid grid-cols-[1fr_88px] gap-2">
                {num("giu_lai_tung_lan", "Giữ lại từng lần (C)")}
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Tỉ lệ %</span>
                  <input value={d.ty_le_giu_lai || ""} onChange={(e) => set("ty_le_giu_lai", e.target.value)}
                    placeholder="5" className={`${inputCls} font-mono text-right`} />
                </label>
              </div>
              <div className="grid grid-cols-[1fr_88px] gap-2">
                {num("khau_tru_tam_ung", "Khấu trừ tạm ứng (D)")}
                <label className="flex flex-col gap-1.5">
                  <span className={labelCls}>Thu hồi %</span>
                  <input value={d.ty_le_thu_hoi || ""} onChange={(e) => set("ty_le_thu_hoi", e.target.value)}
                    placeholder="46.5" className={`${inputCls} font-mono text-right`} />
                </label>
              </div>
              {num("tam_ung_con_lai", "Tạm ứng còn lại chưa thu hồi")}
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                {num("luy_ke_da_thanh_toan", "Luỹ kế đã thanh toán")}
                <button type="button" onClick={autoLuyKe} disabled={!!busy}
                  title="Cộng từ các đợt trước của cùng hợp đồng"
                  className="h-[34px] px-2.5 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 text-slate-500 rounded-xl cursor-pointer disabled:opacity-50">
                  <Calculator size={14} />
                </button>
              </div>
            </div>

            {/* A-B-C-D */}
            <div className="bg-gradient-to-r from-blue-600 to-[#005BAC] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">
                  Giá trị đề nghị thanh toán (A−B−C−D)
                </p>
                <p className="font-heading font-extrabold text-white text-xl leading-tight mt-0.5">
                  {fmtMoney(deNghiCuoi)} <span className="text-xs font-bold text-blue-100">đồng</span>
                </p>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">
                  Ghi đè (để trống = tự tính)
                </span>
                <input value={d.de_nghi_thanh_toan || ""} onChange={(e) => set("de_nghi_thanh_toan", e.target.value)}
                  placeholder={showNum(abcd)}
                  className="border border-white/30 bg-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-white placeholder:text-blue-200/70 outline-none focus:bg-white/20 w-44 text-right" />
              </label>
            </div>
          </section>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200/60 bg-slate-50/70 px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
          <button type="button" onClick={exportDocx} disabled={!!busy}
            className="mr-auto flex items-center gap-1.5 px-3 py-2 text-slate-600 hover:bg-slate-200/60 font-bold rounded-xl text-[11px] transition-all cursor-pointer disabled:opacity-50">
            {busy === "export" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Xuất phiếu Word
          </button>
          <button type="button" onClick={onClose} disabled={!!busy}
            className="px-4 py-2 text-slate-500 hover:bg-slate-200/60 font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50">
            Đóng
          </button>
          <button type="button" onClick={() => save(false)} disabled={!!busy}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:border-blue-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50">
            {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Lưu nháp
          </button>
          <button type="button" onClick={() => save(true)} disabled={!!busy}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-blue-500/10 transition-all cursor-pointer">
            {busy === "submit" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Trình Phó Giám đốc
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
