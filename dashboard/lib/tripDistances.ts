"use client";

// ============================================================
// tripDistances — danh mục cung đường công tác (migration 061).
//
// Một dòng = một cặp điểm đi/đến + số km chuẩn. Form "Đăng ký lịch đi công tác"
// tra bảng này để tự điền ô "Độ dài (KM)" thay vì bắt mỗi người nhớ một số.
//
// SO KHỚP BỎ DẤU, HAI CHIỀU: "Tây Ninh" = "tay ninh" = "TAY NINH", và
// TPHCM→Tây Ninh dùng chung số với Tây Ninh→TPHCM (chặng về không phải nhập
// lại). Khoá so khớp `norm_from`/`norm_to` do CLIENT tính bằng `foldVi` rồi ghi
// xuống — Postgres bản thường không bỏ dấu tiếng Việt được nếu chưa bật
// extension `unaccent`, xem phần đầu migration 061.
//
// Cache ở tầng module giống `financePartners`: form công tác mở/đóng liên tục,
// không việc gì gọi lại mạng mỗi lần bật modal.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { foldVi } from "./financePartners";

export interface TripDistance {
  id: string;
  from_location: string;
  to_location: string;
  norm_from: string;
  norm_to: string;
  distance_km: number;
  note: string | null;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
}

const COLS =
  "id, from_location, to_location, norm_from, norm_to, distance_km, note, created_by, created_at, updated_at";

/**
 * Khoá so khớp một địa danh: bỏ dấu, chữ thường, bỏ dấu câu, gộp khoảng trắng.
 *
 * Bỏ dấu câu là bắt buộc chứ không phải làm cho đẹp: cùng một nơi mà người này
 * gõ "TP.HCM", người kia "TP HCM", người nữa "TPHCM" — không gộp lại thì danh
 * mục có ba dòng cho một thành phố và tự điền trượt liên tục. Sau khi bỏ dấu
 * câu + khoảng trắng, cả ba đều thành "tphcm".
 */
