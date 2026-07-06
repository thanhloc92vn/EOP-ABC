// Unit test bộ định tuyến + tách từ khóa + phát hiện tháng của ai-search
// (bản sao logic từ route.ts) — Chạy: node scratch/test-router-logic.js
const ROUTE_PATTERNS = {
  employees: "nhân sự|nhan su|nhân viên|nhan vien|phòng ban|phong ban|cccd|địa chỉ|dia chi|email|sđt|số điện thoại|so dien thoai|đội ngũ|doi ngu|ai là|nhân lực|nhan luc|cán bộ|can bo|cbnv|danh sách nv|học vấn|bằng cấp|ngày sinh|sinh nhật|giới tính|trưởng phòng|nhân số|biên chế|thử việc|thu viec|chính thức|chinh thuc",
  candidates: "ứng viên|ung vien|tuyển dụng|tuyen dung|phỏng vấn|phong van|cv|hồ sơ|ho so|recruit|candidate|ứng tuyển|nguồn tuyển|điểm ai|cần tuyển",
  tasks: "công việc|cong viec|task|giao việc|giao viec|tiến độ|tien do|deadline|hạn chót|han chot|đang làm|kanban|tồn đọng|hoàn thành|cần làm|nhiệm vụ|nhiem vu|báo cáo công việc|kế hoạch",
  admin: "chi phí|chi phi|ngân sách|ngan sach|văn phòng phẩm|van phong pham|cost|expense|cpql|chi tiêu|chi tieu|tốn|định mức|vpp|khối văn phòng|khoi van phong|hành chính tổng hợp",
  invoices: "hóa đơn|hoa don|invoice|thanh toán|thanh toan|số tiền|so tien|chi trả|chi tra|payment|thụ hưởng|thu huong|beneficiary|chuyển khoản|chuyen khoan",
  suppliers: "nhà cung cấp|nha cung cap|supplier|nhà thầu|nha thau|đối tác|doi tac|vendor|dịch vụ thuê|dich vu thue",
  clerical: "văn thư|van thu|công văn đến|công văn đi|công văn|cong van|văn bản|van ban|tờ trình|to trinh|quyết định|quyet dinh|trích yếu|trich yeu|hđqt|clerical|số văn bản",
  trips: "đi công tác|công tác|cong tac|business trip|chuyến đi|chuyen di|đi tỉnh|di tinh|nơi đến",
  justifications: "giải trình|giai trinh|chấm công|cham cong|quên chấm|quen cham|đi muộn|di muon|về sớm|ve som|justification|nghỉ phép|nghi phep|đơn nghỉ",
  contracts: "hợp đồng lao động|hạn hợp đồng|hợp đồng|hop dong|hđlđ|hdld|bảng lương|bang luong|lương|luong|thu nhập|thu nhap|thuong|thưởng|phụ cấp|phu cap|thử việc|thu viec|chính thức|chinh thuc",
  suggestions: "góp ý|gop y|kiến nghị|kien nghi|ý kiến|y kien|đóng góp|dong gop|phản hồi|phan hoi",
};
const STOPWORDS = new Set([
  "liệt", "kê", "liet", "ke", "danh", "sách", "sach", "cho", "của", "cua", "là", "la",
  "các", "cac", "những", "nhung", "thông", "tin", "thong", "ai", "nào", "nao", "không",
  "khong", "trong", "và", "va", "với", "voi", "có", "co", "bao", "nhiêu", "nhieu",
  "tổng", "tong", "hãy", "hay", "giúp", "giup", "tôi", "toi", "xem", "tìm", "tim",
  "kiếm", "kiem", "về", "ve", "được", "duoc", "bị", "bi", "một", "mot", "này", "nay",
  "đó", "do", "đang", "dang", "sắp", "sap", "thì", "thi", "mà", "ma", "như", "nhu",
  "theo", "tất", "tat", "cả", "ca", "cần", "can", "đi", "ra", "vào", "vao",
  "thế", "the", "sao", "gì", "gi", "thuộc", "thuoc", "phòng", "phong", "ban", "ở", "o",
  "cập", "nhật", "trạng", "thái", "thai", "hiện", "hien", "tại", "tai", "list"
]);

