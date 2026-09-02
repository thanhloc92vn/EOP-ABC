"use client";

// ============================================================
// /cham-cong — CHẤM CÔNG GPS cho nhân sự Ban Điều hành dự án (BĐH)
//
// Luồng: nhận diện BĐH theo phòng ban của người đăng nhập -> lấy toạ độ GPS máy
// -> đo khoảng cách tới toạ độ đã ghim của BĐH -> trong bán kính thì mở camera
// chụp ảnh minh chứng -> lưu về bảng gps_checkins (migration 066).
//
// Server mới là nơi quyết hợp lệ (trigger tính lại khoảng cách + giờ). Ở đây chỉ
// hiển thị nhanh cho người dùng biết đứng đúng chỗ chưa, tránh chấm hụt.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { fetchDepartments } from "@/lib/departments";
import {
  MapPin, Camera, CheckCircle2, XCircle, Loader2, Navigation,
  LogIn, LogOut, RefreshCw, ShieldAlert, Clock,
} from "lucide-react";

type Located = { bdh_name: string; lat: number; lng: number; radius_m: number | null; province: string | null };
type TodayRow = { kind: "in" | "out"; captured_at: string; is_valid: boolean; distance_m: number | null };

// Haversine (mét) — bản client để phản hồi tức thì; server tính lại khi lưu.
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

