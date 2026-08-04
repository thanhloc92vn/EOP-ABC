"use client";

// ============================================================
// NewsEditorModal — màn hình soạn / sửa bài Tin tức.
//
// Tệp được tải lên bucket NGAY khi chọn (không đợi bấm Lưu) để người dùng thấy
// ảnh thật và thanh tiến trình. Đổi lại có thể sinh tệp mồ côi nếu họ đóng modal
// giữa chừng — chấp nhận được, và nút gỡ đính kèm vẫn xoá tệp khỏi bucket.
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  X,
  Loader2,
  ImagePlus,
  Paperclip,
  Trash2,
  Plus,
  Link2,
  Pin,
  Send,
  Save,
  AlertCircle,
  FileText,
  CalendarDays,
  MapPin,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  NEWS_CATEGORIES,
  type NewsCategory,
  type NewsPost,
  type NewsAttachment,
  type NewsExternalLink,
  fetchAttachments,
  uploadNewsFile,
  removeNewsFiles,
  signNewsPaths,
  formatFileSize,
  errMessage,
} from "@/lib/news";
import { plainExcerpt } from "@/lib/newsMarkdown";
import NewsEditor from "./NewsEditor";

type DraftAttachment = {
  /** id trong CSDL — chỉ có với tệp của bài đã lưu trước đó */
  id?: string;
  path: string;
  name: string;
  mime: string | null;
  size_bytes: number | null;
  kind: "image" | "file";
};

type Props = {
  open: boolean;
  post: NewsPost | null; // null = soạn bài mới
  author: { name: string; email: string; department: string };
  onClose: () => void;
  onSaved: () => void;
};

// Ô nhập chuẩn của hệ thống — gom lại để 8 ô dùng chung một dáng
const inputCls =
  "w-full px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-medium";
const labelCls = "block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5";

