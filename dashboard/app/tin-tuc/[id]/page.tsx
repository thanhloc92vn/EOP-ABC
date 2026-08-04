"use client";

// ============================================================
// /tin-tuc/[id] — Trang đọc một bài tin.
//
// Mọi tệp nằm trong bucket RIÊNG TƯ `news-media`, nên ảnh bìa, ảnh nhúng giữa
// bài và tệp đính kèm đều phải ký link trước khi hiển thị. Ba nhóm đường dẫn đó
// được gom vào MỘT lời gọi createSignedUrls (lib/news.signNewsPaths).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import NewsLikeButton from "@/components/news/NewsLikeButton";
import RelatedNewsSidebar from "@/components/news/RelatedNewsSidebar";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/apiClient";
import {
  categoryMeta,
  fetchPost,
  fetchAttachments,
  fetchMyReactions,
  signNewsPaths,
  signOne,
  incrementView,
  formatPostDate,
  formatEventRange,
  formatFileSize,
  linkHost,
  type NewsAttachment,
  type NewsPost,
} from "@/lib/news";
import { renderNewsMarkdown, extractImagePaths, plainExcerpt } from "@/lib/newsMarkdown";
import {
  ArrowLeft,
  Loader2,
  Eye,
  Share2,
  Link2,
  Mail,
  Check,
  Download,
  FileText,
  ExternalLink,
  MapPin,
  CalendarDays,
  X,
  Send,
  AlertCircle,
  Newspaper,
  Search,
} from "lucide-react";

