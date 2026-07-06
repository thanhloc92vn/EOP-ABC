// Chẩn đoán: các bảng AI-search truy vấn có trả dữ liệu với ANON KEY không (RLS check)
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join('D:\\Antigravity\\PM - HCNS - TNEC\\dashboard', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const get = (k) => {
  const m = env.match(new RegExp(k + '=([^\r\n]*)'));
  return m ? m[1].trim().replace(/['"]/g, '') : null;
};
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const service = get('SUPABASE_SERVICE_ROLE_KEY');
console.log('URL:', url ? 'OK' : 'MISSING', '| ANON:', anon ? 'OK' : 'MISSING', '| SERVICE:', service ? 'OK' : 'MISSING');
console.log('OPENAI_API_KEY in env:', get('OPENAI_API_KEY') ? 'OK' : 'MISSING');

const tables = [
  'employees', 'tasks', 'attendance_justifications', 'candidates',
  'admin_monthly_reports', 'invoices', 'suppliers', 'clerical_documents',
  'business_trips', 'contracts', 'suggestions'
];

async function probe(label, client) {
  console.log('\n=== ' + label + ' ===');
  for (const t of tables) {
    try {
      const { data, error, count } = await client.from(t).select('*', { count: 'exact', head: false }).limit(1);
      if (error) console.log(t.padEnd(28), 'ERROR:', error.message);
      else console.log(t.padEnd(28), 'rows visible:', count === null ? (data ? data.length : 0) : count);
    } catch (e) {
      console.log(t.padEnd(28), 'EXCEPTION:', e.message);
    }
  }
}

(async () => {
  await probe('ANON KEY (fallback khi không có token)', createClient(url, anon));
  if (service) await probe('SERVICE ROLE (toàn quyền, để so sánh)', createClient(url, service));
})();
