// Test end-to-end API /api/ai-search — mô phỏng đúng request từ Header.tsx
// Cách dùng: node scratch/test-ai-search.js "<câu hỏi>" [--token <supabase_access_token>]
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const m = env.match(new RegExp(k + '=([^\r\n]*)'));
  return m ? m[1].trim().replace(/['"]/g, '') : null;
};

const args = process.argv.slice(2);
const tokenIdx = args.indexOf('--token');
const token = tokenIdx >= 0 ? args[tokenIdx + 1] : (process.env.SB_TOKEN || null);
const isDebug = args.includes('--debug');
const query = args.filter((a, i) => a !== '--debug' && i !== tokenIdx && i !== (tokenIdx >= 0 ? tokenIdx + 1 : -1)).join(' ') || 'liệt kê danh sách nhân viên';

// OpenAI key lấy từ config.json gốc project (giống cách simulate_api.js dùng)
const path = require('path');
let openaiKey = null;
try {
  openaiKey = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config.json'), 'utf8')).openai_api_key;
} catch (e) {}

const currentUser = {
  email: 'test@tnec.vn',
  name: 'Nhân Viên Test',
  role: 'Nhân viên',
  department: 'Hành chính',
  isAdmin: false
};

(async () => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-supabase-auth'] = token;
  if (openaiKey) headers['Authorization'] = 'Bearer ' + openaiKey;
  console.log('>>> QUERY:', query);
  console.log('>>> TOKEN:', token ? 'CÓ (authenticated)' : 'KHÔNG (anon fallback)');
  const t0 = Date.now();
  const res = await fetch('http://localhost:3000/api/ai-search', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, history: [], currentUser, debug: isDebug })
  });
  const data = await res.json();
  console.log('>>> STATUS:', res.status, '| thời gian:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  if (data.debug) {
    console.log('>>> IDENTITY:', JSON.stringify(data.identity));
    console.log('>>> ROUTER:', JSON.stringify(data.router));
    console.log('>>> ROW COUNTS:', JSON.stringify(data.rowCounts));
    console.log('>>> CONTEXT (' + data.contextChars + ' ký tự):\n' + data.context.slice(0, 3000));
  } else {
    console.log('>>> ANSWER:\n', data.answer || data.error);
  }
})();
