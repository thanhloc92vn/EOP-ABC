import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import * as XLSX from "xlsx";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { smtpConfig, recipient, summary, details, month } = body;
    // Brand công ty (tenant_config): tên gửi, tiêu đề hệ thống trong email
    const cfg = await getTenantConfigServer();

    if (!smtpConfig || !smtpConfig.user || !smtpConfig.pass) {
      return NextResponse.json({ error: "Cấu hình gửi email (SMTP) không đầy đủ!" }, { status: 400 });
    }
    if (!recipient || !recipient.email || !recipient.name) {
      return NextResponse.json({ error: "Thông tin nhân viên nhận email không hợp lệ!" }, { status: 400 });
    }

    // Create a Nodemailer transporter with dynamic configuration
    const portNum = Number(smtpConfig.port) || 465;
    const isSecure = smtpConfig.secure === undefined ? (portNum === 465) : smtpConfig.secure;

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host || "smtp.gmail.com",
      port: portNum,
      secure: isSecure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
      tls: {
        rejectUnauthorized: false // Bỏ qua lỗi SSL/TLS self-signed trên máy chủ doanh nghiệp
      }
    });

    // Generate personalized Excel file for this recipient in memory
    const excelRows = details.map((day: any) => ({
      "Ngày": day.date,
      "Thứ": day.dayOfWeek,
      "Giờ Vào": day.checkin || "",
      "Giờ Ra": day.checkout || "",
      "Tổng Giờ Làm": day.hours || 0,
      "Đi Trễ (phút)": day.late || 0,
      "Về Sớm (phút)": day.early || 0,
      "Trạng Thái / Ca": day.status || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // Auto-fit column widths
    const colWidths = [
      { wch: 12 }, // Ngày
      { wch: 10 }, // Thứ
      { wch: 10 }, // Giờ Vào
      { wch: 10 }, // Giờ Ra
      { wch: 15 }, // Tổng Giờ Làm
      { wch: 15 }, // Đi Trễ (phút)
      { wch: 15 }, // Về Sớm (phút)
      { wch: 20 }, // Trạng Thái / Ca
    ];
    worksheet["!cols"] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Chi tiết chấm công`);
    
    // Write workbook to buffer
    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Build the details rows for the HTML table
    const tableRowsHtml = details.map((day: any) => {
      const isWeekend = day.dayOfWeek === "Thứ Bảy" || day.dayOfWeek === "Chủ Nhật" || day.dayOfWeek === "Bảy" || day.dayOfWeek === "CN";
      const rowBg = isWeekend ? 'background-color: #f8fafc;' : '';
      
      const checkinStyle = day.checkin ? 'color: #10b981; font-weight: bold;' : 'color: #94a3b8;';
      const checkoutStyle = day.checkout ? 'color: #005BAC; font-weight: bold;' : 'color: #94a3b8;';
      
      const lateStyle = day.late > 0 ? 'color: #ef4444; font-weight: bold; background-color: #fee2e2; border-radius: 4px; padding: 2px 6px;' : '';
      const earlyStyle = day.early > 0 ? 'color: #f59e0b; font-weight: bold; background-color: #fef3c7; border-radius: 4px; padding: 2px 6px;' : '';
      
      return `
        <tr style="border-bottom: 1px solid #e2e8f0; ${rowBg}">
          <td style="padding: 10px 12px; text-align: left; color: #334155; font-size: 13px;">${day.date}</td>
          <td style="padding: 10px 12px; text-align: left; color: #475569; font-size: 13px;">${day.dayOfWeek}</td>
          <td style="padding: 10px 12px; text-align: center; font-family: monospace; ${checkinStyle}">${day.checkin || "-"}</td>
          <td style="padding: 10px 12px; text-align: center; font-family: monospace; ${checkoutStyle}">${day.checkout || "-"}</td>
          <td style="padding: 10px 12px; text-align: center; color: #475569; font-size: 13px;">${day.hours > 0 ? day.hours + 'h' : "-"}</td>
          <td style="padding: 10px 12px; text-align: center;"><span style="${lateStyle}">${day.late > 0 ? day.late + ' phút' : "-"}</span></td>
          <td style="padding: 10px 12px; text-align: center;"><span style="${earlyStyle}">${day.early > 0 ? day.early + ' phút' : "-"}</span></td>
          <td style="padding: 10px 12px; text-align: center; color: #64748b; font-size: 12px;">${day.status || "-"}</td>
        </tr>
      `;
    }).join("");

    // Build the full HTML email body
    const mailHtmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Chi Tiết Chấm Công</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
        <div style="max-width: 700px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          
          <!-- Banner Header -->
          <div style="background: linear-gradient(135deg, #005BAC 0%, #1e40af 100%); padding: 32px 40px; text-align: left; color: #ffffff;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: #93c5fd; margin-bottom: 8px;">${cfg.company_name.toUpperCase()}</div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 850; letter-spacing: -0.025em; color: #ffffff;">Báo Cáo Chi Tiết Chấm Công</h1>
            <div style="font-size: 13px; color: #bfdbfe; margin-top: 6px; font-weight: 500;">Đối soát thông tin chấm công tự động - Tháng ${month}</div>
          </div>
          
          <!-- Greeting Section -->
          <div style="padding: 32px 40px 16px 40px;">
            <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #334155;">
              Kính gửi Anh/Chị: <strong style="color: #005BAC; font-size: 16px;">${recipient.name}</strong> (Mã nhân viên: <strong>${recipient.employeeCode}</strong>),
            </p>
            <p style="margin: 8px 0 0 0; font-size: 14px; line-height: 1.6; color: #475569;">
              Phòng Hành chính Nhân sự (C&B) gửi đến Anh/Chị thông tin chi tiết dữ liệu chấm công được ghi nhận từ hệ thống máy chấm công vân tay trong tháng <strong>${month}</strong>. Vui lòng đối soát các thông tin bên dưới:
            </p>
          </div>

          <!-- Attachment Notice (Table layout for email clients) -->
          <div style="margin: 0 40px 24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; width: 100%;">
              <tr>
                <td style="padding: 16px 0 16px 16px; width: 32px; vertical-align: middle; text-align: center;">
                  <span style="font-size: 22px;">📎</span>
                </td>
                <td style="padding: 16px 16px 16px 12px; vertical-align: middle; text-align: left;">
                  <strong style="color: #0369a1; font-size: 14px; display: block; margin-bottom: 2px;">Đã đính kèm File Excel chi tiết!</strong>
                  <span style="color: #0c4a6e; font-size: 13px; line-height: 1.4; display: block;">Hệ thống đã đính kèm file Excel cá nhân (.xlsx) bên dưới. Anh/Chị có thể tải xuống trực tiếp để kiểm tra chi tiết hoặc lưu trữ ngoại tuyến.</span>
                </td>
              </tr>
            </table>
          </div>
          
          <!-- KPI Cards Section (Using standard HTML table for Outlook compatibility) -->
          <div style="padding: 0 40px; margin-bottom: 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
              <tr>
                <!-- KPI Card 1: Days Worked -->
                <td width="25%" style="width: 25%; padding-right: 6px; vertical-align: top;">
                  <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; text-align: center;">
                    <span style="display: block; font-size: 9px; font-weight: bold; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Ngày Công</span>
                    <span style="font-size: 20px; font-weight: 900; color: #005BAC; display: block;">${summary.totalDays}</span>
                  </div>
                </td>
                
                <!-- KPI Card 2: Late -->
                <td width="25%" style="width: 25%; padding-left: 3px; padding-right: 3px; vertical-align: top;">
                  <div style="background-color: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px; padding: 16px; text-align: center;">
                    <span style="display: block; font-size: 9px; font-weight: bold; color: #7f1d1d; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Đi Trễ (Phút)</span>
                    <span style="font-size: 20px; font-weight: 900; color: #ef4444; display: block;">${summary.totalLate}</span>
                  </div>
                </td>

                <!-- KPI Card 3: Early -->
                <td width="25%" style="width: 25%; padding-left: 3px; padding-right: 3px; vertical-align: top;">
                  <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; text-align: center;">
                    <span style="display: block; font-size: 9px; font-weight: bold; color: #78350f; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Về Sớm (Phút)</span>
                    <span style="font-size: 20px; font-weight: 900; color: #f59e0b; display: block;">${summary.totalEarly}</span>
                  </div>
                </td>

                <!-- KPI Card 4: Overtime -->
                <td width="25%" style="width: 25%; padding-left: 6px; vertical-align: top;">
                  <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; text-align: center;">
                    <span style="display: block; font-size: 9px; font-weight: bold; color: #064e3b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Tăng Ca (Giờ)</span>
                    <span style="font-size: 20px; font-weight: 900; color: #10b981; display: block;">${summary.totalOvertime}</span>
                  </div>
                </td>
              </tr>
            </table>
          </div>
          
          <!-- Detailed Table Section -->
          <div style="padding: 0 40px; margin-bottom: 24px;">
            <h4 style="margin: 0 0 12px 0; font-size: 13px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Nhật Ký Chấm Công Chi Tiết</h4>
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">
                    <th style="padding: 10px 12px; text-align: left;">Ngày</th>
                    <th style="padding: 10px 12px; text-align: left;">Thứ</th>
                    <th style="padding: 10px 12px; text-align: center;">Vào</th>
                    <th style="padding: 10px 12px; text-align: center;">Ra</th>
                    <th style="padding: 10px 12px; text-align: center;">Tổng giờ</th>
                    <th style="padding: 10px 12px; text-align: center;">Trễ</th>
                    <th style="padding: 10px 12px; text-align: center;">Sớm</th>
                    <th style="padding: 10px 12px; text-align: center;">Ca</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
            </div>
          </div>
          
          <!-- Important Notes / Instructions -->
          <div style="margin: 0 40px 32px 40px; padding: 20px; background-color: #f8fafc; border-left: 4px solid #005BAC; border-radius: 8px;">
            <h5 style="margin: 0 0 6px 0; font-size: 13px; font-weight: bold; color: #1e3a8a;">Lưu ý giải trình công:</h5>
            <ul style="margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.6; color: #475569;">
              <li>Nếu có bất kỳ sai lệch nào về giờ vào/ra hoặc thiếu ngày công, Anh/Chị vui lòng làm đề xuất giải trình trực tiếp trên phần mềm **HR Portal** trước ngày <strong>05 tháng kế tiếp</strong>.</li>
              <li>Mọi thắc mắc xin vui lòng phản hồi trực tiếp cho bộ phận C&B qua email: <a href="mailto:${smtpConfig.user}" style="color: #005BAC; font-weight: 600; text-decoration: none;">${smtpConfig.user}</a>.</li>
            </ul>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5;">
            Trực thuộc hệ thống quản trị nhân sự <strong>${cfg.system_title}</strong><br>
            Báo cáo này được gửi tự động. Vui lòng không trả lời trực tiếp email này.
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    const safeMonthStr = month.replace("/", "_");
    await transporter.sendMail({
      from: `"${cfg.email_sender_name}" <${smtpConfig.user}>`,
      to: recipient.email,
      subject: `[${cfg.company_name}] Bảng đối soát chi tiết chấm công - Tháng ${month} - ${recipient.name}`,
      html: mailHtmlContent,
      attachments: [
        {
          filename: `Bang_cong_chi_tiet_${safeMonthStr}_${recipient.employeeCode}.xlsx`,
          content: excelBuffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
      ]
    });

    return NextResponse.json({ success: true, message: `Đã gửi email thành công cho ${recipient.name} (${recipient.email})` });

  } catch (error: any) {
    console.error("Error sending timesheet email:", error);
    return NextResponse.json({ error: error.message || "Lỗi không xác định khi gửi email!" }, { status: 500 });
  }
}
