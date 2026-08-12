import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";

// Email báo "BẠN ĐƯỢC GIAO THEO DÕI TIẾP một công việc" — gửi khi có người được
// tag trong một dòng cập nhật ở cột "Update thông tin" (bảng task_updates,
// migration 038).
//
// VÌ SAO KHÔNG DÙNG LẠI /api/send-task-email: route đó viết thẳng trong nội dung
// thư là "Bạn Được Giao Công Việc Mới" và liệt kê ưu tiên / ngày bắt đầu / hạn
// hoàn thành của TASK. Ở đây thứ cần đưa lên đầu là NỘI DUNG CẬP NHẬT và HẠN KẾ
// TIẾP — việc gốc đã xong rồi, cái người nhận cần biết là bước tiếp theo phải
// làm gì. Nhét thêm cờ vào route cũ chỉ làm nó thành hai lá thư trong một hàm.
//
// Phần SMTP + chọn email công ty giữ y hệt send-task-email để hai luồng không
// trôi lệch nhau về sau.
export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      smtpConfig, taskTitle, projectCode, projectName,
      updateContent, nextDueDate, taggedEmails, taggedName, updatedByName,
    } = body;

    const envConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    const smtpUser = envConfigured ? (process.env.SMTP_USER as string) : (smtpConfig?.user || "");
    const smtpPass = envConfigured ? (process.env.SMTP_PASS as string) : (smtpConfig?.pass || "");
    const smtpHost = envConfigured ? (process.env.SMTP_HOST || "smtp.gmail.com") : (smtpConfig?.host || "smtp.gmail.com");
    const portNum = envConfigured ? (Number(process.env.SMTP_PORT) || 465) : (Number(smtpConfig?.port) || 465);

    if (!smtpUser || !smtpPass) {
      return NextResponse.json({ error: "Chưa cấu hình SMTP gửi email (Cài đặt hệ thống hoặc biến môi trường SMTP_USER/SMTP_PASS)!" }, { status: 400 });
    }
    if (!taskTitle || !updateContent) {
      return NextResponse.json({ error: "Thiếu tên công việc hoặc nội dung cập nhật!" }, { status: 400 });
    }

    // Ưu tiên email CÔNG TY: so tên miền với email hệ thống đang gửi, không gắn
    // cứng tên miền của riêng công ty nào (giống send-task-email).
    const senderDomain = (smtpUser.split("@")[1] || "").toLowerCase();
    const candidates = String(taggedEmails || "")
      .split(",")
      .map((e: string) => e.trim())
      .filter(Boolean);
    const recipient =
      candidates.find((e: string) => e.toLowerCase().endsWith(`@${senderDomain}`)) || candidates[0] || "";

    if (!recipient) {
      return NextResponse.json({ error: "Người được giao theo dõi chưa có email trong Danh sách nhân viên!" }, { status: 400 });
    }

    const cfg = await getTenantConfigServer();
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: portNum,
      secure: envConfigured ? portNum === 465 : (smtpConfig?.secure === undefined ? portNum === 465 : !!smtpConfig?.secure),
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });

    // Route API chạy ở giờ UTC — KHÔNG truyền timeZone thì ngày bị lùi một hôm
    // với mọi thao tác trước 7h sáng giờ Việt Nam.
    const fmtDate = (d?: string) =>
      d ? new Date(`${String(d).slice(0, 10)}T00:00:00+07:00`).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "-";

    const esc = (s: unknown) =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const siteOrigin = body.siteUrl || request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || cfg.site_url;
    const tasksUrl = `${siteOrigin}/tasks`;

    const infoRow = (label: string, value: string) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 14px; width: 38%; background-color: #f8fafc; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.03em;">${label}</td>
        <td style="padding: 10px 14px; color: #1e293b; font-size: 13px; font-weight: 600;">${value || "-"}</td>
      </tr>`;

    const projectLabel = projectCode
      ? `<span style="font-family:monospace;font-weight:800;color:#005BAC;">${esc(projectCode)}</span>${projectName ? ` — ${esc(projectName)}` : ""}`
      : (projectName ? esc(projectName) : "-");

    const detailRows = [
      infoRow("Công việc", esc(taskTitle)),
      infoRow("Dự án", projectLabel),
      infoRow("Hạn kế tiếp", nextDueDate
        ? `<span style="color:#b45309;font-weight:800;">${fmtDate(nextDueDate)}</span>`
        : "Chưa đặt hạn"),
      infoRow("Người cập nhật", esc(updatedByName) || "-"),
    ].join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Giao theo dõi công việc</title></head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
        <div style="max-width: 640px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">

          <div style="background-color: #b45309; background: linear-gradient(135deg, #d97706 0%, #b45309 100%); padding: 32px 40px; color: #ffffff;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: #fde68a; margin-bottom: 8px;">${cfg.company_name.toUpperCase()} — ${cfg.system_subtitle.toUpperCase()}</div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 850; letter-spacing: -0.025em; color: #ffffff;">🔄 Bạn Được Giao Theo Dõi Tiếp</h1>
            <div style="font-size: 13px; color: #fef3c7; margin-top: 6px; font-weight: 500;">Quản lý công việc — ${cfg.system_title}</div>
          </div>

          <div style="padding: 28px 40px 8px 40px;">
            <p style="margin: 0 0 10px 0; font-size: 15px; line-height: 1.6; color: #334155;">
              Kính gửi Anh/Chị: <strong style="color: #b45309; font-size: 16px;">${esc(taggedName)}</strong>,
            </p>
            <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #475569;">
              <strong style="color: #b45309;">${esc(updatedByName) || "Quản lý"}</strong> vừa cập nhật một công việc đã hoàn thành
              phần thi công và giao Anh/Chị <strong>theo dõi bước tiếp theo</strong>.
            </p>
          </div>

          <div style="padding: 18px 40px 4px 40px;">
            <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; border-radius: 12px; padding: 16px 18px;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #92400e; margin-bottom: 8px;">Nội dung cập nhật</div>
              <div style="font-size: 14px; line-height: 1.7; color: #1e293b; font-weight: 500;">${esc(updateContent).replace(/\n/g, "<br>")}</div>
            </div>
          </div>

          <div style="padding: 16px 40px 8px 40px;">
            <div style="border: 1px solid #e2e8f0; border-left: 4px solid #005BAC; border-radius: 12px; overflow: hidden;">
              <table style="width: 100%; border-collapse: collapse;">${detailRows}</table>
            </div>
          </div>

          <div style="padding: 26px 40px 10px 40px; text-align: center;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
              <tr>
                <td align="center" bgcolor="#b45309" style="background-color: #b45309; border-radius: 12px;">
                  <a href="${tasksUrl}" target="_blank"
                     style="display: inline-block; padding: 14px 36px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 12px; letter-spacing: 0.02em;">
                    📋 Mở danh sách việc theo dõi
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin: 12px 0 0 0; font-size: 11px; color: #94a3b8;">
              Danh sách việc theo dõi nằm ngay dưới bảng công việc.
            </p>
          </div>

          <div style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5; margin-top: 16px;">
            Trực thuộc hệ thống quản trị nhân sự <strong>${cfg.system_title}</strong><br>
            Email này được gửi tự động khi Anh/Chị được giao theo dõi công việc. Vui lòng không trả lời trực tiếp email này.
          </div>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: `"${cfg.email_sender_name}" <${smtpUser}>`,
      to: recipient,
      subject: `[${cfg.company_name}] 🔄 Theo dõi tiếp: ${taskTitle}${nextDueDate ? ` (hạn ${fmtDate(nextDueDate)})` : ""}`,
      html,
    });

    return NextResponse.json({ success: true, message: `Đã gửi email theo dõi tới ${taggedName} (${recipient})` });
  } catch (error: any) {
    console.error("Error sending tracking email:", error);
    return NextResponse.json({ error: error.message || "Lỗi không xác định khi gửi email!" }, { status: 500 });
  }
}
