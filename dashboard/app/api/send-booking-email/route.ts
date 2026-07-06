import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

// Gửi email thông báo kết quả duyệt đăng ký xe / phòng họp cho người đăng ký.
// SMTP config ưu tiên lấy từ body (localStorage của người duyệt — cùng pattern C&B),
// nếu không có thì fallback sang biến môi trường SMTP_USER / SMTP_PASS / SMTP_HOST / SMTP_PORT.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { smtpConfig, booking, decision, rejectReason, approverName } = body;

    const smtpUser = smtpConfig?.user || process.env.SMTP_USER || "";
    const smtpPass = smtpConfig?.pass || process.env.SMTP_PASS || "";
    const smtpHost = smtpConfig?.host || process.env.SMTP_HOST || "smtp.gmail.com";
    const portNum = Number(smtpConfig?.port || process.env.SMTP_PORT) || 465;

    if (!smtpUser || !smtpPass) {
      return NextResponse.json({ error: "Chưa cấu hình SMTP gửi email (cấu hình tại trang C&B hoặc biến môi trường SMTP_USER/SMTP_PASS)!" }, { status: 400 });
    }
    if (!booking || !booking.requester_email) {
      return NextResponse.json({ error: "Thiếu thông tin đăng ký hoặc email người nhận!" }, { status: 400 });
    }

    const isApproved = decision === "approved";
    const isVehicle = booking.booking_type === "xe";
    const typeLabel = isVehicle ? "Đăng ký xe công tác" : "Đăng ký phòng họp";

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: portNum,
      secure: smtpConfig?.secure === undefined ? portNum === 465 : !!smtpConfig?.secure,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });

    const fmtTime = (iso: string) => {
      if (!iso) return "-";
      const d = new Date(iso);
      return `${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ngày ${d.toLocaleDateString("vi-VN")}`;
    };

    const attendees: string[] = Array.isArray(booking.attendees) ? booking.attendees : [];
    const statusColor = isApproved ? "#10b981" : "#ef4444";
    const statusBg = isApproved ? "#f0fdf4" : "#fef2f2";
    const statusBorder = isApproved ? "#bbf7d0" : "#fca5a5";
    const statusText = isApproved ? "ĐÃ ĐƯỢC PHÊ DUYỆT" : "KHÔNG ĐƯỢC PHÊ DUYỆT";

    const infoRow = (label: string, value: string) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 14px; width: 38%; background-color: #f8fafc; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.03em;">${label}</td>
        <td style="padding: 10px 14px; color: #1e293b; font-size: 13px; font-weight: 600;">${value || "-"}</td>
      </tr>`;

    const detailRows = [
      infoRow("Loại đăng ký", typeLabel),
      infoRow(isVehicle ? "Xe đăng ký" : "Phòng họp", booking.resource_name),
      infoRow("Người chủ trì", booking.host_name),
      infoRow("Người đăng ký", booking.requester_name),
      infoRow("Phòng ban", booking.department),
      infoRow("Thời gian bắt đầu", fmtTime(booking.start_time)),
      infoRow("Thời gian kết thúc", fmtTime(booking.end_time)),
      infoRow(isVehicle ? "Mục đích sử dụng xe" : "Nội dung cuộc họp", booking.content),
      infoRow("Thành phần tham dự", booking.participant_type === "khach_hang" ? "Có khách hàng / đối tác bên ngoài" : "Nội bộ công ty"),
      booking.participant_type === "khach_hang" ? infoRow("Thông tin khách hàng", booking.customer_info) : "",
      infoRow("Số lượng người", String(booking.attendee_count || attendees.length || "-")),
      attendees.length > 0 ? infoRow("Nhân viên tham dự", attendees.join(", ")) : "",
      booking.notes ? infoRow("Ghi chú hậu cần", booking.notes) : "",
      infoRow("Trưởng phòng xác nhận", booking.manager_approved_by),
      infoRow("Người duyệt cuối (HCNS)", approverName || booking.final_decision_by),
    ].join("");

    const resultBlock = isApproved
      ? `
        <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #334155;">
          Yêu cầu <strong>${typeLabel.toLowerCase()}</strong> của Anh/Chị đã được Phòng Hành chính Nhân sự
          <strong style="color: #10b981;">phê duyệt</strong>. ${isVehicle ? "Xe" : "Phòng họp"} <strong>${booking.resource_name}</strong>
          đã được giữ chỗ theo đúng khung thời gian đăng ký bên dưới.
        </p>
        <p style="margin: 10px 0 0 0; font-size: 13px; line-height: 1.7; color: #475569;">
          Anh/Chị vui lòng có mặt đúng giờ và bàn giao lại ${isVehicle ? "xe" : "phòng họp"} sau khi sử dụng.
          Trường hợp thay đổi kế hoạch, vui lòng thông báo sớm cho bộ phận điều phối (Phòng HCNS) để sắp xếp lại lịch.
        </p>`
      : `
        <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #334155;">
          Rất tiếc, yêu cầu <strong>${typeLabel.toLowerCase()}</strong> của Anh/Chị
          <strong style="color: #ef4444;">chưa được phê duyệt</strong> trong đợt này.
        </p>
        ${rejectReason ? `
        <div style="margin-top: 12px; padding: 14px 16px; background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 8px;">
          <div style="font-size: 11px; font-weight: bold; color: #7f1d1d; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Lý do từ chối</div>
          <div style="font-size: 13px; color: #991b1b; font-weight: 600;">${rejectReason}</div>
        </div>` : ""}
        <p style="margin: 12px 0 0 0; font-size: 13px; line-height: 1.7; color: #475569;">
          Anh/Chị vui lòng liên hệ Phòng Hành chính Nhân sự để được hỗ trợ sắp xếp khung thời gian
          hoặc phương án thay thế phù hợp, sau đó gửi lại đăng ký mới trên hệ thống.
        </p>`;

    const mailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Kết quả đăng ký</title></head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
        <div style="max-width: 640px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">

          <!-- Banner Header -->
          <div style="background: linear-gradient(135deg, #005BAC 0%, #1e40af 100%); padding: 32px 40px; color: #ffffff;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: #93c5fd; margin-bottom: 8px;">TRUNG NAM E&C — PHÒNG HÀNH CHÍNH NHÂN SỰ</div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 850; letter-spacing: -0.025em; color: #ffffff;">Kết Quả ${typeLabel}</h1>
            <div style="font-size: 13px; color: #bfdbfe; margin-top: 6px; font-weight: 500;">Hệ thống điều phối xe & phòng họp — PM-HCNS-TNEC</div>
          </div>

          <!-- Status Banner -->
          <div style="margin: 28px 40px 0 40px; padding: 16px 20px; background-color: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 12px; text-align: center;">
            <span style="font-size: 16px; font-weight: 900; color: ${statusColor}; letter-spacing: 0.05em;">${isApproved ? "✅" : "❌"} ${statusText}</span>
          </div>

          <!-- Greeting & Result -->
          <div style="padding: 24px 40px 8px 40px;">
            <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #334155;">
              Kính gửi Anh/Chị: <strong style="color: #005BAC; font-size: 16px;">${booking.requester_name || ""}</strong>,
            </p>
            ${resultBlock}
          </div>

          <!-- Booking Details -->
          <div style="padding: 20px 40px 8px 40px;">
            <h4 style="margin: 0 0 12px 0; font-size: 13px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Thông tin chi tiết đăng ký</h4>
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
              <table style="width: 100%; border-collapse: collapse;">${detailRows}</table>
            </div>
          </div>

          <!-- Contact note -->
          <div style="margin: 20px 40px 32px 40px; padding: 16px 20px; background-color: #f8fafc; border-left: 4px solid #005BAC; border-radius: 8px;">
            <span style="font-size: 12.5px; line-height: 1.6; color: #475569;">
              Mọi thắc mắc về điều phối xe & phòng họp, Anh/Chị vui lòng liên hệ trực tiếp
              <strong>Phòng Hành chính Nhân sự</strong> hoặc phản hồi qua email:
              <a href="mailto:${smtpUser}" style="color: #005BAC; font-weight: 600; text-decoration: none;">${smtpUser}</a>.
            </span>
          </div>

          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5;">
            Trực thuộc hệ thống quản trị nhân sự <strong>PM-HCNS-TNEC</strong><br>
            Email này được gửi tự động sau khi có kết quả phê duyệt. Vui lòng không trả lời trực tiếp email này.
          </div>
        </div>
      </body>
      </html>
    `;

    const dateStr = booking.start_time ? new Date(booking.start_time).toLocaleDateString("vi-VN") : "";
    await transporter.sendMail({
      from: `"Phòng HCNS TNEC" <${smtpUser}>`,
      to: booking.requester_email,
      subject: `[Trung Nam E&C] ${isApproved ? "✅ Đã duyệt" : "❌ Từ chối"} - ${typeLabel} ${booking.resource_name} ngày ${dateStr}`,
      html: mailHtml,
    });

    return NextResponse.json({ success: true, message: `Đã gửi email kết quả cho ${booking.requester_name} (${booking.requester_email})` });
  } catch (error: any) {
    console.error("Error sending booking result email:", error);
    return NextResponse.json({ error: error.message || "Lỗi không xác định khi gửi email!" }, { status: 500 });
  }
}
