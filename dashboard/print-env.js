console.log("Environment variables starting with SUPABASE or NEXT_PUBLIC:");
for (const key in process.env) {
  if (key.startsWith("SUPABASE") || key.startsWith("NEXT_PUBLIC")) {
    console.log(`${key}: ${process.env[key] ? 'Defined (length ' + process.env[key].length + ')' : 'Undefined'}`);
  }
}
