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
  console.log("--- SEARCHING ALL TASKS FOR VPP CATALOG OR NOTES ---");
  const { data, error } = await supabase
    .from('tasks')
    .select('*');

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Total tasks: ${data.length}`);
  data.forEach((t, i) => {
    console.log(`[${i+1}] Title: "${t.title}" | Assignee: "${t.assignee}" | Status: "${t.status}" | Notes length: ${t.notes ? t.notes.length : 0}`);
    if (t.notes && t.notes.includes("Bút highlight")) {
      console.log(`   --> FOUND "Bút highlight" in notes of task ID ${t.id}!`);
    }
  });
}

main().catch(console.error);
