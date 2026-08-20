"use client";

// ============================================================
// PHIẾU TRÌNH KÝ HỒ SƠ/VĂN BẢN (migration 050 + 051)
//
// Một chỗ duy nhất định nghĩa: máy trạng thái, ai được làm gì ở bước nào, và
// cách tính A-B-C-D. Trang và modal chỉ gọi lại — luật nằm rải rác ở nhiều
// component là cách chắc chắn nhất để giao diện nói một đằng CSDL chặn một nẻo.
//
// LƯU Ý: mọi luật ở đây CHỈ để dựng giao diện cho đúng. Chốt chặn thật nằm ở
// trigger `guard_signing_transition` và RLS của migration 050 — người dùng gọi
// thẳng REST API vẫn bị chặn.
// ============================================================

import { supabase } from "./supabase";
import { apiFetch } from "./apiClient";
import type { ApprovalPermissions } from "./approvers";

export const SIGNING_BUCKET = "signing-dossiers";
const SIGNED_TTL = 60 * 60; // 1 giờ

// Một chặng Phó Giám đốc duy nhất: QLDA HOẶC KHĐT, ai xem trước cũng được
// (migration 053). Hai giá trị cũ giữ trong kiểu để phiếu lịch sử không vỡ.
export type SigningStatus =
  | "nhap"
  | "cho_pho_giam_doc"
  | "cho_giam_doc"
  | "cho_ke_toan"
  | "hoan_tat"
  | "tra_lai"
  | "cho_pgd_qlda"
  | "cho_pgd_khdt";

export type SigningFile = { path: string; name: string; size?: number };

// ─── Hai loại phiếu (migration 060) ───
// ho_so    : TL/BM/011  — trình MỘT ĐỢT THANH TOÁN của hợp đồng đã ký.
// hop_dong : KHKT/BM/001 — trình NỘI DUNG HỢP ĐỒNG trước khi ký.
export type SigningLoai = "ho_so" | "hop_dong";

export const LOAI_META: Record<SigningLoai, { label: string; short: string; bieuMau: string; chip: string }> = {
  ho_so: {
    label: "Trình ký hồ sơ / văn bản",
    short: "Hồ sơ",
    bieuMau: "TL/BM/011",
    chip: "bg-blue-50 text-blue-700",
  },
  hop_dong: {
    label: "Trình ký hợp đồng",
    short: "Hợp đồng",
    bieuMau: "KHKT/BM/001",
    chip: "bg-violet-50 text-violet-700",
  },
};

/** Một dòng trong bảng so sánh A-B ↔ B-B′. Số dòng THÊM/BỚT được, không cố định 6. */
export type SoSanhRow = { stt: string; muc: string; ab: string; bb: string };

/** 6 dòng a–f theo đúng tờ mẫu — chỉ dùng làm GỢI Ý khi lập phiếu mới. */
export const SO_SANH_MAU: SoSanhRow[] = [
  { stt: "a)", muc: "Tạm ứng", ab: "", bb: "" },
  { stt: "b)", muc: "Nghiệm thu thanh toán", ab: "", bb: "" },
  { stt: "c)", muc: "Bảo đảm THHĐ", ab: "", bb: "" },
  { stt: "d)", muc: "Giữ bảo hành", ab: "", bb: "" },
  { stt: "e)", muc: "Giữ quyết toán", ab: "", bb: "" },
  { stt: "f)", muc: "Thuế vãng lai", ab: "", bb: "" },
];

