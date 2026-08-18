// ============================================================
// Phép năm — NGUỒN DUY NHẤT của công thức.
//
// Trước đây công thức nằm gọn trong app/cb/page.tsx. Nay trang Lịch cũng phải
// biết nhân sự còn bao nhiêu phép để chặn đăng ký vượt hạn mức, nên tách ra
// đây. Hai trang tính lệch nhau là chặn một đằng trừ một nẻo.
//
// Đơn nghỉ phép được lưu thành MỘT DÒNG trong bảng `tasks` (title chứa
// "Nghỉ phép"), không có bảng riêng.
// ============================================================

export interface LeaveEntry {
  /** "Phép năm" | "Việc riêng" | "Nghỉ không lương" | ... */
  type: string;
  /** "Đã duyệt" | "Chờ duyệt" | "Từ chối" */
  status: string;
  days: number;
  /** Ngày bắt đầu nghỉ, dạng yyyy-mm-dd */
  from: string;
}

/** Thâm niên tính bằng năm, mốc là NGÀY HÔM NAY. */
export const getTenureYears = (emp: any, ref: Date = new Date()): number => {
  if (!emp || !emp.created_at) return 1.5;
  const joinDate = new Date(emp.created_at);
  if (isNaN(joinDate.getTime())) return 1.5;
  const diffTime = Math.max(0, ref.getTime() - joinDate.getTime());
  return diffTime / (1000 * 60 * 60 * 24) / 365.25;
};

export const getTenureStr = (emp: any, ref: Date = new Date()): string => {
  if (!emp || !emp.created_at) return "1 năm 6 tháng";
  const joinDate = new Date(emp.created_at);
  if (isNaN(joinDate.getTime())) return "1 năm 6 tháng";
  // Ngày nhận việc nằm ở TƯƠNG LAI (hồ sơ nhập liệu chưa sửa ngày thật): phép
  // trừ ra số âm, mà nhánh months < 0 bên dưới sẽ bẻ -2 tháng thành "10 tháng".
  if (joinDate.getTime() > ref.getTime()) return "Chưa nhận việc";
  let years = ref.getFullYear() - joinDate.getFullYear();
  let months = ref.getMonth() - joinDate.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years === 0 && months === 0) return "Mới gia nhập";
  return `${years > 0 ? `${years} năm ` : ""}${months > 0 ? `${months} tháng` : ""}`.trim();
};

// ─── Phép năm TÍCH LUỸ THEO THÁNG, không ứng trước cả 12 ngày ───
// Trả về số ngày phép cơ bản đã tích luỹ tính đến tháng hiện tại (chưa cộng
// phép thâm niên).
//
//  • Vào việc từ NĂM TRƯỚC  -> mỗi tháng đã qua trong năm nay là 1 ngày.
//    Tháng 8 = 8 ngày, tháng 12 = 12 ngày.
//
//  • Vào việc TRONG NĂM NAY -> 2 tháng đầu là thử việc, tính 0. Qua chính thức
//    (từ tháng thứ 3) mới được bù 2 tháng đó vào, trong đó THÁNG VÀO VIỆC chỉ
//    được 1 ngày nếu nhận việc từ ngày 1–15; từ ngày 16 trở đi tháng đó là 0.
//    Từ tháng chính thức trở đi mỗi tháng thêm 1 ngày.
//
//    VD nhận việc 10/3 -> tháng 8: (1 + 1) + (T5,6,7,8) = 6 ngày
//       nhận việc 20/3 -> tháng 8: (0 + 1) + (T5,6,7,8) = 5 ngày
//       nhận việc 10/7 -> tháng 8: còn thử việc            = 0 ngày
export const getAccruedBaseLeave = (emp: any, ref: Date = new Date()): number => {
  const year = ref.getFullYear();
  const month = ref.getMonth() + 1;

  const joinDate = emp?.created_at ? new Date(emp.created_at) : null;
  // Không có ngày nhận việc -> coi như người cũ, hưởng đủ số tháng đã qua.
  // Thà rộng tay còn hơn cắt oan phép của người có hồ sơ thiếu ngày.
  if (!joinDate || isNaN(joinDate.getTime())) return month;

  const joinYear = joinDate.getFullYear();
  if (joinYear < year) return month;
  if (joinYear > year) return 0; // ngày nhận việc ở tương lai

  const joinMonth = joinDate.getMonth() + 1;
  const officialMonth = joinMonth + 2; // hết 2 tháng thử việc
  if (month < officialMonth) return 0; // còn trong thời gian thử việc

  const firstMonthCredit = joinDate.getDate() <= 15 ? 1 : 0;
  const probationCredit = firstMonthCredit + 1; // tháng thử việc thứ 2 luôn được 1
  return probationCredit + (month - officialMonth + 1);
};

