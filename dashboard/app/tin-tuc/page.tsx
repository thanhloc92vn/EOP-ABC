"use client";

// ============================================================
// /tin-tuc — Bảng tin nội bộ.
//
// Ba danh mục có ba cách trình bày khác nhau, cố ý:
//   Thông báo  — dòng gọn, nhấn mạnh tệp PDF đính kèm (thứ người đọc cần bấm).
//   Giới thiệu — card lớn ảnh bìa 16:9, kiểu bài viết dài.
//   Sự kiện    — card có ngày/địa điểm + đếm ngược.
//
// XEM: mọi tài khoản đăng nhập. ĐĂNG: Admin hoặc cờ can_manage_news (RLS 023).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import NewsEditorModal from "@/components/news/NewsEditorModal";
import NewsLikeButton from "@/components/news/NewsLikeButton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { supabase } from "@/lib/supabase";
import {
  NEWS_CATEGORIES,
  categoryMeta,
  fetchPosts,
  fetchMyReactions,
  signNewsPaths,
  removeNewsFiles,
  formatPostDate,
  formatEventRange,
  eventCountdown,
  isFresh,
  errMessage,
  type NewsCategory,
  type NewsPost,
} from "@/lib/news";
import { plainExcerpt } from "@/lib/newsMarkdown";
import {
  Search,
  Loader2,
  Plus,
  Pin,
  Eye,
  Newspaper,
  Pencil,
  Trash2,
  MapPin,
  Paperclip,
  FileText,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

type TabKey = NewsCategory | "all";

export default function NewsPage() {
  const user = useCurrentUser();
  const canManage = user.isAdmin || user.perms.canManageNews;

  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [attachCounts, setAttachCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<NewsPost | null>(null);

  const load = useCallback(async () => {
    if (user.loading) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPosts({ includeDrafts: canManage });
      setPosts(rows);

      // Ký link ảnh bìa cả mẻ trong MỘT lời gọi (xem lib/news.signNewsPaths)
      const map = await signNewsPaths(rows.map((r) => r.cover_path));
      setCovers(map);

      if (user.email) setLiked(await fetchMyReactions(user.email, rows.map((r) => r.id)));

      // Đếm số tệp đính kèm để hiện huy hiệu trên card Thông báo
      if (rows.length > 0) {
        const { data } = await supabase
          .from("news_attachments")
          .select("post_id")
          .in("post_id", rows.map((r) => r.id));
        const counts: Record<string, number> = {};
        (data || []).forEach((r) => {
          const id = r.post_id as string;
          counts[id] = (counts[id] || 0) + 1;
        });
        setAttachCounts(counts);
      }
    } catch (err: unknown) {
      setError(errMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user.loading, user.email, canManage]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (post: NewsPost) => {
    if (!confirm(`Xoá bài "${post.title}"?\n\nToàn bộ tệp đính kèm và lượt thích của bài sẽ mất theo, không khôi phục được.`)) return;
    try {
      const { data: atts } = await supabase.from("news_attachments").select("path").eq("post_id", post.id);
      const { error: delErr } = await supabase.from("news_posts").delete().eq("id", post.id);
      if (delErr) throw delErr;
      await removeNewsFiles([...(atts || []).map((a) => a.path as string), post.cover_path]);
      load();
    } catch (err: unknown) {
      setError(`Không xoá được bài viết: ${errMessage(err)}`);
    }
  };

  const applyLike = (postId: string, isLiked: boolean, count: number) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (isLiked) next.add(postId);
      else next.delete(postId);
      return next;
    });
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, like_count: count } : p)));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      if (tab !== "all" && p.category !== tab) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.summary || "").toLowerCase().includes(q) ||
        (p.author_name || "").toLowerCase().includes(q)
      );
    });
  }, [posts, tab, search]);

  // Bài ghim hiện thành banner lớn, không lặp lại trong lưới bên dưới
  const banner = filtered.find((p) => p.pinned && p.status === "published") || null;
  const rest = banner ? filtered.filter((p) => p.id !== banner.id) : filtered;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "Tất cả" },
    ...NEWS_CATEGORIES.map((c) => ({ key: c.key as TabKey, label: c.label })),
  ];

  return (
    <div className="flex min-h-screen bg-[#F7F9FC] relative">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Tin tức" subtitle="Thông báo, giới thiệu và sự kiện nội bộ của công ty" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Thanh lọc */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-slate-200/60 rounded-2xl shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tiêu đề, người đăng..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all"
                />
              </div>

              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-3.5 py-1.5 text-[11px] font-bold rounded-lg transition-all duration-200 active:scale-[0.97] cursor-pointer ${
                      tab === t.key ? "bg-white text-[#005BAC] shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={load}
                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                title="Tải lại"
              >
                <RefreshCw size={15} />
              </button>
              {canManage && (
                <button
                  onClick={() => {
                    setEditing(null);
                    setEditorOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#005BAC] to-[#00AEEF] rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg transition-all active:scale-[0.99] cursor-pointer"
                >
                  <Plus size={14} />
                  Đăng tin
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 bg-rose-50 border border-rose-100 rounded-2xl text-xs font-semibold text-rose-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 bg-white border border-slate-200/60 rounded-3xl gap-3 shadow-sm">
              <Loader2 className="animate-spin text-[#005BAC]" size={32} />
              <p className="text-xs text-slate-400 font-semibold">Đang tải bảng tin...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-20 bg-white border border-slate-200/60 rounded-3xl text-center space-y-3 shadow-sm">
              <Newspaper className="text-slate-300" size={48} />
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-700">Chưa có tin nào</p>
                <p className="text-xs text-slate-400">
                  {canManage
                    ? "Bấm \"Đăng tin\" ở góc phải để đăng bài đầu tiên."
                    : "Bảng tin sẽ hiển thị ngay khi phòng Hành chính Nhân sự đăng bài."}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Bài ghim */}
              {banner && (
                <PinnedBanner
                  post={banner}
                  coverUrl={covers[banner.cover_path || ""]}
                  liked={liked.has(banner.id)}
                  email={user.email}
                  onLike={applyLike}
                />
              )}

              {/* Danh sách — CẢ 3 DANH MỤC DÙNG CHUNG MỘT KIỂU CARD.
                  Trước đây Thông báo có kiểu dòng gọn riêng, nhưng đặt cạnh
                  Giới thiệu/Sự kiện trong tab "Tất cả" thì hai cỡ ảnh lệch nhau
                  trông rời rạc. Nét riêng của Thông báo giữ lại bằng huy hiệu
                  số tệp đính kèm. */}
              <div className="space-y-3.5">
                {rest.map((post) => (
                  <ArticleCard
                    key={post.id}
                    post={post}
                    coverUrl={covers[post.cover_path || ""]}
                    attachCount={attachCounts[post.id] || 0}
                    liked={liked.has(post.id)}
                    email={user.email}
                    canManage={canManage}
                    onLike={applyLike}
                    onEdit={() => {
                      setEditing(post);
                      setEditorOpen(true);
                    }}
                    onDelete={() => handleDelete(post)}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {canManage && (
        <NewsEditorModal
          open={editorOpen}
          post={editing}
          author={{ name: user.name, email: user.email, department: user.department }}
          onClose={() => setEditorOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ─── Bài ghim: banner lớn ───
function PinnedBanner({
  post,
  coverUrl,
  liked,
  email,
  onLike,
}: {
  post: NewsPost;
  coverUrl?: string;
  liked: boolean;
  email: string;
  onLike: (id: string, liked: boolean, count: number) => void;
}) {
  const meta = categoryMeta(post.category);
  return (
    <Link
      href={`/tin-tuc/${post.id}`}
      className="block relative overflow-hidden rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 group"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${meta.gradient}`} />
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-35 group-hover:scale-105 transition-transform duration-500"
        />
      )}
      <div className="relative p-8 space-y-3 text-white">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm uppercase tracking-wider">
            <Pin size={10} />
            Ghim
          </span>
          <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm uppercase tracking-wider">
            {meta.label}
          </span>
        </div>
        <h2 className="font-heading font-extrabold text-2xl leading-tight max-w-3xl">{post.title}</h2>
        <p className="text-xs font-medium text-white/85 max-w-2xl leading-relaxed line-clamp-2">
          {post.summary || plainExcerpt(post.content_md)}
        </p>
        <div className="flex items-center gap-3 pt-1 text-[11px] font-bold text-white/80">
          <span>{post.author_name || "Phòng HCNS"}</span>
          <span>•</span>
          <span>{formatPostDate(post.published_at || post.created_at)}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-all">
            Đọc bài <ArrowRight size={12} />
          </span>
        </div>
      </div>
      <div className="absolute top-6 right-6" onClick={(e) => e.preventDefault()}>
        <div className="bg-white/90 rounded-full">
          <NewsLikeButton
            postId={post.id}
            email={email}
            liked={liked}
            count={post.like_count}
            onChange={(l, c) => onLike(post.id, l, c)}
          />
        </div>
      </div>
    </Link>
  );
}

// ─── Card dùng chung cho cả 3 danh mục ───
function ArticleCard({
  post,
  coverUrl,
  attachCount,
  liked,
  email,
  canManage,
  onLike,
  onEdit,
  onDelete,
}: {
  post: NewsPost;
  coverUrl?: string;
  attachCount: number;
  liked: boolean;
  email: string;
  canManage: boolean;
  onLike: (id: string, liked: boolean, count: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = categoryMeta(post.category);
  const Icon = meta.icon;
  const countdown = post.category === "su_kien" ? eventCountdown(post.event_start_at, post.event_end_at) : null;

  return (
    <div className="flex flex-col sm:flex-row gap-5 p-5 bg-white border border-slate-200/60 rounded-3xl shadow-sm hover:border-slate-300 hover:shadow-md transition-all duration-200">
      <Link href={`/tin-tuc/${post.id}`} className="sm:w-64 shrink-0">
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt={post.title} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
              <Icon size={30} className="text-white/70" />
            </div>
          )}
          {countdown && (
            <span
              className={`absolute top-2.5 left-2.5 text-[9px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider backdrop-blur-sm ${
                countdown.tone === "live"
                  ? "bg-emerald-500/90 text-white"
                  : countdown.tone === "past"
                  ? "bg-slate-800/70 text-white"
                  : "bg-white/90 text-emerald-700"
              }`}
            >
              {countdown.text}
            </span>
          )}
        </div>
      </Link>

      <div className="min-w-0 flex-1 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${meta.badge}`}>
            <Icon size={10} />
            {meta.label}
          </span>
          {isFresh(post) && (
            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 border border-rose-100 uppercase tracking-wider">
              Mới
            </span>
          )}
          <StatusChip post={post} />
        </div>

        <Link
          href={`/tin-tuc/${post.id}`}
          className="font-heading font-bold text-slate-800 text-base leading-snug hover:text-[#005BAC] transition-colors"
        >
          {post.title}
        </Link>

        <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2">
          {post.summary || plainExcerpt(post.content_md)}
        </p>

        {post.category === "su_kien" && (post.event_start_at || post.event_location) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-emerald-700">
            {post.event_start_at && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-100">
                <Icon size={10} />
                {formatEventRange(post.event_start_at, post.event_end_at)}
              </span>
            )}
            {post.event_location && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-100">
                <MapPin size={10} />
                {post.event_location}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-auto pt-1.5 border-t border-slate-100 text-[10px] font-semibold text-slate-400">
          <span>{post.author_name || "Phòng HCNS"}</span>
          <span>{formatPostDate(post.published_at || post.created_at)}</span>
          <span className="inline-flex items-center gap-1">
            <Eye size={11} />
            {post.view_count}
          </span>
          {/* Nét riêng còn lại của Thông báo: đẩy tệp PDF lên cho dễ thấy */}
          {attachCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 font-bold">
              <FileText size={10} />
              {attachCount} tệp đính kèm
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <NewsLikeButton
              postId={post.id}
              email={email}
              liked={liked}
              count={post.like_count}
              onChange={(l, c) => onLike(post.id, l, c)}
            />
            {canManage && <ManageButtons onEdit={onEdit} onDelete={onDelete} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ post }: { post: NewsPost }) {
  if (post.status === "published") return null;
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wider">
      <Paperclip size={9} />
      Bản nháp
    </span>
  );
}

function ManageButtons({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <>
      <button
        onClick={onEdit}
        title="Sửa bài"
        className="p-1.5 text-slate-400 hover:text-[#005BAC] hover:bg-blue-50 rounded-lg border border-slate-100 hover:border-blue-100 transition-all cursor-pointer"
      >
        <Pencil size={13} />
      </button>
      <button
        onClick={onDelete}
        title="Xoá bài"
        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-100 hover:border-rose-100 transition-all cursor-pointer"
      >
        <Trash2 size={13} />
      </button>
    </>
  );
}