export type SigningSubmission = {
  id: string;
  ma_phieu: string | null;

  don_vi: string | null;
  ve_viec: string | null;
  noi_dung_trinh: string | null;

  dot_so: number | null;
  chu_dau_tu: string | null;
  du_an: string | null;
  hop_dong_so: string | null;
  ngay_ky_hop_dong: string | null;
  goi_thau: string | null;
  gia_tri_hd: number | null;
  gia_tri_nghiem_thu: number | null;
  giu_bao_hanh: number | null;
  giu_lai_tung_lan: number | null;
  ty_le_giu_lai: number | null;
  khau_tru_tam_ung: number | null;
  ty_le_thu_hoi: number | null;
  de_nghi_thanh_toan: number | null;
  luy_ke_da_thanh_toan: number | null;
  tam_ung_con_lai: number | null;

  project_code: string | null;
  project_name: string | null;

  ai_ghi_chu: string | null;
  ai_thieu: string[];
  files: SigningFile[];

  // ─── migration 060 ───
  loai: SigningLoai;
  hang_muc: string | null;
  ben_a: string | null;
  ben_b: string | null;
  vat_percent: number | null;
  so_sanh: SoSanhRow[];

  status: SigningStatus;

  ykien_qlda: string | null;
  qlda_by: string | null;
  qlda_at: string | null;
  ykien_khdt: string | null;
  khdt_by: string | null;
  khdt_at: string | null;
  ykien_giam_doc: string | null;
  giam_doc_by: string | null;
  giam_doc_at: string | null;
  ke_toan_by: string | null;
  ke_toan_at: string | null;
  ngay_chi: string | null;

  tra_lai_tu: string | null;
  tra_lai_boi: string | null;
  tra_lai_luc: string | null;
  tra_lai_ly_do: string | null;

  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Nhãn + màu theo trạng thái ───
export const STATUS_META: Record<
  SigningStatus,
  { label: string; short: string; chip: string }
> = {
  nhap:             { label: "Nháp",              short: "Nháp",      chip: "bg-slate-100 text-slate-600" },
  cho_pho_giam_doc: { label: "Chờ Phó Giám đốc",  short: "Phó GĐ",    chip: "bg-amber-50 text-amber-700" },
  cho_giam_doc:     { label: "Chờ Giám đốc",      short: "Giám đốc",  chip: "bg-orange-50 text-orange-700" },
  cho_ke_toan:      { label: "Chờ Kế toán chi",   short: "Kế toán",   chip: "bg-blue-50 text-blue-700" },
  hoan_tat:         { label: "Hoàn tất",          short: "Hoàn tất",  chip: "bg-emerald-50 text-emerald-700" },
  tra_lai:          { label: "Bị trả lại",        short: "Trả lại",   chip: "bg-rose-50 text-rose-700" },
  // Phiếu cũ từ trước migration 053 — vẫn phải hiển thị được.
  cho_pgd_qlda:     { label: "Chờ Phó Giám đốc",  short: "Phó GĐ",    chip: "bg-amber-50 text-amber-700" },
  cho_pgd_khdt:     { label: "Chờ Phó Giám đốc",  short: "Phó GĐ",    chip: "bg-amber-50 text-amber-700" },
};

// Nhãn nút hành động của TỪNG CẤP. Hai Phó Giám đốc "xem xét" chứ không "phê
// duyệt" — phê duyệt là thẩm quyền của Giám đốc, còn Kế toán thì xác nhận đã
// chi. Gọi đúng tên theo quy trình giấy để người ký không hiểu nhầm thẩm quyền.
export const ACTION_LABEL: Partial<Record<SigningStatus, string>> = {
  cho_pho_giam_doc: "Đã xem xét",
  cho_giam_doc: "Phê duyệt",
  cho_ke_toan: "Đã xác nhận",
  cho_pgd_qlda: "Đã xem xét",
  cho_pgd_khdt: "Đã xem xét",
};

// Câu mô tả việc vừa xảy ra, dùng cho email báo người lập.
export const EVENT_LABEL: Partial<Record<SigningStatus, string>> = {
  cho_pho_giam_doc: "Phó Giám đốc đã xem xét",
  cho_giam_doc: "Giám đốc đã phê duyệt",
  cho_ke_toan: "Kế toán đã xác nhận chi",
  cho_pgd_qlda: "Phó Giám đốc đã xem xét",
  cho_pgd_khdt: "Phó Giám đốc đã xem xét",
};

// Thứ tự đi của phiếu. Dùng cho thanh tiến trình và để suy ra bước kế tiếp —
// không viết tay "bước sau của X là Y" ở nhiều nơi.
//
// CHỈ MỘT chặng Phó Giám đốc: một trong hai vị (QLDA hoặc KHĐT) xem xét là
// chuyển thẳng Giám đốc, không phải qua đủ cả hai (migration 053).
export const FLOW: SigningStatus[] = [
  "cho_pho_giam_doc",
  "cho_giam_doc",
  "cho_ke_toan",
  "hoan_tat",
];

// Phiếu HỢP ĐỒNG hết luồng ngay sau Giám đốc: tờ KHKT/BM/001 chỉ có 3 ô ký
// (Người trình · Phụ trách · BLĐ Phê duyệt), không có chỗ cho Kế toán vì hợp
// đồng chưa phát sinh chi tiền.
//
// ⚠ Luật này PHẢI khớp với trigger `guard_signing_transition` ở migration 060.
// Lệch nhau thì giao diện đẩy phiếu sang một bước mà CSDL từ chối, hoặc tệ hơn:
// phiếu treo ở chặng không cấp nào giữ.
export const FLOW_HOP_DONG: SigningStatus[] = [
  "cho_pho_giam_doc",
  "cho_giam_doc",
  "hoan_tat",
];

export function flowOf(loai: SigningLoai): SigningStatus[] {
  return loai === "hop_dong" ? FLOW_HOP_DONG : FLOW;
}

// Phiếu cũ nằm ở trạng thái trước 053 thì quy về chặng Phó Giám đốc, để
// nextStatus / thanh tiến trình không bị lệch.
export function normalizeStatus(s: SigningStatus): SigningStatus {
  return s === "cho_pgd_qlda" || s === "cho_pgd_khdt" ? "cho_pho_giam_doc" : s;
}

// `loai` BẮT BUỘC truyền vào, không để mặc định 'ho_so': quên truyền thì phiếu
// hợp đồng sẽ bị đẩy sang chặng Kế toán và trigger 060 chặn lại — lỗi chỉ lộ ra
// lúc người dùng bấm duyệt, rất khó lần.
export function nextStatus(cur: SigningStatus, loai: SigningLoai): SigningStatus | null {
  const flow = flowOf(loai);
  const i = flow.indexOf(normalizeStatus(cur));
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
}

// Cờ quyền giữ từng chặng. Chặng Phó Giám đốc nhận CẢ HAI cờ — chỉ cần một.
const STAGE_FLAGS: Partial<Record<SigningStatus, (keyof ApprovalPermissions)[]>> = {
  cho_pho_giam_doc: ["canApproveSigningQlda", "canApproveSigningKhdt"],
  cho_giam_doc: ["canApproveSigningDirector"],
  cho_ke_toan:  ["canApproveSigningAccounting"],
};

// Tên cột trong approval_permissions, để tra email người giữ chặng kế tiếp.
const STAGE_COLUMNS: Partial<Record<SigningStatus, string[]>> = {
  cho_pho_giam_doc: ["can_approve_signing_qlda", "can_approve_signing_khdt"],
  cho_giam_doc: ["can_approve_signing_director"],
  cho_ke_toan:  ["can_approve_signing_accounting"],
};

/**
 * Email của những người giữ cờ duyệt ở một bước — để báo "có phiếu chờ bạn".
 * Cột `email` có thể chứa NHIỀU địa chỉ ngăn bằng dấu phẩy (email công ty +
 * gmail), nên phải tách ra hết chứ không lấy mỗi cái đầu.
 */
export async function fetchStageApproverEmails(stage: SigningStatus): Promise<string[]> {
  const cols = STAGE_COLUMNS[normalizeStatus(stage)];
  if (!cols?.length) return [];
  // Chặng Phó Giám đốc có 2 cột -> lấy dòng nào bật MỘT trong hai (or của
  // PostgREST), vì chỉ cần một vị xem xét là phiếu đi tiếp.
  const { data, error } = await supabase
    .from("approval_permissions")
    .select("email")
    .or(cols.map((c) => `${c}.eq.true`).join(","));
  if (error || !data) return [];
  return Array.from(
    new Set(
      data
        .flatMap((r: { email: string | null }) => (r.email || "").split(","))
        .map((e) => e.trim())
        .filter((e) => e.includes("@"))
    )
  );
}

/** Người này có phải cấp đang giữ phiếu không (được Duyệt / Trả lại). */
export function canActOn(
  s: SigningSubmission,
  perms: ApprovalPermissions,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  const flags = STAGE_FLAGS[normalizeStatus(s.status)];
  return !!flags?.some((f) => !!perms[f]);
}

/**
 * Ý kiến của người này ghi vào ô nào trên tờ phiếu.
 * Tờ TL/BM/011 có hai ô riêng cho P.QLDA (mục 3) và P.KHĐT (mục 4). Gộp chặng
 * duyệt KHÔNG gộp hai ô đó — vị nào ký thì ghi vào ô của vị ấy, ô còn lại để
 * trắng đúng như tờ giấy. Người giữ cả hai cờ thì mặc định ghi ô QLDA.
 */
export function pgdOpinionField(perms: ApprovalPermissions): "qlda" | "khdt" {
  if (perms.canApproveSigningQlda) return "qlda";
  if (perms.canApproveSigningKhdt) return "khdt";
  return "qlda"; // Admin duyệt thay — ghi vào ô đầu
}

/** Người này có được sửa nội dung phiếu không. */
export function canEdit(
  s: SigningSubmission,
  email: string,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  const own = !!email && s.created_by.toLowerCase() === email.toLowerCase();
  return own && (s.status === "nhap" || s.status === "tra_lai");
}

/** Các bước mà người này giữ quyền duyệt — dùng để đếm hộp việc cần xử lý. */
export function stagesOf(perms: ApprovalPermissions): SigningStatus[] {
  return (Object.keys(STAGE_FLAGS) as SigningStatus[]).filter((st) =>
    STAGE_FLAGS[st]!.some((f) => !!perms[f])
  );
}

// ─── Tính A-B-C-D ───
// Giữ đúng một bản duy nhất: form nhập, thẻ danh sách và route xuất Word đều
// phải ra cùng một con số, lệch nhau một chỗ là phiếu in ra khác phiếu đã duyệt.
export function tinhDeNghi(s: {
  gia_tri_nghiem_thu?: number | null;
  giu_bao_hanh?: number | null;
  giu_lai_tung_lan?: number | null;
  khau_tru_tam_ung?: number | null;
}): number {
  const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return n(s.gia_tri_nghiem_thu) - n(s.giu_bao_hanh) - n(s.giu_lai_tung_lan) - n(s.khau_tru_tam_ung);
}

/**
 * Đọc lỗi ra chuỗi cho người dùng.
 *
 * BẮT BUỘC có hàm này: supabase-js KHÔNG ném Error mà trả về object thuần
 * { message, details, hint, code }. Viết `e instanceof Error ? e.message :
 * String(e)` thì rơi vào nhánh String() và hiện đúng chữ "[object Object]" —
 * người dùng không biết lỗi gì, mình cũng không lần ra được.
 *
 * Kèm `details`/`hint` vì lỗi RLS và lỗi trigger của Postgres hay nằm ở đó chứ
 * không nằm trong `message`.
 */
export function errText(e: unknown): string {
  if (!e) return "Lỗi không rõ.";
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint]
      .filter((x): x is string => typeof x === "string" && x.trim() !== "");
    if (parts.length) {
      const code = typeof o.code === "string" && o.code ? ` (mã ${o.code})` : "";
      return parts.join(" — ") + code;
    }
    try {
      return JSON.stringify(e);
    } catch {
      return "Lỗi không đọc được.";
    }
  }
  return String(e);
}

