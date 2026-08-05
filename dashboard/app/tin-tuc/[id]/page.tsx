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
  // Lời nhắn nằm ở đây (không nằm trong modal) để khi gửi lỗi, mở lại là chữ
  // người dùng gõ vẫn còn nguyên.
  const [shareNote, setShareNote] = useState("");
  const [toast, setToast] = useState<{ state: "sending" | "ok" | "error"; text: string } | null>(null);
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

  /**
   * Gửi bài cho đồng nghiệp.
   *
   * Đóng hộp thoại NGAY rồi mới gửi, thay vì bắt người dùng ngồi nhìn vòng
   * xoay: một lượt gửi mất 2-5 giây vì phải đợi trọn cuộc bắt tay SMTP với
   * máy chủ thư, không rút ngắn được. Kết quả báo bằng thông báo nổi ở góc.
   * Gửi lỗi thì mở lại hộp thoại, lời nhắn vẫn còn nguyên.
   */
  const handleShareSend = async (targets: { name: string; email: string }[]) => {
    if (!post || targets.length === 0) return;
    setShareOpen(false);
    setToast({
      state: "sending",
      text:
        targets.length === 1
          ? `Đang gửi tới ${targets[0].name}...`
          : `Đang gửi tới ${targets.length} người...`,
    });

    try {
      const res = await apiFetch("/api/share-news-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpConfig: readSmtpConfig(),
          recipients: targets.map((t) => ({ name: t.name, emails: t.email })),
          senderName: user.name,
          note: shareNote.trim(),
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

      setShareNote("");
      // Dùng câu trả về của máy chủ vì nó ghi kèm ĐỊA CHỈ THẬT đã gửi tới.
      // Hồ sơ nhân sự hay có nhiều email (công ty + cá nhân), nhìn thấy địa chỉ
      // cụ thể thì người gửi biết ngay thư đi đâu, khỏi phải đoán khi người
      // nhận báo "chưa thấy thư".
      setToast({
        state: "ok",
        text: json.message || `Đã gửi bài tới ${targets.length} người`,
      });
      setTimeout(() => setToast(null), 6000);
    } catch (err: unknown) {
      setToast({
        state: "error",
        text: err instanceof Error ? err.message : "Không gửi được email.",
      });
      setShareOpen(true); // mở lại để người dùng sửa và thử lại
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
        <ShareByEmailModal
          post={post}
          note={shareNote}
          onNoteChange={setShareNote}
          onSend={handleShareSend}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* Thông báo nổi — thay cho việc ngồi đợi trong hộp thoại */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-start gap-2.5 max-w-sm px-4 py-3 rounded-2xl shadow-premium border animate-in fade-in slide-in-from-bottom-2 duration-200 ${
            toast.state === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : toast.state === "error"
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : "bg-white border-slate-200 text-slate-600"
          }`}
        >
          {toast.state === "sending" && <Loader2 size={15} className="animate-spin text-[#005BAC] mt-0.5 shrink-0" />}
          {toast.state === "ok" && <Check size={15} className="text-emerald-500 mt-0.5 shrink-0" />}
          {toast.state === "error" && <AlertCircle size={15} className="text-rose-500 mt-0.5 shrink-0" />}
          <p className="text-xs font-bold leading-relaxed">{toast.text}</p>
          {toast.state !== "sending" && (
            <button
              onClick={() => setToast(null)}
              className="p-0.5 opacity-50 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
              title="Đóng"
            >
              <X size={13} />
            </button>
          )}
        </div>
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
// Ô chọn người bê nguyên ô "Nhân viên tham dự" ở trang Đăng ký phòng họp
// (dang-ky/page.tsx): chọn nhiều người, nguồn là Danh sách nhân viên, lọc theo
// tên hoặc phòng ban, cắt 30 dòng. Kể cả khoá React của mỗi dòng cũng lấy đúng
// `name + email` như bên đó — khoá chỉ bằng email thì những hồ sơ để email
// "N/A" đụng khoá nhau, React dựng lại nhầm dòng và hiện ra tên lặp.
type DirectoryPerson = { name: string; email: string; department: string; role: string };

/** Khoá React của một dòng — giống hệt bên Đăng ký phòng họp. */
const personKey = (p: DirectoryPerson) => p.name + p.email;

/**
 * Người này có gửi thư tới được không?
 *
 * Cột `employees.email` KHÔNG phải lúc nào cũng là email: hồ sơ chưa có thư
 * điện tử đang để chuỗi "N/A". Phép kiểm cũ chỉ hỏi "cột có rỗng không" nên
 * "N/A" lọt qua, người đó vẫn hiện trong ô chọn dù không gửi tới đâu được.
 * Cột chứa được nhiều địa chỉ ngăn bằng dấu phẩy — chỉ cần MỘT địa chỉ thật.
 */
function hasSendableEmail(raw: unknown): boolean {
  return String(raw || "")
    .split(/[,;\s]+/)
    .some((addr) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr.trim()));
}

function ShareByEmailModal({
  post,
  note,
  onNoteChange,
  onSend,
  onClose,
}: {
  post: NewsPost;
  note: string;
  onNoteChange: (v: string) => void;
  onSend: (targets: { name: string; email: string }[]) => void;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [selected, setSelected] = useState<DirectoryPerson[]>([]);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
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
            // Bỏ người đã nghỉ việc và người chưa có email gửi tới được
            .filter((e) => e.name && hasSendableEmail(e.email) && !String(e.status || "").toLowerCase().includes("nghỉ"))
            .map((e) => ({
              name: e.name as string,
              email: e.email as string,
              department: (e.department as string) || "Chưa xếp phòng",
              role: (e.role as string) || "",
            }))
        );
      });
  }, []);

  // Lọc theo tên hoặc phòng ban, bỏ người đã chọn, cắt 30 dòng — y hệt
  // filteredEmployees của ô "Nhân viên tham dự" bên Đăng ký phòng họp.
  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    const chosen = new Set(selected.map(personKey));
    return people
      .filter((p) => !chosen.has(personKey(p)))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.department.toLowerCase().includes(q))
      .slice(0, 30);
  }, [people, search, selected]);

  // Modal chi chon nguoi va bam gui — viec goi API do trang cha lam, de dong
  // duoc hop thoai ngay thay vi bat nguoi dung doi 2-5 giay bat tay SMTP.
  const handleSend = () => {
    if (selected.length === 0) {
      setError("Vui long chon it nhat mot nguoi nhan trong danh sach.");
      return;
    }
    onSend(selected.map((p) => ({ name: p.name, email: p.email })));
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
                {/* Nguồn dữ liệu là Danh sách nhân viên (employees_directory) nên
                    tên và email đã cấu hình sẵn, không phải nhập tay. */}
                <div className="relative" ref={pickerRef}>
                  <div className="w-full min-h-[42px] px-3 py-2 border border-slate-200 rounded-xl flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/40 bg-white">
                    {selected.map((p) => (
                      <span
                        key={personKey(p)}
                        className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1 text-[10px] font-bold"
                      >
                        {p.name}
                        <button
                          type="button"
                          onClick={() => setSelected((prev) => prev.filter((x) => personKey(x) !== personKey(p)))}
                          className="hover:text-rose-500 transition-colors cursor-pointer"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {/* Ô tìm luôn hiện, kể cả khi đã chọn — để thêm tiếp người nữa */}
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
                        placeholder={
                          selected.length === 0 ? "Tìm tên nhân viên hoặc bấm để chọn nhanh..." : "Thêm người..."
                        }
                        className="flex-1 min-w-0 py-1 outline-none text-xs font-semibold placeholder:font-normal"
                      />
                    </div>
                  </div>

                  {showDropdown && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-premium z-20 max-h-56 overflow-y-auto animate-in fade-in duration-150">
                      {filteredPeople.length === 0 ? (
                        <p className="text-center text-slate-400 text-[11px] italic py-4">
                          {people.length === 0 ? "Đang tải danh bạ nhân sự..." : "Không tìm thấy nhân viên phù hợp."}
                        </p>
                      ) : (
                        filteredPeople.map((p) => (
                          <button
                            key={personKey(p)}
                            type="button"
                            onClick={() => {
                              // Không đóng danh sách: chọn xong còn chọn tiếp người khác
                              setSelected((prev) => [...prev, p]);
                              setSearch("");
                              setError(null);
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

                {/* Email đã cấu hình sẵn của từng người đã chọn — để đối chiếu trước khi gửi.
                    Mỗi người nhận MỘT THƯ RIÊNG, không ai thấy địa chỉ của ai. */}
                {selected.length > 0 && (
                  <div className="mt-1.5 space-y-0.5 max-h-24 overflow-y-auto">
                    {selected.map((p) => (
                      <p key={personKey(p)} className="text-[10px] font-semibold text-slate-400 truncate" title={p.email}>
                        Gửi tới {p.name}: <span className="text-[#005BAC]">{p.email}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
                  Lời nhắn (không bắt buộc)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => onNoteChange(e.target.value)}
                  rows={3}
                  placeholder="VD: Anh/Chị xem giúp em thông báo này nhé."
                  className="w-full px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all font-medium resize-none"
                />
              </div>

              <button
                onClick={handleSend}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#005BAC] to-[#00AEEF] rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg transition-all active:scale-[0.99] cursor-pointer"
              >
                <Send size={14} />
                {selected.length > 1 ? `Gửi email cho ${selected.length} người` : "Gửi email"}
              </button>
          </>
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
