const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = '';
let supabaseAnonKey = '';

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase URL or key!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const email = `temp_${Math.floor(Math.random() * 100000)}@trungnamgroup.com.vn`;
  const password = 'TemporaryPassword123!';
  
  console.log(`Trying to sign up user: ${email}...`);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password
  });
  
  if (signUpError) {
    console.error('Sign up error:', signUpError.message);
    return;
  }
  
  console.log('Sign up successful! JWT Token acquired.');
  
  // The client automatically stores the session and applies it to subsequent queries
  console.log('Querying employees table using the authenticated session...');
  const { data: emps, error: empsError } = await supabase
    .from('employees')
    .select('*')
    .order('name', { ascending: true });
    
  if (empsError) {
    console.error('Query error:', empsError.message);
  } else {
    console.log(`Success! Total employees found: ${emps.length}`);
    emps.forEach((e, idx) => {
      console.log(`[${idx+1}] Code: ${e.employee_code} | Name: ${e.name} | DOB: ${e.date_of_birth} | Dept: ${e.department} | Role: ${e.role}`);
    });
  }
}

main().catch(console.error);