export const fmtMoney = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v)
    ? new Intl.NumberFormat("vi-VN").format(Math.round(v))
    : "—";

export const fmtDateTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : "—";

// ─── Đọc ───
const COLS = "*";

export async function fetchSubmissions(): Promise<SigningSubmission[]> {
  const { data, error } = await supabase
    .from("signing_submissions")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeRow);
}

/**
 * Xoá hẳn một phiếu trình ký.
 *
 * Chốt chặn thật là policy `signing_delete` (migration 050): chỉ Admin, hoặc
 * người lập xoá phiếu còn ở 'nhap'/'tra_lai'. Nút trên UI chỉ hiện với Admin —
 * ẩn nút là cho gọn mắt, không phải cơ chế bảo vệ.
 *
 * RLS chặn thì Postgres KHÔNG báo lỗi, chỉ xoá 0 dòng. Vì vậy phải yêu cầu trả
 * dòng vừa xoá về (`select()`) rồi tự kiểm tra — nếu rỗng thì báo không đủ
 * quyền, đừng để người dùng tưởng đã xoá xong.
 *
 * Tệp hồ sơ trong bucket signing-dossiers KHÔNG xoá theo — cố ý giữ, dọn kho
 * là việc riêng.
 */
export async function deleteSubmission(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("signing_submissions")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Không xoá được phiếu — tài khoản của bạn không đủ quyền xoá.");
  }
}