function analyze(query) {
  const q = query.toLowerCase();
  const want = {};
  for (const [k, src] of Object.entries(ROUTE_PATTERNS)) want[k] = new RegExp(src).test(q);
  const anySelected = Object.values(want).some(Boolean);
  if (!anySelected) { want.employees = true; want.tasks = true; }

  const isAggregation = /bao nhiêu|bao nhieu|tổng|tong|thống kê|thong ke|trung bình|trung binh|đếm|\bdem\b|tất cả|tat ca|toàn bộ|toan bo|danh sách|danh sach|liệt kê|liet ke|có ai|co ai|những ai|nhung ai|tình trạng|tinh trang|tổng hợp|tong hop|tỷ lệ|ty le|thống/.test(q);

  const now = new Date();
  let filterMonth = null;
  const mNum = q.match(/th[áa]ng\s*0?(\d{1,2})/);
  if (mNum) { const n = parseInt(mNum[1], 10); if (n >= 1 && n <= 12) filterMonth = n; }
  else if (/th[áa]ng\s*(n[àa]y|hi[eệ]n t[aạ]i)|hi[eệ]n nay|g[aầ]n [đd][âa]y/.test(q)) filterMonth = now.getMonth() + 1;

  let strippedQuery = query;
  for (const src of Object.values(ROUTE_PATTERNS)) strippedQuery = strippedQuery.replace(new RegExp(src, "gi"), " ");
  strippedQuery = strippedQuery
    .replace(/th[áa]ng\s*0?\d{1,2}(\s*[\/\-]\s*20\d{2})?/gi, " ")
    .replace(/n[ăa]m\s*20\d{2}/gi, " ");
  const terms = strippedQuery
    .replace(/[?.,!"'():;]/g, " ")
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, 6);

  const entityMode = !isAggregation && terms.length > 0;
  const tables = Object.entries(want).filter(([, v]) => v).map(([k]) => k);
  return { tables, terms, entityMode, filterMonth, isAggregation };
}

// [câu hỏi, bảng kỳ vọng, kiểm tra thêm (hàm)]
const CASES = [
  ['công văn đến trong tháng 7', 'clerical', r => r.filterMonth === 7 && r.terms.length === 0],
  ['công văn đi tháng 7', 'clerical', r => r.filterMonth === 7 && r.terms.length === 0],
  ['văn bản HĐQT mới nhất', 'clerical', r => r.terms.join(' ').toLowerCase().includes('mới')],
  ['liệt kê danh sách nhân viên phòng hành chính', 'employees', r => !r.entityMode],
  ['sđt của Bùi Nhựt Duy', 'employees', r => r.terms.includes('Duy') && r.entityMode],
  ['sinh nhật tháng 7 có những ai', 'employees', r => r.filterMonth === 7],
  ['sinh nhật tháng này', 'employees', r => r.filterMonth === new Date().getMonth() + 1],
  ['có bao nhiêu ứng viên đã phỏng vấn đạt', 'candidates', r => r.isAggregation],
  ['tổng chi phí văn phòng phẩm quý 1', 'admin', r => r.isAggregation],
  ['hóa đơn thanh toán cho công ty Vĩnh Tân', 'invoices', r => r.terms.includes('Tân')],
  ['hóa đơn tháng 6 năm 2026', 'invoices', r => r.filterMonth === 6],
  ['ai đang đi công tác Ninh Thuận', 'trips', r => r.terms.includes('Ninh')],
  ['đơn giải trình chấm công của Đặng Đình Quyền', 'justifications', r => r.terms.includes('Quyền')],
  ['góp ý kiến nghị mới nhất', 'suggestions', () => true],
  ['hợp đồng của nhân viên nào sắp hết hạn', 'contracts', () => true],
  ['deadline tuần này có gì', 'tasks', () => true],
  ['công việc tháng 6', 'tasks', r => r.filterMonth === 6 && r.terms.length === 0],
  ['thời tiết hôm nay thế nào', 'employees', () => true],
];

let pass = 0;
for (const [query, expectTable, extra] of CASES) {
  const r = analyze(query);
  const ok = r.tables.includes(expectTable) && extra(r);
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'} | "${query}" → bảng=[${r.tables.join(',')}] terms=[${r.terms.join(',')}] tháng=${r.filterMonth} entity=${r.entityMode}`);
}
console.log(`\n${pass}/${CASES.length} PASS`);
