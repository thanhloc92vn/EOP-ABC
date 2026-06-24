const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl && fs.existsSync('.env.local')) {
  const env = fs.readFileSync('.env.local', 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const DEFAULT_REPORT_ROWS = [
  { stt: "1", content: "Văn phòng phẩm", category_type: "office" },
  { stt: "2", content: "Photo, in ấn, mực in", category_type: "office" },
  { stt: "2.1", content: "Photo, in ấn, mực in  tại các VP", category_type: "office" },
  { stt: "2.2", content: "Photo, in ấn tài liệu phục vụ chuyên môn", category_type: "office" },
  { stt: "2.3", content: "Thuê máy photo các DA", category_type: "office" },
  { stt: "3", content: "Hóa chất, vật dụng vệ sinh văn phòng", category_type: "office" },
  { stt: "3.1", content: "Hóa chất, vật dụng", category_type: "office" },
  { stt: "3.2", content: "Thuê dịch vụ vệ sinh", category_type: "office" },
  { stt: "4", content: "CP hành chính vp", category_type: "office" },
  { stt: "1", content: "Chi phí CCDC, phần mềm hỗ trợ, đồ dùng phục vụ công tác quản lý (giá trị dưới 10tr.đ)", category_type: "office" },
  { stt: "1.1", content: "Mua sắm  bàn, ghế VP", category_type: "office" },
  { stt: "1.2", content: "Mua sắm đồ trang trí VP", category_type: "office" },
  { stt: "1.3", content: "Mua đồ dùng văn phòng (pin, ổ cắm, trái cây, hoa, ….)", category_type: "office" },
  { stt: "1.4", content: "Chi phí mua bánh, trái cây tổ chức lễ 08/03", category_type: "office" },
  { stt: "1.5", content: "Hoa tặng, trái cây, hoa lễ khỏi công", category_type: "office" },
  { stt: "1.6", content: "Cúng tất niên, khai trương, thần tài", category_type: "office" },
  { stt: "1.7", content: "Chi phí in tem nhãn", category_type: "office" },
  { stt: "1.8", content: "Chi phí pickle ball", category_type: "office" },
  { stt: "19", content: "Chi phí di chuyển trang thiết bị làm việc", category_type: "office" },
  { stt: "20", content: "Làm móc khóa, quà tặng tuyển dụng", category_type: "office" },
  { stt: "2", content: "Sự kiện sinh nhật 18 TNEC", category_type: "office" },
  { stt: "2.1", content: "Chi phí sảnh tiệc", category_type: "office" },
  { stt: "2.2", content: "Tổ chức sự kiện", category_type: "office" },
  { stt: "2.3", content: "Quà tặng", category_type: "office" },
  { stt: "2.4", content: "Thuê phòng cho BLĐ (Mr Phát & Mr Hùng)", category_type: "office" },
  { stt: "1", content: "Chi phí VMB", category_type: "office" },
  { stt: "1.1", content: "Chi phí VMB", category_type: "office" },
  { stt: "1.2", content: "Thuê xe, taxi", category_type: "office" },
  { stt: "3", content: "Thuê nhà, văn phòng làm việc", category_type: "office" },
  { stt: "3.1", content: "Chi phí cho PGĐ", category_type: "office" },
  { stt: "3.1.1", content: "Thuê nhà cho PGĐ", category_type: "office" },
  { stt: "3.1.2", content: "Tiền điện , nước", category_type: "office" },
  { stt: "3.1.3", content: "Di chuyển", category_type: "office" },
  { stt: "3.2", content: "Thuê VP HCM  + phí quản lý", category_type: "office" },
  { stt: "4", content: "Chi phí điện vp + phí gửi xe (xe máy + xe ô tô)", category_type: "office" },
  { stt: "5", content: "Chi phí nước (nước uống)", category_type: "office" },
  { stt: "6.2", content: "Chuyển phát nhanh", category_type: "office" },
  { stt: "7", content: "Xăng dầu, cầu phà, bến bãi xe ô tô con", category_type: "office" },
  { stt: "7.1", content: "Phí gửi xe, rửa xe và các chi phí khác", category_type: "office" },
  { stt: "7.2", content: "Nhiên liệu", category_type: "office" },
  { stt: "8", content: "Chi phí sửa chữa, bảo dưỡng ô tô", category_type: "office" },
  { stt: "9", content: "Thuê xe ô tô hàng tháng", category_type: "office" },
  { stt: "10", content: "Chi phí đăng kiểm, phí đường bộ XMTB", category_type: "office" },
  { stt: "11", content: "Chi phí mua quà tặng đối tác khách hàng", category_type: "office" },
  { stt: "12", content: "Dự án Cà Ná", category_type: "project" },
  { stt: "12.1", content: "Mua sắm CCDC, thiết bị cho VP làm việc", category_type: "project" },
  { stt: "13", content: "RẠCH XUYÊN TÂM", category_type: "project" },
  { stt: "13.1", content: "Cúng chặt cây tại dự án", category_type: "project" },
  { stt: "13.2", content: "Tivi 55 inch + giá treo", category_type: "project" },
  { stt: "13.3", content: "Cab HDMI 10m", category_type: "project" },
  { stt: "14", content: "Dự án Cống âu thuyền Vàm Lẽo", category_type: "project" },
  { stt: "14.1", content: "Mời cơm Khách tham gia Lễ khởi công", category_type: "project" },
  { stt: "14.2", content: "Chi phí hậu cần Lễ khởi công", category_type: "project" },
  { stt: "14.3", content: "Kệ hoa chúc mừng Lễ Khởi Công", category_type: "project" },
  { stt: "14.4", content: "CP thuê nhà +nước sinh hoạt", category_type: "project" },
  { stt: "14.5", content: "Chi phí thuê đơn vị tổ chức sự kiện Lễ khởi công", category_type: "project" },
  { stt: "14.6", content: "CP cho TVGS", category_type: "project" },
  { stt: "15", content: "DA Tỉnh lộ  8", category_type: "project" },
  { stt: "15.1", content: "Làm con dấu tròn BĐH", category_type: "project" },
  { stt: "16", content: "DA Trà Vinh", category_type: "project" },
  { stt: "16.1", content: "Flycam Mini 2 Combo + thẻ nhớ 64Gb", category_type: "project" },
  { stt: "17", content: "DA XLNT Tây Ninh", category_type: "project" },
  { stt: "17.1", content: "Tiền thuê nhà BĐH", category_type: "project" }
];

async function main() {
  console.log('Clearing existing report rows...');
  const { error: deleteErr } = await supabase
    .from('admin_monthly_reports')
    .delete()
    .neq('stt', 'FORCE_DELETE_ALL_MARKER'); // deletes all rows

  if (deleteErr) {
    console.error('Error clearing table:', deleteErr);
    return;
  }

  console.log(`Seeding ${DEFAULT_REPORT_ROWS.length} rows...`);
  const seedPayload = DEFAULT_REPORT_ROWS.map(row => ({
    stt: row.stt,
    content: row.content,
    category_type: row.category_type,
    is_custom: false,
    m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0,
    notes: ""
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from('admin_monthly_reports')
    .insert(seedPayload)
    .select();

  if (insertErr) {
    console.error('Error seeding:', insertErr);
  } else {
    console.log(`Successfully seeded ${inserted.length} rows!`);
  }
}

main().catch(console.error);
