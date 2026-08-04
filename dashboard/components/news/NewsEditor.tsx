"use client";

// ============================================================
// NewsEditor — ô soạn nội dung bài tin.
//
// Thanh công cụ tự viết trên nền textarea, KHÔNG dùng thư viện rich text:
// mỗi nút chỉ bọc cú pháp Markdown quanh vùng đang bôi đen. Khung xem trước
// bên phải dùng ĐÚNG hàm render của trang chi tiết (renderNewsMarkdown), nên
// những gì thấy lúc soạn chính là bài thật.
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Heading2,
  List,
  Quote,
  Link2,
  ImagePlus,
  Loader2,
  Eye,
  Minus,
} from "lucide-react";
import { renderNewsMarkdown, extractImagePaths } from "@/lib/newsMarkdown";
import { uploadNewsFile, signNewsPaths } from "@/lib/news";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
};

export default function NewsEditor({ value, onChange, onError }: Props) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // path trong bucket -> link ký hạn giờ, để khung xem trước hiện được ảnh
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // Mở bài cũ để sửa: ký lại link cho những ảnh đã nhúng trong nội dung
  useEffect(() => {
    const paths = extractImagePaths(value).filter((p) => !imageUrls[p]);
    if (paths.length === 0) return;
    let alive = true;
    signNewsPaths(paths).then((map) => {
      if (alive && Object.keys(map).length > 0) setImageUrls((prev) => ({ ...prev, ...map }));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /** Bọc cú pháp quanh vùng bôi đen, hoặc chèn mẫu nếu chưa chọn gì. */
  const wrap = (before: string, after = "", placeholder = "") => {
    const area = areaRef.current;
    if (!area) return;

    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);

    // Trả con trỏ về đúng phần chữ vừa bọc để gõ tiếp
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  /** Thêm tiền tố vào đầu mỗi dòng đang chọn (danh sách, trích dẫn, tiêu đề). */
  const prefixLines = (prefix: string) => {
    const area = areaRef.current;
    if (!area) return;

    const start = area.selectionStart;
    const end = area.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const block = value.slice(lineStart, end) || "Nội dung";
    const prefixed = block
      .split("\n")
      .map((line) => (line.startsWith(prefix) ? line : prefix + line))
      .join("\n");

    onChange(value.slice(0, lineStart) + prefixed + value.slice(end));
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(lineStart, lineStart + prefixed.length);
    });
  };

  const insertLink = () => {
    const url = window.prompt("Dán đường dẫn (báo, website, tài liệu):", "https://");
    if (!url || url.trim() === "https://") return;
    wrap("[", `](${url.trim()})`, "chữ hiển thị");
  };

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      onError("Chỉ chèn được ảnh vào giữa bài. File PDF hãy dùng khối Tệp đính kèm bên dưới.");
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadNewsFile(file, "inline");
      const map = await signNewsPaths([uploaded.path]);
      setImageUrls((prev) => ({ ...prev, ...map }));

      const area = areaRef.current;
      const pos = area ? area.selectionStart : value.length;
      const snippet = `\n![${uploaded.name}](${uploaded.path})\n`;
      onChange(value.slice(0, pos) + snippet + value.slice(pos));
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Không tải được ảnh lên.");
    } finally {
      setUploading(false);
    }
  };

  const tools = [
    { icon: Bold, title: "In đậm", run: () => wrap("**", "**", "chữ in đậm") },
    { icon: Italic, title: "In nghiêng", run: () => wrap("*", "*", "chữ in nghiêng") },
    { icon: Heading2, title: "Tiêu đề mục", run: () => prefixLines("## ") },
    { icon: List, title: "Danh sách", run: () => prefixLines("- ") },
    { icon: Quote, title: "Trích dẫn", run: () => prefixLines("> ") },
    { icon: Minus, title: "Đường kẻ ngang", run: () => onChange(value + "\n\n---\n\n") },
    { icon: Link2, title: "Chèn liên kết", run: insertLink },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Cột soạn */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1 p-1.5 bg-slate-50 border border-slate-200 rounded-xl">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.title}
                type="button"
                onClick={tool.run}
                title={tool.title}
                className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-[#005BAC] hover:shadow-sm transition-all duration-200 active:scale-[0.97] cursor-pointer"
              >
                <Icon size={14} />
              </button>
            );
          })}

          <span className="w-px h-5 bg-slate-200 mx-1" />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Chèn ảnh vào giữa bài"
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-white hover:text-[#005BAC] hover:shadow-sm transition-all duration-200 active:scale-[0.97] cursor-pointer disabled:opacity-60"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            <span>Chèn ảnh</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handlePickImage}
            className="hidden"
          />
        </div>

        <textarea
          ref={areaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={16}
          placeholder={"Viết nội dung tại đây...\n\n## Tiêu đề mục\n- Ý thứ nhất\n- Ý thứ hai\n\n> Câu nhấn mạnh\n\nBôi đen chữ rồi bấm nút trên thanh công cụ để định dạng."}
          className="w-full px-4 py-3 text-xs leading-relaxed bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-mono resize-y"
        />
      </div>

      {/* Cột xem trước */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 px-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
          <Eye size={12} />
          Xem trước
        </div>
        <div className="h-[calc(100%-1.75rem)] min-h-[24rem] max-h-[32rem] overflow-y-auto px-5 py-4 bg-slate-50/60 border border-slate-200 rounded-xl">
          {value.trim() ? (
            <div
              className="text-xs text-slate-600 font-medium"
              dangerouslySetInnerHTML={{
                __html: renderNewsMarkdown(value, (p) => imageUrls[p]),
              }}
            />
          ) : (
            <p className="text-slate-400 text-xs italic text-center py-8">
              Nội dung bài viết sẽ hiển thị tại đây.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
