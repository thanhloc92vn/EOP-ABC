/**
 * Chuyển một mẩu tên tiếng Việt thành phần tên tệp thuần ASCII.
 * "Công ty TNHH Hữu Biên" → "Cong_ty_TNHH_Huu_Bien"
 *
 * Giữ nguyên hoa/thường vì tên tệp xuất ra đang theo kiểu Giay_De_Nghi_...,
 * chỉ bỏ dấu và gom mọi ký tự lạ về "_". Đ/đ phải xử lý riêng: NFD không tách
 * được chúng ra thành D + dấu như các nguyên âm.
 */
export function asciiFileNamePart(s: string, fallback = "File"): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      // Gạch chéo, dấu hai chấm… là ký tự cấm trong tên tệp trên Windows —
      // gom chung vào đây luôn thay vì chỉ thay khoảng trắng.
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback
  );
}

// Number to Vietnamese words helper
export function docSoVietNam(num: number): string {
  if (num === 0) return "Không đồng";
  
  const units = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const unitsTen = ["", "mười", "hai mươi", "ba mươi", "bốn mươi", "năm mươi", "sáu mươi", "bảy mươi", "tám mươi", "chín mươi"];
  
  function readGroup(group: number): string {
    let readStr = "";
    const hundred = Math.floor(group / 100);
    const ten = Math.floor((group % 100) / 10);
    const unit = group % 10;
    
    if (hundred > 0) {
      readStr += units[hundred] + " trăm ";
    }
    
    if (ten > 0) {
      if (ten === 1) {
        readStr += "mười ";
      } else {
        readStr += unitsTen[ten] + " ";
      }
    } else if (hundred > 0 && unit > 0) {
      readStr += "lẻ ";
    }
    
    if (unit > 0) {
      if (unit === 1 && ten > 1) {
        readStr += "mốt";
      } else if (unit === 5 && ten > 0) {
        readStr += "lăm";
      } else {
        readStr += units[unit];
      }
    }
    return readStr;
  }
  
  let result = "";
  let temp = num;
  const billions = Math.floor(temp / 1000000000);
  temp %= 1000000000;
  const millions = Math.floor(temp / 1000000);
  temp %= 1000000;
  const thousands = Math.floor(temp / 1000);
  const ones = temp % 1000;
  
  if (billions > 0) {
    result += readGroup(billions) + " tỷ ";
  }
  if (millions > 0) {
    result += readGroup(millions) + " triệu ";
  }
  if (thousands > 0) {
    result += readGroup(thousands) + " nghìn ";
  }
  if (ones > 0) {
    result += readGroup(ones);
  }
  
  result = result.trim().replace(/\s+/g, " ");
  if (result.length > 0) {
    return result.charAt(0).toUpperCase() + result.slice(1) + " đồng.";
  }
  return "";
}

// Format number to currency string: e.g. 1.516.800
function formatNumber(num: number): string {
  return new Intl.NumberFormat("vi-VN").format(num);
}

// Generate document HTML shell
function wrapInWordShell(bodyHtml: string): string {
  return `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <meta charset="utf-8">
      <style>
        @page {
          size: 21cm 29.7cm;
          margin: 2cm 2cm 2cm 2.5cm;
        }
        body {
          font-family: 'Times New Roman', serif;
          font-size: 12pt;
          line-height: 1.35;
          color: #000000;
        }
        table {
          border-collapse: collapse;
          width: 100%;
        }
        .header-table td {
          border: none;
          padding: 2px;
          vertical-align: top;
        }
        .data-table {
          width: 100%;
          border: 1px solid #000000;
          margin-top: 15px;
          margin-bottom: 15px;
        }
        .data-table th, .data-table td {
          border: 1px solid #000000;
          padding: 6px 8px;
          font-size: 11pt;
        }
        .data-table th {
          font-weight: bold;
          text-align: center;
          background-color: #F2F2F2;
        }
        .text-center { text-align: center; }
        .text-left { text-align: left; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .italic { font-style: italic; }
        .underline { text-decoration: underline; }
      </style>
    </head>
    <body>
      ${bodyHtml}
    </body>
    </html>
  `;
}

