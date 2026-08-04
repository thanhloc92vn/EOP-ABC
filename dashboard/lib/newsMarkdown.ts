// ============================================================
// newsMarkdown — bộ dựng HTML cho nội dung bài Tin tức.
//
// VÌ SAO KHÔNG LƯU HTML THÔ:
// Trình soạn thảo của module Tin tức là thanh công cụ tự viết (không dùng thư
// viện rich text). Nếu lưu HTML do trình duyệt sinh ra thì phải có bước lọc thẻ
// để chặn XSS — sai một nhịp là người có quyền đăng bài chèn được <script> cho
// TOÀN CÔNG TY chạy. Ở đây lưu Markdown RÚT GỌN và tự dựng thẻ:
// escape toàn bộ HTML TRƯỚC, rồi mới sinh thẻ từ cú pháp -> an toàn theo cấu
// trúc, không cần thư viện lọc.
//
// Cú pháp hỗ trợ (cố ý hẹp, đủ cho một bài thông báo nội bộ):
//   ## / ###        tiêu đề
//   **đậm**  *nghiêng*  `mã`
//   - mục            danh sách gạch đầu dòng
//   1. mục           danh sách đánh số
//   > trích dẫn
//   ---              đường kẻ ngang
//   [chữ](url)       liên kết (chỉ http/https/mailto)
//   ![mô tả](path)   ảnh — `path` là đường dẫn trong bucket news-media,
//                    được đổi thành link ký hạn giờ qua tham số resolveImage.
//   dòng trống       ngắt đoạn
// ============================================================

/** Đổi đường dẫn ảnh trong bucket thành URL xem được (link ký hạn giờ). */
export type ImageResolver = (path: string) => string | undefined;

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

/**
 * Chỉ cho phép liên kết an toàn. Chặn `javascript:`, `data:`, `vbscript:` —
 * kể cả khi bị viết lách kiểu "java\nscript:" (đã trim + bỏ ký tự điều khiển).
 */
function safeUrl(raw: string): string | null {
  const url = raw.trim().replace(/[\x00-\x1F\x7F]/g, "");
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
  // Đường dẫn tương đối trong chính hệ thống (vd /tin-tuc/abc)
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return null;
}

/** Ảnh: hoặc URL http(s), hoặc đường dẫn trong bucket -> nhờ resolveImage đổi. */
function resolveImageSrc(raw: string, resolveImage?: ImageResolver): string | null {
  const src = raw.trim();
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  // Còn lại phải là ĐƯỜNG DẪN trong bucket. Chặn mọi thứ mang lược đồ
  // (javascript:, data:, //ngoai.com) trước khi đưa cho resolver — không phụ
  // thuộc vào việc resolver có đủ chặt hay không.
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//")) return null;
  const signed = resolveImage?.(src);
  return signed ? signed : null;
}

/** Định dạng trong một dòng. Chuỗi đầu vào PHẢI đã được escapeHtml. */
function renderInline(escaped: string, resolveImage?: ImageResolver): string {
  let out = escaped;

  // Ảnh trước liên kết, vì cú pháp ảnh chứa cú pháp liên kết bên trong.
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt: string, src: string) => {
    const url = resolveImageSrc(src, resolveImage);
    if (!url) return whole;
    return `<img src="${url}" alt="${alt}" loading="lazy" class="my-4 w-full rounded-2xl border border-slate-200/60" />`;
  });

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text: string, href: string) => {
    const url = safeUrl(href);
    if (!url) return whole;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-[#005BAC] font-semibold underline decoration-blue-200 underline-offset-2 hover:decoration-blue-500">${text}</a>`;
  });

  // `mã` trước đậm/nghiêng để dấu * bên trong đoạn mã không bị hiểu là định dạng
  out = out.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded-md bg-slate-100 text-[0.9em] font-mono text-slate-700">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-slate-800">$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');

  return out;
}

type Block =
  | { type: "p" | "h2" | "h3" | "quote"; lines: string[] }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "hr" };

/** Gom các dòng thành khối trước khi dựng thẻ (danh sách/trích dẫn nhiều dòng). */
function toBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let current: Block | null = null;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flush();
      blocks.push({ type: "hr" });
      continue;
    }

    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      flush();
      blocks.push({ type: "h3", lines: [h3[1]] });
      continue;
    }
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      flush();
      blocks.push({ type: "h2", lines: [h2[1]] });
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (current?.type !== "ul") {
        flush();
        current = { type: "ul", items: [] };
      }
      (current as { type: "ul"; items: string[] }).items.push(ul[1]);
      continue;
    }

    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      if (current?.type !== "ol") {
        flush();
        current = { type: "ol", items: [] };
      }
      (current as { type: "ol"; items: string[] }).items.push(ol[1]);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      if (current?.type !== "quote") {
        flush();
        current = { type: "quote", lines: [] };
      }
      (current as { type: "quote"; lines: string[] }).lines.push(quote[1]);
      continue;
    }

    if (current?.type !== "p") {
      flush();
      current = { type: "p", lines: [] };
    }
    (current as { type: "p"; lines: string[] }).lines.push(line);
  }

  flush();
  return blocks;
}

/**
 * Dựng HTML để đưa vào dangerouslySetInnerHTML.
 * An toàn vì mọi ký tự HTML trong nội dung gốc đã bị escape trước khi sinh thẻ.
 */
export function renderNewsMarkdown(md?: string | null, resolveImage?: ImageResolver): string {
  if (!md || !md.trim()) return "";

  const inline = (s: string) => renderInline(escapeHtml(s), resolveImage);

  return toBlocks(md)
    .map((block) => {
      switch (block.type) {
        case "hr":
          return '<hr class="my-7 border-slate-200/70" />';
        case "h2":
          return `<h2 class="font-heading font-extrabold text-slate-800 text-lg mt-7 mb-3">${inline(block.lines[0])}</h2>`;
        case "h3":
          return `<h3 class="font-heading font-bold text-slate-800 text-sm mt-6 mb-2">${inline(block.lines[0])}</h3>`;
        case "quote":
          return `<blockquote class="my-4 pl-4 border-l-3 border-blue-200 bg-blue-50/40 py-2.5 pr-3 rounded-r-xl text-slate-600 italic">${block.lines.map(inline).join("<br />")}</blockquote>`;
        case "ul":
          return `<ul class="my-3 space-y-1.5 list-disc pl-5 marker:text-blue-400">${block.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
        case "ol":
          return `<ol class="my-3 space-y-1.5 list-decimal pl-5 marker:text-blue-400 marker:font-bold">${block.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ol>`;
        default: {
          const body = block.lines.map(inline).join("<br />");
          // Đoạn chỉ chứa một ảnh: bỏ thẻ <p> để ảnh chiếm trọn bề ngang
          if (/^<img\s/.test(body) && block.lines.length === 1) return body;
          return `<p class="my-3 leading-relaxed">${body}</p>`;
        }
      }
    })
    .join("");
}

/** Danh sách đường dẫn ảnh nhúng trong bài — để ký link hàng loạt trước khi render. */
export function extractImagePaths(md?: string | null): string[] {
  if (!md) return [];
  const paths: string[] = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const src = m[1].trim();
    if (src && !/^https?:\/\//i.test(src)) paths.push(src);
  }
  return Array.from(new Set(paths));
}

/** Trích đoạn không định dạng — dùng cho tóm tắt tự động và nội dung email chia sẻ. */
export function plainExcerpt(md?: string | null, maxLen = 180): string {
  if (!md) return "";
  const text = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + "…" : text;
}