/**
 * Nhân đôi một phiếu để sửa nhanh thành phiếu mới.
 *
 * CHỈ chép phần NGHIỆP VỤ (hợp đồng, giá trị, số tiền, tệp hồ sơ). KHÔNG chép:
 *   - `ma_phieu`  : trigger tự sinh mã mới, chép sang là đụng ràng buộc unique.
 *   - toàn bộ vết duyệt (ý kiến, người duyệt, mốc thời gian, lý do trả lại) —
 *     phiếu mới chưa ai duyệt, mang vết cũ sang là ghi khống lịch sử.
 *   - `ai_ghi_chu` / `ai_thieu` : nhận xét của AI về BỘ HỒ SƠ ĐÃ QUÉT của phiếu
 *     cũ, dán sang phiếu mới thì không còn đúng nữa.
 *
 * `dot_so` chép NGUYÊN: chỉ số về `nhap` nên không vướng unique index
 * (uq_signing_hopdong_dot bỏ qua trạng thái nhap/tra_lai). Người lập tự sửa
 * sang đợt cần làm.
 *
 * `files` chép tham chiếu, KHÔNG nhân bản tệp trong kho: hai phiếu cùng trỏ vào
 * một đường dẫn. An toàn vì xoá phiếu không đụng tới tệp trong kho — xem
 * `deleteSubmission`, nó chỉ xoá dòng.
 */