/** Kiêm nhiệm / hỗ trợ -> không được cấp phép năm. */
export const isConcurrentRole = (emp: any): boolean => {
  const role = (emp?.role || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d");
  return role.includes("kiem nhiem") || role.includes("ho tro");
};

// ─── Đọc một dòng `tasks` thành đơn nghỉ phép ───
// Dùng chung cho cả C&B lẫn Lịch: trang nào tự đọc lấy là sớm muộn cũng lệch
// (nhất là chỗ "Nửa ngày" -> 0.5 ngày).
export const parseLeaveTask = (t: any) => {
  let type = "Phép năm";
  const title = t.title || "";

  if (title.includes("Nghỉ phép")) {
    const match = title.match(/Nghỉ phép \((.*?)\)/);
    if (match && match[1]) {
      const ext = match[1].toLowerCase();
      if (ext.includes("phép năm") || ext.includes("phep nam")) {
        type = "Phép năm";
      } else if (ext.includes("không hưởng lương") || ext.includes("khong huong luong")) {
        type = "Nghỉ không lương";
      } else if (ext.includes("việc riêng") || ext.includes("viec rieng")) {
        type = "Việc riêng";
      } else {
        type = match[1];
      }
    }
  }

  let days = 1;
  const daysMatch = title.match(/(\d+(\.\d+)?)\s*ngày/);
  if (daysMatch && daysMatch[1]) {
    days = parseFloat(daysMatch[1]);
  } else if (title.toLowerCase().includes("nửa ngày") || title.toLowerCase().includes("nua ngay")) {
    days = 0.5;
  } else if (t.start_date && t.due_date) {
    const diffTime = new Date(t.due_date).getTime() - new Date(t.start_date).getTime();
    if (diffTime >= 0) days = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  let status = "Chờ duyệt";
  if (t.status === "completed") status = "Đã duyệt";
  else if (t.status === "rejected") status = "Từ chối";
  else if (t.status === "pending_approval") status = "Chờ duyệt";

  return {
    id: t.id,
    name: t.assignee || "Chưa rõ",
    type,
    from: t.start_date || new Date().toISOString().split("T")[0],
    to: t.due_date || new Date().toISOString().split("T")[0],
    days,
    reason: t.notes || "Nghỉ phép",
    status,
  };
};

/** Phép năm cũ dùng được tới HẾT tháng này của năm sau, sang tháng 4 là xoá. */
export const CARRY_OVER_LAST_MONTH = 3;

export interface LeaveQuota {
  /** Phép cơ bản đã tích luỹ tới tháng này */
  base: number;
  /** Phép thâm niên: cứ đủ 5 năm +1 ngày */
  senior: number;
  /** Phép năm trước còn dư, CHƯA trừ gì — 0 nếu đã qua 31/3 */
  carry: number;
  /** Phép năm trước còn dùng được ngay lúc này (đã trừ phần đã nghỉ) */
  carryLeft: number;
  /** Tổng hạn mức = phép năm nay + phép tồn còn hiệu lực */
  total: number;
  /** Đã nghỉ — đơn phép năm ĐÃ DUYỆT trong năm nay */
  used: number;
  /** Đang giữ chỗ — đơn phép năm CHỜ DUYỆT trong năm nay */
  pending: number;
  /** Còn được đăng ký */
  remaining: number;
  isConcurrent: boolean;
  /** Admin có nhập tay tổng phép cho người này không */
  hasOverride: boolean;
  tenureStr: string;
}

// Đơn CHỜ DUYỆT cũng bị giữ chỗ. Nếu chỉ trừ đơn đã duyệt thì gửi 10 đơn liên
// tiếp đều lọt vì chưa đơn nào được duyệt — đúng cái "đăng ký bừa" cần chặn.
//
// ─── PHÉP TỒN NĂM TRƯỚC ───
// Phép năm cũ không mất ngay 1/1 mà mang sang dùng tới HẾT 31/3, sang 1/4 xoá.
// VD dư 3 ngày của 2026 -> tháng 3/2027 có 6 ngày (3 cũ + 3 mới); qua tháng 4
// còn đúng 4 ngày mới.
//
// Nghỉ trong quý I thì TRỪ VÀO PHÉP CŨ TRƯỚC (nó sắp hết hạn). Nhờ vậy ai nghỉ
// 3 ngày trong tháng 1 thì sang tháng 4 vẫn còn nguyên 4 ngày phép mới.
//
// Số tồn tính trực tiếp lúc chạy từ chính dữ liệu đơn nghỉ — không cần bảng lưu
// và không cần tác vụ chạy đêm giao thừa.
export const computeLeaveQuota = (
  emp: any,
  entries: LeaveEntry[],
  opts: { isConcurrent?: boolean; ref?: Date } = {}
): LeaveQuota => {
  const ref = opts.ref || new Date();
  const year = ref.getFullYear();
  const month = ref.getMonth() + 1;
  const isConcurrent = opts.isConcurrent ?? isConcurrentRole(emp);

  const base = getAccruedBaseLeave(emp, ref);
  const senior = Math.floor(getTenureYears(emp, ref) / 5);

  const override = emp?.annual_leave_override;
  const hasOverride = override !== null && override !== undefined;

  // Phép năm nay (chưa tính tồn). Admin nhập tay là CHỐT CỨNG cả cụm — con số
  // gõ vào ô "Tổng phép" chính là tổng cuối cùng, đã bao gồm phần tồn nếu có.
  const accrued = isConcurrent ? 0 : hasOverride ? Number(override) : base + senior;

  const sum = (list: LeaveEntry[]) => list.reduce((s, l) => s + (l.days || 0), 0);
  const annualOfYear = (y: number) =>
    entries.filter(l => l.type === "Phép năm" && new Date(l.from).getFullYear() === y);
  // Đơn đã duyệt VÀ đơn đang chờ duyệt đều tính là đã tiêu.
  const consumedIn = (y: number) =>
    sum(annualOfYear(y).filter(l => l.status === "Đã duyệt" || l.status === "Chờ duyệt"));

  // ── Quỹ phép tồn từ năm trước ──
  // Hạn mức TRỌN năm ngoái = tích luỹ tính tới 31/12 năm ngoái, trừ đi số đã tiêu.
  // Người vào việc trong năm nay thì getAccruedBaseLeave trả 0 -> tự khắc không có tồn.
  let carryPool = 0;
  if (!isConcurrent && !hasOverride) {
    const endOfLastYear = new Date(year - 1, 11, 31);
    const lastYearQuota =
      getAccruedBaseLeave(emp, endOfLastYear) +
      Math.floor(getTenureYears(emp, endOfLastYear) / 5);
    carryPool = Math.max(0, lastYearQuota - consumedIn(year - 1));
  }

  const thisYear = annualOfYear(year);
  const used = sum(thisYear.filter(l => l.status === "Đã duyệt"));
  const pending = sum(thisYear.filter(l => l.status === "Chờ duyệt"));

  // QUAN TRỌNG: quỹ cũ chỉ bù cho ngày nghỉ RƠI VÀO quý I. Ngày nghỉ tháng 6 mà
  // vẫn được quỹ cũ gánh thì quỹ đó có xoá đâu — nó sống hết năm.
  const isConsumed = (l: LeaveEntry) => l.status === "Đã duyệt" || l.status === "Chờ duyệt";
  const inCarryWindow = (l: LeaveEntry) =>
    new Date(l.from).getMonth() + 1 <= CARRY_OVER_LAST_MONTH;
  const consumedInWindow = sum(thisYear.filter(l => isConsumed(l) && inCarryWindow(l)));
  const consumedAfterWindow = sum(thisYear.filter(l => isConsumed(l) && !inCarryWindow(l)));

  // Trừ phép cũ trước: trong quý I, tiêu tới đâu ăn vào quỹ cũ tới đó; vượt quá
  // mới ăn sang phép năm nay. Ngày nghỉ ngoài quý I luôn ăn thẳng phép năm nay.
  const carryUsed = Math.min(consumedInWindow, carryPool);
  const spentFromNew = (consumedInWindow - carryUsed) + consumedAfterWindow;

  // Qua 1/4 quỹ cũ hết hiệu lực: phần DƯ bị cắt, phần ĐÃ TIÊU trong quý I vẫn
  // được ghi nhận nên không bị tính lại vào phép năm nay.
  const carryStillValid = month <= CARRY_OVER_LAST_MONTH;
  const carry = carryStillValid ? carryPool : 0;
  const carryLeft = carryStillValid ? Math.max(0, carryPool - carryUsed) : 0;

  return {
    base: isConcurrent ? 0 : base,
    senior: isConcurrent ? 0 : senior,
    carry,
    carryLeft,
    total: accrued + carry,
    used,
    pending,
    remaining: Math.max(0, accrued - spentFromNew) + carryLeft,
    isConcurrent,
    hasOverride,
    tenureStr: getTenureStr(emp, ref),
  };
};
