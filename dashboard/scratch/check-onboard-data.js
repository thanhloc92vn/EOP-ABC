// Soi dữ liệu probation_result + onboard_date thật để cấu hình đếm "đã tuyển trong tháng"
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => { const m = env.match(new RegExp('^' + k + '=([^\r\n]*)', 'm')); return m ? m[1].trim().replace(/['"]/g, '') : null; };
const supabase = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('NEXT_PUBLIC_SUPABASE_ANON_KEY'));

(async () => {
  const { data, error } = await supabase.from('candidates')
    .select('name, department, probation_result, onboard_date, v2_result, status');
  if (error) { console.error(error.message); return; }
  console.log('Tổng ứng viên:', data.length);

  const probVals = {};
  data.forEach(c => { const k = JSON.stringify(c.probation_result); probVals[k] = (probVals[k] || 0) + 1; });
  console.log('\nGiá trị probation_result:', probVals);

  const withOnboard = data.filter(c => c.onboard_date);
  console.log('\nCó onboard_date:', withOnboard.length);
  const fmts = {};
  withOnboard.forEach(c => {
    const s = String(c.onboard_date);
    const f = /^\d{4}-\d{2}-\d{2}/.test(s) ? 'YYYY-MM-DD' : /^\d{1,2}\/\d{1,2}\/\d{4}/.test(s) ? 'DD/MM/YYYY' : 'KHÁC: ' + s;
    fmts[f] = (fmts[f] || 0) + 1;
  });
  console.log('Định dạng onboard_date:', fmts);

  console.log('\n— Ứng viên có onboard_date (kèm kết quả nhận việc) —');
  withOnboard.slice(0, 30).forEach(c => console.log(
    (c.onboard_date + '').padEnd(12), '| prob=' + String(c.probation_result).padEnd(14), '| v2=' + String(c.v2_result).padEnd(6), '|', c.department, '|', c.name
  ));
})();
