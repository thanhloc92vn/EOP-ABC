"use client";

// Khối "Tin mới nhất" trên Dashboard — 3 bài đã đăng gần nhất.
// Tự nạp dữ liệu và tự ẩn khi chưa có tin nào, để Dashboard không phải biết gì
// về module Tin tức ngoài một dòng gọi component này.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, Pin } from "lucide-react";
import {
  categoryMeta,
  fetchPosts,
  signNewsPaths,
  formatPostDate,
  isFresh,
  type NewsPost,
} from "@/lib/news";
import { plainExcerpt } from "@/lib/newsMarkdown";

export default function LatestNewsSection() {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchPosts({ limit: 3 })
      .then(async (rows) => {
        if (!alive) return;
        setPosts(rows);
        setCovers(await signNewsPaths(rows.map((r) => r.cover_path)));
      })
      .catch(() => setPosts([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="flex items-center justify-center py-8 gap-2 text-slate-400">
        <Loader2 className="animate-spin text-[#005BAC]" size={16} />
        <span className="text-xs font-semibold">Đang tải bảng tin...</span>
      </section>
    );
  }

  if (posts.length === 0) return null;

  return (
    <section className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tin mới nhất</h2>
        <Link href="/tin-tuc" className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
          Xem tất cả <ChevronRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {posts.map((post) => {
          const meta = categoryMeta(post.category);
          const Icon = meta.icon;
          const cover = post.cover_path ? covers[post.cover_path] : undefined;

          return (
            <Link
              key={post.id}
              href={`/tin-tuc/${post.id}`}
              className="group bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden hover:shadow-md hover:border-slate-300 transition-all duration-200"
            >
              <div className="relative h-28 overflow-hidden">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                    <Icon size={24} className="text-white/70" />
                  </div>
                )}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full border uppercase tracking-wider bg-white/90 ${meta.badge}`}>
                    <Icon size={9} />
                    {meta.label}
                  </span>
                  {post.pinned && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100/90 text-amber-700 uppercase tracking-wider">
                      <Pin size={9} />
                      Ghim
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-1.5">
                <div className="flex items-start gap-2">
                  <h3 className="text-xs font-bold text-slate-800 leading-snug line-clamp-2 group-hover:text-[#005BAC] transition-colors">
                    {post.title}
                  </h3>
                  {isFresh(post) && (
                    <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-500 border border-rose-100 uppercase tracking-wider shrink-0">
                      Mới
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed line-clamp-2">
                  {post.summary || plainExcerpt(post.content_md, 120)}
                </p>
                <p className="text-[10px] text-slate-400 font-semibold pt-0.5">
                  {formatPostDate(post.published_at || post.created_at)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