export default function ChamCongPage() {
  const user = useCurrentUser();

  const [isBdh, setIsBdh] = useState<boolean | null>(null);   // phòng ban có phải BĐH không
  const [loc, setLoc] = useState<Located | null>(null);        // toạ độ ghim của BĐH
  const [locLoading, setLocLoading] = useState(true);
  const [today, setToday] = useState<TodayRow[]>([]);

  // Trạng thái phiên chấm công
  const [kind, setKind] = useState<"in" | "out" | null>(null); // đang chấm buổi nào
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [dist, setDist] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "locating" | "camera" | "saving">("idle");
  const [err, setErr] = useState<string>("");
  const [okMsg, setOkMsg] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const radius = loc?.radius_m ?? 50;
  const inRange = dist !== null && dist <= radius;

  // ─── Nhận diện BĐH + tải toạ độ + trạng thái hôm nay ───
  const loadContext = useCallback(async () => {
    if (!user.authenticated || !user.department) return;
    setLocLoading(true);
    try {
      const deps = await fetchDepartments();
      const bdh = deps.bdh.includes(user.department);
      setIsBdh(bdh);
      if (!bdh) { setLocLoading(false); return; }

      const { data: pl } = await supabase
        .from("project_locations")
        .select("bdh_name, lat, lng, radius_m, province")
        .eq("bdh_name", user.department)
        .maybeSingle();
      setLoc(pl as Located | null);

      // Lịch sử chấm hôm nay (RLS chỉ trả bản ghi của chính mình).
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const { data: rows } = await supabase
        .from("gps_checkins")
        .select("kind, captured_at, is_valid, distance_m")
        .gte("captured_at", startOfDay.toISOString())
        .order("captured_at", { ascending: true });
      setToday((rows || []) as TodayRow[]);
    } catch {
      setIsBdh(false);
    } finally {
      setLocLoading(false);
    }
  }, [user.authenticated, user.department]);

  useEffect(() => { loadContext(); }, [loadContext]);

  // Dọn camera khi rời trang
  useEffect(() => () => stopCamera(), []);

  const doneIn = useMemo(() => today.some(r => r.kind === "in" && r.is_valid), [today]);
  const doneOut = useMemo(() => today.some(r => r.kind === "out" && r.is_valid), [today]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  function reset() {
    stopCamera();
    setKind(null); setGps(null); setDist(null); setPhase("idle"); setErr(""); setOkMsg("");
  }

  // ─── Bước 1: bấm chấm công -> lấy GPS ───
  async function startCheckin(which: "in" | "out") {
    setErr(""); setOkMsg(""); setKind(which); setPhase("locating"); setGps(null); setDist(null);

    if (!("geolocation" in navigator)) {
      setErr("Thiết bị không hỗ trợ định vị GPS."); setPhase("idle"); return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGps({ lat: latitude, lng: longitude, acc: accuracy });
        if (loc) setDist(distanceM(latitude, longitude, loc.lat, loc.lng));
        // Định vị rác -> chặn ngay, khỏi tốn công chụp ảnh.
        if (accuracy > 100) {
          setErr(`Tín hiệu GPS quá yếu (sai số ~${Math.round(accuracy)}m). Ra chỗ thoáng và thử lại.`);
          setPhase("idle"); return;
        }
        openCamera();
      },
      (e) => {
        const m: Record<number, string> = {
          1: "Bạn đã chặn quyền vị trí. Vào cài đặt trình duyệt cho phép truy cập vị trí rồi thử lại.",
          2: "Không lấy được vị trí. Kiểm tra GPS/định vị đã bật chưa.",
          3: "Lấy vị trí quá lâu. Thử lại ở nơi thoáng.",
        };
        setErr(m[e.code] || "Không lấy được vị trí GPS."); setPhase("idle");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // ─── Bước 2: mở camera ───
  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setPhase("camera");
      // gán stream sau khi video element đã render
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 60);
    } catch {
      setErr("Không mở được camera. Cho phép quyền camera trong trình duyệt rồi thử lại.");
      setPhase("idle");
    }
  }

  // ─── Bước 3: chụp + nén + overlay thông tin ───
  async function captureAndSave() {
    if (!videoRef.current || !gps || !kind) return;
    setPhase("saving"); setErr("");
    try {
      const v = videoRef.current;
      const maxW = 720;
      const scale = Math.min(1, maxW / (v.videoWidth || maxW));
      const w = Math.round((v.videoWidth || maxW) * scale);
      const h = Math.round((v.videoHeight || maxW * 0.75) * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(v, 0, 0, w, h);

      // Overlay minh chứng: thời điểm máy + dự án + toạ độ + khoảng cách.
      const lines = [
        `${user.department}`,
        `${new Date().toLocaleString("vi-VN")}`,
        `GPS ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (±${Math.round(gps.acc)}m)`,
        dist !== null ? `Cách vị trí BĐH: ${Math.round(dist)}m` : "",
      ].filter(Boolean);
      const pad = 8, lh = 18, boxH = lines.length * lh + pad;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, h - boxH, w, boxH);
      ctx.fillStyle = "#fff"; ctx.font = "600 13px sans-serif"; ctx.textBaseline = "top";
      lines.forEach((t, i) => ctx.fillText(t, pad, h - boxH + pad / 2 + i * lh));

      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob(b => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", 0.7)
      );

      stopCamera();

      // Tải ảnh: <email>/<yyyy-mm>/<uuid>.jpg
      const ym = new Date().toISOString().slice(0, 7);
      const path = `${user.email}/${ym}/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from("gps-checkins").upload(path, blob, {
        contentType: "image/jpeg", upsert: false,
      });
      if (up.error) throw new Error("Không tải được ảnh lên: " + up.error.message);

      const { error: insErr } = await supabase.from("gps_checkins").insert([{
        user_email: user.email,
        employee_name: user.name,
        bdh_name: user.department,
        kind,
        lat: gps.lat, lng: gps.lng, accuracy_m: gps.acc,
        photo_path: path,
        device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
        // captured_at / distance_m / is_valid do TRIGGER server tự tính.
      }]);
      if (insErr) {
        // Trùng: đã chấm hợp lệ buổi này hôm nay.
        if ((insErr as any).code === "23505") throw new Error(`Bạn đã chấm công ${kind === "in" ? "VÀO" : "RA"} hợp lệ hôm nay rồi.`);
        throw new Error("Không lưu được: " + insErr.message);
      }

      setOkMsg(`Đã chấm công ${kind === "in" ? "VÀO" : "RA"} lúc ${new Date().toLocaleTimeString("vi-VN")}.`);
      setPhase("idle"); setKind(null); setGps(null); setDist(null);
      loadContext();
    } catch (e: any) {
      setErr(e?.message || "Có lỗi khi lưu chấm công."); setPhase("idle"); stopCamera();
    }
  }

  // ─── UI ───
  if (user.loading || locLoading) {
    return <Center><Loader2 className="animate-spin text-[#005BAC]" size={34} /><p className="text-xs font-semibold text-slate-500 mt-3">Đang tải…</p></Center>;
  }

  // Không thuộc BĐH -> chặn (văn phòng dùng máy vân tay).
  if (isBdh === false) {
    return (
      <Center>
        <div className="max-w-sm w-full bg-white rounded-3xl shadow-xl p-8 text-center space-y-4 border border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto"><ShieldAlert size={26} /></div>
          <h1 className="font-extrabold text-slate-800">Chấm công GPS chỉ dành cho BĐH dự án</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            Phòng ban của bạn (<b>{user.department || "Chưa xếp phòng"}</b>) không phải Ban Điều hành dự án.
            Nhân sự văn phòng chấm công bằng máy vân tay như thường lệ.
          </p>
        </div>
      </Center>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0ea5e9]/5 to-[#F7F9FC] px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="rounded-3xl p-5 text-white shadow-lg" style={{ background: "linear-gradient(135deg,#0ea5e9 0%,#2563eb 60%,#4f46e5 100%)" }}>
          <div className="flex items-center gap-2 text-white/90 text-xs font-semibold"><MapPin size={14} /> Chấm công GPS công trường</div>
          <h1 className="font-heading font-black text-xl mt-1 leading-tight">{user.department}</h1>
          <p className="text-white/80 text-xs mt-1 font-medium">{user.name} · {loc?.province || "—"}</p>
        </div>

        {/* BĐH chưa ghim toạ độ */}
        {!loc && (
          <Banner tone="warn" icon={<ShieldAlert size={16} />}>
            BĐH này <b>chưa được ghim toạ độ</b>. Liên hệ Admin định vị trong module “Vị trí dự án” trước khi chấm công.
          </Banner>
        )}

        {/* Trạng thái hôm nay */}
        <div className="bg-white rounded-2xl border border-slate-150 p-4 shadow-sm">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Clock size={12} /> Hôm nay</div>
          <div className="grid grid-cols-2 gap-3">
            <StatusPill label="Vào (sáng)" done={doneIn} time={today.find(r => r.kind === "in" && r.is_valid)?.captured_at} />
            <StatusPill label="Ra (chiều)" done={doneOut} time={today.find(r => r.kind === "out" && r.is_valid)?.captured_at} />
          </div>
        </div>

        {/* Thông báo */}
        {err && <Banner tone="err" icon={<XCircle size={16} />}>{err}</Banner>}
        {okMsg && <Banner tone="ok" icon={<CheckCircle2 size={16} />}>{okMsg}</Banner>}

        {/* Khối chấm công */}
        {phase === "camera" ? (
          <div className="bg-white rounded-3xl border border-slate-150 p-4 shadow-sm space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4]">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              <div className="absolute bottom-2 left-2 right-2 text-white text-[11px] font-semibold bg-black/40 rounded-lg px-2 py-1 leading-tight">
                {dist !== null && <>Cách BĐH ~{Math.round(dist)}m · </>}Chụp ảnh để xác nhận có mặt
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={reset} className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm active:scale-95">Huỷ</button>
              <button onClick={captureAndSave} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#005BAC] text-white font-bold text-sm active:scale-95 shadow">
                <Camera size={16} /> Chụp & Gửi chấm công
              </button>
            </div>
          </div>
        ) : phase === "saving" ? (
          <div className="bg-white rounded-3xl border border-slate-150 p-8 shadow-sm flex flex-col items-center">
            <Loader2 className="animate-spin text-[#005BAC]" size={30} />
            <p className="text-xs font-semibold text-slate-500 mt-3">Đang lưu chấm công…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {gps && (
              <div className={`rounded-2xl px-4 py-3 text-xs font-semibold flex items-center gap-2 ${inRange ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
                <Navigation size={14} />
                {dist !== null
                  ? <>Bạn đang cách vị trí BĐH <b>~{Math.round(dist)}m</b> {inRange ? `(trong bán kính ${radius}m ✓)` : `(ngoài bán kính ${radius}m ✗)`}</>
                  : <>Đã lấy vị trí, nhưng BĐH chưa ghim toạ độ để so.</>}
              </div>
            )}
            <button
              disabled={!loc || phase === "locating" || doneIn}
              onClick={() => startCheckin("in")}
              className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-600 text-white font-black text-base active:scale-95 shadow disabled:opacity-40 disabled:active:scale-100"
            >
              {phase === "locating" && kind === "in" ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
              {doneIn ? "Đã chấm VÀO hôm nay" : "Chấm công VÀO (sáng)"}
            </button>
            <button
              disabled={!loc || phase === "locating" || doneOut}
              onClick={() => startCheckin("out")}
              className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#005BAC] text-white font-black text-base active:scale-95 shadow disabled:opacity-40 disabled:active:scale-100"
            >
              {phase === "locating" && kind === "out" ? <Loader2 className="animate-spin" size={18} /> : <LogOut size={18} />}
              {doneOut ? "Đã chấm RA hôm nay" : "Chấm công RA (chiều)"}
            </button>
            <button onClick={loadContext} className="flex items-center justify-center gap-1.5 py-2 text-slate-400 font-bold text-xs active:scale-95">
              <RefreshCw size={12} /> Làm mới
            </button>
          </div>
        )}

        <p className="text-[10px] text-slate-400 text-center leading-relaxed px-4">
          Vị trí & thời gian do máy chủ ghi nhận và kiểm tra lại. Ảnh chụp là minh chứng có mặt tại công trường.
        </p>
      </div>
    </div>
  );
}

// ─── Thành phần phụ ───
function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F9FC] px-4">{children}</div>;
}

function Banner({ tone, icon, children }: { tone: "ok" | "err" | "warn"; icon: React.ReactNode; children: React.ReactNode }) {
  const c = { ok: "bg-emerald-50 text-emerald-700 border-emerald-200", err: "bg-rose-50 text-rose-700 border-rose-200", warn: "bg-amber-50 text-amber-700 border-amber-200" }[tone];
  return <div className={`rounded-2xl border px-4 py-3 text-xs font-semibold flex items-start gap-2 ${c}`}><span className="mt-0.5 shrink-0">{icon}</span><span className="leading-relaxed">{children}</span></div>;
}

function StatusPill({ label, done, time }: { label: string; done: boolean; time?: string }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 border ${done ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-150"}`}>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-black mt-0.5 flex items-center gap-1 ${done ? "text-emerald-700" : "text-slate-300"}`}>
        {done ? <><CheckCircle2 size={14} /> {time ? fmtTime(time) : "Đã chấm"}</> : "—"}
      </div>
    </div>
  );
}
