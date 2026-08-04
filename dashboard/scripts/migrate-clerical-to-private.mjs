// ============================================================
// CHUYỂN TỆP CÔNG VĂN TỪ KHO CÔNG KHAI SANG KHO RIÊNG TƯ
//
// Chạy MỘT LẦN sau khi đã chạy migrations/024_clerical_private_bucket.sql.
//
// Việc script làm, theo đúng thứ tự an toàn:
//   1. Tìm mọi dòng clerical_documents còn trỏ vào .../object/public/clerical-documents/
//   2. Tải tệp từ kho công khai về, đẩy lên kho riêng tư `clerical-private`
//   3. Cập nhật CSDL sang dạng "private:<đường dẫn>"
//   4. (chỉ khi có cờ --delete-source) xoá tệp gốc bên kho công khai
//
// BƯỚC 4 TÁCH RIÊNG CÓ CHỦ Ý: chạy lượt đầu không xoá gì cả, vào ứng dụng bấm
// thử vài công văn xem mở được không, ĐẠT rồi mới chạy lượt hai kèm
// --delete-source. Xoá trước mà bước 2 lỗi thì mất tệp thật, không lấy lại được.
//
// CÁCH CHẠY (đứng trong thư mục `dashboard`):
//
//   1) Lấy service role key: Supabase Dashboard > Project Settings > API >
//      "service_role secret". ĐÂY LÀ KHOÁ TOÀN QUYỀN — chỉ dán vào cửa sổ dòng
//      lệnh này, tuyệt đối không commit, không đưa vào .env.local của ứng dụng.
//
//   2) Thử trước, không đụng gì:
//        SUPABASE_SERVICE_ROLE_KEY="<khoá>" node scripts/migrate-clerical-to-private.mjs --dry-run
//
//   3) Chuyển thật (vẫn giữ tệp gốc):
//        SUPABASE_SERVICE_ROLE_KEY="<khoá>" node scripts/migrate-clerical-to-private.mjs
//
//   4) Kiểm tra trên ứng dụng, ổn rồi mới dọn kho công khai:
//        SUPABASE_SERVICE_ROLE_KEY="<khoá>" node scripts/migrate-clerical-to-private.mjs --delete-source
//
// Chạy lại nhiều lần được: dòng đã chuyển sẽ bị bỏ qua ở lượt sau.
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const PUBLIC_BUCKET = "clerical-documents";
const PRIVATE_BUCKET = "clerical-private";
const PUBLIC_MARKER = `/object/public/${PUBLIC_BUCKET}/`;

const dryRun = process.argv.includes("--dry-run");
const deleteSource = process.argv.includes("--delete-source");

// ─── Lấy cấu hình: ưu tiên biến môi trường, thiếu thì đọc .env.local ───
function readEnvLocal(key) {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const line = text.split(/\r?\n/).find((l) => l.trim().startsWith(`${key}=`));
    return line ? line.slice(line.indexOf("=") + 1).trim() : "";
  } catch {
    return "";
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || readEnvLocal("NEXT_PUBLIC_SUPABASE_URL");
// Khoá đọc từ biến môi trường, hoặc từ .env.local (tệp này đã nằm trong
// .gitignore nên không bị commit). Không có tiền tố NEXT_PUBLIC_ nên Next.js
// KHÔNG nhúng nó vào mã chạy ở trình duyệt.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvLocal("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL (không có biến môi trường, cũng không đọc được .env.local).");
  process.exit(1);
}
if (!serviceKey) {
  console.error(
    "Thiếu SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Cách 1 — thêm vào tệp dashboard/.env.local một dòng:\n" +
      "    SUPABASE_SERVICE_ROLE_KEY=<khoá service_role>\n" +
      "Cách 2 — đặt biến môi trường rồi chạy (PowerShell):\n" +
      '    $env:SUPABASE_SERVICE_ROLE_KEY = "<khoá>"\n' +
      "    node scripts/migrate-clerical-to-private.mjs --dry-run"
  );
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

/** ".../object/public/clerical-documents/1785_abc.pdf" -> "1785_abc.pdf" */
function pathFromPublicUrl(url) {
  const i = url.indexOf(PUBLIC_MARKER);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + PUBLIC_MARKER.length).split("?")[0]);
}

