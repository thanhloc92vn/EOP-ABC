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
  console.log("--- FETCHING ALL TASKS ---");
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, assignee, start_date')
    .limit(100);

  if (error) {
    console.error("Error fetching tasks:", error);
    return;
  }

  console.log(`Total tasks found: ${data.length}`);
  data.forEach((t, i) => {
    console.log(`[${i+1}] ID: ${t.id} | Title: ${t.title} | Status: ${t.status} | Assignee: ${t.assignee}`);
  });
}

main().catch(console.error);
