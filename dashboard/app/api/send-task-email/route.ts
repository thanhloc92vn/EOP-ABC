import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";

// Email báo NHÂN VIÊN ĐƯỢC GIAO VIỆC MỚI.
// Chỉ gọi khi người giao là cấp quản lý / ban lãnh đạo và giao cho NGƯỜI KHÁC —
// nhân viên tự tạo việc cho mình thì không gửi (xử lý ở tasks/page.tsx).
//
// Người gửi luôn là email hệ thống đã cấu hình (Cài đặt hệ thống > SMTP), giống
// các module Đăng ký xe / phòng họp: server ưu tiên SMTP_USER/SMTP_PASS, chỉ dùng
// cấu hình từ trình duyệt khi server chưa đặt biến môi trường.
export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { smtpConfig, task, assigneeEmails, assigneeName, assignedByName, assignedByRole } = body;

    const envConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    const smtpUser = envConfigured ? (process.env.SMTP_USER as string) : (smtpConfig?.user || "");
    const smtpPass = envConfigured ? (process.env.SMTP_PASS as string) : (smtpConfig?.pass || "");
    const smtpHost = envConfigured ? (process.env.SMTP_HOST || "smtp.gmail.com") : (smtpConfig?.host || "smtp.gmail.com");
    const portNum = envConfigured ? (Number(process.env.SMTP_PORT) || 465) : (Number(smtpConfig?.port) || 465);

    if (!smtpUser || !smtpPass) {
      return NextResponse.json({ error: "Chưa cấu hình SMTP gửi email (Cài đặt hệ thống hoặc biến môi trường SMTP_USER/SMTP_PASS)!" }, { status: 400 });
    }
    if (!task?.title) {
      return NextResponse.json({ error: "Thiếu thông tin công việc!" }, { status: 400 });
    }

    // Nhân viên có thể có nhiều email (công ty + cá nhân). Ưu tiên email CÔNG TY —
    // nhận diện bằng cách so tên miền với email hệ thống đang gửi, nên không phải
    // gắn cứng tên miền của riêng một công ty nào.
    const senderDomain = (smtpUser.split("@")[1] || "").toLowerCase();
    const candidates = String(assigneeEmails || "")
      .split(",")
      .map((e: string) => e.trim())
      .filter(Boolean);
    const recipient =
      candidates.find((e: string) => e.toLowerCase().endsWith(`@${senderDomain}`)) || candidates[0] || "";

    if (!recipient) {
      return NextResponse.json({ error: "Nhân viên này chưa có email trong Danh sách nhân viên!" }, { status: 400 });
    }

    const cfg = await getTenantConfigServer();
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: portNum,
      secure: envConfigured ? portNum === 465 : (smtpConfig?.secure === undefined ? portNum === 465 : !!smtpConfig?.secure),
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });

    const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("vi-VN") : "-");
    const siteOrigin = body.siteUrl || request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || cfg.site_url;
    const tasksUrl = `${siteOrigin}/tasks`;

    const priorityColor =
      task.priority === "Cao" ? "#ef4444" : task.priority === "Thấp" ? "#64748b" : "#f59e0b";

    const infoRow = (label: string, value: string) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 14px; width: 38%; background-color: #f8fafc; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.03em;">${label}</td>
        <td style="padding: 10px 14px; color: #1e293b; font-size: 13px; font-weight: 600;">${value || "-"}</td>
      </tr>`;

    const detailRows = [
      infoRow("Tên công việc", task.title),
      infoRow("Mức ưu tiên", `<span style="color:${priorityColor};font-weight:800;">${task.priority || "Trung bình"}</span>`),
      infoRow("Ngày bắt đầu", fmtDate(task.start_date)),
      infoRow("Hạn hoàn thành", fmtDate(task.due_date)),
      task.description ? infoRow("Mô tả công việc", String(task.description).replace(/\n/g, "<br>")) : "",
      task.link ? infoRow("Tài liệu liên quan", `<a href="${task.link}" style="color:#005BAC;">${task.link}</a>`) : "",
      infoRow("Người giao việc", `${assignedByName || "-"}${assignedByRole ? ` — ${assignedByRole}` : ""}`),
    ].join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Công việc mới</title></head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
        <div style="max-width: 640px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">

          <div style="background-color: #005BAC; background: linear-gradient(135deg, #005BAC 0%, #1e40af 100%); padding: 32px 40px; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 850; letter-spacing: -0.025em; color: #ffffff;">📌 Bạn Được Giao Công Việc Mới</h1>
            <div style="font-size: 13px; color: #bfdbfe; margin-top: 6px; font-weight: 500;">Hệ thống quản trị - ${cfg.company_name}</div>
          </div>

          <div style="padding: 28px 40px 8px 40px;">
            <p style="margin: 0 0 10px 0; font-size: 15px; line-height: 1.6; color: #334155;">
              Kính gửi Anh/Chị: <strong style="color: #005BAC; font-size: 16px;">${assigneeName || ""}</strong>,
            </p>
            <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #475569;">
              <strong style="color: #005BAC;">${assignedByName || "Quản lý"}</strong> vừa giao cho Anh/Chị một công việc mới
              trên hệ thống. Anh/Chị vui lòng xem chi tiết bên dưới và cập nhật tiến độ đúng hạn.
            </p>
          </div>

          <div style="padding: 18px 40px 8px 40px;">
            <div style="border: 1px solid #e2e8f0; border-left: 4px solid #005BAC; border-radius: 12px; overflow: hidden;">
              <table style="width: 100%; border-collapse: collapse;">${detailRows}</table>
            </div>
          </div>

          <div style="padding: 26px 40px 10px 40px; text-align: center;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
              <tr>
                <td align="center" bgcolor="#005BAC" style="background-color: #005BAC; border-radius: 12px;">
                  <a href="${tasksUrl}" target="_blank"
                     style="display: inline-block; padding: 14px 36px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 12px; letter-spacing: 0.02em;">
                    📋 Mở bảng công việc của tôi
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin: 12px 0 0 0; font-size: 11px; color: #94a3b8;">
              Đăng nhập bằng tài khoản Google của công ty nếu hệ thống yêu cầu.
            </p>
          </div>

          <div style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5; margin-top: 16px;">
            Trực thuộc hệ thống quản trị - <strong>${cfg.company_name}</strong><br>
            Email này được gửi tự động khi Anh/Chị được giao việc. Vui lòng không trả lời trực tiếp email này.
          </div>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: `"${cfg.email_sender_name}" <${smtpUser}>`,
      to: recipient,
      subject: `📌 Công việc mới: ${task.title}${task.due_date ? ` (hạn ${fmtDate(task.due_date)})` : ""}`,
      html,
    });

    return NextResponse.json({ success: true, message: `Đã gửi email giao việc tới ${assigneeName} (${recipient})` });
  } catch (error: any) {
    console.error("Error sending task assignment email:", error);
    return NextResponse.json({ error: error.message || "Lỗi không xác định khi gửi email!" }, { status: 500 });
  }
}
