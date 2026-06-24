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
  console.log('Inserting test candidate...');
  const { data, error } = await supabase
    .from('candidates')
    .insert([{
      name: "Lê Tuấn Kha",
      email: "test@example.com",
      phone: "0123456789",
      education: "Đại học",
      major: "Chuyên viên",
      experience: "9 năm",
      last_position: "Chuyên viên",
      last_company: "Công ty cũ",
      region: "TP.HCM",
      department: "An toàn lao động",
      role: "Chuyên viên an toàn lao động",
      status: "screening",
      v1_date: new Date().toLocaleDateString('sv-SE'),
      source: "Khác",
      reviewer: "AI Auto",
      ai_score: 85,
      ai_recommendation: "Pass CV",
      ai_analysis: "Tốt"
    }])
    .select();

  if (error) {
    console.error('Error inserting candidate:', error);
  } else {
    console.log('Success inserting candidate:', data);
  }
}

main().catch(console.error);