export function locationKey(s: string): string {
  return foldVi(s || "")
    .replace(/[.,;:''"()\-_/\\]+/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

/** Độ dài tối thiểu của phần "từ khoá chính" thì mới cho khớp kiểu chứa nhau. */
const MIN_PARTIAL = 3;

/**
 * Hai tên có cùng chỉ MỘT địa điểm không? Khớp khi trùng khít, hoặc khi tên này
 * CHỨA tên kia: tên thật trong công ty hay có tiền tố ("BĐH Tây Ninh",
 * "KCN Trảng Bàng") mà người khai đơn chỉ gõ phần chính ("Tây Ninh").
 *
 * Chặn dưới 3 ký tự để "An" không nuốt "Long An" / "Nghệ An".
 */
function sameSpot(x: string, y: string): boolean {
  if (x === y) return true;
  const short = x.length <= y.length ? x : y;
  const long = short === x ? y : x;
  return short.length >= MIN_PARTIAL && long.includes(short);
}

function keyRows(rows: TripDistance[]) {
  // ⚠ Tính LẠI khoá từ `from_location`/`to_location`, KHÔNG đọc hai cột `norm_*`
  // dưới CSDL. Hai cột đó chỉ để unique index chống trùng dòng; dòng lưu trước
  // khi luật normalize đổi vẫn giữ khoá cũ, tin vào chúng là tra trượt dòng có sẵn.
  return rows.map((r) => ({
    row: r,
    f: locationKey(r.from_location),
    t: locationKey(r.to_location),
  }));
}

/**
 * Tra dòng TRÙNG KHÍT cặp điểm (cả hai chiều). Dùng cho việc chống trùng khi
 * thêm/sửa danh mục — chỗ đó phải chặt, khớp gần là ghi đè nhầm dòng người khác.
 */
export function findExactDistance(
  rows: TripDistance[],
  from: string,
  to: string
): TripDistance | null {
  const a = locationKey(from);
  const b = locationKey(to);
  if (!a || !b || a === b) return null;
  const hit = keyRows(rows).find(
    (k) => (k.f === a && k.t === b) || (k.f === b && k.t === a)
  );
  return hit ? hit.row : null;
}

export interface DistanceMatch {
  row: TripDistance | null;
  /** Nhiều dòng cùng thoả kiểu "chứa từ khoá" — KHÔNG đoán bừa, để người dùng gõ rõ hơn. */
  ambiguous: boolean;
}

/**
 * Tra số km của một cung đường để TỰ ĐIỀN vào form công tác.
 *
 * Tra CẢ HAI CHIỀU (A→B và B→A là một khoảng cách), và hai bậc:
 *   1. trùng khít -> lấy luôn;
 *   2. không có thì tìm theo từ khoá chính ("Tây Ninh" ↔ "BĐH Tây Ninh").
 *
 * Bậc 2 chỉ điền khi có ĐÚNG MỘT dòng thoả. Hai dòng trở lên (vừa "BĐH Tây
 * Ninh" vừa "KCN Tây Ninh") thì trả `ambiguous` để màn hình bảo người dùng gõ
 * rõ hơn — điền đại một số km sai vào giấy đề nghị thanh toán tệ hơn là không
 * điền gì.
 */
export function matchDistance(
  rows: TripDistance[],
  from: string,
  to: string
): DistanceMatch {
  const a = locationKey(from);
  const b = locationKey(to);
  if (!a || !b || a === b) return { row: null, ambiguous: false };

  const keyed = keyRows(rows);
  const exact = keyed.find(
    (k) => (k.f === a && k.t === b) || (k.f === b && k.t === a)
  );
  if (exact) return { row: exact.row, ambiguous: false };

  const near = keyed.filter(
    (k) =>
      (sameSpot(k.f, a) && sameSpot(k.t, b)) ||
      (sameSpot(k.f, b) && sameSpot(k.t, a))
  );
  if (near.length === 1) return { row: near[0].row, ambiguous: false };
  return { row: null, ambiguous: near.length > 1 };
}

/** Dạng gọn của `matchDistance` khi chỉ cần biết có số km hay không. */
export function findDistance(
  rows: TripDistance[],
  from: string,
  to: string
): TripDistance | null {
  return matchDistance(rows, from, to).row;
}

/** Gợi ý địa danh đã có trong danh mục — đổ vào <datalist> cho ô nhập. */
export function knownLocations(rows: TripDistance[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (!seen.has(r.norm_from)) seen.set(r.norm_from, r.from_location);
    if (!seen.has(r.norm_to)) seen.set(r.norm_to, r.to_location);
  }
  return [...seen.values()].sort((x, y) => x.localeCompare(y, "vi"));
}

let cached: TripDistance[] | null = null;
let inflight: Promise<TripDistance[]> | null = null;

async function fetchTripDistances(): Promise<TripDistance[]> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("trip_distances")
        .select(COLS)
        .order("from_location", { ascending: true });
      if (error) throw error;
      const rows = (data || []) as unknown as TripDistance[];
      // Lỗi thì KHÔNG cache — để lần mở sau còn thử lại.
      cached = rows;
      return rows;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Gọi sau mỗi lần ghi, để lần đọc kế tiếp lấy dữ liệu mới mà không cần F5. */
export function invalidateTripDistances(): void {
  cached = null;
}

/**
 * @param enabled Chỉ gọi mạng khi form công tác đang mở. Hook này nằm sẵn trong
 *   trang /calendar — trang được mở nhiều nhất hệ thống — nên không để nó tải
 *   danh mục cho cả những người chỉ vào xem lịch.
 */
export function useTripDistances(enabled: boolean = true): {
  rows: TripDistance[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
} {
  const [rows, setRows] = useState<TripDistance[]>(cached || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setRows(await fetchTripDistances());
    } catch (e) {
      // Bảng chưa tạo (migration 061 chưa chạy) cũng rơi vào đây: giữ danh sách
      // rỗng để form công tác vẫn dùng được, chỉ mất phần tự điền.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  const reload = useCallback(async () => {
    invalidateTripDistances();
    await load();
  }, [load]);

  return { rows, loading, error, reload };
}
