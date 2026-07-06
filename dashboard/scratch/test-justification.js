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
  console.log('Inserting test justification record...');
  const testRecord = {
    date: '2026-06-25',
    name: 'Phạm Thành Lộc',
    department: 'Phòng HCNS',
    reason: 'Chạy thử nghiệm hệ thống giải trình mới',
    propose: 'Checkout 17:00',
    approver: 'Lại Nguyễn Lan Phương',
    status: 'Chờ duyệt'
  };

  const { data: insertData, error: insertError } = await supabase
    .from('attendance_justifications')
    .insert([testRecord])
    .select();

  if (insertError) {
    console.error('Error inserting record:', insertError.message);
    process.exit(1);
  }

  const inserted = insertData[0];
  console.log('Successfully inserted record:', inserted);

  console.log('Toggling status to "Đã duyệt"...');
  const { data: updateData, error: updateError } = await supabase
    .from('attendance_justifications')
    .update({ status: 'Đã duyệt' })
    .eq('id', inserted.id)
    .select();

  if (updateError) {
    console.error('Error updating status:', updateError.message);
    process.exit(1);
  }

  console.log('Successfully updated status:', updateData[0]);

  console.log('Cleaning up (deleting test record)...');
  const { error: deleteError } = await supabase
    .from('attendance_justifications')
    .delete()
    .eq('id', inserted.id);

  if (deleteError) {
    console.error('Error deleting test record:', deleteError.message);
  } else {
    console.log('Test completed successfully and cleanup done!');
  }
}

main().catch(console.error);