export async function duplicateSubmission(
  src: SigningSubmission,
  email: string,
  name: string
): Promise<SigningSubmission> {
  const payload = {
    don_vi: src.don_vi,
    ve_viec: src.ve_viec,
    noi_dung_trinh: src.noi_dung_trinh,
    dot_so: src.dot_so,
    chu_dau_tu: src.chu_dau_tu,
    du_an: src.du_an,
    hop_dong_so: src.hop_dong_so,
    ngay_ky_hop_dong: src.ngay_ky_hop_dong,
    goi_thau: src.goi_thau,
    gia_tri_hd: src.gia_tri_hd,
    gia_tri_nghiem_thu: src.gia_tri_nghiem_thu,
    giu_bao_hanh: src.giu_bao_hanh,
    giu_lai_tung_lan: src.giu_lai_tung_lan,
    ty_le_giu_lai: src.ty_le_giu_lai,
    khau_tru_tam_ung: src.khau_tru_tam_ung,
    ty_le_thu_hoi: src.ty_le_thu_hoi,
    de_nghi_thanh_toan: src.de_nghi_thanh_toan,
    luy_ke_da_thanh_toan: src.luy_ke_da_thanh_toan,
    tam_ung_con_lai: src.tam_ung_con_lai,
    project_code: src.project_code,
    project_name: src.project_name,
    files: src.files,
    status: "nhap",
    created_by: email,
    created_by_name: name || null,
  };

  const { data, error } = await supabase
    .from("signing_submissions")
    .insert([payload])
    .select(COLS)
    .single();
  if (error) throw error;
  return normalizeRow(data as unknown as Record<string, unknown>);
}

