const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://eepzfmogumogmcbqzkvz.supabase.co', 'sb_publishable_d-U0nfrPjeWSwg32OcP__A_6L3fp1OZ');
async function test() {
  const { data, error } = await supabase.from('attendance_imports').select('*').limit(1);
  console.log('Data:', data);
  console.log('Error:', error);
}
test();
