import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";

// Email của module Đăng ký xe / phòng họp. Hai chế độ:
//  - mode "notify_approver": báo người duyệt (Trưởng phòng / HCNS) có yêu cầu mới chờ xử lý,
//    kèm nút bấm mở thẳng trang Duyệt yêu cầu.
//  - mặc định ("result"): gửi kết quả duyệt / từ chối cho người đăng ký.
// SMTP config ưu tiên lấy từ body (localStorage của người thao tác — cùng pattern C&B),
// nếu không có thì fallback sang biến môi trường SMTP_USER / SMTP_PASS / SMTP_HOST / SMTP_PORT.
export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { smtpConfig, booking, decision, rejectReason, approverName, mode, approverEmails, stage, removedDaysLabel } = body;
    const isNotifyMode = mode === "notify_approver";

    // ƯU TIÊN email hệ thống trên server (SMTP_USER/SMTP_PASS — ổn định, không phụ thuộc
    // máy người dùng). Cấu hình từ trình duyệt chỉ dùng khi server CHƯA đặt biến môi trường,
    // tránh trường hợp nhân viên tự cấu hình sai làm mail thất bại âm thầm.
    const envConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    const smtpUser = envConfigured ? (process.env.SMTP_USER as string) : (smtpConfig?.user || "");
    const smtpPass = envConfigured ? (process.env.SMTP_PASS as string) : (smtpConfig?.pass || "");
    const smtpHost = envConfigured ? (process.env.SMTP_HOST || "smtp.gmail.com") : (smtpConfig?.host || "smtp.gmail.com");
    const portNum = envConfigured ? (Number(process.env.SMTP_PORT) || 465) : (Number(smtpConfig?.port) || 465);

    if (!smtpUser || !smtpPass) {
      return NextResponse.json({ error: "Chưa cấu hình SMTP gửi email (cấu hình tại Cài đặt hệ thống / trang C&B hoặc biến môi trường SMTP_USER/SMTP_PASS)!" }, { status: 400 });
    }
    if (!booking) {
      return NextResponse.json({ error: "Thiếu thông tin đăng ký!" }, { status: 400 });
    }
    if (isNotifyMode && !approverEmails) {
      return NextResponse.json({ error: "Thiếu email người duyệt để gửi thông báo!" }, { status: 400 });
    }
    if (!isNotifyMode && !booking.requester_email) {
      return NextResponse.json({ error: "Thiếu email người nhận kết quả!" }, { status: 400 });
    }

    const isApproved = decision === "approved";
    const isDeleted = decision === "deleted";
    // "trimmed": lịch nhiều ngày bị bỏ bớt ngày, phần còn lại VẪN hiệu lực.
    const isTrimmed = decision === "trimmed";
    const isVehicle = booking.booking_type === "xe";
    const typeLabel = isVehicle ? "Đăng ký xe công tác" : "Đăng ký phòng họp";
    // Brand công ty (tenant_config): tên gửi, tiêu đề hệ thống, URL trong email
    const cfg = await getTenantConfigServer();

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: portNum,
      secure: envConfigured ? portNum === 465 : (smtpConfig?.secure === undefined ? portNum === 465 : !!smtpConfig?.secure),
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });

    // start_time/end_time lưu ở dạng UTC (trang Đăng ký ghi bằng toISOString()).
    // Trình duyệt hiển thị đúng 15h vì máy người dùng ở giờ VN, nhưng route này
    // chạy trên server Vercel — múi giờ hệ thống là UTC. Tham số "vi-VN" chỉ
    // quyết định KIỂU hiển thị (dd/mm/yyyy), KHÔNG đổi múi giờ, nên 15h VN bị
    // in ra thành 08h. Phải chỉ định múi giờ tường minh.
    const TZ = "Asia/Ho_Chi_Minh";

    const fmtTime = (iso: string) => {
      if (!iso) return "-";
      const d = new Date(iso);
      return `${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: TZ })} ngày ${d.toLocaleDateString("vi-VN", { timeZone: TZ })}`;
    };

    const attendees: string[] = Array.isArray(booking.attendees) ? booking.attendees : [];
    const statusColor = isApproved ? "#10b981" : isTrimmed ? "#d97706" : isDeleted ? "#64748b" : "#ef4444";
    const statusBg = isApproved ? "#f0fdf4" : isTrimmed ? "#fffbeb" : isDeleted ? "#f8fafc" : "#fef2f2";
    const statusBorder = isApproved ? "#bbf7d0" : isTrimmed ? "#fcd34d" : isDeleted ? "#e2e8f0" : "#fca5a5";
    const statusText = isApproved
      ? "ĐÃ ĐƯỢC PHÊ DUYỆT"
      : isTrimmed
      ? "LỊCH ĐÃ ĐƯỢC ĐIỀU CHỈNH"
      : isDeleted
      ? "ĐÃ BỊ XOÁ KHỎI LỊCH"
      : "KHÔNG ĐƯỢC PHÊ DUYỆT";

    const infoRow = (label: string, value: string) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 14px; width: 38%; background-color: #f8fafc; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.03em;">${label}</td>
        <td style="padding: 10px 14px; color: #1e293b; font-size: 13px; font-weight: 600;">${value || "-"}</td>
      </tr>`;

    const dateStr2 = booking.start_time ? new Date(booking.start_time).toLocaleDateString("vi-VN", { timeZone: TZ }) : "";

    // ━━━ CHẾ ĐỘ THÔNG BÁO NGƯỜI DUYỆT: có yêu cầu mới chờ xử lý ━━━
    if (isNotifyMode) {
      const isFinalStage = stage === "final";
      const stageLabel = isFinalStage
        ? "xác nhận (phòng HCNS — điều phối xe & phòng họp)"
        : "phê duyệt cấp Trưởng phòng / Tổ trưởng";
      const siteOrigin = body.siteUrl || request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || cfg.site_url;
      // Mở thẳng trang Đăng ký xe/phòng họp và tự bật popup chi tiết của đúng đăng ký này
      // (không bắt người duyệt phải tự tìm trong tab "Duyệt yêu cầu" nữa).
      const approvalUrl = `${siteOrigin}/dang-ky?tab=${isVehicle ? "xe" : "phong_hop"}&bookingId=${booking.id}`;

      const notifyRows = [
        infoRow("Loại đăng ký", typeLabel),
        infoRow(isVehicle ? "Xe đăng ký" : "Phòng họp", booking.resource_name),
        infoRow("Người đăng ký", `${booking.requester_name || "-"} — ${booking.department || ""}`),
        infoRow("Người chủ trì", booking.host_name),
        infoRow("Thời gian", `${fmtTime(booking.start_time)} ➔ ${fmtTime(booking.end_time)}`),
        infoRow(isVehicle ? "Mục đích sử dụng xe" : "Nội dung cuộc họp", booking.content),
        infoRow("Số lượng người", String(booking.attendee_count || attendees.length || "-")),
        attendees.length > 0 ? infoRow("Nhân viên tham dự", attendees.join(", ")) : "",
        booking.participant_type === "khach_hang" ? infoRow("Khách hàng bên ngoài", booking.customer_info || "Có") : "",
        booking.notes ? infoRow("Ghi chú hậu cần", booking.notes) : "",
        isFinalStage && booking.manager_approved_by ? infoRow("Trưởng phòng đã phê duyệt", booking.manager_approved_by) : "",
      ].join("");

      const notifyHtml = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Yêu cầu chờ duyệt</title></head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
          <div style="max-width: 640px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">

            <!-- Banner Header -->
            <div style="background-color: #005BAC; background: linear-gradient(135deg, #005BAC 0%, #1e40af 100%); padding: 32px 40px; color: #ffffff;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 850; letter-spacing: -0.025em; color: #ffffff;">🔔 Yêu Cầu ${typeLabel} Chờ Duyệt</h1>
              <div style="font-size: 13px; color: #bfdbfe; margin-top: 6px; font-weight: 500;">Hệ thống quản trị - ${cfg.company_name}</div>
            </div>

            <!-- Greeting -->
            <div style="padding: 28px 40px 8px 40px;">
              <p style="margin: 0 0 10px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Kính gửi Anh/Chị,
              </p>
              <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #475569;">
                Có một yêu cầu <strong>${typeLabel.toLowerCase()}</strong> từ
                <strong style="color: #005BAC;">${booking.requester_name || "nhân viên"}</strong>
                (${booking.department || "—"}) đang <strong>chờ Anh/Chị ${stageLabel}</strong> trên hệ thống. Thông tin chi tiết:
              </p>
            </div>

            <!-- Booking Details -->
            <div style="padding: 18px 40px 8px 40px;">
              <div style="border: 1px solid #e2e8f0; border-left: 4px solid #005BAC; border-radius: 12px; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse;">${notifyRows}</table>
              </div>
            </div>

            <!-- CTA Button (bulletproof: dùng bgcolor trên <td> để Outlook hiển thị đúng màu nền) -->
            <div style="padding: 26px 40px 10px 40px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td align="center" bgcolor="#005BAC" style="background-color: #005BAC; border-radius: 12px;">
                    <a href="${approvalUrl}" target="_blank"
                       style="display: inline-block; padding: 14px 36px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 12px; letter-spacing: 0.02em;">
                      ✅ Xem &amp; Duyệt yêu cầu ngay
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 12px 0 0 0; font-size: 11px; color: #94a3b8;">
                Nút sẽ mở thẳng lịch <strong>${isVehicle ? "Đăng ký xe" : "Đăng ký phòng họp"}</strong> và bật popup chi tiết để Anh/Chị duyệt ngay (đăng nhập bằng tài khoản Google nếu được hỏi).
              </p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5; margin-top: 16px;">
              Trực thuộc hệ thống quản trị - <strong>${cfg.company_name}</strong><br>
              Email này được gửi tự động khi có yêu cầu mới. Vui lòng không trả lời trực tiếp email này.
            </div>
          </div>
        </body>
        </html>
      `;

      // approverEmails: chuỗi "a@x.com, b@y.com" — khử trùng lặp trước khi gửi
      const uniqueRecipients = Array.from(
        new Set(
          String(approverEmails)
            .split(",")
            .map((e: string) => e.trim().toLowerCase())
            .filter(Boolean)
        )
      ).join(", ");

      await transporter.sendMail({
        from: `"${cfg.email_sender_name}" <${smtpUser}>`,
        to: uniqueRecipients,
        subject: `🔔 Chờ duyệt: ${typeLabel} ${booking.resource_name} - ${booking.requester_name || ""} (${dateStr2})`,
        html: notifyHtml,
      });

      return NextResponse.json({ success: true, message: `Đã gửi email thông báo chờ duyệt tới: ${uniqueRecipients}` });
    }

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
      booking.manager_approved_by ? infoRow("Trưởng phòng phê duyệt", booking.manager_approved_by) : "",
      infoRow(
        isApproved
          ? "Người xác nhận (phòng HCNS)"
          : isTrimmed
          ? "Người điều chỉnh lịch"
          : isDeleted
          ? "Người xoá lịch"
          : "Người từ chối",
        approverName || booking.final_decision_by
      ),
    ].join("");

    const resultBlock = isTrimmed
      ? `
        <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #334155;">
          Lịch <strong>${typeLabel.toLowerCase()}</strong> của Anh/Chị (${isVehicle ? "xe" : "phòng họp"} <strong>${booking.resource_name}</strong>)
          đã được <strong style="color: #d97706;">điều chỉnh</strong>: bỏ ngày <strong>${removedDaysLabel || "-"}</strong>.
          Phần lịch còn lại <strong>vẫn giữ nguyên hiệu lực</strong>:
          <strong>${fmtTime(booking.start_time)} ➔ ${fmtTime(booking.end_time)}</strong>.
        </p>
        ${rejectReason ? `
        <div style="margin-top: 12px; padding: 14px 16px; background-color: #fffbeb; border-left: 4px solid #d97706; border-radius: 8px;">
          <div style="font-size: 11px; font-weight: bold; color: #92400e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Ghi chú</div>
          <div style="font-size: 13px; color: #78350f; font-weight: 600;">${rejectReason}</div>
        </div>` : ""}
        <p style="margin: 12px 0 0 0; font-size: 13px; line-height: 1.7; color: #475569;">
          ${isVehicle ? "Xe" : "Phòng họp"} đã được trả về trạng thái trống trong ngày bị bỏ, các phòng ban khác có thể đăng ký sử dụng.
          Nếu đây là nhầm lẫn, vui lòng liên hệ ngay bộ phận điều phối (Phòng HCNS).
        </p>`
      : isApproved
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
      : isDeleted
      ? `
        <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #334155;">
          Lịch <strong>${typeLabel.toLowerCase()}</strong> của Anh/Chị (${isVehicle ? "xe" : "phòng họp"} <strong>${booking.resource_name}</strong>,
          ${fmtTime(booking.start_time)} ➔ ${fmtTime(booking.end_time)})
          <strong style="color: #64748b;">đã bị xoá khỏi hệ thống</strong> — thường do đặt nhầm khung giờ/xe/phòng.
        </p>
        ${rejectReason ? `
        <div style="margin-top: 12px; padding: 14px 16px; background-color: #f8fafc; border-left: 4px solid #64748b; border-radius: 8px;">
          <div style="font-size: 11px; font-weight: bold; color: #334155; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Ghi chú</div>
          <div style="font-size: 13px; color: #475569; font-weight: 600;">${rejectReason}</div>
        </div>` : ""}
        <p style="margin: 12px 0 0 0; font-size: 13px; line-height: 1.7; color: #475569;">
          Nếu vẫn còn nhu cầu sử dụng ${isVehicle ? "xe" : "phòng họp"}, vui lòng gửi lại đăng ký mới trên hệ thống.
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
          <div style="background-color: #005BAC; background: linear-gradient(135deg, #005BAC 0%, #1e40af 100%); padding: 32px 40px; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 850; letter-spacing: -0.025em; color: #ffffff;">Kết Quả ${typeLabel}</h1>
            <div style="font-size: 13px; color: #bfdbfe; margin-top: 6px; font-weight: 500;">Hệ thống quản trị - ${cfg.company_name}</div>
          </div>

          <!-- Status Banner -->
          <div style="margin: 28px 40px 0 40px; padding: 16px 20px; background-color: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 12px; text-align: center;">
            <span style="font-size: 16px; font-weight: 900; color: ${statusColor}; letter-spacing: 0.05em;">${isApproved ? "✅" : isTrimmed ? "✂️" : isDeleted ? "🗑️" : "❌"} ${statusText}</span>
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
            Trực thuộc hệ thống quản trị - <strong>${cfg.company_name}</strong><br>
            Email này được gửi tự động sau khi có kết quả phê duyệt. Vui lòng không trả lời trực tiếp email này.
          </div>
        </div>
      </body>
      </html>
    `;

    const dateStr = booking.start_time ? new Date(booking.start_time).toLocaleDateString("vi-VN", { timeZone: TZ }) : "";
    await transporter.sendMail({
      from: `"${cfg.email_sender_name}" <${smtpUser}>`,
      to: booking.requester_email,
      subject: `${isApproved ? "✅ Đã duyệt" : isTrimmed ? "✂️ Đã điều chỉnh lịch" : isDeleted ? "🗑️ Đã xoá lịch" : "❌ Từ chối"} - ${typeLabel} ${booking.resource_name} ngày ${dateStr}`,
      html: mailHtml,
    });

    return NextResponse.json({ success: true, message: `Đã gửi email kết quả cho ${booking.requester_name} (${booking.requester_email})` });
  } catch (error: any) {
    console.error("Error sending booking result email:", error);
    return NextResponse.json({ error: error.message || "Lỗi không xác định khi gửi email!" }, { status: 500 });
  }
}
