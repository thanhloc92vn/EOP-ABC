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
  console.log(`Còn ở kho công khai     : ${affected.length}`);

  // Nhiều dòng có thể trỏ chung một tệp (hệ thống điền cả scan lẫn bản gốc
  // cùng một URL) -> gom theo đường dẫn để không xử lý trùng.
  const paths = new Set();

  if (deleteSource) {
    // LƯỢT DỌN chạy SAU lượt chuyển, lúc đó CSDL đã trỏ hết sang "private:" nên
    // không còn dòng nào mang dấu URL công khai. Vì vậy phải lấy danh sách từ
    // chính các tham chiếu private, chứ không phải từ `affected` (sẽ rỗng).
    //
    // HAI ĐIỀU KIỆN BẮT BUỘC trước khi xoá một tệp bên kho công khai:
    //   1. CSDL đang trỏ tới nó dưới dạng private: -> đúng là tệp của Văn thư
    //   2. Bản sao CÓ THẬT trong kho riêng tư      -> chép lỗi thì tuyệt đối không xoá
    // Tên tệp Văn thư nằm ở gốc bucket, còn Hành chính (invoices/) và Góp ý
    // (suggestions/) nằm trong thư mục con, nên không thể xoá nhầm sang họ.
    const refs = new Set();
    for (const r of rows || []) {
      for (const v of [r.scan_file_url, r.original_file_url]) {
        if (v && v.startsWith("private:")) refs.add(v.slice("private:".length));
      }
    }

    const inPrivate = new Set();
    let offset = 0;
    while (true) {
      const { data } = await db.storage.from(PRIVATE_BUCKET).list("", { limit: 100, offset });
      if (!data || data.length === 0) break;
      data.forEach((f) => inPrivate.add(f.name));
      offset += data.length;
      if (data.length < 100) break;
    }

    let khongCoBanSao = 0;
    for (const p of refs) {
      if (inPrivate.has(p)) paths.add(p);
      else khongCoBanSao++;
    }

    console.log(`CSDL trỏ tới (private:) : ${refs.size}`);
    console.log(`Có bản sao, sẽ xoá gốc  : ${paths.size}`);
    if (khongCoBanSao > 0) {
      console.log(`GIỮ LẠI (chưa có bản sao): ${khongCoBanSao}`);
    }
    console.log("");
  } else {
    if (affected.length === 0) {
      console.log("\nKhông còn gì để chuyển. Xong.");
      return;
    }
    for (const r of affected) {
      for (const v of [r.scan_file_url, r.original_file_url]) {
        const p = v && v.includes(PUBLIC_MARKER) ? pathFromPublicUrl(v) : null;
        if (p) paths.add(p);
      }
    }
    console.log(`\nSố tệp riêng biệt       : ${paths.size}\n`);
  }

  if (paths.size === 0) {
    console.log("Không có tệp nào cần xử lý. Xong.");
    return;
  }

  let copied = 0;
  let skipped = 0;
  let failed = 0;
  const movedOk = new Set();

  // Xử lý MỘT tệp. Trả về true nếu tệp đó coi như đã nằm ở kho riêng tư.
  async function handleOne(path) {
    if (dryRun) return true;

    if (deleteSource) {
      const { error: delErr } = await db.storage.from(PUBLIC_BUCKET).remove([path]);
      if (delErr) {
        console.error(`  LỖI xoá  ${path}: ${delErr.message}`);
        failed++;
        return false;
      }
      copied++;
      return true;
    }

    // SAO CHÉP NGAY TRÊN MÁY CHỦ SUPABASE.
    // Trước đây script tải tệp về máy rồi đẩy lên lại — mỗi tệp đi hai vòng qua
    // đường truyền của người chạy, 336 tệp là rất lâu. `copy` kèm
    // destinationBucket khiến byte không bao giờ rời khỏi Supabase.
    const { error: cpErr } = await db.storage
      .from(PUBLIC_BUCKET)
      .copy(path, path, { destinationBucket: PRIVATE_BUCKET });

    if (!cpErr) {
      copied++;
      return true;
    }

    // Chạy lại lần hai: tệp đã có bên kho riêng tư -> coi như xong
    if (/already exists|duplicate/i.test(cpErr.message || "")) {
      skipped++;
      return true;
    }

    console.error(`  LỖI chép ${path}: ${cpErr.message}`);
    failed++;
    return false;
  }

  // Chạy song song có giới hạn: nhanh hơn hẳn tuần tự mà không dội quá nhiều
  // yêu cầu cùng lúc khiến Supabase chặn.
  const CONCURRENCY = 10;
  const list = [...paths];
  let cursor = 0;
  let done = 0;

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, list.length) }, async () => {
      while (cursor < list.length) {
        const path = list[cursor++];
        const ok = await handleOne(path);
        if (ok) movedOk.add(path);
        done++;
        if (done % 25 === 0 || done === list.length) {
          console.log(`  ... ${done}/${list.length} tệp`);
        }
      }
    })
  );

  // ─── Cập nhật CSDL: chỉ đổi những dòng có tệp đã chuyển THÀNH CÔNG ───
  if (!deleteSource) {
    // Gom sẵn việc cần làm rồi chạy song song — 335 lượt gọi tuần tự rất chậm.
    const jobs = [];
    for (const r of affected) {
      const next = {};
      for (const col of ["scan_file_url", "original_file_url"]) {
        const v = r[col];
        if (!v || !v.includes(PUBLIC_MARKER)) continue;
        const p = pathFromPublicUrl(v);
        if (p && movedOk.has(p)) next[col] = `private:${p}`;
      }
      if (Object.keys(next).length > 0) jobs.push({ id: r.id, next });
    }

    let updated = 0;
    if (dryRun) {
      updated = jobs.length;
    } else {
      let jc = 0;
      await Promise.all(
        Array.from({ length: Math.min(10, jobs.length) }, async () => {
          while (jc < jobs.length) {
            const job = jobs[jc++];
            const { error: updErr } = await db.from("clerical_documents").update(job.next).eq("id", job.id);
            if (updErr) {
              console.error(`  LỖI cập nhật dòng ${job.id}: ${updErr.message}`);
              failed++;
            } else {
              updated++;
            }
          }
        })
      );
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
