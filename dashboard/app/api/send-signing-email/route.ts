import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";

// ============================================================
// POST /api/send-signing-email — báo tiến độ PHIẾU TRÌNH KÝ.
//
// Mỗi lần phiếu nhích một bước, gửi 2 loại thư:
//   1. NGƯỜI LẬP  — "phiếu của bạn đã tới bước nào", để khỏi phải chạy đi hỏi.
//   2. CẤP KẾ TIẾP — "có phiếu chờ bạn xử lý", kèm nút mở thẳng màn hình duyệt.
//
// Người lập LUÔN nhận được thư kể cả khi không tra ra email cấp kế tiếp — đó
// mới là yêu cầu gốc (theo dõi hồ sơ đang ở đâu), còn nhắc cấp sau là phần thêm.
//
// ⚠ MÚI GIỜ: route chạy trên server theo UTC. toLocaleString("vi-VN") KHÔNG tự
// đổi múi giờ — thiếu timeZone thì email ghi lệch 7 tiếng, và trước 7h sáng còn
// lùi hẳn một ngày. Luôn truyền timeZone: "Asia/Ho_Chi_Minh".
//
// SMTP: ưu tiên biến môi trường của server, fallback cấu hình trình duyệt —
// cùng khuôn send-request-email / send-booking-email.
// ============================================================

const TZ = "Asia/Ho_Chi_Minh";

type Payload = {
  smtpConfig?: { user?: string; pass?: string; host?: string; port?: number; secure?: boolean };
  maPhieu?: string;
  hopDongSo?: string;
  duAn?: string;
  chuDauTu?: string;
  dotSo?: number | string | null;
  soTien?: number | null;
  event: "trinh" | "duyet" | "tra_lai";
  eventLabel?: string;      // "PGĐ QLDA đã xem xét"
  nextLabel?: string;       // "Chờ PGĐ KHĐT"
  actorName?: string;
  ykien?: string;
  lyDo?: string;
  creatorEmail?: string;
  creatorName?: string;
  nextApproverEmails?: string[];
  siteUrl?: string;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const money = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " đồng"
    : "—";

const row = (label: string, value: string) => `
  <tr style="border-bottom:1px solid #e2e8f0;">
    <td style="padding:10px 14px;width:38%;background:#f8fafc;color:#64748b;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;">${esc(label)}</td>
    <td style="padding:10px 14px;color:#1e293b;font-size:13px;font-weight:600;">${value || "—"}</td>
  </tr>`;

function shell(title: string, accent: string, bodyRows: string, note: string, cta: string, brand: string) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:${accent};padding:20px 24px;">
      <p style="margin:0;color:#fff;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;opacity:.85;">${esc(brand)}</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:18px;font-weight:800;">${esc(title)}</h1>
    </div>
    <table style="width:100%;border-collapse:collapse;">${bodyRows}</table>
    ${note ? `<div style="padding:14px 24px;background:#fffbeb;border-top:1px solid #fde68a;color:#92400e;font-size:13px;font-weight:600;">${note}</div>` : ""}
    ${cta}
    <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
      Thư tự động từ hệ thống ${esc(brand)} — vui lòng không trả lời thư này.
    </div>
  </div></body></html>`;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const b = (await request.json()) as Payload;
    const cfg = await getTenantConfigServer();

    const envOk = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    const user = envOk ? (process.env.SMTP_USER as string) : b.smtpConfig?.user || "";
    const pass = envOk ? (process.env.SMTP_PASS as string) : b.smtpConfig?.pass || "";
    const host = envOk ? process.env.SMTP_HOST || "smtp.gmail.com" : b.smtpConfig?.host || "smtp.gmail.com";
    const port = envOk ? Number(process.env.SMTP_PORT) || 465 : Number(b.smtpConfig?.port) || 465;

    if (!user || !pass) {
      return NextResponse.json(
        { error: "Chưa cấu hình SMTP gửi email (Cài đặt hệ thống hoặc biến SMTP_USER/SMTP_PASS)." },
        { status: 400 }
      );
    }

    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });

    const now = new Date().toLocaleString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: TZ,
    });

    const origin =
      b.siteUrl || request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || cfg.site_url;
    const link = `${origin}/bao-cao`;

    const info = [
      row("Mã phiếu", esc(b.maPhieu)),
      row("Hợp đồng", esc(b.hopDongSo)),
      row("Đợt thanh toán", esc(b.dotSo)),
      row("Chủ đầu tư", esc(b.chuDauTu)),
      row("Dự án", esc(b.duAn)),
      row("Đề nghị thanh toán", money(b.soTien ?? null)),
      row("Thời điểm", esc(now)),
    ].join("");

    const button = `
      <div style="padding:20px 24px;text-align:center;">
        <a href="${esc(link)}" style="display:inline-block;background:#005BAC;color:#fff;text-decoration:none;padding:12px 26px;border-radius:10px;font-size:13px;font-weight:bold;">
          Mở phiếu trong hệ thống
        </a>
      </div>`;

    const sent: string[] = [];
    const failed: string[] = [];

    const send = async (to: string[], subject: string, html: string) => {
      const list = Array.from(new Set(to.filter((x) => x && x.includes("@"))));
      if (list.length === 0) return;
      try {
        await transporter.sendMail({
          from: `"${cfg.company_name}" <${user}>`,
          to: list.join(","),
          subject,
          html,
        });
        sent.push(...list);
      } catch (e) {
        // Một địa chỉ hỏng KHÔNG được làm đổ cả thao tác duyệt — phiếu đã
        // chuyển bước rồi, email chỉ là thông báo.
        failed.push(`${list.join(",")}: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    // ─── 1. Thư cho NGƯỜI LẬP ───
    if (b.creatorEmail) {
      const isBack = b.event === "tra_lai";
      const title = isBack
        ? "Phiếu trình ký bị trả lại"
        : b.event === "trinh"
        ? "Đã trình phiếu ký"
        : b.eventLabel || "Phiếu trình ký đã được xử lý";

      const note = isBack
        ? `<strong>${esc(b.actorName)}</strong> trả lại phiếu. Lý do: ${esc(b.lyDo)}`
        : b.ykien
        ? `Ý kiến của ${esc(b.actorName)}: ${esc(b.ykien)}`
        : "";

      const extra = row("Trạng thái hiện tại", esc(b.nextLabel));
      await send(
        [b.creatorEmail],
        `[${esc(b.maPhieu)}] ${title}`,
        shell(title, isBack ? "#e11d48" : "#005BAC", info + extra, note, button, cfg.company_name)
      );
    }

    // ─── 2. Thư cho CẤP KẾ TIẾP ───
    if (b.event !== "tra_lai" && b.nextApproverEmails?.length) {
      const title = "Có phiếu trình ký chờ bạn xử lý";
      const extra =
        row("Đang chờ", esc(b.nextLabel)) +
        row("Người lập", esc(b.creatorName || b.creatorEmail));
      await send(
        b.nextApproverEmails,
        `[${esc(b.maPhieu)}] ${title}`,
        shell(title, "#d97706", info + extra, "", button, cfg.company_name)
      );
    }

    return NextResponse.json({ ok: true, sent, failed });
  } catch (error: unknown) {
    console.error("Send signing email error:", error);
    const msg = error instanceof Error ? error.message : "Lỗi gửi email";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
