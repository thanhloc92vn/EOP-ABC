# 🏗️ PM-HCNS-TNEC: Project Architecture & System Structure

Tài liệu này bản đồ hóa toàn bộ cấu trúc dự án, luồng đi của dữ liệu và kiến trúc hệ thống để lập trình viên (hoặc AI Agent) có thể nắm bắt 100% cách hoạt động của hệ thống ngay lập tức.

---

## 🗺️ Bản Đồ Hệ Thống (System Overview)

Hệ thống **PM-HCNS-TNEC** (Hành chính Nhân sự & Quản trị Dự án) gồm 3 khối thành phần chính liên kết chặt chẽ với nhau:

*   **Desktop App (AI CV Scorer)**: Ứng dụng chạy local trên CustomTkinter (Python) dành cho bộ phận HR để lọc CV tự động từ thư mục cục bộ hoặc quét Gmail tự động, phân tích qua OpenAI API và lưu thông tin sang Google Sheets.
*   **Google Workspace Integration**: Sử dụng Google Apps Script Webhook để nhận dữ liệu từ Desktop App, cập nhật vào tab `Tổng Hợp` và tự động chuyển các dòng có trạng thái `PASS CV` sang tab `Vòng 1`.
*   **Web Dashboard & Admin Portal**: Dự án Next.js kết nối với Supabase DB để cung cấp trang giao diện quản trị nhân sự, KPI, quản lý thử việc, văn thư lưu trữ, công việc nội bộ và tạo báo cáo tự động từ template Word/Excel.

---

## 📂 Chi Tiết Cấu Trúc Thư Mục (Directory Structure)

### 1. Thư mục Gốc (Root Directory)
*   [main.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/main.py): Entry point khởi chạy ứng dụng Desktop (CustomTkinter GUI).
*   [generate_reports.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/generate_reports.py): Script độc lập lấy dữ liệu ứng viên từ Supabase, phân tích bằng OpenAI và tạo báo cáo tuyển dụng Tuần/Tháng theo file mẫu (Word/Excel) trong `dashboard/public/templates/`.
*   [sync_to_vong1.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/sync_to_vong1.py): Script tiện ích đồng bộ thủ công các ứng viên có trạng thái `"PASS CV"` từ tab "Tổng Hợp" sang tab "Vòng 1" trên Google Sheets.
*   [config.json](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/config.json): Lưu API Key, tên model OpenAI và Webhook URL của Google Apps Script (không chứa thông tin nhạy cảm cứng).
*   `requirements.txt`: Các thư viện Python phụ thuộc (`customtkinter`, `pymupdf`, `openai`, `requests`, `openpyxl`, `python-docx`, `docx2txt`, `pdfplumber`).

---

### 2. 🧠 Lõi Xử Lý Python (`/core`)
Phần xử lý logic nền tảng của Desktop App (không phụ thuộc giao diện):
*   [core/config_manager.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/core/config_manager.py): Đọc và lưu trữ cấu hình trong `config.json`.
*   [core/file_reader.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/core/file_reader.py): 
    *   Hỗ trợ đọc file: `.pdf`, `.docx`, `.txt`, `.png`, `.jpg`, `.jpeg`.
    *   **Cơ chế Hybrid / AI Vision**: Nếu file PDF có độ dài text trích xuất `< 50` ký tự (PDF scan), tự động chuyển sang chế độ **Scanned PDF**, render 3 trang đầu thành ảnh PNG, mã hóa Base64 để gửi lên OpenAI Vision API.
*   [core/ai_client.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/core/ai_client.py):
    *   Xây dựng Prompt chi tiết (System/User) cho mô hình `gpt-4o-mini` để thực hiện đồng thời: (1) Trích xuất thông tin cá nhân chuẩn hóa, (2) Chấm điểm phù hợp dựa trên mô tả công việc (JD), kỹ năng bắt buộc (Hard/Soft Skills) và áp dụng Penalty (Điểm trừ) nếu thiếu điều kiện tiên quyết.
    *   Sử dụng định dạng `response_format={"type": "json_object"}` để đảm bảo dữ liệu đầu ra là JSON sạch.
*   [core/department_classifier.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/core/department_classifier.py): 
    *   Phân tích từ khóa trong JD và vị trí ứng tuyển để phân loại chính xác Phòng ban thụ hưởng (vd: *Phòng Kỹ Thuật*, *Phòng Kế Hoạch*, *Phòng Vật Tư Thiết Bị*,...)
    *   Gán Người đánh giá tương ứng (Reviewer) dựa trên phòng ban (vd: *Phó Giám Đốc*, *TP Kế Hoạch*, *TP Vật Tư*,...).
*   [core/scorer.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/core/scorer.py): Điều phối toàn bộ luồng chấm điểm (File -> FileReader -> AIClient -> Chuẩn hóa định dạng đầu ra 16 trường).

---

### 3. 🎨 Giao Diện Người Dùng Tkinter (`/ui`)
Giao diện quản lý quy trình chấm CV và email của HR:
*   [ui/main_window.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/ui/main_window.py): Setup giao diện chính CustomTkinter (màu tối làm chủ đạo), các tabs chức năng:
    *   **Tab Chấm Điểm**: Nhập JD, chọn thư mục CV, hiển thị bảng tiến độ chấm điểm thời gian thực, xem chi tiết đánh giá AI và xuất báo cáo Excel nhanh.
    *   **Tab Email Auto-Pilot**: Nhập thông tin IMAP Gmail và từ khóa. Chạy luồng quét email ngầm (`threading`), tải CV đính kèm về thư mục `downloaded_cvs` và tự động đưa vào hàng đợi chấm điểm.
    *   **Tab Cấu Hình**: Nhập API Key, chọn model LLM, dán link Webhook Google Sheets.

