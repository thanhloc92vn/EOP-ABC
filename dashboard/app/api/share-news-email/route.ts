import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";

// Chia sẻ một bài Tin tức cho đồng nghiệp qua email (nút "Gửi cho đồng nghiệp"
// ở trang /tin-tuc/[id]).
//
// Email chỉ mang TIÊU ĐỀ + TRÍCH ĐOẠN + ĐƯỜNG DẪN — cố ý không đính kèm tệp và
// không chèn ảnh từ bucket: tệp nằm trong bucket riêng tư, người nhận phải đăng
// nhập hệ thống mới xem được. Gửi kèm file qua email là lách chính lớp quyền đó.
//
// Cấu hình người gửi giống các route email khác: ưu tiên SMTP_USER/SMTP_PASS của
// máy chủ, chỉ dùng cấu hình từ trình duyệt khi máy chủ chưa đặt biến môi trường.

const CATEGORY_LABELS: Record<string, string> = {
  thong_bao: "Thông báo",
  gioi_thieu: "Giới thiệu",
  su_kien: "Sự kiện",
};

/** Chặn HTML từ dữ liệu người dùng lọt vào thân email. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { smtpConfig, post, recipients, recipientName, recipientEmails, senderName, note } = body;

    const envConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    const smtpUser = envConfigured ? (process.env.SMTP_USER as string) : (smtpConfig?.user || "");
    const smtpPass = envConfigured ? (process.env.SMTP_PASS as string) : (smtpConfig?.pass || "");
    const smtpHost = envConfigured ? (process.env.SMTP_HOST || "smtp.gmail.com") : (smtpConfig?.host || "smtp.gmail.com");
    const portNum = envConfigured ? (Number(process.env.SMTP_PORT) || 465) : (Number(smtpConfig?.port) || 465);

    if (!smtpUser || !smtpPass) {
      return NextResponse.json(
        { error: "Chưa cấu hình SMTP gửi email (Cài đặt hệ thống hoặc biến môi trường SMTP_USER/SMTP_PASS)!" },
        { status: 400 }
      );
    }
    if (!post?.id || !post?.title) {
      return NextResponse.json({ error: "Thiếu thông tin bài viết cần chia sẻ!" }, { status: 400 });
    }

    // GỬI TỚI MỌI ĐỊA CHỈ CÓ TRONG HỒ SƠ, không chỉ email công ty.
    //
    // Các route email khác (giao việc, đăng ký xe) chỉ chọn MỘT địa chỉ, ưu
    // tiên email cùng tên miền hộp thư gửi. Với thông báo nội bộ thì cách đó
    // hỏng việc: thư vào hộp thư công ty mà người nhận ít mở, còn Gmail họ dùng
    // hằng ngày lại không nhận được gì — đúng tình huống đã gặp trong thực tế.
    // Sắp email công ty lên trước để nó là địa chỉ chính, các địa chỉ còn lại
    // nhận kèm.
    const senderDomain = (smtpUser.split("@")[1] || "").toLowerCase();
    const orderEmails = (raw: unknown): string => {
      const candidates: string[] = Array.from(
        new Set(
          String(raw || "")
            .split(/[,;\s]+/)
            .map((e: string) => e.trim().toLowerCase())
            .filter((e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
        )
      );
      return [
        ...candidates.filter((e) => e.endsWith(`@${senderDomain}`)),
        ...candidates.filter((e) => !e.endsWith(`@${senderDomain}`)),
      ].join(", ");
    };

    // Nhiều người nhận: gửi MỖI NGƯỜI MỘT THƯ RIÊNG, không gộp chung một thư.
    // Gộp chung thì dòng "Kính gửi Anh/Chị: <tên>" chỉ đúng với một người, và
    // mọi người nhận sẽ nhìn thấy địa chỉ email của nhau.
    // Vẫn nhận dạng cũ (recipientName/recipientEmails) để tab đang mở bản JS cũ
    // không gãy ngay lúc triển khai bản mới.
    const rawTargets: unknown[] = Array.isArray(recipients) && recipients.length
      ? recipients
      : [{ name: recipientName, emails: recipientEmails }];

    const targets = rawTargets
      .map((r) => {
        const item = (r || {}) as { name?: unknown; emails?: unknown };
        return { name: String(item.name || "").trim(), to: orderEmails(item.emails) };
      })
      .filter((t) => t.to);

    if (targets.length === 0) {
      return NextResponse.json({ error: "Người nhận chưa có email hợp lệ trong Danh sách nhân viên!" }, { status: 400 });
    }

    const cfg = await getTenantConfigServer();
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: portNum,
      secure: envConfigured ? portNum === 465 : (smtpConfig?.secure === undefined ? portNum === 465 : !!smtpConfig?.secure),
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });

    const siteOrigin =
      body.siteUrl || request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || cfg.site_url;
    const postUrl = `${siteOrigin}/tin-tuc/${encodeURIComponent(String(post.id))}`;
    const categoryLabel = CATEGORY_LABELS[String(post.category)] || "Tin nội bộ";

    const noteBlock = note
      ? `<div style="margin: 0 40px 4px 40px; padding: 14px 18px; background-color: #eff6ff; border-left: 4px solid #005BAC; border-radius: 10px;">
           <div style="font-size: 11px; font-weight: 800; color: #005BAC; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Lời nhắn từ ${esc(senderName) || "đồng nghiệp"}</div>
           <div style="font-size: 13px; color: #334155; line-height: 1.6;">${esc(note).replace(/\n/g, "<br>")}</div>
         </div>`
      : "";

    const buildHtml = (toName: string) => `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>${esc(post.title)}</title></head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
        <div style="max-width: 640px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">

          <div style="background-color: #005BAC; background: linear-gradient(135deg, #005BAC 0%, #00AEEF 100%); padding: 32px 40px; color: #ffffff;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: #bfdbfe; margin-bottom: 8px;">${esc(cfg.company_name).toUpperCase()} — BẢNG TIN NỘI BỘ</div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 850; letter-spacing: -0.025em; color: #ffffff;">📰 ${esc(categoryLabel)}: ${esc(post.title)}</h1>
          </div>

          <div style="padding: 28px 40px 12px 40px;">
            <p style="margin: 0 0 10px 0; font-size: 15px; line-height: 1.6; color: #334155;">
              Kính gửi Anh/Chị: <strong style="color: #005BAC; font-size: 16px;">${esc(toName)}</strong>,
            </p>
            <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #475569;">
              <strong style="color: #005BAC;">${esc(senderName) || "Một đồng nghiệp"}</strong> vừa chia sẻ với Anh/Chị một bài trên bảng tin nội bộ.
            </p>
          </div>

          ${noteBlock}

          <div style="padding: 18px 40px 8px 40px;">
            <div style="border: 1px solid #e2e8f0; border-left: 4px solid #005BAC; border-radius: 12px; padding: 18px 20px;">
              <div style="font-size: 16px; font-weight: 800; color: #1e293b; margin-bottom: 8px;">${esc(post.title)}</div>
              <div style="font-size: 13px; color: #64748b; line-height: 1.7;">${esc(post.excerpt)}</div>
            </div>
          </div>

          <div style="padding: 26px 40px 10px 40px; text-align: center;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
              <tr>
                <td align="center" bgcolor="#005BAC" style="background-color: #005BAC; border-radius: 12px;">
                  <a href="${postUrl}" target="_blank"
                     style="display: inline-block; padding: 14px 36px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 12px; letter-spacing: 0.02em;">
                    📖 Đọc bài viết đầy đủ
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin: 12px 0 0 0; font-size: 11px; color: #94a3b8;">
              Tệp đính kèm của bài chỉ xem được sau khi đăng nhập hệ thống bằng tài khoản công ty.
            </p>
          </div>

          <div style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5; margin-top: 16px;">
            Trực thuộc hệ thống quản trị nhân sự <strong>${esc(cfg.system_title)}</strong><br>
            Email này được gửi khi một đồng nghiệp chia sẻ bài viết. Vui lòng không trả lời trực tiếp email này.
          </div>
        </div>
      </body>
      </html>
    `;

    // Gửi tuần tự trên CÙNG một kết nối SMTP đã bắt tay: nhanh hơn nhiều so với
    // mỗi người một lượt gọi API. Một người lỗi thì vẫn gửi tiếp cho người sau,
    // rồi báo rõ ai được ai không.
    const sent: string[] = [];
    const failed: string[] = [];
    for (const t of targets) {
      try {
        await transporter.sendMail({
          from: `"${cfg.email_sender_name}" <${smtpUser}>`,
          to: t.to,
          subject: `[${cfg.company_name}] 📰 ${categoryLabel}: ${post.title}`,
          html: buildHtml(t.name),
        });
        sent.push(`${t.name} (${t.to})`);
      } catch (err: unknown) {
        console.error(`Error sharing news post to ${t.to}:`, err);
        failed.push(t.name || t.to);
      }
    }

    if (sent.length === 0) {
      return NextResponse.json(
        { error: `Không gửi được email tới: ${failed.join(", ")}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        `Đã gửi bài viết tới ${sent.join("; ")}` +
        (failed.length ? ` — KHÔNG gửi được tới: ${failed.join(", ")}` : ""),
    });
  } catch (error: unknown) {
    console.error("Error sharing news post by email:", error);
    const message = error instanceof Error ? error.message : "Lỗi không xác định khi gửi email!";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
