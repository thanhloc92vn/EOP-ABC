// Mô phỏng logic "đã tuyển trong tháng" mới (NHẬN + onboard DD/MM/YYYY) trên dữ liệu thật
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => { const m = env.match(new RegExp('^' + k + '=([^\r\n]*)', 'm')); return m ? m[1].trim().replace(/['"]/g, '') : null; };
const supabase = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('NEXT_PUBLIC_SUPABASE_ANON_KEY'));

const parseDateUI = (dStr) => {
  if (!dStr) return null;
  let m = String(dStr).match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = String(dStr).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
};

(async () => {
  const { data } = await supabase.from('candidates').select('name, department, probation_result, onboard_date');
  for (const month of ['2026-06', '2026-07']) {
    const hired = data.filter(c => {
      const res = String(c.probation_result || '').toUpperCase().trim();
      if (res !== 'NHẬN' && res !== 'ĐẠT') return false;
      const d = parseDateUI(c.onboard_date || '');
      if (!d) return false;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month;
    });
    console.log(`\n=== Tháng ${month}: ${hired.length} đã tuyển ===`);
    hired.forEach(c => console.log(' -', c.name, '|', c.department, '| onboard', c.onboard_date));
  }
})();
