"use client";

// Nút thả tim — dùng chung cho card ở trang danh sách và thanh cuối trang chi tiết.
// Cập nhật lạc quan (đổi màu + số ngay khi bấm), lỗi thì trả về trạng thái cũ:
// mạng công ty chập chờn thì người dùng vẫn thấy phản hồi tức thì.

import { useState } from "react";
import { Heart } from "lucide-react";
import { toggleReaction } from "@/lib/news";

type Props = {
  postId: string;
  email: string;
  liked: boolean;
  count: number;
  onChange: (liked: boolean, count: number) => void;
  size?: "sm" | "lg";
};

export default function NewsLikeButton({ postId, email, liked, count, onChange, size = "sm" }: Props) {
  const [busy, setBusy] = useState(false);
  const large = size === "lg";

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy || !email) return;

    const nextLiked = !liked;
    const nextCount = Math.max(0, count + (nextLiked ? 1 : -1));
    onChange(nextLiked, nextCount); // lạc quan
    setBusy(true);
    try {
      await toggleReaction(postId, email, liked);
    } catch {
      onChange(liked, count); // trả lại như cũ
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || !email}
      title={liked ? "Bỏ thích" : "Thích bài này"}
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold transition-all duration-200 active:scale-[0.97] cursor-pointer disabled:opacity-60 ${
        large ? "px-4 py-2 text-xs" : "px-2.5 py-1 text-[10px]"
      } ${
        liked
          ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100"
          : "bg-slate-50/70 border-slate-200 text-slate-500 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-500"
      }`}
    >
      <Heart
        size={large ? 15 : 12}
        className={`transition-transform duration-200 ${liked ? "fill-rose-500 text-rose-500 scale-110" : ""}`}
      />
      <span>{count}</span>
    </button>
  );
}