// Export Template 1: PHIẾU ĐỀ NGHỊ THANH TOÁN
export function exportPhieuThanhToan(data: any) {
  const {
    employeeName,
    employeeDept,
    mission,
    days,
    nights,
    hotelRate = 350000,
    travelEstimate,
    otherExpenses = [],
    totalAmount,
    routes = [],
    modalStart
  } = data;

  const textAmount = docSoVietNam(totalAmount);
  
  // Helper to compute individual trip day dates from start date
  const startDate = modalStart ? new Date(modalStart) : new Date();
  const getDateForDay = (dayIndex: number) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayIndex);
    return d.toLocaleDateString("vi-VN");
  };

  // Prepare table rows
  let rowsHtml = "";
  let counter = 1;

  // 1. Phụ cấp công tác phí rows (split into individual dates if range is known)
  const daysVal = Number(days) || 0;
  for (let i = 0; i < daysVal; i++) {
    rowsHtml += `
      <tr>
        <td class="text-center">${counter++}</td>
        <td class="text-center"></td>
        <td class="text-center">${getDateForDay(i)}</td>
        <td class="text-left">Chi phí công tác (Ngày ${i + 1}/${daysVal})</td>
        <td class="text-right">${formatNumber(120000)}</td>
        <td class="text-center"></td>
      </tr>
    `;
  }

  // 2. Hotel costs (grouped or single row)
  const nightsVal = Number(nights) || 0;
  if (nightsVal > 0) {
    rowsHtml += `
      <tr>
        <td class="text-center">${counter++}</td>
        <td class="text-center"></td>
        <td class="text-center">${getDateForDay(0)} - ${getDateForDay(daysVal - 1)}</td>
        <td class="text-left">Chi phí lưu trú (Khách sạn ${nightsVal} đêm)</td>
        <td class="text-right">${formatNumber(nightsVal * hotelRate)}</td>
        <td class="text-center"></td>
      </tr>
    `;
  }

  // 3. Travel estimate
  const travelVal = Number(travelEstimate) || 0;
  if (travelVal > 0) {
    rowsHtml += `
      <tr>
        <td class="text-center">${counter++}</td>
        <td class="text-center"></td>
        <td class="text-center">${getDateForDay(0)}</td>
        <td class="text-left">Chi phí di chuyển (Vé tàu / xe / máy bay tạm tính)</td>
        <td class="text-right">${formatNumber(travelVal)}</td>
        <td class="text-center"></td>
      </tr>
    `;
  }

  // 4. Other expenses rows
  otherExpenses.forEach((exp: any) => {
    rowsHtml += `
      <tr>
        <td class="text-center">${counter++}</td>
        <td class="text-center">${exp.notes || ""}</td>
        <td class="text-center">${getDateForDay(0)}</td>
        <td class="text-left">${exp.name || "Chi phí phát sinh khác"}</td>
        <td class="text-right">${formatNumber(Number(exp.amount) || 0)}</td>
        <td class="text-center"></td>
      </tr>
    `;
  });

  const bodyHtml = `
    <!-- Header Block -->
    <table class="header-table" style="width:100%;">
      <tr>
        <td style="width: 55%; text-align: left;">
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 15pt; color: #005BAC;">TRUNG <span style="color: #EF4444;">N</span>AM <span style="color: #00AEEF; font-size: 11pt; font-weight: normal; font-style: italic;">E&C</span></div>
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 7.5pt; color: #333333; margin-top: 2px;">CÔNG TY CP XÂY DỰNG VÀ LẮP MÁY TRUNG NAM</div>
          <div style="font-family: Arial, sans-serif; font-size: 6.5pt; color: #555555; line-height: 1.2; margin-top: 3px;">
            A : Tầng trệt tòa nhà Safomec, 7/1 Thành Thái, Phường 14, Quận 10, TPHCM<br>
            T : (+84) 834 70 75 79   E : info.tnec@trungnamgroup.com.vn<br>
            W : trungnamec.com.vn
          </div>
        </td>
        <td style="width: 45%; text-align: center; vertical-align: middle;">
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 15pt; color: #000000; letter-spacing: 0.5px;">PHIẾU ĐỀ NGHỊ THANH TOÁN</div>
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 9.5pt; color: #000000; margin-top: 3px; text-decoration: underline;">TCKT/BM/003</div>
        </td>
      </tr>
    </table>

    <br/>

    <!-- Target Destination -->
    <div style="margin-left: 20px;">
      <table style="width: 100%; font-size: 12pt;">
        <tr>
          <td style="width: 12%; font-weight: bold; vertical-align: top;">Kính gửi:</td>
          <td style="width: 88%; font-weight: bold;">
            - Ban lãnh đạo Công ty CP XD và LM Trung Nam;<br/>
            - Phòng HCSN công ty,
          </td>
        </tr>
      </table>
    </div>

    <br/>

    <!-- Employee Details -->
    <table style="width: 100%; font-size: 12pt; margin-top: 5px; line-height: 1.5;">
      <tr>
        <td style="width: 33%;"><span class="underline">Họ và tên người đề nghị thanh toán</span>: ${employeeName}</td>
      </tr>
      <tr>
        <td><span class="underline">Bộ phận</span>: ${employeeDept}</td>
      </tr>
      <tr>
        <td><span class="underline">Nội dung thanh toán</span>: ${mission} tại ${destinationStr(routes)}</td>
      </tr>
    </table>

    <!-- Expense Table -->
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 6%;" rowspan="2">TT</th>
          <th style="width: 26%;" colspan="2">HÓA ĐƠN</th>
          <th style="width: 38%;" rowspan="2">NỘI DUNG THANH TOÁN</th>
          <th style="width: 18%;" rowspan="2">SỐ TIỀN (VNĐ)</th>
          <th style="width: 12%;" rowspan="2">GHI CHÚ</th>
        </tr>
        <tr>
          <th>SỐ</th>
          <th>NGÀY</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="bold">
          <td colspan="4" class="text-center">Tổng cộng</td>
          <td class="text-right">${formatNumber(totalAmount)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <!-- Text Amount & Undertaking -->
    <div style="font-size: 11.5pt; line-height: 1.4; margin-top: 10px;">
      <div class="italic"><span class="bold">Bằng chữ:</span> ${textAmount}</div>
      <div style="margin-top: 5px;">Tôi xin chịu trách nhiệm về nội dung thanh toán và các hóa đơn chứng từ kèm theo.</div>
      <div><i>(Kèm theo .................................................... chứng từ gốc).</i></div>
    </div>

    <br/>

    <!-- Signature Block -->
    <table style="width: 100%; margin-top: 15px; font-size: 10.5pt; text-align: center;">
      <tr>
        <td colspan="4" style="text-align: right; font-style: italic; padding-right: 30px;">Tp.hcm, ngày ${getFormattedDayString(startDate)}</td>
      </tr>
      <tr style="font-weight: bold; height: 35px; vertical-align: top;">
        <td style="width: 25%;">GIÁM ĐỐC</td>
        <td style="width: 25%;">KẾ TOÁN TRƯỞNG</td>
        <td style="width: 25%;">TRƯỞNG BỘ PHẬN</td>
        <td style="width: 25%;">NGƯỜI ĐỀ NGHỊ</td>
      </tr>
      <tr style="height: 70px;">
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    </table>
  `;

  return wrapInWordShell(bodyHtml);
}

