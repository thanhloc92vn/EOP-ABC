import customtkinter as ctk
import os
import threading
import webbrowser
import json
from tkinter import messagebox, filedialog
from core.scorer import CVScorer
from core.config_manager import ConfigManager
from utils.process_cv_to_sheets import process_cv_to_sheets, batch_process

# Cấu hình giao diện chung
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

NGUON_OPTIONS = ["TopCV", "LinkedIn", "Email", "Referral", "Khác"]
MODEL_OPTIONS = ["gpt-4o-mini", "gpt-4o", "o1-preview", "o1-mini"]


class SettingsPopup(ctk.CTkToplevel):
    def __init__(self, parent):
        super().__init__(parent)
        self.title("⚙️ Cài đặt cấu hình")
        self.geometry("500x450")
        self.attributes("-topmost", True)
        
        self.grid_columnconfigure(0, weight=1)
        self.padx = 20
        
        # Load current config
        self.config = ConfigManager.load_config()
        
        # UI elements
        row = 0
        ctk.CTkLabel(self, text="CẤU HÌNH HỆ THỐNG", font=ctk.CTkFont(size=16, weight="bold")
                    ).grid(row=row, column=0, pady=(20, 10)); row += 1
        
        # API Key
        ctk.CTkLabel(self, text="OpenAI API Key:", anchor="w").grid(row=row, column=0, padx=self.padx, sticky="w"); row += 1
        self.api_entry = ctk.CTkEntry(self, placeholder_text="sk-...", show="*", width=400)
        self.api_entry.insert(0, self.config.get("openai_api_key", ""))
        self.api_entry.grid(row=row, column=0, padx=self.padx, pady=(0, 10)); row += 1
        
        # Model
        ctk.CTkLabel(self, text="Model ChatGPT:", anchor="w").grid(row=row, column=0, padx=self.padx, sticky="w"); row += 1
        self.model_var = ctk.StringVar(value=self.config.get("openai_model", "gpt-4o-mini"))
        self.model_menu = ctk.CTkOptionMenu(self, values=MODEL_OPTIONS, variable=self.model_var, width=400)
        self.model_menu.grid(row=row, column=0, padx=self.padx, pady=(0, 10)); row += 1
        
        # Webhook URL
        ctk.CTkLabel(self, text="Google Apps Script URL:", anchor="w").grid(row=row, column=0, padx=self.padx, sticky="w"); row += 1
        self.url_entry = ctk.CTkEntry(self, placeholder_text="https://script.google.com/...", width=400)
        self.url_entry.insert(0, self.config.get("apps_script_url", ""))
        self.url_entry.grid(row=row, column=0, padx=self.padx, pady=(0, 10)); row += 1
        
        # Save Button
        self.save_btn = ctk.CTkButton(self, text="LƯU CẤU HÌNH", fg_color="#2ecc71", hover_color="#27ae60",
                                     command=self.save_and_close)
        self.save_btn.grid(row=row, column=0, pady=20); row += 1

    def save_and_close(self):
        new_config = {
            "openai_api_key": self.api_entry.get().strip(),
            "openai_model": self.model_var.get(),
            "apps_script_url": self.url_entry.get().strip()
        }
        ConfigManager.save_config(new_config)
        messagebox.showinfo("Thành công", "Đã lưu cấu hình thành công!")
        self.destroy()


