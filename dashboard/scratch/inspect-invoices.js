const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const projectEnvPath = '.env.local';
let supabaseUrl = '';
let supabaseAnonKey = '';

if (fs.existsSync(projectEnvPath)) {
  const env = fs.readFileSync(projectEnvPath, 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data: invoices, error } = await supabase.from('invoices').select('*');
  if (error) {
    console.error(error);
    return;
  }
  console.log(`Total invoices: ${invoices.length}`);
  invoices.forEach(inv => {
    console.log(JSON.stringify({
      id: inv.id,
      number: inv.number,
      date: inv.date,
      description: inv.description,
      amount: inv.amount,
      beneficiary_name: inv.beneficiary_name,
      project_name: inv.project_name
    }));
  });
}

main();