// ─── Đính kèm thêm tệp cho một phiếu đã có ───
// Dùng cho cột "File gốc" ngoài danh sách: tải lên rồi NỐI vào mảng `files`,
// không ghi đè — phiếu thường có nhiều tệp, ghi đè là mất bộ hồ sơ đã tải.
export async function appendDossierFiles(
  row: SigningSubmission,
  picked: File[]
): Promise<SigningFile[]> {
  const added: SigningFile[] = [];
  for (const f of picked) {
    added.push(await uploadDossierFile(f));
  }
  const files = [...row.files, ...added];
  const { error } = await supabase
    .from("signing_submissions")
    .update({ files })
    .eq("id", row.id);
  if (error) throw error;
  return files;
}

/**
 * Gỡ một tệp khỏi phiếu.
 *
 * CHỈ xoá THAM CHIẾU trong cột `files`, KHÔNG xoá tệp trong kho. Lý do: phiếu
 * nhân đôi dùng chung đường dẫn với phiếu gốc (xem `duplicateSubmission`), nên
 * xoá vật lý sẽ làm hỏng luôn tệp của phiếu kia — mà từ đây không cách nào biết
 * còn phiếu nào đang trỏ vào nó. Đổi lại kho có thể còn tệp không ai dùng; dọn
 * kho là việc định kỳ, không đáng đánh đổi bằng rủi ro mất hồ sơ của phiếu khác.
 *
 * Trigger `guard_signing_transition` chỉ cho sửa `files` khi phiếu còn ở
 * nháp/trả lại và người sửa là người lập (hoặc Admin) — trùng đúng với `canEdit`
 * mà giao diện đang dùng để ẩn/hiện nút.
 */
export async function removeDossierFile(
  rowId: string,
  files: SigningFile[],
  path: string
): Promise<SigningFile[]> {
  const next = files.filter(f => f.path !== path);
  const { error } = await supabase
    .from("signing_submissions")
    .update({ files: next })
    .eq("id", rowId);
  if (error) throw error;
  return next;
}

function normalizeRow(r: Record<string, unknown>): SigningSubmission {
  return {
    ...(r as unknown as SigningSubmission),
    // Hai cột jsonb: Postgres trả về mảng, nhưng dòng cũ/lỗi có thể là null.
    ai_thieu: Array.isArray(r.ai_thieu) ? (r.ai_thieu as string[]) : [],
    files: Array.isArray(r.files) ? (r.files as SigningFile[]) : [],
    // Phiếu lập trước 060 không có 2 cột này — về mặc định thay vì undefined,
    // để mọi chỗ đọc `s.loai` / `s.so_sanh` không phải kiểm null.
    loai: (r.loai as SigningLoai) || "ho_so",
    so_sanh: Array.isArray(r.so_sanh) ? (r.so_sanh as SoSanhRow[]) : [],
  };
}

/**
 * Luỹ kế đã thanh toán tính từ các đợt TRƯỚC của cùng hợp đồng, cộng đợt đang lập.
 * Gọi hàm SQL (migration 050) thay vì cộng ở client: client chỉ thấy những phiếu
 * RLS cho phép, cộng thiếu một đợt là sai con số trình Giám đốc.
 */
export async function tinhLuyKe(
  hopDongSo: string,
  dotSo: number,
  dotNay: number
): Promise<number | null> {
  const { data, error } = await supabase.rpc("luy_ke_da_thanh_toan", {
    p_hop_dong_so: hopDongSo,
    p_dot_so: dotSo,
    p_dot_nay: dotNay,
  });
  if (error) return null;
  return typeof data === "number" ? data : Number(data) || null;
}

