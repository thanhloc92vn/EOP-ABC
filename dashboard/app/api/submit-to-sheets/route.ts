import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const customUrl = req.headers.get("x-apps-script-url");
    const SCRIPT_URL = customUrl || process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || "";
    const SECRET = process.env.APPS_SCRIPT_SECRET || "CV_SCORER_SECRET_2025";

    const body = await req.json();
    const { extracted_info } = body;

    if (!extracted_info) {
      return NextResponse.json({ error: "Thiếu extracted_info." }, { status: 400 });
    }

    if (!SCRIPT_URL) {
      return NextResponse.json({ error: "APPS_SCRIPT_URL chưa được cấu hình. Vui lòng nhập trong phần Cài đặt." }, { status: 500 });
    }

    // Build row matching Google Sheets column order (16 columns)
    const info = extracted_info;
    const row = [
      info.ngay        || "N/A",
      info.ten_ung_vien || "N/A",
      info.email        || "N/A",
      info.sdt          || "N/A",
      info.bang_cap     || "N/A",
      info.chuyen_nganh || "N/A",
      info.kinh_nghiem  || "N/A",
      info.chuc_danh_gan_nhat || "N/A",
      info.cong_ty_gan_nhat   || "N/A",
      info.khu_vuc      || "N/A",
      info.phong_ban    || "N/A",
      info.vi_tri       || "N/A",
      info.trang_thai   || "FAIL",
      info.nguon        || "N/A",
      info.nguoi_danh_gia || "N/A",
    ];

    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: SECRET, action: "append", row }),
      redirect: "follow",
    });

    const json = await res.json();
    return NextResponse.json(json);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
