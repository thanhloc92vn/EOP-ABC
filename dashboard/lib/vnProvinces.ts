// ============================================================
// vnProvinces.ts — 34 tỉnh/thành Việt Nam SAU SÁP NHẬP 2025.
// Nguồn: thanglequoc/vietnamese-provinces-database (v3.1.0, cập nhật mới nhất).
// Sinh tự động từ JSON gốc — KHÔNG sửa tay; cập nhật khi có nghị quyết mới.
// ============================================================

export type VnProvince = { code: string; name: string; fullName: string };

export const VN_PROVINCES: VnProvince[] = [
  { code: "01", name: "Hà Nội", fullName: "Thành phố Hà Nội" },
  { code: "04", name: "Cao Bằng", fullName: "Tỉnh Cao Bằng" },
  { code: "08", name: "Tuyên Quang", fullName: "Tỉnh Tuyên Quang" },
  { code: "11", name: "Điện Biên", fullName: "Tỉnh Điện Biên" },
  { code: "12", name: "Lai Châu", fullName: "Tỉnh Lai Châu" },
  { code: "14", name: "Sơn La", fullName: "Tỉnh Sơn La" },
  { code: "15", name: "Lào Cai", fullName: "Tỉnh Lào Cai" },
  { code: "19", name: "Thái Nguyên", fullName: "Tỉnh Thái Nguyên" },
  { code: "20", name: "Lạng Sơn", fullName: "Tỉnh Lạng Sơn" },
  { code: "22", name: "Quảng Ninh", fullName: "Tỉnh Quảng Ninh" },
  { code: "24", name: "Bắc Ninh", fullName: "Tỉnh Bắc Ninh" },
  { code: "25", name: "Phú Thọ", fullName: "Tỉnh Phú Thọ" },
  { code: "31", name: "Hải Phòng", fullName: "Thành phố Hải Phòng" },
  { code: "33", name: "Hưng Yên", fullName: "Tỉnh Hưng Yên" },
  { code: "37", name: "Ninh Bình", fullName: "Tỉnh Ninh Bình" },
  { code: "38", name: "Thanh Hoá", fullName: "Tỉnh Thanh Hoá" },
  { code: "40", name: "Nghệ An", fullName: "Tỉnh Nghệ An" },
  { code: "42", name: "Hà Tĩnh", fullName: "Tỉnh Hà Tĩnh" },
  { code: "44", name: "Quảng Trị", fullName: "Tỉnh Quảng Trị" },
  { code: "46", name: "Huế", fullName: "Thành phố Huế" },
  { code: "48", name: "Đà Nẵng", fullName: "Thành phố Đà Nẵng" },
  { code: "51", name: "Quảng Ngãi", fullName: "Tỉnh Quảng Ngãi" },
  { code: "52", name: "Gia Lai", fullName: "Tỉnh Gia Lai" },
  { code: "56", name: "Khánh Hoà", fullName: "Tỉnh Khánh Hoà" },
  { code: "66", name: "Đắk Lắk", fullName: "Tỉnh Đắk Lắk" },
  { code: "68", name: "Lâm Đồng", fullName: "Tỉnh Lâm Đồng" },
  { code: "75", name: "Đồng Nai", fullName: "Thành phố Đồng Nai" },
  { code: "79", name: "Hồ Chí Minh", fullName: "Thành phố Hồ Chí Minh" },
  { code: "80", name: "Tây Ninh", fullName: "Tỉnh Tây Ninh" },
  { code: "82", name: "Đồng Tháp", fullName: "Tỉnh Đồng Tháp" },
  { code: "86", name: "Vĩnh Long", fullName: "Tỉnh Vĩnh Long" },
  { code: "91", name: "An Giang", fullName: "Tỉnh An Giang" },
  { code: "92", name: "Cần Thơ", fullName: "Thành phố Cần Thơ" },
  { code: "96", name: "Cà Mau", fullName: "Tỉnh Cà Mau" },
];

// Danh sách tên ngắn (dùng cho dropdown/lọc).
export const VN_PROVINCE_NAMES: string[] = VN_PROVINCES.map((p) => p.name);
