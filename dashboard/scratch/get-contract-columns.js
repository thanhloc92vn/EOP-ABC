const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = "";
let supabaseAnonKey = "";
const envPath = "d:/Antigravity/PM - HCNS - TNEC/dashboard/.env.local";
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log("=== CREATING DUMMY EMPLOYEE & INSERTING DUMMY CONTRACT TO DISCOVER COLUMNS ===");
  
  // 1. Create a dummy employee
  const dummyEmp = {
    name: "DUMMY FOR COLUMN DISCOVERY",
    department: "Chưa xếp phòng",
    status: "Thử việc"
  };
  
  const { data: empData, error: empErr } = await supabase
    .from('employees')
    .insert([dummyEmp])
    .select();
    
  if (empErr) {
    console.error("Error inserting dummy employee:", empErr);
    return;
  }
  
  const employee = empData[0];
  console.log("Dummy Employee created with ID:", employee.id);
  console.log("Employee columns:", Object.keys(employee));
  
  // 2. Create a dummy contract
  const dummyContract = {
    employee_id: employee.id,
    contract_number: "DUMMY-123",
    type: "Thử việc"
  };
  
  const { data: contractData, error: contractErr } = await supabase
    .from('contracts')
    .insert([dummyContract])
    .select();
    
  if (contractErr) {
    console.error("Error inserting dummy contract:", contractErr);
  } else {
    const contract = contractData[0];
    console.log("Dummy Contract inserted successfully!");
    console.log("Contracts table columns:");
    console.log(JSON.stringify(Object.keys(contract), null, 2));
    console.log("Full contract object:", contract);
    
    // Clean up contract
    await supabase.from('contracts').delete().eq('id', contract.id);
  }
  
  // Clean up employee
  await supabase.from('employees').delete().eq('id', employee.id);
  console.log("Cleaned up dummy employee and contract.");
}

main();
