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
  console.log('Inserting test record for delete verification...');
  const testRecord = {
    date: '2026-06-25',
    name: 'Phạm Thành Lộc',
    department: 'Phòng HCNS',
    reason: 'Test delete function',
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
  console.log('Record inserted:', inserted.id);

  console.log('Deleting record using id...');
  const { data: deleteData, error: deleteError } = await supabase
    .from('attendance_justifications')
    .delete()
    .eq('id', inserted.id)
    .select();

  if (deleteError) {
    console.error('Error deleting record:', deleteError.message);
    process.exit(1);
  }

  console.log('Delete successful!');
}

main().catch(console.error);