async function main() {
  console.log(`Nguồn : ${supabaseUrl}`);
  console.log(`Chế độ: ${dryRun ? "THỬ (không ghi gì)" : deleteSource ? "DỌN KHO CÔNG KHAI" : "CHUYỂN KHO (giữ tệp gốc)"}\n`);

  const { data: rows, error } = await db
    .from("clerical_documents")
    .select("id, file_name, scan_file_url, original_file_url");

  if (error) {
    console.error("Không đọc được bảng clerical_documents:", error.message);
    process.exit(1);
  }

  const affected = (rows || []).filter(
    (r) => (r.scan_file_url || "").includes(PUBLIC_MARKER) || (r.original_file_url || "").includes(PUBLIC_MARKER)
  );

  console.log(`Tổng số công văn        : ${rows?.length ?? 0}`);
  console.log(`Còn ở kho công khai     : ${affected.length}\n`);

  if (affected.length === 0) {
    console.log("Không còn gì để chuyển. Xong.");
    return;
  }

  // Nhiều dòng có thể trỏ chung một tệp (hệ thống điền cả scan lẫn bản gốc
  // cùng một URL) -> gom theo đường dẫn để không tải/đẩy trùng.
  const paths = new Set();
  for (const r of affected) {
    for (const v of [r.scan_file_url, r.original_file_url]) {
      const p = v && v.includes(PUBLIC_MARKER) ? pathFromPublicUrl(v) : null;
      if (p) paths.add(p);
    }
  }
  console.log(`Số tệp riêng biệt       : ${paths.size}\n`);

  let copied = 0;
  let skipped = 0;
  let failed = 0;
  const movedOk = new Set();

  for (const path of paths) {
    if (dryRun) {
      console.log(`  [thử] ${path}`);
      movedOk.add(path);
      continue;
    }

    if (deleteSource) {
      const { error: delErr } = await db.storage.from(PUBLIC_BUCKET).remove([path]);
      if (delErr) {
        console.error(`  LỖI xoá  ${path}: ${delErr.message}`);
        failed++;
      } else {
        console.log(`  đã xoá   ${path}`);
        copied++;
      }
      continue;
    }

    // Đã có bên kho riêng tư rồi thì bỏ qua (chạy lại lần hai)
    const { data: existing } = await db.storage.from(PRIVATE_BUCKET).list("", { search: path });
    if (existing && existing.some((f) => f.name === path)) {
      console.log(`  bỏ qua   ${path} (đã có ở kho riêng tư)`);
      movedOk.add(path);
      skipped++;
      continue;
    }

    const { data: blob, error: dlErr } = await db.storage.from(PUBLIC_BUCKET).download(path);
    if (dlErr || !blob) {
      console.error(`  LỖI tải  ${path}: ${dlErr?.message || "không có dữ liệu"}`);
      failed++;
      continue;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const { error: upErr } = await db.storage.from(PRIVATE_BUCKET).upload(path, buffer, {
      contentType: blob.type || "application/octet-stream",
      upsert: true,
    });

    if (upErr) {
      console.error(`  LỖI đẩy  ${path}: ${upErr.message}`);
      failed++;
      continue;
    }

    console.log(`  đã chuyển ${path}`);
    movedOk.add(path);
    copied++;
  }

  // ─── Cập nhật CSDL: chỉ đổi những dòng có tệp đã chuyển THÀNH CÔNG ───
  if (!deleteSource) {
    let updated = 0;
    for (const r of affected) {
      const next = {};
      for (const col of ["scan_file_url", "original_file_url"]) {
        const v = r[col];
        if (!v || !v.includes(PUBLIC_MARKER)) continue;
        const p = pathFromPublicUrl(v);
        if (p && movedOk.has(p)) next[col] = `private:${p}`;
      }
      if (Object.keys(next).length === 0) continue;

      if (dryRun) {
        updated++;
        continue;
      }

      const { error: updErr } = await db.from("clerical_documents").update(next).eq("id", r.id);
      if (updErr) {
        console.error(`  LỖI cập nhật dòng ${r.id}: ${updErr.message}`);
        failed++;
      } else {
        updated++;
      }
    }
    console.log(`\nSố dòng CSDL đã đổi     : ${updated}`);
  }

  console.log(`Tệp xử lý thành công    : ${copied}`);
  if (skipped) console.log(`Tệp bỏ qua (đã có)      : ${skipped}`);
  if (failed) console.log(`LỖI                     : ${failed}`);

  if (dryRun) {
    console.log("\nĐây mới là lượt THỬ, chưa ghi gì. Bỏ --dry-run để chuyển thật.");
  } else if (!deleteSource) {
    console.log(
      "\nĐã chuyển xong nhưng tệp gốc VẪN CÒN ở kho công khai.\n" +
        "Vào ứng dụng bấm thử vài công văn, mở được hết rồi mới chạy lượt dọn:\n" +
        '  SUPABASE_SERVICE_ROLE_KEY="<khoá>" node scripts/migrate-clerical-to-private.mjs --delete-source'
    );
  } else {
    console.log("\nĐã dọn kho công khai. Công văn giờ chỉ còn ở kho riêng tư.");
  }
}

main().catch((e) => {
  console.error("Lỗi không lường trước:", e);
  process.exit(1);
});
