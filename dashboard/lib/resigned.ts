// ============================================================
// CỜ "ĐÃ NGHỈ VIỆC" cho các dòng đọc từ view `employees_directory`.
//
// Nguồn chuẩn là cột `is_resigned` do view tính sẵn (migration 031): nó dò cả
// `status` LẪN `notes` ở phía server, trong khi view cố ý không trả `notes` ra
// ngoài (PII — migration 011). Rất nhiều hồ sơ cũ chỉ đánh dấu nghỉ việc ở cột
// Ghi chú, nên tự dò `status` ở client sẽ bỏ sót.
//
// VÌ SAO KHÔNG lọc thẳng bằng `.eq("is_resigned", false)` trên truy vấn:
// nếu tenant nào chưa chạy migration 031 thì cột không tồn tại -> PostgREST trả
// lỗi -> danh sách rỗng, ô chọn người trắng trơn mà không rõ nguyên nhân. Đọc cả
// dòng rồi lọc ở client thì thiếu cột chỉ làm cờ `undefined`, và ta quay về cách
// dò `status` như trước. Cùng cách trang chủ (app/page.tsx) đang làm.
// ============================================================

export function isResignedRow(e: any): boolean {
  if (e?.is_resigned !== undefined && e?.is_resigned !== null) return !!e.is_resigned;
  return String(e?.status || "").toLowerCase().includes("nghỉ việc");
}
