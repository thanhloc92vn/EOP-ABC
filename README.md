# EOP-ABC - Hệ Thống Quản Trị Dự Án & Hành Chính Nhân Sự 🚀

Chào mừng đến với **EOP-ABC**! Đây là hệ thống quản lý tích hợp (Project Management - Hành chính Nhân sự - Trung Nam EC). Hệ thống bao gồm ứng dụng Desktop hiện đại giúp bộ phận HR tự động hóa quy trình sàng lọc hồ sơ ứng viên (AI CV Scorer), kết nối Google Sheets và hệ thống quản trị dữ liệu nhân sự, thử việc, văn thư nội bộ.

> **Phong cách phát triển: "Vibe Coding"** - Giao diện đẹp, trải nghiệm mượt mà, code sạch. ✨

![Banner](https://img.shields.io/badge/AI-Powered-blue?style=for-the-badge&logo=openai)
![Banner](https://img.shields.io/badge/UI-CustomTkinter-green?style=for-the-badge)
![Banner](https://img.shields.io/badge/Python-3.10+-yellow?style=for-the-badge&logo=python)

---

## 🌟 Tính Năng Nổi Bật

### 1. 🧠 Chấm Điểm Thông Minh (Smart Scoring)
*   **Phân tích đa chiều:** Đánh giá dựa trên Từ khóa kỹ thuật (Hard Skills), Kinh nghiệm làm việc, và Kỹ năng mềm.
*   **Logic "Quân Phiệt":** Áp dụng hình phạt (Penalty) nặng nếu thiếu kỹ năng bắt buộc.
*   **Độ ổn định tuyệt đối:** Sử dụng thuật toán Deterministic (Seed cố định) để đảm bảo 1 CV chấm 10 lần điểm giống nhau cả 10.
*   **Chain-of-Thought:** AI tư duy từng bước trước khi ra quyết định điểm số.

### 2. 👁️ Hỗ Trợ Đa Định Dạng & OCR (AI Vision)
*   Đọc mượt mà các file text: `.pdf`, `.docx`, `.txt`.
*   **Xử lý file ảnh/Scan:** Hỗ trợ `.png`, `.jpg`, `.jpeg` và cả **PDF dạng scan** (ảnh chụp) nhờ tích hợp AI Vision. Không cần convert thủ công!

### 3. 📧 Tự Động Hóa Email (Auto-Pilot)
*   Kết nối trực tiếp tới Gmail.
*   Tự động quét mail theo từ khóa (VD: "Ứng tuyển", "CV").
*   Tự động tải đính kèm và chấm điểm ngay lập tức. **"Hands-free"** thực sự!

### 4. 📊 Giao Diện & Báo Cáo
*   **Modern UI:** Giao diện Dark Mode cực ngầu với `CustomTkinter`.
*   **Chi tiết trực quan:** Xem chi tiết điểm số, kỹ năng phù hợp/thiếu, nhận xét của AI.
*   **Xuất Excel:** Xuất báo cáo đầy đủ (.xlsx) bao gồm cả **Năm sinh**, Điểm số, Nhận xét để báo cáo sếp.

---

## 🛠️ Cài Đặt & Sử Dụng

### Yêu Cầu Hệ Thống
*   Python 3.10 trở lên.
*   API Key của OpenAI (hoặc DeepSeek/tương tự).
*   Nếu dùng tính năng Email: Cần "App Password" của Gmail.

### Bước 1: Cài đặt thư viện
Mở terminal tại thư mục dự án và chạy:
```bash
pip install -r requirements.txt
```

### Bước 2: Cấu hình
Tạo file `.env` (nếu chưa có) và điền API Key (hoặc nhập trực tiếp trên giao diện khi chạy):
```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini
```

### Bước 3: Khởi chạy
```bash
python main.py
```
Giao diện ứng dụng sẽ hiện lên sau vài giây.

---

## 📖 Hướng Dẫn Sử Dụng Nhanh

1.  **Nhập JD:** Paste Mô tả công việc vào ô bên trái.
2.  **Chọn nguồn CV:**
    *   *Cách 1 (Thủ công):* Chọn Tab "📁 File Máy Tính" -> Chọn thư mục chứa CV trên máy.
    *   *Cách 2 (Tự động):* Chọn Tab "📧 Auto Email" -> Nhập Email, App Password, Keyword -> Bấm Start để máy tự làm hết.
3.  **Chấm điểm:** Bấm nút **"BẮT ĐẦU CHẤM ĐIỂM"**.
4.  **Xem kết quả & Xuất file:**
    *   Xem điểm số và màu sắc đánh giá (Xanh/Vàng/Đỏ) ngay trên list.
    *   Bấm **"Chi tiết"** để xem AI nhận xét gì.
    *   Bấm **"Xuất Excel"** để lưu file báo cáo.

---

## 📂 Cấu Trúc Dự Án

```
EOP-ABC/
├── core/                   # Lõi xử lý
│   ├── ai_client.py        # Giao tiếp với AI (Logic chấm, Prompt)
│   ├── file_reader.py      # Đọc file (PDF, OCR, Image)
│   └── scorer.py           # Điều phối luồng xử lý
├── ui/                     # Giao diện người dùng
│   ├── main_window.py      # Cửa sổ chính (GUI logic)
│   └── components/         # Các thành phần UI nhỏ (nếu có)
├── utils/                  # Tiện ích
│   └── email_handler.py    # Xử lý kết nối & tải mail
├── cv pdf png/             # (Folder test file ảnh)
├── main.py                 # File khởi chạy (Entry point)
├── requirements.txt        # Danh sách thư viện
└── .env                    # Biến môi trường (API Key)
```

---

## 💡 Tech Stack
*   **Language:** Python 🐍
*   **GUI Framework:** CustomTkinter (Modern Tkinter wrapper)
*   **AI/LLM:** OpenAI API (GPT-4o-mini)
*   **PDF/OCR:** PyMuPDF, Pillow, pdfplumber
*   **Data/Office:** Pandas, OpenPyXL, python-docx
*   **Automation:** Imaplib, Threading

---

Created with ❤️ by **Vibe Coding Team**.
