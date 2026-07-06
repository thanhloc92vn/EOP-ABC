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

async function main() {
  console.log('1. Kiểm tra bảng resource_bookings...');
  const { data, error } = await supabase.from('resource_bookings').select('*').limit(3);
  if (error) {
    console.error('   ❌ Lỗi:', error.message);
  } else {
    console.log(`   ✅ Bảng tồn tại. Số dòng mẫu: ${data.length}`);
  }

  console.log('2. Kiểm tra cột can_approve_booking + quyền chị Quỳnh...');
  const { data: perms, error: permErr } = await supabase
    .from('approval_permissions')
    .select('name, email, can_approve_booking');
  if (permErr) {
    console.error('   ❌ Lỗi:', permErr.message);
  } else {
    console.log('   ✅ Danh sách phân quyền:');
    perms.forEach(p => console.log(`      - ${p.name} <${p.email}> can_approve_booking=${p.can_approve_booking}`));
    const quynh = perms.find(p => (p.name || '').toLowerCase().includes('quỳnh') && p.can_approve_booking);
    console.log(quynh ? `   ✅ Chị Quỳnh đã có quyền duyệt cuối: ${quynh.name}` : '   ⚠️ CHƯA thấy dòng nào tên Quỳnh có can_approve_booking=true!');
  }

  console.log('3. Thử insert + delete 1 booking test...');
  const { data: ins, error: insErr } = await supabase.from('resource_bookings').insert([{
    booking_type: 'phong_hop',
    resource_name: 'Phòng họp nhỏ',
    host_name: '__TEST__',
    requester_name: '__TEST__',
    requester_email: 'test@test.local',
    department: 'HCNS',
    start_time: new Date(Date.now() + 86400000).toISOString(),
    end_time: new Date(Date.now() + 90000000).toISOString(),
    content: 'Test insert - sẽ xoá ngay',
    attendees: ['__TEST__'],
    attendee_count: 1,
    participant_type: 'noi_bo',
    status: 'pending_manager',
  }]).select();
  if (insErr) {
    console.error('   ❌ Insert lỗi:', insErr.message);
  } else {
    console.log('   ✅ Insert OK, id =', ins[0].id);
    const { error: delErr } = await supabase.from('resource_bookings').delete().eq('id', ins[0].id);
    console.log(delErr ? `   ❌ Delete lỗi: ${delErr.message}` : '   ✅ Đã xoá dòng test.');
  }
}

main().catch(console.error);
