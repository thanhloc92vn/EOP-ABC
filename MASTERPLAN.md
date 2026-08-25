# 🏗️ MASTERPLAN: EOP-ABC (Vibe Coding Edition)

## 📋 Tổng Quan Dự Án (Project Summary)
EOP-ABC là hệ thống quản lý quy trình hành chính nhân sự và dự án tích hợp (Trung Nam EC). Hệ thống bao gồm ứng dụng Desktop chạy local (Windows/Mac) hỗ trợ bộ phận HR tự động chấm điểm CV ứng viên dựa trên Job Description (JD) bằng công nghệ LLM (OpenAI/DeepSeek), và Web Dashboard quản trị toàn diện quy trình tuyển dụng, thử việc, văn thư nội bộ. Ưu tiên tốc độ phát triển (Vibe Coding), giao diện hiện đại và kiến trúc dễ bảo trì.

---

## 1. Phân tích công nghệ (Tech Stack Analysis)

| Thành phần | Công nghệ | Lý do lựa chọn |
| :--- | :--- | :--- |
| **Language** | **Python 3.10+** | Ổn định, hỗ trợ Type Hints tốt, hệ sinh thái AI mạnh. |
| **GUI Framework** | **CustomTkinter** | Giao diện Modern/Dark mode mặc định, code gọn hơn Tkinter thuần, native look. |
| **Core AI** | **OpenAI API** | Dễ tích hợp, trả về JSON structure tốt. Có thể switch sang DeepSeek (với base_url) để tối ưu chi phí. |
| **File Processing** | **pdfplumber** & **docx2txt** | `pdfplumber` extract text chính xác hơn PyPDF2 với layout phức tạp. `docx2txt` nhẹ và nhanh. |
| **Data Handling** | **Pandas** | Xử lý danh sách ứng viên, sort điểm số và export ra Excel dễ dàng. |

---

## 2. Cấu trúc thư mục (Project Structure)
Sử dụng mô hình **Modular Service-Based** (tương tự MVC nhưng đơn giản hóa cho Desktop App). Tách biệt hoàn toàn giao diện (UI) và logic xử lý (Core).

```text
EOP-ABC/
│
├── .env                     # 🔐 Lưu API KEY, Base URL (Không commit lên Git)
├── requirements.txt         # 📦 Danh sách dependencies
├── main.py                  # 🚀 Entry Point (Khởi chạy ứng dụng)
├── README.md                # 📄 Tài liệu hướng dẫn
│
├── core/                    # 🧠 LOGIC LAYER (Xử lý nghiệp vụ)
│   ├── __init__.py
│   ├── file_reader.py       # Adapter đọc file (PDF, DOCX) -> Clean Text
│   ├── ai_client.py         # Wrapper gọi API (OpenAI/DeepSeek), xử lý Retry/Error
│   ├── scorer.py            # Logic chính: Ghép Prompt, gửi AI, parse kết quả JSON
│   └── exporter.py          # Xuất kết quả ra Excel/CSV
│
├── ui/                      # 🎨 VIEW LAYER (Giao diện người dùng)
│   ├── __init__.py
│   ├── app.py               # Main Window Setup
│   ├── theme.json           # (Optional) Config màu sắc nếu cần custom sâu
│   └── components/          # Các Widget tái sử dụng
│       ├── __init__.py
│       ├── jd_input.py      # Form nhập JD
│       ├── file_list.py     # List file đã chọn
│       └── result_view.py   # Bảng hiển thị điểm số
│
└── utils/                   # 🛠️ UTILITIES (Hàm hỗ trợ)
    ├── logger.py            # Ghi log file (cần thiết để debug production)
    └── validators.py        # Kiểm tra file hợp lệ, check API key format
```

---

## 3. Lộ trình phát triển (Development Roadmap)

### 🚀 Phase 1: Core Logic (The Brain)
Tập trung vào tính năng, chưa cần giao diện đẹp.
- [ ] Setup Project, Virtual Env, Git `.gitignore`.
- [ ] Implement `file_reader.py`: Input đường dẫn file -> Output text string.
- [ ] Implement `ai_client.py`: Class kết nối OpenAI, hàm `get_completion(prompt)`.
- [ ] **Milestone 1**: Viết script test chạy terminal: Đọc 1 CV + 1 JD -> In ra điểm số trên màn hình console.

### 🎨 Phase 2: UI Implementation (The Face)
Dựng giao diện người dùng trơn tru.
- [ ] Dựng Main Window với CustomTkinter (Grid layout).
- [ ] Tạo khu vực bên trái: Textbox nhập JD, Button "Load CV Folder".
- [ ] Tạo khu vực bên phải: Placeholder cho bảng kết quả.
- [ ] Kết nối button với Logic Phase 1 (Sử dụng `threading` để app không bị treo khi AI đang "suy nghĩ").
- [ ] **Milestone 2**: App chạy được, chọn file, bấm nút chấm, hiện kết quả thô (text hoặc print log).

### 💎 Phase 3: Export & Optimization (The Polish)
Hoàn thiện trải nghiệm và tính ổn định.
- [ ] Hiển thị kết quả lên `CTkTable` hoặc Treeview đẹp mắt.
- [ ] Nút "Export Excel": Xuất file `.xlsx` với format màu (Xanh: match cao, Đỏ: thấp).
- [ ] Xử lý lỗi (Error Handling): File lỗi không làm crash app, hiện popup thông báo.
- [ ] **Milestone 3**: Phiên bản v1.0 hoàn chỉnh, đóng gói `.exe` (nếu cần).

---

## 4. Tư duy ngược & Quản lý rủi ro (Risk Management & Safety)

| 🔥 Rủi ro (Risk) | 🛡️ Giải pháp (Inversion Solution) |
| :--- | :--- |
| **1. File PDF dạng ảnh (Scanned)** | Các thư viện text thông thường sẽ trả về rỗng. <br>👉 **Giải pháp**: Logic trích xuất phải kiểm tra độ dài text (`len(text) < 50`). Nếu quá ngắn -> Đánh dấu là "Scan/Error" và bỏ qua, báo user check tay. Không cố gắng OCR ngay Phase 1 để tránh phức tạp `Tesseract`. |
| **2. Chi phí API & Timeout** | Gửi 100 CV cùng lúc sẽ tắc nghẽn hoặc timeout. <br>👉 **Giải pháp**: Implement cơ chế "Queue" (Hàng đợi). Xử lý từng file hoặc batch nhỏ (3-5 file/lần). Thêm `try-except` retry 3 lần nếu API lỗi mạng. |
| **3. Dữ liệu nhạy cảm & Bảo mật** | Nguy cơ lộ API Key hoặc gửi thông tin PII lung tung. <br>👉 **Giải pháp**: 100% dùng `.env` load key, không hardcode. Nhắc nhở user trong README về việc data được gửi lên OpenAI chứa PII (Tên, SĐT), cần tuân thủ chính sách công ty. |

---
*Created by AI Agent (Role: Software Architect)*
python main.py

