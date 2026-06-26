"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch (e) {
      /* ignore */
    }
  };

  return (
    <button
      onClick={toggle}
      title={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
      aria-label="Chuyển chế độ sáng/tối"
      className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-slate-700 transition-all active:scale-95"
    >
      {/* Render nhất quán cho SSR; sau khi mounted thì đổi icon theo theme */}
      {mounted && dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
