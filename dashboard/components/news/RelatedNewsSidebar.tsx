"use client";

// Cột phải của trang đọc bài: "Tin tức cập nhật mới".
// Lấp khoảng trống bên phải bài viết và cho người đọc nhảy thẳng sang bài khác
// mà không phải quay về bảng tin.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Newspaper, Eye, Pin, ArrowRight } from "lucide-react";
import {
  categoryMeta,
  fetchPosts,
  signNewsPaths,
  formatPostDate,
  isFresh,
  type NewsPost,
} from "@/lib/news";

/** Số bài hiện trong cột. Lấy dư 1 vì bài đang đọc sẽ bị loại khỏi danh sách. */
const SHOW = 6;

export default function RelatedNewsSidebar({ currentId }: { currentId: string }) {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Không setLoading(true) ở đây: state đã khởi tạo là true, và khi người đọc
  // nhảy sang bài khác thì component được gắn `key` ở chỗ dùng nên tự dựng lại
  // từ đầu. Gọi setState thẳng trong effect sẽ sinh vòng render thừa.
  useEffect(() => {
    let alive = true;

    fetchPosts({ limit: SHOW + 1 })
      .then(async (rows) => {
        if (!alive) return;
        const others = rows.filter((r) => r.id !== currentId).slice(0, SHOW);
        setPosts(others);
        setCovers(await signNewsPaths(others.map((r) => r.cover_path)));
      })
      .catch(() => setPosts([]))
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [currentId]);

  return (
    <div className="bg-white border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
        <h2 className="inline-flex items-center gap-2 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
          <Newspaper size={13} className="text-[#005BAC]" />
          Tin tức cập nhật mới
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
          <Loader2 className="animate-spin text-[#005BAC]" size={16} />
          <span className="text-xs font-semibold">Đang tải...</span>
        </div>
      ) : posts.length === 0 ? (
        <p className="text-slate-400 text-xs italic text-center py-10 px-5">
          Chưa có bài viết nào khác.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {posts.map((post) => {
            const meta = categoryMeta(post.category);
            const Icon = meta.icon;
            const cover = post.cover_path ? covers[post.cover_path] : undefined;

            return (
              <Link
                key={post.id}
                href={`/tin-tuc/${post.id}`}
                className="flex items-start gap-3 p-3.5 hover:bg-slate-50/70 transition-all duration-200 group"
              >
                <div className="relative w-24 h-16 rounded-xl overflow-hidden shrink-0 bg-slate-100">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                      <Icon size={18} className="text-white/70" />
                    </div>
                  )}
                  {post.pinned && (
                    <span className="absolute top-1 left-1 w-4 h-4 rounded-md bg-amber-400/90 flex items-center justify-center">
                      <Pin size={9} className="text-white" />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full border uppercase tracking-wider ${meta.badge}`}>
                      <Icon size={8} />
                      {meta.label}
                    </span>
                    {isFresh(post) && (
                      <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-500 border border-rose-100 uppercase tracking-wider">
                        Mới
                      </span>
                    )}
                  </div>

                  <h3 className="text-[11px] font-bold text-slate-700 leading-snug line-clamp-2 group-hover:text-[#005BAC] transition-colors">
                    {post.title}
                  </h3>

                  <div className="flex items-center gap-2 text-[9px] font-semibold text-slate-400">
                    <span>{formatPostDate(post.published_at || post.created_at)}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Eye size={9} />
                      {post.view_count}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Link
        href="/tin-tuc"
        className="flex items-center justify-center gap-1.5 px-5 py-3.5 border-t border-slate-100 text-[11px] font-bold text-[#005BAC] hover:bg-blue-50/50 transition-all"
      >
        Xem toàn bộ bảng tin
        <ArrowRight size={12} />
      </Link>
    </div>
  );
}
