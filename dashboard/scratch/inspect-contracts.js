const fs = require('fs');

async function main() {
  console.log("=== SENDING OPTIONS REQUEST TO CONTRACTS ===");
  
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
    const res = await fetch(`${supabaseUrl}/rest/v1/contracts`, {
      method: "OPTIONS",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const contentType = res.headers.get("content-type");
    console.log("Content-Type:", contentType);
    
    // Read body
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log("Body text:", text);
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