export default function NewsDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const postId = String(params?.id || "");
  const user = useCurrentUser();

  const [post, setPost] = useState<NewsPost | null>(null);
  const [attachments, setAttachments] = useState<NewsAttachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const viewCounted = useRef(false);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const row = await fetchPost(postId);
      if (!row) {
        setNotFound(true);
        return;
      }
      setPost(row);

      const atts = await fetchAttachments(postId);
      setAttachments(atts);

      // Ảnh bìa + ảnh nhúng trong nội dung + mọi tệp đính kèm — ký một lượt
      setUrls(
        await signNewsPaths([
          row.cover_path,
          ...extractImagePaths(row.content_md),
          ...atts.map((a) => a.path),
        ])
      );

      if (user.email) {
        const set = await fetchMyReactions(user.email, [postId]);
        setLiked(set.has(postId));
      }

      if (!viewCounted.current && row.status === "published") {
        viewCounted.current = true;
        incrementView(postId);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [postId, user.email]);

  useEffect(() => {
    if (!user.loading) load();
  }, [load, user.loading]);

  const html = useMemo(
    () => renderNewsMarkdown(post?.content_md, (p) => urls[p]),
    [post?.content_md, urls]
  );

  const images = attachments.filter((a) => a.kind === "image");
  const files = attachments.filter((a) => a.kind !== "image");

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Sao chép đường dẫn bài viết:", window.location.href);
    }
  };

  const handleDownload = async (att: NewsAttachment) => {
    const url = urls[att.path] || (await signOne(att.path));
    if (url) window.open(url, "_blank", "noopener");
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center p-20 bg-white border border-slate-200/60 rounded-3xl gap-3 shadow-sm">
          <Loader2 className="animate-spin text-[#005BAC]" size={32} />
          <p className="text-xs text-slate-400 font-semibold">Đang mở bài viết...</p>
        </div>
      </Shell>
    );
  }

  if (notFound || !post) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center p-20 bg-white border border-slate-200/60 rounded-3xl text-center space-y-3 shadow-sm">
          <Newspaper className="text-slate-300" size={48} />
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-700">Không tìm thấy bài viết</p>
            <p className="text-xs text-slate-400">
              Bài có thể đã bị gỡ, hoặc vẫn đang ở dạng bản nháp chưa đăng.
            </p>
          </div>
          <button
            onClick={() => router.push("/tin-tuc")}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#005BAC] to-[#00AEEF] rounded-xl shadow-md shadow-blue-500/20 transition-all active:scale-[0.99] cursor-pointer"
          >
            <ArrowLeft size={14} />
            Về bảng tin
          </button>
        </div>
      </Shell>
    );
  }

  const meta = categoryMeta(post.category);
  const Icon = meta.icon;
  const coverUrl = post.cover_path ? urls[post.cover_path] : undefined;

  return (
    <Shell aside={<RelatedNewsSidebar key={post.id} currentId={post.id} />}>
      <Link
        href="/tin-tuc"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#005BAC] transition-colors"
      >
        <ArrowLeft size={14} />
        Về bảng tin
      </Link>

      <article className="bg-white border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={post.title} className="w-full max-h-96 object-cover" />
        )}

        <div className="p-8 space-y-5">
          {/* Nhãn + trạng thái */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold px-2.5 py-1 rounded-full border uppercase tracking-wider ${meta.badge}`}>
              <Icon size={10} />
              {meta.label}
            </span>
            {post.status === "draft" && (
              <span className="text-[9px] font-extrabold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wider">
                Bản nháp — chỉ người đăng bài thấy
              </span>
            )}
          </div>

          <h1 className="font-heading font-extrabold text-slate-800 text-2xl leading-tight">{post.title}</h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-5 border-b border-slate-100 text-[11px] font-semibold text-slate-400">
            <span className="text-slate-600 font-bold">{post.author_name || "Phòng HCNS"}</span>
            {post.department && <span>{post.department}</span>}
            <span>{formatPostDate(post.published_at || post.created_at)}</span>
            <span className="inline-flex items-center gap-1">
              <Eye size={12} />
              {post.view_count} lượt xem
            </span>
          </div>

          {/* Thông tin sự kiện */}
          {post.category === "su_kien" && (post.event_start_at || post.event_location) && (
            <div className="flex flex-wrap items-center gap-3 p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl">
              {post.event_start_at && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                  <CalendarDays size={14} />
                  {formatEventRange(post.event_start_at, post.event_end_at)}
                </span>
              )}
              {post.event_location && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                  <MapPin size={14} />
                  {post.event_location}
                </span>
              )}
            </div>
          )}

          {/* Tóm tắt */}
          {post.summary && (
            <p className="text-sm font-semibold text-slate-600 leading-relaxed border-l-3 border-blue-200 pl-4">
              {post.summary}
            </p>
          )}

          {/* Nội dung */}
          {html ? (
            <div
              className="text-sm text-slate-600 font-medium"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-slate-400 text-xs italic py-4">Bài viết chưa có nội dung chi tiết.</p>
          )}

          {/* Album ảnh */}
          {images.length > 0 && (
            <section className="space-y-3 pt-2">
              <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                Hình ảnh ({images.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {images.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => urls[img.path] && setLightbox(urls[img.path])}
                    className="aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/60 hover:border-blue-300 transition-all active:scale-[0.99] cursor-pointer"
                    title={img.name}
                  >
                    {urls[img.path] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urls[img.path]} alt={img.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="animate-spin text-slate-300" size={18} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Tệp đính kèm */}
          {files.length > 0 && (
            <section className="space-y-3 pt-2">
              <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                Tệp đính kèm ({files.length})
              </h3>
              <div className="space-y-2">
                {files.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleDownload(f)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50/60 border border-slate-200 rounded-2xl hover:bg-white hover:border-blue-300 hover:shadow-sm transition-all active:scale-[0.99] cursor-pointer text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-700 truncate">{f.name}</p>
                      <p className="text-[10px] text-slate-400 font-semibold">
                        {formatFileSize(f.size_bytes)}
                      </p>
                    </div>
                    <Download size={15} className="text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Link ngoài */}
          {post.external_links.length > 0 && (
            <section className="space-y-3 pt-2">
              <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                Đường dẫn liên quan
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {post.external_links.map((l, i) => (
                  <a
                    key={i}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-sm transition-all group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#005BAC] flex items-center justify-center shrink-0">
                      <Link2 size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-700 truncate group-hover:text-[#005BAC] transition-colors">
                        {l.label || linkHost(l.url)}
                      </p>
                      <p className="text-[10px] text-slate-400 font-semibold truncate">{linkHost(l.url)}</p>
                    </div>
                    <ExternalLink size={14} className="text-slate-400 shrink-0" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Thanh tương tác */}
          <div className="flex flex-wrap items-center gap-2.5 pt-5 border-t border-slate-100">
            <NewsLikeButton
              postId={post.id}
              email={user.email}
              liked={liked}
              count={post.like_count}
              size="lg"
              onChange={(l, c) => {
                setLiked(l);
                setPost((prev) => (prev ? { ...prev, like_count: c } : prev));
              }}
            />

            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 bg-slate-50/70 border border-slate-200 rounded-full hover:bg-white hover:border-blue-300 hover:text-[#005BAC] transition-all active:scale-[0.97] cursor-pointer"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Link2 size={14} />}
              {copied ? "Đã sao chép" : "Sao chép đường dẫn"}
            </button>

            <button
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 bg-slate-50/70 border border-slate-200 rounded-full hover:bg-white hover:border-blue-300 hover:text-[#005BAC] transition-all active:scale-[0.97] cursor-pointer"
            >
              <Share2 size={14} />
              Gửi cho đồng nghiệp
            </button>
          </div>
        </div>
      </article>

      {shareOpen && post && (
        <ShareByEmailModal post={post} senderName={user.name} onClose={() => setShareOpen(false)} />
      )}

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6 cursor-zoom-out animate-in fade-in duration-150"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-2xl shadow-2xl" />
          <button
            className="absolute top-6 right-6 p-2 bg-white/90 text-slate-600 rounded-xl shadow-sm cursor-pointer"
            title="Đóng"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </Shell>
  );
}

// Bố cục 2 cột: bài viết bên trái, cột "Tin tức cập nhật mới" bên phải.
// Cột phải dính theo màn hình khi cuộn (xl:sticky) và tự xuống dưới bài viết ở
// màn hình hẹp. Trạng thái đang tải / không tìm thấy bài thì không có cột phải.
function Shell({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#F7F9FC] relative">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Tin tức" subtitle="Thông báo, giới thiệu và sự kiện nội bộ của công ty" />
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full max-w-4xl space-y-5">{children}</div>
            {aside && (
              <aside className="w-full xl:w-80 shrink-0 xl:sticky xl:top-8">{aside}</aside>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Gửi bài cho đồng nghiệp qua email ───
// Chọn người bằng <datalist> để TRÌNH DUYỆT tự lọc: ô lọc bằng React sẽ mất chữ
// khi gõ tiếng Việt có dấu (bộ gõ IME), lỗi đã gặp ở các module trước.
function ShareByEmailModal({
  post,
  senderName,
  onClose,
}: {
  post: NewsPost;
  senderName: string;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<{ name: string; email: string; department: string; role: string }[]>([]);
  const [picked, setPicked] = useState(""); // email người được chọn (khoá duy nhất)
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài thì đóng danh sách — giống ô chọn người nhận việc ở trang Công việc
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    supabase
      .from("employees_directory")
      .select("name, email, department, role, status")
      .order("name")
      .then(({ data }) => {
        setPeople(
          (data || [])
            // Bỏ người chưa có email (không gửi tới đâu được) và người đã nghỉ việc
            .filter((e) => e.email && !String(e.status || "").toLowerCase().includes("nghỉ"))
            .map((e) => ({
              name: e.name as string,
              email: e.email as string,
              department: (e.department as string) || "Chưa xếp phòng",
              role: (e.role as string) || "",
            }))
        );
      });
  }, []);

  // `picked` giữ EMAIL vì email là khoá duy nhất — hai nhân viên có thể trùng tên.
  const selected = people.find((p) => p.email === picked) || null;

  // Lọc theo tên hoặc phòng ban, cắt 30 dòng — cùng cách làm với ô giao việc
  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.department.toLowerCase().includes(q))
      .slice(0, 30);
  }, [people, search]);

  const handleSend = async () => {
    const target = selected;
    if (!target) {
      setError("Vui lòng chọn người nhận trong danh sách.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await apiFetch("/api/share-news-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpConfig: readSmtpConfig(),
          recipientName: target.name,
          recipientEmails: target.email,
          senderName,
          note: note.trim(),
          post: {
            id: post.id,
            title: post.title,
            category: post.category,
            excerpt: post.summary || plainExcerpt(post.content_md, 220),
          },
          siteUrl: window.location.origin,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không gửi được email.");

      setDone(true);
      setTimeout(onClose, 1400);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không gửi được email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Mail size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-heading font-extrabold text-slate-800 text-sm">Gửi bài cho đồng nghiệp</h3>
            <p className="text-[10px] text-slate-400 font-semibold truncate">{post.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-2.5 py-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <Check size={22} className="text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-slate-700">Đã gửi email</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <p className="text-xs font-semibold">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                  Người nhận
                </label>
                {/* Ô chọn người nhận — dựng theo đúng ô "Người nhận việc" ở trang
                    Quản lý công việc: gõ để lọc, danh sách hiện avatar chữ viết
                    tắt + tên + phòng ban/chức danh, chọn xong thành thẻ có nút X.
                    Nguồn dữ liệu là Danh sách nhân viên (employees_directory) nên
                    tên và email đã cấu hình sẵn, không phải nhập tay. */}
                <div className="relative" ref={pickerRef}>
                  <div className="w-full min-h-[42px] px-3 py-2 border border-slate-200 rounded-xl flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/40 bg-white">
                    {selected ? (
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1 text-[10px] font-bold">
                        {selected.name}
                        <button
                          type="button"
                          onClick={() => {
                            setPicked("");
                            setSearch("");
                            setShowDropdown(true);
                          }}
                          className="hover:text-rose-500 transition-colors cursor-pointer"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                        <Search size={12} className="text-slate-400 shrink-0" />
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setShowDropdown(true);
                          }}
                          onFocus={() => setShowDropdown(true)}
                          placeholder="Tìm tên nhân viên hoặc bấm để chọn nhanh..."
                          className="flex-1 min-w-0 py-1 outline-none text-xs font-semibold placeholder:font-normal"
                        />
                      </div>
                    )}
                  </div>

                  {showDropdown && !selected && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-premium z-20 max-h-56 overflow-y-auto animate-in fade-in duration-150">
                      {filteredPeople.length === 0 ? (
                        <p className="text-center text-slate-400 text-[11px] italic py-4">
                          {people.length === 0 ? "Đang tải danh bạ nhân sự..." : "Không tìm thấy nhân viên phù hợp."}
                        </p>
                      ) : (
                        filteredPeople.map((p) => (
                          <button
                            key={p.email}
                            type="button"
                            onClick={() => {
                              setPicked(p.email);
                              setSearch("");
                              setShowDropdown(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                          >
                            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                              {p.name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-bold text-slate-700 truncate">{p.name}</span>
                              <span className="block text-[10px] text-slate-400 font-semibold truncate">
                                {p.department}
                                {p.role ? ` • ${p.role}` : ""}
                              </span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Email đã cấu hình sẵn của người vừa chọn — để đối chiếu trước khi gửi */}
                {selected && (
                  <p className="mt-1.5 text-[10px] font-semibold text-slate-400 truncate" title={selected.email}>
                    Gửi tới: <span className="text-[#005BAC]">{selected.email}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                  Lời nhắn (không bắt buộc)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="VD: Anh/Chị xem giúp em thông báo này nhé."
                  className="w-full px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-medium resize-none"
                />
              </div>

              <button
                onClick={handleSend}
                disabled={sending}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#005BAC] to-[#00AEEF] rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg transition-all active:scale-[0.99] cursor-pointer disabled:opacity-60"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Gửi email
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Cấu hình SMTP người dùng tự đặt (Cài đặt hệ thống) — server ưu tiên biến môi trường. */
function readSmtpConfig() {
  if (typeof window === "undefined") return null;
  return {
    user: localStorage.getItem("tnec_cb_smtp_user") || "",
    pass: localStorage.getItem("tnec_cb_smtp_pass") || "",
    host: localStorage.getItem("tnec_cb_smtp_host") || "smtp.gmail.com",
    port: Number(localStorage.getItem("tnec_cb_smtp_port")) || 465,
    secure: localStorage.getItem("tnec_cb_smtp_secure") !== "false",
  };
}