// Export Template 2: PHIẾU ĐI CÔNG TÁC
export function exportPhieuCongTac(data: any) {
  const {
    employeeName,
    employeeRole = "Chuyên viên",
    employeeDept,
    destination,
    modalStart,
    modalEnd,
    mission,
    transport,
    days,
    nights,
    hotelRate = 350000,
    travelEstimate,
    totalAmount,
    routes = []
  } = data;

  const totalTripAmount = Number(totalAmount) || 0;
  const textAmount = docSoVietNam(totalTripAmount);
  
  // Format Date Ranges
  const startFmt = modalStart ? new Date(modalStart).toLocaleDateString("vi-VN") : "";
  const endFmt = modalEnd ? new Date(modalEnd).toLocaleDateString("vi-VN") : "";

  // Prepare routes rows
  let routesHtml = "";
  routes.forEach((r: any, i: number) => {
    routesHtml += `
      <tr>
        <td class="text-left" style="font-size: 10pt;">
          Nơi đi: ${r.from || "Chưa ghi"}<br/><br/>
          Nơi đến: ${r.to || "Chưa ghi"}
        </td>
        <td class="text-center" style="font-size: 10pt;">
          ${r.date ? new Date(r.date).toLocaleDateString("vi-VN") : ""}
        </td>
        <td class="text-center" style="font-size: 10pt;">${r.transport || "Xe Cty"}</td>
        <td class="text-center" style="font-size: 10pt;">${r.distance ? `${r.distance}km` : "N/A"}</td>
        <td class="text-center" style="font-size: 10pt;">${r.nights || 0}</td>
        <td class="text-center" style="font-size: 10pt;">${r.reason || ""}</td>
        <td class="text-center" style="font-size: 10pt;"></td>
      </tr>
    `;
  });

  const bodyHtml = `
    <!-- Header Block -->
    <table class="header-table" style="width:100%;">
      <tr>
        <td style="width: 55%; text-align: left;">
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 15pt; color: #005BAC;">TRUNG <span style="color: #EF4444;">N</span>AM <span style="color: #00AEEF; font-size: 11pt; font-weight: normal; font-style: italic;">E&C</span></div>
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 7.5pt; color: #333333; margin-top: 2px;">CÔNG TY CP XÂY DỰNG VÀ LẮP MÁY TRUNG NAM</div>
          <div style="font-family: Arial, sans-serif; font-size: 6.5pt; color: #555555; line-height: 1.2; margin-top: 3px;">
            A : Tầng trệt tòa nhà Safomec, 7/1 Thành Thái, Phường 14, Quận 10, TPHCM<br>
            T : (+84) 834 70 75 79   E : info.tnec@trungnamgroup.com.vn<br>
            W : trungnamec.com.vn
          </div>
        </td>
        <td style="width: 45%; text-align: center; vertical-align: middle;">
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 15pt; color: #000000; letter-spacing: 0.5px;">PHIẾU ĐI CÔNG TÁC</div>
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 9.5pt; color: #000000; margin-top: 3px; text-decoration: underline;">HCNS/BM/049</div>
        </td>
      </tr>
    </table>

    <br/>

    <!-- Main Form Details -->
    <table style="width: 100%; font-size: 11.5pt; line-height: 1.6; margin-top: 5px;">
      <tr>
        <td style="width: 50%;"><span class="bold">Họ và tên</span>: ${employeeName.toUpperCase()}</td>
        <td style="width: 50%;"><span class="bold">Chức vụ</span>: ${employeeRole}</td>
      </tr>
      <tr>
        <td colspan="2"><span class="bold">Bộ phận</span>: ${employeeDept}</td>
      </tr>
      <tr>
        <td colspan="2"><span class="bold">Được cử đi công tác tại</span>: ${destination}</td>
      </tr>
      <tr>
        <td colspan="2"><span class="bold">Từ ngày</span>: ${startFmt} &nbsp; <span class="bold">Đến ngày</span>: ${endFmt}</td>
      </tr>
      <tr>
        <td colspan="2"><span class="bold">Nhiệm vụ</span>: ${mission}</td>
      </tr>
      <tr>
        <td colspan="2"><span class="bold">Bằng phương tiện</span>: ${transport}</td>
      </tr>
    </table>

    <br/>

    <!-- Signatures Page 1 -->
    <table style="width: 100%; font-size: 10.5pt; text-align: center; margin-top: 5px;">
      <tr>
        <td colspan="3" style="text-align: right; font-style: italic; padding-right: 35px;">Tp.hcm, ngày ${modalStart ? getFormattedDayString(new Date(modalStart)) : getCurrentDayString()}</td>
      </tr>
      <tr style="font-weight: bold; height: 35px; vertical-align: top;">
        <td style="width: 33.3%;">GIÁM ĐỐC</td>
        <td style="width: 33.3%;">TRƯỞNG BỘ PHẬN</td>
        <td style="width: 33.3%;">NGƯỜI ĐI CÔNG TÁC</td>
      </tr>
      <tr style="height: 60px;">
        <td></td>
        <td></td>
        <td></td>
      </tr>
    </table>

    <br/>

    <!-- Route Table -->
    <table class="data-table" style="margin-top: 15px;">
      <thead>
        <tr>
          <th style="width: 26%;">NƠI ĐI VÀ ĐẾN</th>
          <th style="width: 14%;">Ngày / giờ</th>
          <th style="width: 12%;">Phương tiện</th>
          <th style="width: 12%;">Độ dài chặng đường</th>
          <th style="width: 10%;">Thời gian lưu trú (Đêm)</th>
          <th style="width: 12%;">Lý do lưu trú</th>
          <th style="width: 14%;">Chứng nhận của đơn vị (Ký tên/đóng dấu)</th>
        </tr>
        <tr style="font-size: 9pt; font-style: italic; background-color: #F9F9F9; text-align: center;">
          <td>1</td>
          <td>2</td>
          <td>3</td>
          <td>4</td>
          <td>5</td>
          <td>6</td>
          <td>7</td>
        </tr>
      </thead>
      <tbody>
        ${routesHtml}
      </tbody>
    </table>

    <!-- Page Break -->
    <br style="page-break-before: always;" />

    <!-- Page 2: PHẦN THANH TOÁN -->
    <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 14pt; text-align: center; margin-top: 20px; border-bottom: 2px solid #000000; padding-bottom: 5px;">PHẦN THANH TOÁN</div>
    
    <br/>

    <table style="width: 100%; font-size: 11.5pt; line-height: 2; margin-top: 10px;">
      <tr>
        <td><span class="bold">1. Vé tàu, xe:</span> ${travelEstimate > 0 ? formatNumber(travelEstimate) + ' đồng' : '............................................................................................................................'}</td>
      </tr>
      <tr>
        <td>
          <span class="bold">2. Phụ cấp công tác phí:</span><br/>
          &nbsp;&nbsp;&nbsp;&nbsp;Số ngày được hưởng phụ cấp: ${days} ngày x mức phụ cấp: 120.000đ/ngày = <span class="bold">${formatNumber(days * 120000)} đồng</span>
        </td>
      </tr>
      <tr>
        <td><span class="bold">3. Tiền lưu trú:</span> ${nights > 0 ? `${formatNumber(nights * hotelRate)} đồng (${nights} đêm qua đêm)` : 'Không qua đêm (Đi công tác trong ngày)'}</td>
      </tr>
      <tr>
        <td><span class="bold">4. Các chứng từ:</span> ........................................................................................................................</td>
      </tr>
      <tr style="height: 15px;"><td></td></tr>
      <tr style="font-size: 12pt;">
        <td class="text-right" style="padding-right: 20px;"><span class="bold">CỘNG: ${formatNumber(totalTripAmount)} đồng</span></td>
      </tr>
      <tr>
        <td><span class="italic"><span class="bold">Duyệt số tiền được thanh toán là:</span> ${textAmount}</span></td>
      </tr>
    </table>

    <br/><br/>

    <!-- Signatures Page 2 -->
    <table style="width: 100%; font-size: 10.5pt; text-align: center; margin-top: 15px;">
      <tr style="font-weight: bold; height: 35px; vertical-align: top;">
        <td style="width: 25%;">GIÁM ĐỐC</td>
        <td style="width: 25%;">KẾ TOÁN TRƯỞNG</td>
        <td style="width: 25%;">KẾ TOÁN THANH TOÁN</td>
        <td style="width: 25%;">NGƯỜI ĐI CÔNG TÁC</td>
      </tr>
      <tr style="height: 70px;">
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    </table>
  `;
  return wrapInWordShell(bodyHtml);
}

