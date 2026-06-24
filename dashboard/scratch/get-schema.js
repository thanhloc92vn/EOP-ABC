const fs = require('fs');

async function main() {
  console.log("=== FETCHING POSTGREST SCHEMA ===");
  
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

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const data = await res.json();
    console.log("Tables:", Object.keys(data.paths));
    
    // Look at contracts paths
    const contractsPath = data.paths['/contracts'];
    if (contractsPath) {
      console.log("Contracts parameters:");
      const getParams = contractsPath.get.parameters;
      const columns = getParams.filter(p => p.in === 'query' && !['select', 'order', 'limit', 'offset', 'on_conflict'].includes(p.name));
      console.log(columns.map(c => `${c.name}: ${c.type} (${c.description || ''})`));
    } else {
      console.log("No contracts path in schema!");
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
