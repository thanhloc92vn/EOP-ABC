"use client";

// ============================================================
// AvatarUploadCard — thẻ "Ảnh đại diện" trong Cài đặt hệ thống.
//
// MỌI tài khoản đều dùng được (không gate theo gói hay cờ quyền) — RLS của
// `user_avatars` chỉ cho mỗi người ghi đúng dòng của chính mình.
//
// Người dùng chọn ảnh bất kỳ, kéo để chỉnh khung và dùng thanh trượt để phóng
// to/thu nhỏ. Ảnh luôn được vẽ lại vào canvas 300×300 rồi nén JPEG, nên file
// gốc dù 4000px cũng chỉ lưu xuống ~25-40 KB.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, UserRound, ZoomIn } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  AVATAR_MAX_UPLOAD_BYTES,
  AVATAR_SIZE,
  emitAvatarUpdated,
  fetchAvatar,
  initialsFrom,
} from "@/lib/avatar";

type Props = {
  email: string;
  name: string;
};

/** Khung xem trước trên giao diện (px). Canvas vẫn xuất đúng AVATAR_SIZE. */
const PREVIEW_PX = 176;

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function AvatarUploadCard({ email, name }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const [savedAvatar, setSavedAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // ─── Tải ảnh đang có ───
  useEffect(() => {
    let mounted = true;
    if (!email) {
      setLoading(false);
      return;
    }
    fetchAvatar(email).then(data => {
      if (!mounted) return;
      setSavedAvatar(data);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [email]);

  // ─── Vẽ khung cắt ───
  // Ảnh luôn phủ kín khung (cover), offset bị kẹp lại để không bao giờ hở mép.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const baseScale = Math.max(AVATAR_SIZE / img.naturalWidth, AVATAR_SIZE / img.naturalHeight);
    const scale = baseScale * zoom;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;

    const maxOffsetX = Math.max(0, (drawW - AVATAR_SIZE) / 2);
    const maxOffsetY = Math.max(0, (drawH - AVATAR_SIZE) / 2);
    const clampedX = Math.min(maxOffsetX, Math.max(-maxOffsetX, offset.x));
    const clampedY = Math.min(maxOffsetY, Math.max(-maxOffsetY, offset.y));

    ctx.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(
      img,
      (AVATAR_SIZE - drawW) / 2 + clampedX,
      (AVATAR_SIZE - drawH) / 2 + clampedY,
      drawW,
      drawH
    );
  }, [zoom, offset]);

  useEffect(() => {
    if (editing) draw();
  }, [editing, draw]);

  // ─── Chọn file ───
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại đúng file vừa huỷ
    if (!file) return;

    setMessage(null);

    if (!file.type.startsWith("image/")) {
      setMessage({ kind: "err", text: "Vui lòng chọn một tệp ảnh (JPG, PNG, WebP...)." });
      return;
    }
    if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
      setMessage({
        kind: "err",
        text: `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Vui lòng chọn ảnh dưới 8 MB.`,
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setEditing(true);
      };
      img.onerror = () => setMessage({ kind: "err", text: "Không đọc được tệp ảnh này." });
      img.src = String(reader.result);
    };
    reader.onerror = () => setMessage({ kind: "err", text: "Không đọc được tệp ảnh này." });
    reader.readAsDataURL(file);
  };

  // ─── Kéo để chỉnh khung (chuột + cảm ứng) ───
  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editing) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    // Toạ độ trên khung xem trước -> toạ độ canvas thật.
    const ratio = AVATAR_SIZE / PREVIEW_PX;
    const dx = (e.clientX - dragRef.current.x) * ratio;
    const dy = (e.clientY - dragRef.current.y) * ratio;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const pointerUp = () => {
    dragRef.current = null;
  };

  // ─── Lưu ───
  const handleSave = async () => {
    if (!email) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSaving(true);
    setMessage(null);
    try {
      const imageData = canvas.toDataURL("image/jpeg", 0.85);

      const { error } = await supabase
        .from("user_avatars")
        .upsert({ email: email.trim().toLowerCase(), image_data: imageData }, { onConflict: "email" });

      if (error) throw error;

      setSavedAvatar(imageData);
      setEditing(false);
      imageRef.current = null;
      emitAvatarUpdated({ email, imageData });
      setMessage({ kind: "ok", text: "Đã cập nhật ảnh đại diện." });
    } catch (err) {
      console.error("Error saving avatar:", err);
      setMessage({ kind: "err", text: "Không lưu được ảnh: " + errText(err) });
    } finally {
      setSaving(false);
    }
  };

  // ─── Gỡ ảnh ───
  const handleRemove = async () => {
    if (!email || !savedAvatar) return;
    if (!confirm("Gỡ ảnh đại diện và quay về hai chữ viết tắt?")) return;

    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from("user_avatars")
        .delete()
        .eq("email", email.trim().toLowerCase());

      if (error) throw error;

      setSavedAvatar(null);
      emitAvatarUpdated({ email, imageData: null });
      setMessage({ kind: "ok", text: "Đã gỡ ảnh đại diện." });
    } catch (err) {
      console.error("Error removing avatar:", err);
      setMessage({ kind: "err", text: "Không gỡ được ảnh: " + errText(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    imageRef.current = null;
    setMessage(null);
  };

  return (
    <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-4">
      <div>
        <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
          <UserRound size={18} className="text-slate-500" /> Ảnh đại diện
        </h2>
      </div>

      <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
        {/* Khung xem trước / khung cắt */}
        <div className="shrink-0">
          <div
            className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center"
            style={{ width: PREVIEW_PX, height: PREVIEW_PX }}
          >
            {editing ? (
              <canvas
                ref={canvasRef}
                width={AVATAR_SIZE}
                height={AVATAR_SIZE}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerUp}
                className="cursor-move touch-none"
                style={{ width: PREVIEW_PX, height: PREVIEW_PX }}
              />
            ) : savedAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={savedAvatar}
                alt="Ảnh đại diện"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold text-4xl uppercase">
                {loading ? "" : initialsFrom(name)}
              </div>
            )}
          </div>
          {editing && (
            <p className="text-[10px] text-slate-400 font-semibold text-center mt-2">Kéo ảnh để chỉnh khung</p>
          )}
        </div>

        {/* Điều khiển */}
        <div className="flex-1 w-full space-y-3">
          {editing && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <ZoomIn size={12} /> Phóng to
              </label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                className="w-full accent-[#005BAC] cursor-pointer"
              />
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              <ImagePlus size={14} /> {savedAvatar || editing ? "Chọn ảnh khác" : "Chọn ảnh"}
            </button>

            {editing && (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-[#005BAC] hover:bg-blue-700 text-white active:scale-95 transition-all shadow disabled:opacity-60 cursor-pointer"
                >
                  {saving ? "Đang lưu..." : "Lưu ảnh đại diện"}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold rounded-xl text-slate-500 hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  Huỷ
                </button>
              </>
            )}

            {!editing && savedAvatar && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl text-rose-600 hover:bg-rose-50 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Trash2 size={14} /> Gỡ ảnh
              </button>
            )}
          </div>

          {message && (
            <p
              className={`text-[11px] font-bold ${
                message.kind === "ok" ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
