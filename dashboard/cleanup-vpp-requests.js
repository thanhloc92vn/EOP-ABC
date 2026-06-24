const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let supabaseUrl = '';
let supabaseAnonKey = '';

try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.includes('NEXT_PUBLIC_SUPABASE_URL')) {
      supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
    }
    if (line.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')) {
      supabaseAnonKey = line.split('=')[1].trim().replace(/['"]/g, '');
    }
  }
} catch (e) {
  console.error("Error reading .env.local file:", e);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log("--- STARTING VPP STATUS MIGRATION ---");
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .ilike('title', 'VPP:%');
  
  if (error) {
    console.error("Error querying tasks:", error);
    return;
  }
  
  console.log(`Found ${data.length} records matching VPP:%`);
  let updatedCount = 0;

  for (const task of data) {
    let newStatus = task.status;
    let notesChanged = false;
    let notesObj = {};

    try {
      if (task.notes) {
        notesObj = JSON.parse(task.notes);
      }
    } catch (e) {
      console.warn(`Could not parse notes for task ID ${task.id}:`, task.notes);
    }

    if (!notesObj.frequency) {
      notesObj.frequency = "Cấp phát";
      notesChanged = true;
    }

    if (task.status === 'pending_approval') {
      newStatus = 'Chờ duyệt';
    } else if (task.status === 'completed') {
      newStatus = 'Hoàn thành';
    }

    if (newStatus !== task.status || notesChanged) {
      console.log(`Updating Task ID ${task.id} (${task.title}):`);
      console.log(`  - Status: "${task.status}" -> "${newStatus}"`);
      if (notesChanged) {
        console.log(`  - Notes: Adding frequency: "Cấp phát"`);
      }

      const { error: updateErr } = await supabase
        .from('tasks')
        .update({
          status: newStatus,
          notes: JSON.stringify(notesObj)
        })
        .eq('id', task.id);

      if (updateErr) {
        console.error(`  - Update error for ID ${task.id}:`, updateErr.message);
      } else {
        updatedCount++;
      }
    }
  }

  console.log(`--- MIGRATION FINISHED: Updated ${updatedCount} VPP tasks ---`);
}

main().catch(console.error);
