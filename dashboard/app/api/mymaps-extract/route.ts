import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/apiAuth";

// ============================================================
// /api/mymaps-extract — lấy toạ độ đại diện từ link Google My Maps.
//
// Trình duyệt KHÔNG fetch được KML của Google (chặn CORS) -> phải làm ở server.
// Nhận link My Maps, tách `mid`, tải bản KML public, gộp toàn bộ điểm rồi trả về
// TÂM (giữa khung bao) để cắm 1 marker đại diện cho dự án trên bản đồ tổng.
//
// An toàn: chỉ gọi đúng endpoint google.com/maps/d/kml với mid dạng [A-Za-z0-9_-]
// (không cho fetch host tuỳ ý -> tránh SSRF). Bắt buộc đăng nhập nội bộ.
// ============================================================

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  let url = "";
  try {
    const body = await req.json();
    url = String(body?.url || "");
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ." }, { status: 400 });
  }

  const midMatch = url.match(/mid=([A-Za-z0-9_-]+)/);
  if (!midMatch) {
    return NextResponse.json(
      { error: "Không tìm thấy mã bản đồ (mid) trong link My Maps." },
      { status: 400 }
    );
  }
  const mid = midMatch[1];
  const kmlUrl = `https://www.google.com/maps/d/kml?mid=${mid}&forcekml=1`;

  let kml = "";
  try {
    const res = await fetch(kmlUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Không tải được bản đồ (HTTP ${res.status}). Hãy đặt My Maps ở chế độ chia sẻ "Bất kỳ ai có đường liên kết đều xem được".`,
        },
        { status: 502 }
      );
    }
    kml = await res.text();
  } catch {
    return NextResponse.json({ error: "Không kết nối được tới Google My Maps." }, { status: 502 });
  }

  // Tên bản đồ
  const nameMatch = kml.match(/<Document>[\s\S]*?<name>([\s\S]*?)<\/name>/);
  const name = nameMatch ? nameMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";

  // Gộp toạ độ từ mọi <coordinates> (Point/LineString/Polygon) -> khung bao.
  const coordBlocks = kml.match(/<coordinates>([\s\S]*?)<\/coordinates>/g) || [];
  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180,
    n = 0;
  for (const block of coordBlocks) {
    const inner = block.replace(/<\/?coordinates>/g, "").trim();
    for (const tok of inner.split(/\s+/)) {
      const parts = tok.split(",");
      if (parts.length < 2) continue;
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      // Chỉ nhận điểm quanh Việt Nam (loại điểm rác/ngoài vùng).
      if (lat < 4 || lat > 25 || lng < 100 || lng > 120) continue;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      n++;
    }
  }

  if (n === 0) {
    return NextResponse.json(
      { error: "Bản đồ không có điểm toạ độ hợp lệ trong phạm vi Việt Nam." },
      { status: 422 }
    );
  }

  const lat = +(((minLat + maxLat) / 2).toFixed(6));
  const lng = +(((minLng + maxLng) / 2).toFixed(6));
  const placemarks = (kml.match(/<Placemark/g) || []).length;

  return NextResponse.json({ ok: true, lat, lng, count: n, placemarks, name, mid });
}
