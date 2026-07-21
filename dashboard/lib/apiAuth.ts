import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// XÁC THỰC CHO API ROUTE (server-side)
//
// Trước đây các route dưới /api/* không kiểm tra người gọi, nên bất kỳ ai trên
// Internet cũng POST được — dẫn tới 2 rủi ro thật:
//   1. Nhóm send-*: gửi thư TỪ ĐỊA CHỈ CHÍNH THỨC của công ty tới người nhận
//      tuỳ ý, nội dung tuỳ ý (giả danh / lừa đảo).
//   2. Nhóm analyze-*: rơi về `process.env.OPENAI_API_KEY` của công ty và đốt
//      tiền không giới hạn.
//
// Chuẩn header giữ nguyên như `ai-search` vốn đã dùng, để không đụng nhau:
//   - `x-supabase-auth`  : access token phiên đăng nhập Supabase (danh tính)
//   - `Authorization`    : khoá OpenAI của người dùng (KHÔNG phải danh tính)
//
// Danh tính LUÔN lấy từ token đã xác minh server-side, không bao giờ tin các
// trường như `currentUser`/`email` do client gửi trong body.
// ============================================================

export type VerifiedCaller = {
  email: string;
  userId: string;
  /** Token gốc — dùng để tạo Supabase client chạy đúng RLS của người này. */
  token: string;
};

export type ApiAuthOk = { ok: true; caller: VerifiedCaller };
export type ApiAuthFail = { ok: false; response: NextResponse };

const UNAUTHORIZED_MESSAGE =
  "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng tải lại trang và đăng nhập lại.";

function unauthorized(): ApiAuthFail {
  return {
    ok: false,
    response: NextResponse.json({ error: UNAUTHORIZED_MESSAGE }, { status: 401 }),
  };
}

/**
 * Bắt buộc người gọi phải có phiên đăng nhập hợp lệ.
 *
 * Cách dùng trong route:
 *   const auth = await requireApiAuth(req);
 *   if (!auth.ok) return auth.response;
 *   // auth.caller.email đã được xác minh từ token
 */
export async function requireApiAuth(req: NextRequest): Promise<ApiAuthOk | ApiAuthFail> {
  const token = (req.headers.get("x-supabase-auth") || "").trim();
  if (!token) return unauthorized();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Máy chủ chưa cấu hình Supabase (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)." },
        { status: 500 }
      ),
    };
  }

  try {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await client.auth.getUser(token);
    const email = data?.user?.email?.toLowerCase()?.trim() || "";
    if (error || !email) return unauthorized();

    return { ok: true, caller: { email, userId: data.user.id, token } };
  } catch {
    return unauthorized();
  }
}

/**
 * Supabase client mang danh tính người gọi — mọi truy vấn qua client này chạy
 * đúng RLS của họ (thay vì client anon dùng chung).
 */
export function supabaseForCaller(caller: VerifiedCaller) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    { global: { headers: { Authorization: `Bearer ${caller.token}` } } }
  );
}