export default function NewsEditorModal({ open, post, author, onClose, onSaved }: Props) {
  const [category, setCategory] = useState<NewsCategory>("thong_bao");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);

  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);

  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);

  const [links, setLinks] = useState<NewsExternalLink[]>([]);
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventLocation, setEventLocation] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const coverRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Nạp dữ liệu khi mở ───
  useEffect(() => {
    if (!open) return;
    setError(null);
    setRemovedIds([]);

    if (!post) {
      setCategory("thong_bao");
      setTitle("");
      setSummary("");
      setContent("");
      setPinned(false);
      setCoverPath(null);
      setCoverUrl(null);
      setAttachments([]);
      setLinks([]);
      setEventStart("");
      setEventEnd("");
      setEventLocation("");
      return;
    }

    setCategory(post.category);
    setTitle(post.title);
    setSummary(post.summary || "");
    setContent(post.content_md || "");
    setPinned(post.pinned);
    setCoverPath(post.cover_path);
    setLinks(post.external_links);
    setEventStart(toLocalInput(post.event_start_at));
    setEventEnd(toLocalInput(post.event_end_at));
    setEventLocation(post.event_location || "");

    fetchAttachments(post.id)
      .then((rows: NewsAttachment[]) =>
        setAttachments(
          rows.map((r) => ({
            id: r.id,
            path: r.path,
            name: r.name,
            mime: r.mime,
            size_bytes: r.size_bytes,
            kind: r.kind,
          }))
        )
      )
      .catch(() => setAttachments([]));

    if (post.cover_path) {
      signNewsPaths([post.cover_path]).then((map) => setCoverUrl(map[post.cover_path!] || null));
    } else {
      setCoverUrl(null);
    }
  }, [open, post]);

  // Đóng bằng phím ESC — giống các modal khác trong hệ thống
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  // ─── Ảnh bìa ───
  const handleCover = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Ảnh bìa phải là tệp hình ảnh (JPG, PNG, WEBP).");
      return;
    }
    setCoverBusy(true);
    setError(null);
    try {
      const old = coverPath;
      const uploaded = await uploadNewsFile(file, "covers");
      const map = await signNewsPaths([uploaded.path]);
      setCoverPath(uploaded.path);
      setCoverUrl(map[uploaded.path] || null);
      if (old) await removeNewsFiles([old]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không tải được ảnh bìa.");
    } finally {
      setCoverBusy(false);
    }
  };

  // ─── Tệp đính kèm ───
  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setError(null);
    setUploadingCount((n) => n + list.length);

    for (const file of list) {
      try {
        const uploaded = await uploadNewsFile(file, "attachments");
        setAttachments((prev) => [
          ...prev,
          {
            path: uploaded.path,
            name: uploaded.name,
            mime: uploaded.mime,
            size_bytes: uploaded.size,
            kind: uploaded.kind,
          },
        ]);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : `Không tải được "${file.name}".`);
      } finally {
        setUploadingCount((n) => Math.max(0, n - 1));
      }
    }
  };

  const removeAttachment = async (index: number) => {
    const item = attachments[index];
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    if (item.id) setRemovedIds((prev) => [...prev, item.id!]);
    await removeNewsFiles([item.path]);
  };

  // ─── Lưu ───
  const handleSave = async (publish: boolean) => {
    if (!title.trim()) {
      setError("Vui lòng nhập tiêu đề bài viết.");
      return;
    }
    if (uploadingCount > 0 || coverBusy) {
      setError("Đang tải tệp lên, vui lòng đợi trong giây lát.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        category,
        title: title.trim(),
        summary: summary.trim() || plainExcerpt(content, 180),
        content_md: content,
        cover_path: coverPath,
        status: publish ? "published" : "draft",
        pinned,
        event_start_at: category === "su_kien" && eventStart ? new Date(eventStart).toISOString() : null,
        event_end_at: category === "su_kien" && eventEnd ? new Date(eventEnd).toISOString() : null,
        event_location: category === "su_kien" ? eventLocation.trim() || null : null,
        external_links: links.filter((l) => l.url.trim()),
        author_email: post?.author_email || author.email,
        author_name: post?.author_name || author.name,
        department: post?.department || author.department,
        // Giữ nguyên ngày đăng cũ khi sửa lại bài đã đăng
        published_at: publish ? post?.published_at || new Date().toISOString() : null,
      };

      let postId = post?.id;

      if (post) {
        const { error: upErr } = await supabase.from("news_posts").update(payload).eq("id", post.id);
        if (upErr) throw upErr;
      } else {
        const { data, error: insErr } = await supabase
          .from("news_posts")
          .insert(payload)
          .select("id")
          .single();
        if (insErr) throw insErr;
        postId = data.id as string;
      }

      if (!postId) throw new Error("Không lấy được mã bài viết sau khi lưu.");

      if (removedIds.length > 0) {
        await supabase.from("news_attachments").delete().in("id", removedIds);
      }

      const fresh = attachments.filter((a) => !a.id);
      if (fresh.length > 0) {
        const { error: attErr } = await supabase.from("news_attachments").insert(
          fresh.map((a, i) => ({
            post_id: postId,
            path: a.path,
            name: a.name,
            mime: a.mime,
            size_bytes: a.size_bytes,
            kind: a.kind,
            sort_order: attachments.length - fresh.length + i,
          }))
        );
        if (attErr) throw attErr;
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(explainSaveError(err));
    } finally {
      setSaving(false);
    }
  };

  const meta = NEWS_CATEGORIES.find((c) => c.key === category) || NEWS_CATEGORIES[0];
  const busy = saving || uploadingCount > 0 || coverBusy;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-5xl my-6 bg-white rounded-2xl shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">
        {/* Đầu modal */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shadow-md shadow-blue-500/20`}>
            <meta.icon size={17} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading font-extrabold text-slate-800 text-sm">
              {post ? "Chỉnh sửa bài viết" : "Đăng tin nội bộ"}
            </h2>
            <p className="text-[10px] text-slate-400 font-semibold">{meta.desc}</p>
          </div>
          <button
            onClick={() => !saving && onClose()}
            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
            title="Đóng (ESC)"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <p className="text-xs font-semibold leading-relaxed">{error}</p>
            </div>
          )}

          {/* Danh mục */}
          <div>
            <label className={labelCls}>Danh mục</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {NEWS_CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = c.key === category;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-left transition-all duration-200 active:scale-[0.99] cursor-pointer ${
                      active
                        ? "bg-blue-50 border-blue-300 ring-1 ring-blue-500/30"
                        : "bg-slate-50/60 border-slate-200 hover:bg-white hover:border-slate-300"
                    }`}
                  >
                    <Icon size={15} className={active ? "text-[#005BAC]" : "text-slate-400"} />
                    <span className={`text-xs font-bold ${active ? "text-[#005BAC]" : "text-slate-600"}`}>
                      {c.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tiêu đề + tóm tắt */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Tiêu đề *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Thông báo lịch nghỉ lễ Quốc khánh 02/09"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Tóm tắt ngắn</label>
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Để trống sẽ tự lấy vài dòng đầu của bài viết"
                className={inputCls}
              />
            </div>
          </div>

          {/* Ảnh bìa */}
          <div>
            <label className={labelCls}>Ảnh bìa</label>
            <div
              onClick={() => !coverBusy && coverRef.current?.click()}
              className="relative h-44 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer overflow-hidden flex items-center justify-center"
            >
              {coverBusy ? (
                <Loader2 className="animate-spin text-[#005BAC]" size={22} />
              ) : coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="Ảnh bìa" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center space-y-1.5">
                  <ImagePlus className="text-slate-300 mx-auto" size={26} />
                  <p className="text-xs font-bold text-slate-500">Chọn ảnh bìa</p>
                  <p className="text-[10px] text-slate-400 font-semibold">JPG, PNG, WEBP — tối đa 10MB</p>
                </div>
              )}
              {coverUrl && !coverBusy && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const old = coverPath;
                    setCoverPath(null);
                    setCoverUrl(null);
                    await removeNewsFiles([old]);
                  }}
                  className="absolute top-2.5 right-2.5 p-1.5 bg-white/90 text-slate-500 hover:text-rose-600 rounded-lg shadow-sm transition-all cursor-pointer"
                  title="Gỡ ảnh bìa"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                handleCover(e.target.files?.[0]);
                e.target.value = "";
              }}
              className="hidden"
            />
          </div>

          {/* Nội dung */}
          <div>
            <label className={labelCls}>Nội dung bài viết</label>
            <NewsEditor value={content} onChange={setContent} onError={setError} />
          </div>

          {/* Trường riêng cho Sự kiện */}
          {category === "su_kien" && (
            <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-emerald-700 uppercase tracking-widest">
                <CalendarDays size={12} />
                Thông tin sự kiện
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <DateTime24Field label="Bắt đầu" value={eventStart} onChange={setEventStart} />
                <DateTime24Field label="Kết thúc" value={eventEnd} onChange={setEventEnd} />
                <div>
                  <label className={labelCls}>Địa điểm</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      placeholder="Hội trường tầng 3"
                      className={`${inputCls} pl-9`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tệp đính kèm */}
          <div>
            <label className={labelCls}>Tệp đính kèm (PDF thông báo, ảnh sự kiện)</label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
              className={`p-5 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center ${
                dragging ? "border-blue-400 bg-blue-50/50" : "border-slate-200 bg-slate-50/60 hover:border-blue-300"
              }`}
            >
              <Paperclip className="text-slate-300 mx-auto mb-1.5" size={22} />
              <p className="text-xs font-bold text-slate-500">Kéo thả tệp vào đây hoặc bấm để chọn</p>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                PDF, JPG, PNG, WEBP, GIF — tối đa 10MB mỗi tệp, chọn được nhiều tệp
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
            />

            {(attachments.length > 0 || uploadingCount > 0) && (
              <div className="mt-3 space-y-2">
                {attachments.map((a, i) => (
                  <div
                    key={a.path}
                    className="flex items-center gap-3 px-3.5 py-2.5 bg-white border border-slate-200/60 rounded-xl shadow-sm"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      a.kind === "image" ? "bg-indigo-50 text-indigo-500" : "bg-rose-50 text-rose-500"
                    }`}>
                      {a.kind === "image" ? <ImagePlus size={14} /> : <FileText size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-700 truncate">{a.name}</p>
                      <p className="text-[10px] text-slate-400 font-semibold">{formatFileSize(a.size_bytes)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                      title="Gỡ tệp này"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {uploadingCount > 0 && (
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-blue-50/50 border border-blue-100 rounded-xl">
                    <Loader2 className="animate-spin text-[#005BAC]" size={14} />
                    <p className="text-xs font-semibold text-slate-500">
                      Đang tải lên {uploadingCount} tệp...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Link ngoài */}
          <div>
            <label className={labelCls}>Đường dẫn liên quan (báo chí, website)</label>
            <div className="space-y-2">
              {links.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={link.label}
                    onChange={(e) =>
                      setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, label: e.target.value } : l)))
                    }
                    placeholder="Tên hiển thị (VD: Báo Tuổi Trẻ)"
                    className={`${inputCls} sm:w-64`}
                  />
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                      value={link.url}
                      onChange={(e) =>
                        setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, url: e.target.value } : l)))
                      }
                      placeholder="https://..."
                      className={`${inputCls} pl-9`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer shrink-0"
                    title="Xoá dòng"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLinks((prev) => [...prev, { label: "", url: "" }])}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-bold text-[#005BAC] bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-all active:scale-[0.98] cursor-pointer"
              >
                <Plus size={13} />
                Thêm đường dẫn
              </button>
            </div>
          </div>

          {/* Ghim */}
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#005BAC] focus:ring-blue-500/30 cursor-pointer"
            />
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
              <Pin size={13} className="text-amber-500" />
              Ghim bài này lên đầu trang Tin tức
            </span>
          </label>
        </div>

        {/* Chân modal */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl sticky bottom-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer disabled:opacity-60"
          >
            Huỷ
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-[0.99] cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Lưu nháp
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#005BAC] to-[#00AEEF] rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg transition-all active:scale-[0.99] cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {post?.status === "published" ? "Cập nhật bài" : "Đăng ngay"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Ô chọn ngày + giờ LUÔN Ở DẠNG 24 GIỜ.
 *
 * Không dùng <input type="datetime-local"> cho phần giờ được: định dạng của nó
 * do LOCALE TRÌNH DUYỆT quyết định, không có thuộc tính nào ép được. Máy đặt
 * tiếng Việt sẽ hiện "10:25 CH" thay vì "22:25", và mẹo gắn lang="en-GB" thì
 * tuỳ phiên bản Chrome, không chắc chắn.
 *
 * Nên: giữ <input type="date"> cho phần ngày (vẫn có lịch bấm chọn, không dính
 * chuyện SA/CH) và tách giờ/phút ra hai ô chọn 00-23 / 00-59.
 *
 * Giá trị vào-ra vẫn đúng chuỗi "YYYY-MM-DDTHH:mm" như <input datetime-local>
 * trả về, nên chỗ lưu ở handleSave không phải đổi gì.
 */
function DateTime24Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [datePart = "", timePart = ""] = (value || "").split("T");
  const [hour = "", minute = ""] = timePart.split(":");

  const emit = (d: string, h: string, m: string) => {
    // Chưa chọn ngày thì coi như để trống cả trường (handleSave sẽ lưu null)
    if (!d) return onChange("");
    onChange(`${d}T${(h || "08").padStart(2, "0")}:${(m || "00").padStart(2, "0")}`);
  };

  const selectCls =
    "px-2.5 py-2.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-medium cursor-pointer";

  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="space-y-2">
        <input
          type="date"
          value={datePart}
          onChange={(e) => emit(e.target.value, hour, minute)}
          className={inputCls}
        />
        <div className="flex items-center gap-1.5">
          <select
            value={hour}
            onChange={(e) => emit(datePart, e.target.value, minute)}
            disabled={!datePart}
            className={`${selectCls} flex-1 disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Giờ (0 - 23)"
          >
            {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")).map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <span className="text-sm font-bold text-slate-400">:</span>
          <select
            value={minute}
            onChange={(e) => emit(datePart, hour, e.target.value)}
            disabled={!datePart}
            className={`${selectCls} flex-1 disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Phút"
          >
            {Array.from({ length: 60 }, (_, m) => String(m).padStart(2, "0")).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span className="text-[10px] font-bold text-slate-400 pl-1 shrink-0">24h</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Dịch lỗi kỹ thuật của Supabase thành câu người dùng xử lý được.
 *
 * Ba lỗi hay gặp nhất đều do THIẾU BƯỚC CÀI ĐẶT chứ không phải lỗi thao tác,
 * nên phải nói thẳng ra việc cần làm — nếu không người dùng chỉ thấy một câu
 * tiếng Anh và không biết đi tiếp thế nào.
 */
function explainSaveError(err: unknown): string {
  const msg = errMessage(err);
  const low = msg.toLowerCase();

  if (low.includes("does not exist") || low.includes("could not find") || low.includes("schema cache")) {
    return `Chưa có bảng dữ liệu của module Tin tức. Cần chạy tệp migrations/023_news_module.sql trong Supabase > SQL Editor. (Chi tiết: ${msg})`;
  }
  if (low.includes("row-level security") || low.includes("violates") || low.includes("policy")) {
    return "Tài khoản của bạn chưa được cấp quyền đăng tin. Vào Cài đặt hệ thống > User Permissions và tick \"Tin tức — Đăng bài\".";
  }
  if (low.includes("bucket not found")) {
    return "Chưa có kho tệp `news-media`. Chạy phần 8 của migrations/023_news_module.sql, hoặc tạo bucket thủ công trong Supabase > Storage.";
  }
  return `Không lưu được bài viết: ${msg}`;
}

/** ISO -> giá trị cho <input type="datetime-local"> (giờ địa phương, không có Z). */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