---

### 4. 🛠️ Tiện Ích & Kết Nối (`/utils`)
*   [utils/email_handler.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/utils/email_handler.py): Xử lý kết nối IMAP Gmail bảo mật (qua App Passwords), lọc thư và tải tệp đính kèm.
*   [utils/apps_script_caller.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/utils/apps_script_caller.py): Định dạng dữ liệu thô thành mảng chuẩn và thực hiện request POST đồng bộ dữ liệu ứng viên sang Google Sheets Webhook. Tự động thêm dấu `'` vào số điện thoại để tránh lỗi mất số `0` ở đầu trong Sheets.
*   [utils/process_cv_to_sheets.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/utils/process_cv_to_sheets.py): Điều phối luồng xử lý hàng loạt (Batch Processing) từ lúc chọn file cho tới khi ghi nhận thành công trên Google Sheets.
*   [utils/sheets_exporter.py](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/utils/sheets_exporter.py): Client export dữ liệu thông qua Google API Credentials (nếu không dùng qua Apps Script Webhook).

---

### 5. ⚡ Google Apps Script (`/apps_script`)
Mã nguồn chạy trên Google Workspace Editor liên kết với Google Sheets của phòng Nhân Sự:
*   [apps_script/Code.gs](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/apps_script/Code.gs):
    *   Nhận request `doPost(e)` chứa thông tin ứng viên.
    *   Thực hiện ghi dòng mới vào sheet `Tổng Hợp`.
    *   Nếu cột Trạng thái là `"PASS CV"`, tự động sao chép toàn bộ thông tin dòng đó sang sheet `Vòng 1`.
    *   Hỗ trợ cơ chế cập nhật trạng thái (`action: "update"`) và đồng bộ cưỡng bức (`action: "sync_pass"`).
*   [apps_script/VanThu.gs](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/apps_script/VanThu.gs): Hỗ trợ các trigger tự động hóa về văn thư lưu trữ, số hóa tờ trình và công văn đến/đi trên Google Drive.

---

### 6. 🌐 Web Dashboard Portal (`/dashboard`)
Trang web quản trị tập trung dành cho các cấp quản lý và nhân sự, xây dựng bằng Next.js (React), Supabase (Database) và TailwindCSS:
*   **Database (Supabase Schema)**: Hệ thống bảng quan hệ được định nghĩa qua các tệp SQL:
    *   `employees`: Lưu hồ sơ thông tin nhân viên, chức vụ, bộ phận, hệ số lương, chỉ số KPI.
    *   `tasks`: Lưu danh sách công việc hành chính nhân sự dạng Kanban, tiến độ, người thực hiện.
    *   `candidates`: Hồ sơ ứng viên tuyển dụng đồng bộ từ quá trình sàng lọc CV.
    *   `van_thu`: Sổ theo dõi văn thư (Công văn đi, Công văn đến, Tờ trình nội bộ).
    *   `attendance`: Bảng log chấm công ngày/tháng.
    *   `invoices` & `suppliers`: Theo dõi đơn hàng văn phòng phẩm, nhà cung cấp và hóa đơn thanh toán.
*   **Trang Chức Năng (App Routes trong `/dashboard/app`)**:
    *   `/` (Dashboard chính): Tổng quan chỉ số KPI, tiến độ công việc hành chính, danh sách nhân sự nghỉ phép và biểu đồ hiệu suất.
    *   `/recruitment`: Theo dõi phễu tuyển dụng tổng thể.
    *   `/vong-1` & `/vong-2`: Quản lý danh sách phỏng vấn vòng chuyên môn và vòng lãnh đạo.
    *   `/thu-viec`: Quản lý lộ trình đánh giá 2 tháng thử việc của nhân sự mới.
    *   `/employees`: Danh bạ nhân viên, hồ sơ năng lực và C&B.
    *   `/phong-ban`: Phân rã cấu trúc tổ chức và nhân sự theo từng bộ phận.
    *   `/tasks`: Quản lý dự án / công việc nội bộ.
    *   `/van-thu`: Giao diện số hóa lưu trữ công văn đến, đi và duyệt tờ trình trực tuyến.
    *   `/document-control`: Thư viện quy trình, chính sách, quy định nội bộ của Trung Nam E&C.

---

## 🔄 Luồng Đi Của Dữ Liệu Tuyển Dụng (Recruitment Data Flow)

1.  **Thu nhận CV**: CV (dưới dạng PDF, DOCX, ảnh) được chọn thủ công qua GUI Desktop hoặc tự động quét tải về từ Gmail nhờ `email_handler.py`.
2.  **Trích xuất & Chấm điểm**: `scorer.py` điều phối `file_reader.py` để lấy nội dung. Tiếp theo, `ai_client.py` gửi nội dung CV và JD tới OpenAI để trích xuất 16 trường thông tin cá nhân và chấm điểm độ tương thích. Đồng thời `department_classifier.py` sẽ phân tích tự động phòng ban nhận hồ sơ và gán trưởng bộ phận đánh giá tương ứng.
3.  **Đồng bộ Sheets**: `apps_script_caller.py` gọi Webhook Apps Script để lưu kết quả vào Google Sheet `Tổng Hợp`.
4.  **Tự động phân luồng**: Google Apps Script phát hiện dòng mới có kết quả `PASS CV`, tự động nhân bản thông tin dòng đó sang sheet `Vòng 1` để sẵn sàng cho quy trình phỏng vấn chuyên môn.
5.  **Báo cáo Quản trị**: Toàn bộ hồ sơ sau đó được đưa lên Supabase, phục vụ hiển thị trên Next.js Web Dashboard và làm đầu vào cho script `generate_reports.py` để xuất báo cáo định kỳ hàng tuần/tháng.