class DetailPopup(ctk.CTkToplevel):
    """Popup hiển thị chi tiết chấm điểm CV."""
    def __init__(self, parent, data: dict):
        super().__init__(parent)
        info = data.get("row_appended", {})
        name = info.get("ten_ung_vien", "N/A")
        self.title(f"📋 Chi tiết: {name}")
        self.geometry("520x560")
        self.attributes("-topmost", True)
        self.grid_columnconfigure(0, weight=1)

        score = data.get("score", 0)
        matching = data.get("matching_skills", [])
        missing  = data.get("missing_skills", [])
        summary  = data.get("summary", "")
        rec      = data.get("recommendation", "")
        success  = data.get("success", False)

        row = 0
        # Header
        ctk.CTkLabel(self, text=name, font=ctk.CTkFont(size=16, weight="bold")
                     ).grid(row=row, column=0, pady=(16, 2), padx=20, sticky="w"); row += 1
        vi_tri = info.get("vi_tri", "N/A")
        khu_vuc = info.get("khu_vuc", "N/A")
        sdt = info.get("sdt", "N/A")
        ctk.CTkLabel(self, text=f"{vi_tri}  |  {khu_vuc}  |  📞 {sdt}",
                     font=ctk.CTkFont(size=11), text_color="gray"
                     ).grid(row=row, column=0, padx=20, sticky="w"); row += 1

        # Score bar
        score_color = "#2ecc71" if score >= 75 else ("#f1c40f" if score >= 50 else "#e74c3c")
        ctk.CTkLabel(self, text=f"Điểm phù hợp: {score}/100",
                     font=ctk.CTkFont(size=14, weight="bold"), text_color=score_color
                     ).grid(row=row, column=0, padx=20, pady=(12, 2), sticky="w"); row += 1
        bar = ctk.CTkProgressBar(self, progress_color=score_color)
        bar.set(score / 100)
        bar.grid(row=row, column=0, padx=20, sticky="ew", pady=(0, 10)); row += 1

        # Recommendation
        rec_colors = {"Interview": "#2ecc71", "Hold": "#f1c40f", "Reject": "#e74c3c", "Error": "gray"}
        rec_color = rec_colors.get(rec, "gray")
        ctk.CTkLabel(self, text=f"Khuyến nghị: {rec}",
                     font=ctk.CTkFont(size=12, weight="bold"), text_color=rec_color
                     ).grid(row=row, column=0, padx=20, sticky="w"); row += 1

        # Matching skills
        ctk.CTkLabel(self, text="✅ Kỹ năng tương thích:",
                     font=ctk.CTkFont(size=12, weight="bold"), text_color="#2ecc71"
                     ).grid(row=row, column=0, padx=20, pady=(12, 2), sticky="w"); row += 1
        match_text = "  •  ".join(matching) if matching else "(Không có)"
        ctk.CTkLabel(self, text=match_text, wraplength=460, justify="left",
                     font=ctk.CTkFont(size=11), anchor="w"
                     ).grid(row=row, column=0, padx=28, sticky="w"); row += 1

        # Missing skills
        ctk.CTkLabel(self, text="❌ Kỹ năng chưa tương thích:",
                     font=ctk.CTkFont(size=12, weight="bold"), text_color="#e74c3c"
                     ).grid(row=row, column=0, padx=20, pady=(10, 2), sticky="w"); row += 1
        miss_text = "  •  ".join(missing) if missing else "(Không có)"
        ctk.CTkLabel(self, text=miss_text, wraplength=460, justify="left",
                     font=ctk.CTkFont(size=11), anchor="w"
                     ).grid(row=row, column=0, padx=28, sticky="w"); row += 1

        # Summary
        ctk.CTkLabel(self, text="📝 Nhận xét AI:",
                     font=ctk.CTkFont(size=12, weight="bold")
                     ).grid(row=row, column=0, padx=20, pady=(10, 2), sticky="w"); row += 1
        summary_box = ctk.CTkTextbox(self, height=90, wrap="word", font=ctk.CTkFont(size=11))
        summary_box.insert("0.0", summary)
        summary_box.configure(state="disabled")
        summary_box.grid(row=row, column=0, padx=20, sticky="ew", pady=(0, 8)); row += 1

        # Sheets status
        sheet_status = "✅ Đã ghi Sheets" if success else "⚠️ Chưa ghi Sheets"
        sheet_color  = "#2ecc71" if success else "#e74c3c"
        ctk.CTkLabel(self, text=sheet_status, text_color=sheet_color,
                     font=ctk.CTkFont(size=11)
                     ).grid(row=row, column=0, padx=20, pady=(0, 16), sticky="w")


class CVScorerApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        # --- CẤU HÌNH WINDOW ---
        self.title("EOP-ABC")
        self.geometry("1200x800")

        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # --- KHỞI TẠO LOGIC ---
        self.selected_folder = ""
        self.is_processing = False
        self.results_data = []
        
        # Load config to get default API key if any
        self.config = ConfigManager.load_config()

        # --- UI COMPONENTS ---
        self._setup_sidebar()
        self._setup_main_area()

    # ──────────────────────────────────────────────────────────────────
    # SIDEBAR
    # ──────────────────────────────────────────────────────────────────
    def _setup_sidebar(self):
        self.sidebar_frame = ctk.CTkFrame(self, width=280, corner_radius=0)
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_propagate(False)

        row = 0

        # Title
        ctk.CTkLabel(
            self.sidebar_frame, text="🤖 EOP-ABC",
            font=ctk.CTkFont(size=18, weight="bold")
        ).grid(row=row, column=0, padx=20, pady=(20, 2), sticky="w"); row += 1

        ctk.CTkLabel(
            self.sidebar_frame, text="Automation Pipeline",
            font=ctk.CTkFont(size=11), text_color="gray"
        ).grid(row=row, column=0, padx=20, pady=(0, 15), sticky="w"); row += 1

        # ── JD Input ─────────────────────────────────────────────────
        ctk.CTkLabel(self.sidebar_frame, text="📋 Mô tả công việc (JD):", anchor="w"
                     ).grid(row=row, column=0, padx=20, pady=(8, 0), sticky="w"); row += 1

        self.jd_textbox = ctk.CTkTextbox(self.sidebar_frame, height=200)
        self.jd_textbox.grid(row=row, column=0, padx=20, pady=(4, 12), sticky="ew"); row += 1
        self.jd_textbox.insert("0.0", "Paste Job Description vào đây...")

        # ── Nguồn CV ─────────────────────────────────────────────────
        ctk.CTkLabel(self.sidebar_frame, text="🌐 Nguồn CV:", anchor="w"
                     ).grid(row=row, column=0, padx=20, pady=(4, 0), sticky="w"); row += 1
        self.nguon_var = ctk.StringVar(value="TopCV")
        self.nguon_dropdown = ctk.CTkOptionMenu(
            self.sidebar_frame, values=NGUON_OPTIONS, variable=self.nguon_var
        )
        self.nguon_dropdown.grid(row=row, column=0, padx=20, pady=(4, 12), sticky="ew"); row += 1

        # ── Chọn thư mục CV ───────────────────────────────────────────
        self.folder_btn = ctk.CTkButton(
            self.sidebar_frame, text="📁 Chọn Thư Mục CV",
            command=self.browse_folder
        )
        self.folder_btn.grid(row=row, column=0, padx=20, pady=(15, 4)); row += 1

        self.folder_path_label = ctk.CTkLabel(
            self.sidebar_frame, text="Chưa chọn thư mục",
            text_color="gray", wraplength=230, font=ctk.CTkFont(size=11)
        )
        self.folder_path_label.grid(row=row, column=0, padx=20, pady=(0, 15)); row += 1

        # ── Start Button ──────────────────────────────────────────────
        self.start_btn = ctk.CTkButton(
            self.sidebar_frame,
            text="🚀 BẮT ĐẦU CHẤM & GHI SHEETS",
            fg_color="#2ecc71", hover_color="#27ae60",
            height=48, font=ctk.CTkFont(size=14, weight="bold"),
            command=self.start_scoring
        )
        self.start_btn.grid(row=row, column=0, padx=20, pady=(10, 10), sticky="ew"); row += 1

        # Bottom Frame for Settings & Link
        bottom_frame = ctk.CTkFrame(self.sidebar_frame, fg_color="transparent")
        bottom_frame.grid(row=row, column=0, padx=20, pady=(20, 10), sticky="sew"); row += 1
        bottom_frame.grid_columnconfigure((0, 1), weight=1)

        self.settings_btn = ctk.CTkButton(
            bottom_frame, text="⚙️ Cài đặt", width=100,
            fg_color="#34495e", hover_color="#2c3e50",
            command=self.open_settings
        )
        self.settings_btn.grid(row=0, column=0, padx=(0, 5))

        self.open_sheet_btn = ctk.CTkButton(
            bottom_frame, text="🔗 Mở Sheets", width=100,
            fg_color="#1a73e8", hover_color="#1558b0",
            command=self.open_sheet
        )
        self.open_sheet_btn.grid(row=0, column=1, padx=(5, 0))

    # ──────────────────────────────────────────────────────────────────
    # MAIN AREA
    # ──────────────────────────────────────────────────────────────────
    def _setup_main_area(self):
        self.main_frame = ctk.CTkFrame(self, corner_radius=0, fg_color="transparent")
        self.main_frame.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)
        self.main_frame.grid_rowconfigure(1, weight=1)
        self.main_frame.grid_columnconfigure(0, weight=1)

        # Header
        header_frame = ctk.CTkFrame(self.main_frame, fg_color="transparent")
        header_frame.grid(row=0, column=0, sticky="ew", pady=(0, 10))

        ctk.CTkLabel(
            header_frame, text="Kết Quả Phân Tích",
            font=ctk.CTkFont(size=22, weight="bold")
        ).pack(side="left")

        self.progress_bar = ctk.CTkProgressBar(header_frame)
        self.progress_bar.pack(side="right", fill="x", expand=True, padx=(20, 0))
        self.progress_bar.set(0)

        self.progress_label = ctk.CTkLabel(
            header_frame, text="", font=ctk.CTkFont(size=11), text_color="gray"
        )
        self.progress_label.pack(side="right", padx=(0, 10))

        # Scrollable results
        self.result_scroll = ctk.CTkScrollableFrame(
            self.main_frame, label_text="Danh Sách Ứng Viên"
        )
        self.result_scroll.grid(row=1, column=0, sticky="nsew")

        # Status bar
        self.status_label = ctk.CTkLabel(
            self.main_frame, text="Sẵn sàng.",
            font=ctk.CTkFont(size=11), text_color="gray", anchor="w"
        )
        self.status_label.grid(row=2, column=0, sticky="ew", pady=(6, 0))

    # ──────────────────────────────────────────────────────────────────
    # ACTIONS
    # ──────────────────────────────────────────────────────────────────
    def open_settings(self):
        SettingsPopup(self)

    def browse_folder(self):
        folder = filedialog.askdirectory()
        if folder:
            self.selected_folder = folder
            self.folder_path_label.configure(
                text=os.path.basename(folder), text_color="white"
            )

    def start_scoring(self):
        if self.is_processing:
            return

        # Reload config per run to ensure latest settings are used
        config = ConfigManager.load_config()
        
        jd_text = self.jd_textbox.get("1.0", "end-1c").strip()
        nguon = self.nguon_var.get()
        nguoi_dg = "AI Auto"  # Defaulted as requested
        
        api_key = config.get("openai_api_key")
        webhook_url = config.get("apps_script_url")

        # Validations
        if not self.selected_folder:
            messagebox.showwarning("Thiếu thông tin", "Vui lòng chọn thư mục chứa CV.")
            return
        if not api_key:
            messagebox.showwarning("Thiếu cấu hình", "Vui lòng vào Cài đặt để nhập OpenAI API Key.")
            return
        if not webhook_url:
            if not messagebox.askyesno("Thiếu cấu hình", "Chưa có Link Apps Script. Kết quả sẽ không được lưu vào Sheets. Tiếp tục?"):
                return

        # Reset UI
        self.is_processing = True
        self.results_data = []
        self.start_btn.configure(state="disabled", text="⏳ Đang xử lý...")
        self.progress_bar.set(0)
        self._set_status("Bắt đầu xử lý danh sách CV...")
        for w in self.result_scroll.winfo_children():
            w.destroy()

        # Background thread
        t = threading.Thread(
            target=self._process_files,
            args=(jd_text, webhook_url, nguon, nguoi_dg, api_key)
        )
        t.daemon = True
        t.start()

    def _process_files(self, jd_text, webhook_url, nguon, nguoi_dg, api_key):
        extensions = ('.pdf', '.docx', '.doc', '.txt', '.png', '.jpg', '.jpeg')
        files = [
            os.path.join(self.selected_folder, f)
            for f in os.listdir(self.selected_folder)
            if f.lower().endswith(extensions)
        ]
        total = len(files)

        if total == 0:
            self.after(0, lambda: messagebox.showinfo("Thông báo", "Không tìm thấy file CV nào."))
            self.after(0, self._reset_ui)
            return

        def on_progress(idx, tot, result):
            pct = idx / tot
            info = result.get("row_appended", {})
            name = info.get("ten_ung_vien", "N/A")
            status_icon = "✅" if result.get("success") else "⚠️"
            self.after(0, lambda: self.progress_bar.set(pct))
            self.after(0, lambda: self.progress_label.configure(text=f"{idx}/{tot}"))
            self.after(0, lambda: self._set_status(f"[{idx}/{tot}] {status_icon} {name}"))
            self.after(0, lambda d=result: self._add_result_row(d))

        # We pass sheet_id=webhook_url because process_cv_to_sheets now uses apps_script_caller 
        # which reads URL from config, but we pass it anyway for consistency.
        results = batch_process(
            cv_files=files,
            sheet_id=webhook_url,
            jd_text=jd_text,
            nguon=nguon,
            nguoi_danh_gia=nguoi_dg,
            api_key=api_key,
            on_progress=on_progress,
        )
        self.results_data = results
        self.last_sheet_url = next((r.get("sheet_url") for r in results if r.get("sheet_url")), None)

        success_count = sum(1 for r in results if r.get("success"))
        msg = f"Hoàn tất {total} hồ sơ.\n✅ Thành công: {success_count}/{total}"
        self.after(0, lambda: messagebox.showinfo("Hoàn tất 🎉", msg))
        self.after(0, self._reset_ui)

    def _add_result_row(self, data: dict):
        info = data.get("row_appended", {})
        score = data.get("score", 0)
        success = data.get("success", False)
        name = info.get("ten_ung_vien", "N/A")
        trang_thai = info.get("trang_thai", "FAIL")

        row_frame = ctk.CTkFrame(self.result_scroll, fg_color=("#2b2b2b", "#333333"))
        row_frame.pack(fill="x", pady=4, padx=5)

        # Avatar
        initials = "".join([n[0] for n in name.split()[:2]]).upper() if name != "N/A" and "Lỗi" not in name else "?"
        ctk.CTkLabel(row_frame, text=initials, width=40, height=40, fg_color="gray", corner_radius=20).pack(side="left", padx=10, pady=10)

        # Nút Chi tiết
        detail_btn = ctk.CTkButton(
            row_frame, text="📋 Chi tiết",
            width=90, height=34,
            fg_color="#1a73e8", hover_color="#1558b0",
            font=ctk.CTkFont(size=11, weight="bold"),
            command=lambda d=data: DetailPopup(self, d)
        )
        detail_btn.pack(side="right", padx=10, pady=10)

        # Score
        score_color = self._get_score_color(score)
        score_frame = ctk.CTkFrame(row_frame, fg_color="transparent")
        score_frame.pack(side="right", padx=10)
        ctk.CTkLabel(score_frame, text=str(score), font=ctk.CTkFont(size=22, weight="bold"), text_color=score_color).pack(anchor="e")
        ctk.CTkLabel(score_frame, text="/100", font=ctk.CTkFont(size=9), text_color="gray").pack(anchor="e")

        # Info
        info_frame = ctk.CTkFrame(row_frame, fg_color="transparent")
        info_frame.pack(side="left", fill="both", expand=True, padx=5)
        ctk.CTkLabel(info_frame, text=name, font=ctk.CTkFont(size=14, weight="bold"), anchor="w").pack(fill="x")
        detail_text = f"{trang_thai}  |  {info.get('vi_tri','N/A')}  |  {info.get('khu_vuc','N/A')}"
        ctk.CTkLabel(info_frame, text=detail_text, font=ctk.CTkFont(size=11), text_color="silver", anchor="w").pack(fill="x")

    def open_sheet(self):
        url = getattr(self, "last_sheet_url", None)
        if not url:
            config = ConfigManager.load_config()
            url = config.get("apps_script_url")
        
        if url and "macros/s/" not in url:
             webbrowser.open(url)
        elif url:
             # If it's the webhook URL, we can't really "open" a sheet from it easily without a separate config for Sheet ID
             # But usually the user just wants the final sheet URL returned from the script.
             messagebox.showinfo("Thông báo", "Vui lòng chạy xử lý để lấy URL Sheet kết quả!")
        else:
            messagebox.showinfo("Thông báo", "Chưa có Google Sheet URL để mở.")

    def _get_score_color(self, score: int) -> str:
        if score >= 75: return "#2ecc71"
        if score >= 50: return "#f1c40f"
        return "#e74c3c"

    def _set_status(self, msg: str):
        self.status_label.configure(text=msg)

    def _reset_ui(self):
        self.is_processing = False
        self.start_btn.configure(state="normal", text="🚀 BẮT ĐẦU CHẤM & GHI SHEETS")


if __name__ == "__main__":
    app = CVScorerApp()
    app.mainloop()
