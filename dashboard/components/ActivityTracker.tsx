"use client";

// ============================================================
// ActivityTracker — ghi nhật ký "ai mở module nào" vào bảng activity_events.
//
// Mục tiêu: đo tài khoản nào THỰC SỰ dùng phần mềm, không phải đăng nhập rồi
// treo đó. Đặt ở AuthWrapper (sau khi đã qua cổng đăng nhập + cổng gói) nên bắt
// được mọi trang mà không phải sửa từng module.
//
// BA CHỐT CHỐNG THỔI PHỒNG SỐ LIỆU:
//   1. Tab phải đang hiển thị — mở rồi để chạy nền không tính.
//   2. Phải ở lại trang >= 5 giây — bấm nhầm/đi ngang qua không tính.
//      (cũng lọc luôn mấy trang chỉ chuyển hướng, vd /van-thu/cong-van-di-1)
//   3. Cùng (người, module) chỉ ghi lại sau 30 phút — F5 liên tục vẫn 1 lượt.
//
// AN TOÀN LÀ ƯU TIÊN SỐ 1: component này nằm trên đường đi của MỌI trang, nên
// nó không được phép làm hỏng gì. Vì vậy:
//   - Luôn `return null`, không render gì, không đụng vào cây giao diện.
//   - Toàn bộ bọc try/catch, promise luôn có .catch() — lỗi thì im lặng bỏ qua.
//   - Không `await` trong luồng render, không đưa state nào ra ngoài.
//   - Ghi log hỏng (mất mạng, RLS chặn, DB lỗi) KHÔNG BAO GIỜ chặn người dùng
//     làm việc — cùng lắm là thiếu một dòng thống kê.
// ============================================================

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

/** Phải ở lại trang bao lâu thì mới tính là "có dùng". */
const DWELL_MS = 5_000;

/** Cùng người + cùng module, trong khoảng này chỉ tính 1 lượt. */
const DEDUPE_MS = 30 * 60 * 1000;

/** Trang công khai, người xem không đăng nhập -> không đo. */
const IGNORED_PREFIXES = ["/gop-y"];

/**
 * Khoá module = đoạn đầu của đường dẫn. Trang chủ quy ước là "dashboard".
 * Cố ý KHÔNG dùng danh sách cứng: thêm module mới sau này vẫn tự được đếm,
 * không phải nhớ sửa file này.
 */
function moduleKeyOf(pathname: string): string {
  if (!pathname) return "";
  if (IGNORED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "";
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return "dashboard";
  return first.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 60);
}

export default function ActivityTracker() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      if (typeof window === "undefined") return;

      const moduleKey = moduleKeyOf(pathname);
      if (!moduleKey) return;

      const log = async () => {
        if (cancelled) return;
        // Chốt 1: tab phải đang được nhìn.
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

        const { data } = await supabase.auth.getSession();
        const email = (data?.session?.user?.email || "").toLowerCase().trim();
        if (!email || cancelled) return;

        // Chốt 3: khử trùng bằng localStorage (mỗi máy tự nhớ, không tốn lượt
        // gọi DB chỉ để hỏi "lần trước ghi lúc nào").
        const key = `hcns_act:${email}:${moduleKey}`;
        const last = Number(window.localStorage.getItem(key) || "0");
        const now = Date.now();
        if (Number.isFinite(last) && last > 0 && now - last < DEDUPE_MS) return;

        // Đánh dấu TRƯỚC khi ghi: nếu ghi hỏng (mất mạng...) thì bỏ qua lượt này
        // thay vì thử lại liên tục ở mỗi lần chuyển trang.
        window.localStorage.setItem(key, String(now));

        await supabase.from("activity_events").insert({
          email,
          module: moduleKey,
          path: pathname.slice(0, 200),
        });
      };

      // Chốt 2: chờ đủ lâu mới ghi. Rời trang sớm -> cleanup huỷ timer.
      timer = setTimeout(() => {
        log().catch(() => { /* im lặng: log hỏng không được ảnh hưởng người dùng */ });
      }, DWELL_MS);
    } catch {
      /* im lặng */
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