export function exportDeNghiChuyenTien(payments: any[], month: string) {
  let totalAmount = 0;
  let rowsHtml = "";
  
  payments.forEach((p, idx) => {
    const amt = Number(p.amount) || 0;
    totalAmount += amt;
    rowsHtml += `
      <tr>
        <td class="text-center" style="font-size: 11pt; border: 1px solid #000000; padding: 6px 8px;">${idx + 1}</td>
        <td class="text-left" style="font-size: 11pt; font-weight: bold; border: 1px solid #000000; padding: 6px 8px;">${p.supplierName || p.beneficiary_name || ""}</td>
        <td class="text-center font-mono" style="font-size: 11pt; font-weight: bold; border: 1px solid #000000; padding: 6px 8px;">${p.account || p.bank_account || ""}</td>
        <td class="text-left" style="font-size: 11pt; border: 1px solid #000000; padding: 6px 8px;">${p.bank || p.bank_name_branch || ""}</td>
        <td class="text-left" style="font-size: 11pt; border: 1px solid #000000; padding: 6px 8px;">${p.content || p.desc || ""}</td>
        <td class="text-right" style="font-size: 11pt; font-weight: bold; border: 1px solid #000000; padding: 6px 8px;">${formatNumber(amt)}</td>
      </tr>
    `;
  });

  const textAmount = docSoVietNam(totalAmount);

  const bodyHtml = `
    <!-- Header Block -->
    <table class="header-table" style="width:100%; border-collapse: collapse;">
      <tr>
        <td style="width: 55%; text-align: left; border: none; padding: 2px; vertical-align: top;">
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 15pt; color: #005BAC;">TRUNG <span style="color: #EF4444;">N</span>AM <span style="color: #00AEEF; font-size: 11pt; font-weight: normal; font-style: italic;">E&C</span></div>
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 7.5pt; color: #333333; margin-top: 2px;">CÔNG TY CP XÂY DỰNG VÀ LẮP MÁY TRUNG NAM</div>
          <div style="font-family: Arial, sans-serif; font-size: 6.5pt; color: #555555; line-height: 1.2; margin-top: 3px;">
            A : Tầng trệt tòa nhà Safomec, 7/1 Thành Thái, Phường 14, Quận 10, TPHCM<br>
            T : (+84) 834 70 75 79   E : info.tnec@trungnamgroup.com.vn<br>
            W : trungnamec.com.vn
          </div>
        </td>
        <td style="width: 45%; text-align: center; vertical-align: middle; border: none; padding: 2px;">
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 14pt; color: #000000; letter-spacing: 0.5px;">BẢNG ĐỀ NGHỊ CHUYỂN TIỀN</div>
          <div style="font-family: Arial, sans-serif; font-weight: bold; font-size: 9.5pt; color: #000000; margin-top: 3px; text-decoration: underline;">Tháng ${month || ""}</div>
        </td>
      </tr>
    </table>

    <br/>

    <!-- Target Destination -->
    <div style="margin-left: 10px;">
      <table style="width: 100%; font-size: 12pt; border-collapse: collapse;">
        <tr>
          <td style="width: 12%; font-weight: bold; vertical-align: top; border: none; padding: 2px;">Kính gửi:</td>
          <td style="width: 88%; font-weight: bold; border: none; padding: 2px;">
            - Ban Lãnh đạo Công ty Cổ phần Xây dựng và Lắp máy Trung Nam;<br/>
            - Phòng Tài chính - Kế toán.
          </td>
        </tr>
      </table>
    </div>

    <br/>

    <div style="font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; margin-bottom: 10px;">
      Bộ phận Hành chính Nhân sự kính trình Ban lãnh đạo phê duyệt danh sách chuyển tiền thanh toán cho các Nhà cung cấp định kỳ tháng ${month || ""} chi tiết như sau:
    </div>

    <!-- Expense Table -->
    <table class="data-table" style="width: 100%; border-collapse: collapse; border: 1px solid #000000; margin-top: 15px; margin-bottom: 15px;">
      <thead>
        <tr style="background-color: #F2F2F2;">
          <th style="width: 5%; border: 1px solid #000000; padding: 6px 8px; font-weight: bold; text-align: center;">STT</th>
          <th style="width: 25%; border: 1px solid #000000; padding: 6px 8px; font-weight: bold; text-align: center;">Đơn vị thụ hưởng</th>
          <th style="width: 15%; border: 1px solid #000000; padding: 6px 8px; font-weight: bold; text-align: center;">Số tài khoản</th>
          <th style="width: 20%; border: 1px solid #000000; padding: 6px 8px; font-weight: bold; text-align: center;">Ngân hàng thụ hưởng</th>
          <th style="width: 20%; border: 1px solid #000000; padding: 6px 8px; font-weight: bold; text-align: center;">Nội dung thanh toán</th>
          <th style="width: 15%; border: 1px solid #000000; padding: 6px 8px; font-weight: bold; text-align: center;">Số tiền (VNĐ)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="bold" style="background-color: #F2F2F2; font-weight: bold;">
          <td colspan="5" class="text-center" style="font-size: 11pt; border: 1px solid #000000; padding: 6px 8px; text-align: center;">Tổng cộng</td>
          <td class="text-right" style="font-size: 11pt; border: 1px solid #000000; padding: 6px 8px; text-align: right;">${formatNumber(totalAmount)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Text Amount & Undertaking -->
    <div style="font-family: 'Times New Roman', serif; font-size: 11.5pt; line-height: 1.4; margin-top: 10px;">
      <div class="italic" style="font-style: italic;"><span class="bold" style="font-weight: bold;">Bằng chữ:</span> ${textAmount}</div>
      <div style="margin-top: 8px;">Kính trình Ban lãnh đạo xem xét và phê duyệt chuyển khoản thanh toán.</div>
    </div>

    <br/>

    <!-- Signature Block -->
    <table style="width: 100%; margin-top: 15px; font-size: 10.5pt; text-align: center; border-collapse: collapse;">
      <tr>
        <td colspan="3" style="text-align: right; font-style: italic; padding-right: 30px; border: none;">Tp.HCM, ngày ${getFormattedDayString(new Date())}</td>
      </tr>
      <tr style="font-weight: bold; height: 35px; vertical-align: top;">
        <td style="width: 33%; border: none; padding: 2px; font-weight: bold;">BAN GIÁM ĐỐC</td>
        <td style="width: 33%; border: none; padding: 2px; font-weight: bold;">KẾ TOÁN TRƯỞNG</td>
        <td style="width: 33%; border: none; padding: 2px; font-weight: bold;">NGƯỜI ĐỀ NGHỊ</td>
      </tr>
      <tr style="height: 70px;">
        <td style="border: none;"></td>
        <td style="border: none;"></td>
        <td style="border: none;"></td>
      </tr>
    </table>
  `;

  return wrapInWordShell(bodyHtml);
}

// Download action helper
export function downloadDocFile(htmlContent: string, fileName: string) {
  const blob = new Blob(["\ufeff" + htmlContent], {
    type: "application/msword;charset=utf-8"
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName + ".doc";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper to construct destination string from routes
function destinationStr(routes: any[]): string {
  if (!routes || routes.length === 0) return "";
  const dests = routes.map((r: any) => r.to).filter(Boolean);
  if (dests.length === 0) return "";
  return dests.join(", ");
}

// Get Vietnamese Date String: e.g. "23 tháng 04 năm 2026"
function getCurrentDayString(): string {
  return getFormattedDayString(new Date());
}

function getFormattedDayString(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day} tháng ${month} năm ${year}`;
}
