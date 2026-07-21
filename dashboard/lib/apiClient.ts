"use client";

import { supabase } from "./supabase";

// ============================================================
// GỌI API NỘI BỘ TỪ TRÌNH DUYỆT
//
// Mọi route dưới /api/* nay đều yêu cầu xác thực (xem lib/apiAuth.ts). Helper
// này tự gắn access token của phiên đăng nhập vào header `x-supabase-auth`,
// nên các trang chỉ cần đổi `fetch(...)` thành `apiFetch(...)` là xong.
//
// Giữ nguyên mọi header sẵn có của lời gọi — đặc biệt `Authorization` (khoá
// OpenAI của người dùng) và `Content-Type` — vì hai header này phục vụ mục
// đích khác, không phải danh tính.
// ============================================================

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("x-supabase-auth", token);
  } catch {
    // Không lấy được phiên -> vẫn gửi đi, server sẽ trả 401 với thông báo rõ ràng
  }

  return fetch(input, { ...init, headers });
}
