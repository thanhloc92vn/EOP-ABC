import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const SYSTEM_PROMPT = `
Bạn là một AI phân tích công văn chuyên nghiệp cho phòng Văn thư của công ty Trung Nam E&C.
Nhiệm vụ của bạn là đọc nội dung văn bản (hoặc phân tích hình ảnh quét công văn) và trích xuất chính xác các thông tin cần thiết dưới định dạng JSON, bao gồm cả việc TỰ ĐỘNG PHÂN LOẠI công văn.

━━━ CÁC TRƯỜNG THÔNG TIN CẦN TRÍCH XUẤT ━━━
1. "type": Phân loại loại công văn. Phải là một trong bốn giá trị sau:
   - "incoming": Công văn đến (Văn bản từ cơ quan/đơn vị bên ngoài gửi ĐẾN Trung Nam E&C. Ví dụ kính gửi: Công ty CP Xây dựng và Lắp máy Trung Nam, hoặc Trung Nam E&C).
   - "outgoing_1": Công văn đi 1 (Công văn đi chung của công ty Trung Nam E&C gửi cho đơn vị khác, ký bởi Ban Giám đốc hoặc Đại diện công ty, số hiệu thường có dạng "TNEC-CV", "TNEC/", "CV/TNEC"...).
   - "outgoing_2": Công văn đi 2 (Các loại văn bản đi khác như hồ sơ thầu, công văn của ban quản lý dự án, báo giá, yêu cầu vật tư... số hiệu thường chứa ký hiệu các dự án hoặc ban điều hành công trường khác).
   - "outgoing_hdqt": Công văn HĐQT (Công văn đi phát hành từ Hội đồng Quản trị, số hiệu thường chứa ký hiệu "HĐQT" hoặc ký bởi Chủ tịch HĐQT).
2. "doc_number": Số hiệu văn bản / Số hiệu công văn (ví dụ: "1577/BQLDAGT-DA5", "575/PMUMT-DHDA1"). Nếu không tìm thấy hoặc chưa có, điền rỗng "".
3. "doc_date": Ngày ban hành văn bản (định dạng YYYY-MM-DD). Nếu không tìm thấy, điền rỗng "".
4. "receive_send_date": Ngày nhận hoặc ngày gửi công văn (định dạng YYYY-MM-DD). Thường là ngày đến hoặc ngày đi thực tế. Hãy cố gắng tìm ngày nhận/gửi trong nội dung hoặc ngày gần với ngày ban hành văn bản nếu không tìm thấy.
5. "sender_receiver": 
   - Nếu là công văn ĐẾN (incoming): Tên cơ quan/đơn vị GỬI ĐẾN (ví dụ: "Sở Xây dựng TP.HCM", "UBND TP. Cần Thơ").
   - Nếu là công văn ĐI (outgoing_1, outgoing_2, outgoing_hdqt): Tên cơ quan/đơn vị NHẬN (ví dụ: "Liên danh Nhà thầu thi công gói thầu XL-01", "Ủy ban nhân dân Quận 2").
6. "summary": Trích yếu của công văn — KHÔNG tự tóm tắt. Hãy tìm dòng "V/v: ..." (Về việc) nằm ngay bên dưới dòng "Số: ..." ở góc trên bên trái văn bản, và CHÉP NGUYÊN VĂN nội dung sau chữ "V/v:" (bỏ dấu ngoặc kép nếu có, bỏ tiền tố "V/v:"/"Về việc:"). Ví dụ văn bản ghi: Số: 897/026/CV/TNE&C, dòng dưới là "V/v: Báo cáo tình hình triển khai thi công và khối lượng thực hiện tháng 06/2026..." thì summary = "Báo cáo tình hình triển khai thi công và khối lượng thực hiện tháng 06/2026...". CHỈ KHI văn bản hoàn toàn không có dòng "V/v"/"Về việc" mới được tự tóm tắt ngắn gọn 1-2 câu từ nội dung.
7. "signer_recipient":
   - Nếu là công văn ĐẾN (incoming): Người nhận trực tiếp hoặc đơn vị nhận xử lý chính trong công ty.
   - Nếu là công văn ĐI (outgoing_1, outgoing_2, outgoing_hdqt): Người ký duyệt văn bản (ví dụ: "Giám đốc Dự án", "Trưởng phòng Vật tư").

━━━ QUY TẮC PHÂN TÍCH ━━━
- Hãy đọc thật kỹ các phần: Tiêu đề công văn, Nơi nhận (Kính gửi / To), Người ký (Signed by), và phần Trích yếu (V/v...) để lấy đúng thông tin và phân loại loại công văn chính xác.
- Đối với "doc_number" (Số văn bản): Hãy chú ý đối chiếu và so sánh giữa nội dung văn bản với Tên file tài liệu gốc (nếu có cung cấp). Thường số hiệu văn bản có thể được viết trong tên file dưới dạng các ký hiệu phân tách bằng dấu chấm hoặc dấu gạch chéo (ví dụ tên file "20210604.711.026.CV.TNEC..." tương ứng với Số văn bản là "711/026/CV/TNEC" hoặc "711.026/CV/TNEC"). Hãy khôi phục số hiệu chính xác nhất bằng cách kết hợp thông tin đọc được trong văn bản và tên file.
- Chuẩn hoá ngày về dạng YYYY-MM-DD. Ví dụ "ngày 10 tháng 03 năm 2026" hoặc "10/03/2026" đều chuyển thành "2026-03-10".
- Trả về kết quả CHỈ dạng JSON, không kèm bất kỳ giải thích nào bên ngoài.

━━━ OUTPUT FORMAT (JSON ONLY) ━━━
{
  "type": "incoming | outgoing_1 | outgoing_2 | outgoing_hdqt",
  "doc_number": "...",
  "doc_date": "YYYY-MM-DD",
  "receive_send_date": "YYYY-MM-DD",
  "sender_receiver": "...",
  "summary": "...",
  "signer_recipient": "..."
}
`.trim();

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng nhập trong mục Cài đặt hệ thống hoặc Cấu hình API của Văn thư." },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("document_file") as File | null;
    const originalFilename = form.get("original_filename") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Thiếu file văn bản cần phân tích." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.name.toLowerCase();

    let messages: OpenAI.Chat.ChatCompletionMessageParam[];

    const filenameInfo = originalFilename ? `Tên file tài liệu gốc: "${originalFilename}"` : `Tên file tài liệu: "${file.name}"`;
    const promptText = `Hãy phân tích công văn này và tự động phân loại nó (type). 
${filenameInfo}
Hãy chú ý so sánh nội dung văn bản với tên file để trích xuất số hiệu văn bản (doc_number) thật chính xác.
Hãy trích xuất thông tin dạng JSON gồm: type, doc_number, doc_date, receive_send_date, sender_receiver, summary, signer_recipient.`;

    if (fileType.endsWith(".pdf")) {
      // Gửi PDF trực tiếp lên OpenAI Responses API (không cần pdf-parse, tương thích Vercel)
      const base64Pdf = fileBuffer.toString("base64");
      const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o";
      try {
        const response = await openai.responses.create({
          model: model === "gpt-4o-mini" ? "gpt-4o-mini" : model,
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: `${SYSTEM_PROMPT}\n\n${promptText}` },
              { type: "input_file", filename: originalFilename || file.name, file_data: `data:application/pdf;base64,${base64Pdf}` },
            ],
          }],
          text: { format: { type: "json_object" } },
        });
        const rawOutput = response.output_text || "{}";
        const extractedData = JSON.parse(rawOutput);
        return NextResponse.json(extractedData);
      } catch (pdfErr: any) {
        console.error("PDF analyze error:", pdfErr);
        return NextResponse.json({ error: pdfErr.message || "Lỗi khi phân tích file PDF" }, { status: 500 });
      }
    } else if (fileType.endsWith(".docx") || fileType.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = result.value || "";
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${promptText}\n\n--- NỘI DUNG VĂN BẢN ---\n${text}` },
      ];
    } else if (fileType.endsWith(".png") || fileType.endsWith(".jpg") || fileType.endsWith(".jpeg")) {
      const base64 = fileBuffer.toString("base64");
      const mimeType = fileType.endsWith(".png") ? "image/png" : "image/jpeg";
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ];
    } else if (fileType.endsWith(".txt")) {
      const text = fileBuffer.toString("utf-8");
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${promptText}\n\n--- NỘI DUNG VĂN BẢN ---\n${text}` },
      ];
    } else {
      return NextResponse.json({ error: "Định dạng file không hỗ trợ. Sử dụng PDF, DOCX, PNG, JPG hoặc TXT." }, { status: 400 });
    }

    const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const reply = completion.choices[0]?.message?.content || "{}";
    const extractedData = JSON.parse(reply);

    return NextResponse.json(extractedData);
  } catch (err: any) {
    console.error("Analyze document error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi gọi OpenAI API" }, { status: 500 });
  }
}
