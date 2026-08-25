# 📋 Hướng dẫn: Kết nối Google Sheets API

Để tính năng **Xuất Google Sheets** hoạt động, bạn cần thiết lập **một lần** theo các bước sau.

---

## Bước 1: Tạo Google Cloud Project

1. Truy cập [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Nhấn **"Select a project"** → **"New Project"**
3. Đặt tên project (VD: `eop-abc-app`) → nhấn **Create**

---

## Bước 2: Bật API cần thiết

Trong project vừa tạo:
1. Vào menu **"APIs & Services"** → **"Library"**
2. Tìm **"Google Sheets API"** → nhấn **Enable**
3. Tìm **"Google Drive API"** → nhấn **Enable**

---

## Bước 3: Tạo Service Account

1. Vào **"APIs & Services"** → **"Credentials"**
2. Nhấn **"+ Create Credentials"** → chọn **"Service account"**
3. Đặt tên (VD: `eop-abc-sa`) → nhấn **Create and Continue** → **Done**
4. Nhấn vào Service Account vừa tạo → tab **"Keys"**
5. Nhấn **"Add Key"** → **"Create new key"** → chọn **JSON** → **Create**
6. File `credentials.json` sẽ tự động tải về máy

---

## Bước 4: Đặt file credentials.json

Copy file `credentials.json` vào **thư mục gốc dự án**:

```
EOP-ABC/
├── credentials.json   ← ĐẶT FILE NÀY VÀO ĐÂY
├── main.py
├── requirements.txt
└── ...
```

> [!IMPORTANT]
> File `credentials.json` chứa khoá bí mật. **Không chia sẻ, không commit lên Git.**
> Thêm vào `.gitignore`: `credentials.json`

---

## Bước 5: Cài thư viện

Chạy trong terminal:

```bash
pip install gspread google-auth
```

hoặc:

```bash
pip install -r requirements.txt
```

---

## Cách hoạt động

Sau khi thiết lập:
1. Chạy ứng dụng: `python main.py`
2. Nhập JD → Chọn thư mục CV → Nhấn **Bắt đầu chấm điểm**
3. Sau khi chấm xong, nhấn **📤 Xuất Google Sheets**
4. Ứng dụng sẽ:
   - Tự động tạo một Google Spreadsheet mới trên Drive của Service Account
   - Ghi đầy đủ kết quả (Họ Tên, Năm Sinh, Điểm Số, Nhận Xét, Trạng Thái, Đường Dẫn File)
   - Hỏi bạn có muốn mở Google Sheets trên trình duyệt không

> [!NOTE]
> Spreadsheet được tạo trên Drive của **Service Account** (không phải Drive cá nhân của bạn).
> Để xem được, bạn cần nhấn link ứng dụng hiển thị hoặc vào Drive → "Shared with me".
> Hoặc mở file `credentials.json`, copy `client_email`, rồi chia sẻ Spreadsheet cho email đó.

---

## Khắc phục lỗi thường gặp

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `Không tìm thấy file credentials.json` | File chưa được đặt đúng chỗ | Xem Bước 4 |
| `403 Forbidden` | API chưa được bật | Xem Bước 2 |
| `PERMISSION_DENIED` | Service Account thiếu quyền | Kiểm tra lại Bước 2 và 3 |