// ─── Tệp hồ sơ gốc ───
function safeName(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${clean}`;
}

export async function uploadDossierFile(file: File): Promise<SigningFile> {
  const path = safeName(file.name);
  const { error } = await supabase.storage
    .from(SIGNING_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (error) {
    // Người dùng cuối đọc "Bucket not found" thì không biết phải làm gì.
    const hint = /bucket not found/i.test(error.message)
      ? ` — chưa có kho "${SIGNING_BUCKET}". Chạy migrations/051_signing_dossier_bucket.sql.`
      : /row-level security|policy/i.test(error.message)
      ? " — tài khoản chưa được cấp cờ “Lập phiếu trình ký”."
      : /exceeded the maximum allowed size|payload too large/i.test(error.message)
      ? " — tệp vượt mức 25MB."
      : "";
    throw new Error(`Không tải lên được "${file.name}": ${error.message}${hint}`);
  }
  return { path, name: file.name, size: file.size };
}

// ─── Xuất phiếu Word ───
// Đặt ở lib để màn hình SOẠN THẢO và màn hình CHI TIẾT dùng chung một đường:
// hai nơi tự gọi API rồi tự dựng thẻ <a> tải file thì rất dễ trôi lệch nhau,
// mà phiếu in ra từ hai chỗ bắt buộc phải giống hệt.
export async function downloadSigningForm(
  payload: Record<string, unknown>,
  filename: string
): Promise<void> {
  const res = await apiFetch("/api/export-signing-form", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Lỗi xuất phiếu (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Dựng payload xuất Word từ một phiếu ĐÃ LƯU.
 * Khác màn hình soạn thảo ở chỗ CÓ kèm ý kiến 3 cấp — xuất từ màn hình chi tiết
 * là để lấy bản phiếu đã có chữ ký/ý kiến, đó mới là bản đem đi lưu hồ sơ.
 */
export function docxPayloadFromRow(s: SigningSubmission): Record<string, unknown> {
  // Phiếu HỢP ĐỒNG: bộ trường khác hẳn, route cũng render bằng nhánh riêng.
  if (s.loai === "hop_dong") {
    return {
      loai: "hop_dong",
      duAn: s.du_an,
      goiThau: s.goi_thau,
      hangMuc: s.hang_muc,
      hopDongSo: s.hop_dong_so,
      benA: s.ben_a,
      benB: s.ben_b,
      giaTriHD: s.gia_tri_hd,
      vatPercent: s.vat_percent,
      soSanh: s.so_sanh,
      ykienQLDA: s.ykien_qlda || "",
      ykienKHDT: s.ykien_khdt || "",
      ykienGiamDoc: s.ykien_giam_doc || "",
      nguoiTrinh: s.created_by_name || "",
      fileName: docxFileName(s),
    };
  }

  return {
    loai: "ho_so",
    donVi: s.don_vi,
    veViec: s.ve_viec,
    noiDungTrinh: s.noi_dung_trinh,
    dotSo: s.dot_so,
    chuDauTu: s.chu_dau_tu,
    duAn: s.du_an,
    hopDongSo: [s.hop_dong_so, s.ngay_ky_hop_dong ? `ký ngày ${s.ngay_ky_hop_dong}` : ""]
      .filter(Boolean).join(" "),
    goiThau: s.goi_thau,
    giaTriHD: s.gia_tri_hd,
    giaTriNghiemThu: s.gia_tri_nghiem_thu,
    giuBaoHanh: s.giu_bao_hanh,
    giuLaiTungLan: s.giu_lai_tung_lan,
    tyLeGiuLai: s.ty_le_giu_lai,
    khauTruTamUng: s.khau_tru_tam_ung,
    tyLeThuHoi: s.ty_le_thu_hoi,
    deNghiThanhToan: s.de_nghi_thanh_toan ?? tinhDeNghi(s),
    luyKeDaThanhToan: s.luy_ke_da_thanh_toan,
    tamUngConLai: s.tam_ung_con_lai,
    ykienQLDA: s.ykien_qlda || "",
    ykienKHDT: s.ykien_khdt || "",
    ykienGiamDoc: s.ykien_giam_doc || "",
  };
}

export function docxFileName(s: {
  ma_phieu?: string | null; hop_dong_so?: string | null; dot_so?: number | null;
  loai?: SigningLoai;
}): string {
  const safe = String(s.hop_dong_so || s.ma_phieu || "phieu").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);
  // Phiếu hợp đồng không có "đợt" — gắn đuôi _Dot_x vào là sai nghiệp vụ.
  if (s.loai === "hop_dong") return `Phieu_Trinh_Ky_Hop_Dong_${safe}.docx`;
  return `Phieu_Trinh_Ky_${safe}_Dot_${s.dot_so ?? "x"}.docx`;
}

export async function resolveDossierUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(SIGNING_BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}
