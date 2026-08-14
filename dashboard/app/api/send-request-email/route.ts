import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";

// Email cho đơn Nghỉ phép / Công tác (bảng `tasks`, luồng duyệt 2 cấp: Trưởng phòng/Tổ
// trưởng -> HCNS). Hai chế độ:
//  - mode "notify_approver": báo người duyệt (cấp 1 hoặc cấp 2) có đơn mới chờ xử lý,
//    kèm nút bấm mở thẳng trang Duyệt yêu cầu.
//  - mặc định ("result"): gửi kết quả duyệt / từ chối cho người gửi đơn.
// SMTP: ưu tiên email hệ thống trên server (SMTP_USER/SMTP_PASS), fallback cấu hình
// trình duyệt người thao tác — cùng pattern với send-booking-email.
function extractLeaveInfo(notes: string) {
  const typeMatch = notes.match(/Loại nghỉ phép:\s*([^.]+)\./i);
  const reasonMatch = notes.match(/Lý do:\s*(.*)/i);
  const isAutoApproved = /Được duyệt tự động/i.test(notes);
  return {
    leaveType: typeMatch?.[1]?.trim() || "Nghỉ phép",
    reason: reasonMatch?.[1]?.trim() || "",
    isAutoApproved,
  };
}

function extractTripInfo(notes: string) {
  const destMatch = notes.match(/-\s+\*\*Điểm công tác chính\*\*:\s*(.*)/i);
  const missionMatch = notes.match(/-\s+\*\*Nhiệm vụ cụ thể\*\*:\s*(.*)/i);
  const transportMatch = notes.match(/-\s+\*\*Phương tiện chính\*\*:\s*(.*)/i);
  const metaMatch = notes.match(/<!--METADATA:(.*?)-->/);
  let totalAmount: number | null = null;
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch[1]);
      if (meta && typeof meta.totalAmount !== "undefined") totalAmount = Number(meta.totalAmount);
    } catch {
      // bỏ qua nếu metadata không parse được, dùng giá trị mặc định null
    }
  }
  return {
    destination: destMatch?.[1]?.trim() || "",
    mission: missionMatch?.[1]?.trim() || "",
    transport: transportMatch?.[1]?.trim() || "",
    totalAmount,
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { smtpConfig, task, requestType, decision, rejectReason, deciderName, mode, approverEmails, stage, requesterEmail } = body;
    const isNotifyMode = mode === "notify_approver";
    const isTrip = requestType === "trip";
    const typeLabel = isTrip ? "Đơn Đi Công Tác" : "Đơn Xin Nghỉ Phép";
    // Brand công ty (tenant_config): tên gửi, tiêu đề hệ thống, URL trong email
    const cfg = await getTenantConfigServer();

    const envConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    const smtpUser = envConfigured ? (process.env.SMTP_USER as string) : (smtpConfig?.user || "");
    const smtpPass = envConfigured ? (process.env.SMTP_PASS as string) : (smtpConfig?.pass || "");
    const smtpHost = envConfigured ? (process.env.SMTP_HOST || "smtp.gmail.com") : (smtpConfig?.host || "smtp.gmail.com");
    const portNum = envConfigured ? (Number(process.env.SMTP_PORT) || 465) : (Number(smtpConfig?.port) || 465);

    if (!smtpUser || !smtpPass) {
      return NextResponse.json({ error: "Chưa cấu hình SMTP gửi email (cấu hình tại Cài đặt hệ thống hoặc biến môi trường SMTP_USER/SMTP_PASS)!" }, { status: 400 });
    }
    if (!task) {
      return NextResponse.json({ error: "Thiếu thông tin đơn!" }, { status: 400 });
    }
    if (isNotifyMode && !approverEmails) {
      return NextResponse.json({ error: "Thiếu email người duyệt để gửi thông báo!" }, { status: 400 });
    }
    if (!isNotifyMode && !requesterEmail) {
      return NextResponse.json({ error: "Thiếu email người nhận kết quả!" }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: portNum,
      secure: envConfigured ? portNum === 465 : (smtpConfig?.secure === undefined ? portNum === 465 : !!smtpConfig?.secure),
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
    });

    const notes: string = task.notes || "";
    const leaveInfo = !isTrip ? extractLeaveInfo(notes) : null;
    const tripInfo = isTrip ? extractTripInfo(notes) : null;

    const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString("vi-VN") : "-");
    const fmtMoney = (n: number | null) => (n === null ? "-" : n.toLocaleString("vi-VN") + " đ");

    const infoRow = (label: string, value: string) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 14px; width: 38%; background-color: #f8fafc; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.03em;">${label}</td>
        <td style="padding: 10px 14px; color: #1e293b; font-size: 13px; font-weight: 600;">${value || "-"}</td>
      </tr>`;

    const dateRangeStr = `${fmtDate(task.start_date)} ➔ ${fmtDate(task.due_date)}`;

    const baseRows = isTrip
      ? [
          infoRow("Người đăng ký", task.assignee),
          infoRow("Thời gian", dateRangeStr),
          infoRow("Điểm công tác", tripInfo?.destination || ""),
          infoRow("Phương tiện", tripInfo?.transport || ""),
          infoRow("Nhiệm vụ cụ thể", tripInfo?.mission || ""),
          tripInfo?.totalAmount !== null ? infoRow("Tổng đề nghị thanh toán", fmtMoney(tripInfo!.totalAmount)) : "",
        ]
      : [
          infoRow("Người đăng ký", task.assignee),
          infoRow("Loại nghỉ phép", leaveInfo?.leaveType || ""),
          infoRow("Thời gian", dateRangeStr),
          infoRow("Lý do", leaveInfo?.reason || ""),
        ];

    // ━━━ CHẾ ĐỘ THÔNG BÁO NGƯỜI DUYỆT ━━━
    if (isNotifyMode) {
      const isHcnsStage = stage === "hcns";
      const stageLabel = isHcnsStage ? "xác nhận (phòng HCNS)" : "phê duyệt cấp Trưởng phòng / Tổ trưởng";
      const siteOrigin = body.siteUrl || request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || cfg.site_url;
      const approvalUrl = `${siteOrigin}/settings?tab=approvals&subtab=${isTrip ? "trip" : "leave"}`;

      const notifyRows = [
        ...baseRows,
        isHcnsStage && task.manager_approved_by ? infoRow("Trưởng phòng/Tổ trưởng đã phê duyệt", task.manager_approved_by) : "",
      ].join("");

      const notifyHtml = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Yêu cầu chờ duyệt</title></head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
          <div style="max-width: 640px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">

            <!-- Banner Header -->
            <div style="background-color: #005BAC; background: linear-gradient(135deg, #005BAC 0%, #1e40af 100%); padding: 32px 40px; color: #ffffff;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 850; letter-spacing: -0.025em; color: #ffffff;">🔔 ${typeLabel} Chờ Duyệt</h1>
              <div style="font-size: 13px; color: #bfdbfe; margin-top: 6px; font-weight: 500;">Hệ thống quản trị - ${cfg.company_name}</div>
            </div>

            <!-- Greeting -->
            <div style="padding: 28px 40px 8px 40px;">
              <p style="margin: 0 0 10px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Kính gửi Anh/Chị,
              </p>
              <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #475569;">
                Có một <strong>${typeLabel.toLowerCase()}</strong> từ
                <strong style="color: #005BAC;">${task.assignee || "nhân viên"}</strong>
                đang <strong>chờ Anh/Chị ${stageLabel}</strong> trên hệ thống. Thông tin chi tiết:
              </p>
            </div>

            <!-- Details -->
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
                Nút sẽ mở trang <strong>Duyệt yêu cầu → ${isTrip ? "1. Duyệt công tác" : "2. Duyệt Nghỉ Phép"}</strong> (đăng nhập bằng tài khoản Google của Anh/Chị nếu được hỏi).
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
        subject: `🔔 Chờ duyệt: ${typeLabel} - ${task.assignee || ""}`,
        html: notifyHtml,
      });

      return NextResponse.json({ success: true, message: `Đã gửi email thông báo chờ duyệt tới: ${uniqueRecipients}` });
    }

    // ━━━ CHẾ ĐỘ KẾT QUẢ DUYỆT / TỪ CHỐI ━━━
    const isApproved = decision === "approved";
    const statusColor = isApproved ? "#10b981" : "#ef4444";
    const statusBg = isApproved ? "#f0fdf4" : "#fef2f2";
    const statusBorder = isApproved ? "#bbf7d0" : "#fca5a5";
    const statusText = isApproved ? "ĐÃ ĐƯỢC PHÊ DUYỆT" : "KHÔNG ĐƯỢC PHÊ DUYỆT";

    const detailRows = [
      ...baseRows,
      task.manager_approved_by ? infoRow("Trưởng phòng/Tổ trưởng phê duyệt", task.manager_approved_by) : "",
      infoRow(isApproved ? "Người xác nhận (phòng HCNS)" : "Người từ chối", deciderName || task.final_decision_by),
    ].join("");

    const resultBlock = isApproved
      ? `
        <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #334155;">
          ${typeLabel} của Anh/Chị đã được
          <strong style="color: #10b981;">phê duyệt</strong>. Vui lòng sắp xếp công việc bàn giao
          (nếu có) trước thời gian ${isTrip ? "đi công tác" : "nghỉ phép"} ở trên.
        </p>`
      : `
        <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #334155;">
          Rất tiếc, ${typeLabel.toLowerCase()} của Anh/Chị
          <strong style="color: #ef4444;">chưa được phê duyệt</strong> trong đợt này.
        </p>
        ${rejectReason ? `
        <div style="margin-top: 12px; padding: 14px 16px; background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 8px;">
          <div style="font-size: 11px; font-weight: bold; color: #7f1d1d; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Lý do từ chối</div>
          <div style="font-size: 13px; color: #991b1b; font-weight: 600;">${rejectReason}</div>
        </div>` : ""}
        <p style="margin: 12px 0 0 0; font-size: 13px; line-height: 1.7; color: #475569;">
          Anh/Chị vui lòng liên hệ Phòng Hành chính Nhân sự hoặc người duyệt để biết thêm chi tiết,
          sau đó có thể gửi lại đơn mới trên hệ thống nếu cần.
        </p>`;

    const mailHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Kết quả đơn</title></head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
        <div style="max-width: 640px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">

          <!-- Banner Header -->
          <div style="background-color: #005BAC; background: linear-gradient(135deg, #005BAC 0%, #1e40af 100%); padding: 32px 40px; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 850; letter-spacing: -0.025em; color: #ffffff;">Kết Quả ${typeLabel}</h1>
            <div style="font-size: 13px; color: #bfdbfe; margin-top: 6px; font-weight: 500;">Hệ thống quản trị - ${cfg.company_name}</div>
          </div>

          <!-- Status Banner -->
          <div style="margin: 28px 40px 0 40px; padding: 16px 20px; background-color: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 12px; text-align: center;">
            <span style="font-size: 16px; font-weight: 900; color: ${statusColor}; letter-spacing: 0.05em;">${isApproved ? "✅" : "❌"} ${statusText}</span>
          </div>

          <!-- Greeting & Result -->
          <div style="padding: 24px 40px 8px 40px;">
            <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #334155;">
              Kính gửi Anh/Chị: <strong style="color: #005BAC; font-size: 16px;">${task.assignee || ""}</strong>,
            </p>
            ${resultBlock}
          </div>

          <!-- Details -->
          <div style="padding: 20px 40px 8px 40px;">
            <h4 style="margin: 0 0 12px 0; font-size: 13px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Thông tin chi tiết đơn</h4>
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
              <table style="width: 100%; border-collapse: collapse;">${detailRows}</table>
            </div>
          </div>

          <!-- Contact note -->
          <div style="margin: 20px 40px 32px 40px; padding: 16px 20px; background-color: #f8fafc; border-left: 4px solid #005BAC; border-radius: 8px;">
            <span style="font-size: 12.5px; line-height: 1.6; color: #475569;">
              Mọi thắc mắc, Anh/Chị vui lòng liên hệ trực tiếp <strong>Phòng Hành chính Nhân sự</strong>
              hoặc phản hồi qua email: <a href="mailto:${smtpUser}" style="color: #005BAC; font-weight: 600; text-decoration: none;">${smtpUser}</a>.
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

    await transporter.sendMail({
      from: `"${cfg.email_sender_name}" <${smtpUser}>`,
      to: requesterEmail,
      subject: `${isApproved ? "✅ Đã duyệt" : "❌ Từ chối"} - ${typeLabel} - ${task.assignee || ""}`,
      html: mailHtml,
    });

    return NextResponse.json({ success: true, message: `Đã gửi email kết quả cho ${task.assignee} (${requesterEmail})` });
  } catch (error: any) {
    console.error("Error sending leave/trip request email:", error);
    return NextResponse.json({ error: error.message || "Lỗi không xác định khi gửi email!" }, { status: 500 });
  }
}
