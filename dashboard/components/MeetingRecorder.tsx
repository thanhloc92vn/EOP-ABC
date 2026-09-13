"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDialog } from "@/components/DialogProvider";
import {
  RECORDING_SEGMENT_MINUTES,
  RECORDING_BITS_PER_SECOND,
} from "@/lib/meetingModels";
import { Mic, Square, Pause, Play, Loader2, CheckCircle2, AlertTriangle, Radio } from "lucide-react";

// ============================================================
// GHI ÂM CUỘC HỌP TRỰC TIẾP TRONG APP
//
// VÌ SAO PHẢI CẮT ĐOẠN:
// OpenAI chỉ nhận tối đa 25MB mỗi lần gọi API gỡ băng — giới hạn này áp dụng
// cho MỌI model, kể cả những model mới nhất, và không có endpoint nào nhận URL
// hay chạy bất đồng bộ để lách. Nên phải cắt ngay từ khâu ghi.
//
// CON SỐ: opus mono 32kbps ~ 240KB mỗi phút. Đoạn 20 phút ~ 4,8MB, cách xa trần
// 25MB kể cả khi người nói liên tục. Cả cuộc họp 2 tiếng = 6 đoạn.
//
// VÌ SAO DỪNG HẲN RỒI TẠO RECORDER MỚI, thay vì dùng timeslice:
// timeslice của MediaRecorder cắt ra các mảnh KHÔNG tự giải mã được — chỉ mảnh
// đầu tiên mang header của container. Gửi mảnh thứ hai lên API gỡ băng là lỗi
// file hỏng. Dừng hẳn rồi tạo recorder mới cho ra từng file webm hoàn chỉnh,
// độc lập, gửi đi được ngay.
//
// AN TOÀN: mỗi đoạn upload lên Storage NGAY khi vừa cắt, trong lúc cuộc họp vẫn
// đang diễn ra. Máy sập hay trình duyệt đóng thì mất nhiều nhất là đoạn đang ghi
// dở, phần đã họp trước đó vẫn còn nguyên trên server.
// ============================================================

export type RecordedSegment = {
  index: number;
  path: string;
  /** Vị trí bắt đầu của đoạn này tính từ lúc bấm Ghi (giây) — để dựng timeline thật. */
  offsetSec: number;
  durationSec: number;
  sizeBytes: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

type Props = {
  disabled?: boolean;
  onFinish: (result: { startedAt: string; segments: RecordedSegment[] }) => void;
};

const SEGMENT_MS = RECORDING_SEGMENT_MINUTES * 60 * 1000;

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function formatClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function MeetingRecorder({ disabled, onFinish }: Props) {
  const dialog = useDialog();
  const [status, setStatus] = useState<"idle" | "recording" | "paused" | "finishing">("idle");
  const [totalSec, setTotalSec] = useState(0);
  const [segmentSec, setSegmentSec] = useState(0);
  const [segments, setSegments] = useState<RecordedSegment[]>([]);
  // Bản sao bằng ref: callback kết thúc phải đọc danh sách đoạn MỚI NHẤT mà
  // không được đọc từ trong hàm cập nhật state — React StrictMode gọi hàm đó
  // hai lần ở chế độ dev, sẽ khởi chạy quy trình gỡ băng hai lần.
  const segmentsRef = useRef<RecordedSegment[]>([]);
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const sessionIdRef = useRef("");
  const startedAtRef = useRef("");
  const segmentIndexRef = useRef(0);
  const offsetMsRef = useRef(0);      // Tổng thời lượng các đoạn đã hoàn tất
  const segmentMsRef = useRef(0);     // Thời lượng đoạn đang ghi
  const continueAfterStopRef = useRef(false);
  const pendingUploadsRef = useRef(0);
  const finishingRef = useRef(false);
  const statusRef = useRef<typeof status>("idle");

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);

  // ─── Đồng hồ: chỉ chạy khi đang ghi thật, khoảng tạm dừng không tính vào
  //     offset, nhờ đó mốc giờ của đoạn sau vẫn khớp với file âm thanh ───
  useEffect(() => {
    const id = setInterval(() => {
      if (statusRef.current !== "recording") return;
      segmentMsRef.current += 1000;
      setSegmentSec(Math.floor(segmentMsRef.current / 1000));
      setTotalSec(Math.floor((offsetMsRef.current + segmentMsRef.current) / 1000));
      if (segmentMsRef.current >= SEGMENT_MS) rotateSegment();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ─── Chặn đóng tab khi đang ghi ───
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (statusRef.current === "recording" || statusRef.current === "paused") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // ─── Vạch mức âm thanh: để thư ký thấy ngay micro có ăn hay không, thay vì
  //     họp xong 2 tiếng mới phát hiện file câm ───
  const runMeter = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
      setLevel(Math.min(100, Math.round((peak / 128) * 140)));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  // Cập nhật đồng thời ref (đọc ngay được) và state (để vẽ lại giao diện).
  const applySegments = (updater: (prev: RecordedSegment[]) => RecordedSegment[]) => {
    segmentsRef.current = updater(segmentsRef.current);
    setSegments(segmentsRef.current);
  };

  const uploadSegment = async (blob: Blob, index: number, offsetSec: number, durationSec: number) => {
    const ext = blob.type.includes("ogg") ? "ogg" : "webm";
    const path = `recordings/${sessionIdRef.current}/part_${String(index).padStart(3, "0")}.${ext}`;

    applySegments((prev) => [
      ...prev,
      { index, path, offsetSec, durationSec, sizeBytes: blob.size, status: "uploading" },
    ]);
    pendingUploadsRef.current += 1;

    try {
      const { error: upErr } = await supabase.storage
        .from("meetings")
        .upload(path, blob, { cacheControl: "3600", upsert: true, contentType: blob.type });
      if (upErr) throw upErr;
      applySegments((prev) =>
        prev.map((s) => (s.index === index ? { ...s, status: "done" } : s))
      );
    } catch (err: any) {
      applySegments((prev) =>
        prev.map((s) =>
          s.index === index ? { ...s, status: "error", error: err?.message || "Lỗi tải lên" } : s
        )
      );
    } finally {
      pendingUploadsRef.current -= 1;
      maybeFinish();
    }
  };

  // Chỉ báo xong khi đoạn cuối đã upload hết — tránh trả về danh sách thiếu file
  const maybeFinish = () => {
    if (!finishingRef.current || pendingUploadsRef.current > 0) return;
    finishingRef.current = false;
    setStatus("idle");
    onFinish({ startedAt: startedAtRef.current, segments: segmentsRef.current });
  };

  const startSegment = () => {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
    });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      const index = segmentIndexRef.current;
      const offsetSec = Math.floor(offsetMsRef.current / 1000);
      const durationSec = Math.floor(segmentMsRef.current / 1000);

      offsetMsRef.current += segmentMsRef.current;
      segmentMsRef.current = 0;
      setSegmentSec(0);
      segmentIndexRef.current += 1;

      if (blob.size > 0) void uploadSegment(blob, index, offsetSec, durationSec);

      if (continueAfterStopRef.current) {
        continueAfterStopRef.current = false;
        startSegment();
      } else {
        maybeFinish();
      }
    };

    recorder.start();
    recorderRef.current = recorder;
  };

  const rotateSegment = () => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    continueAfterStopRef.current = true;
    recorderRef.current.stop();
  };

  const handleStart = async () => {
    setError("");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Trình duyệt không hỗ trợ ghi âm, hoặc trang đang chạy qua HTTP. Ghi âm chỉ hoạt động trên HTTPS (hoặc localhost).");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("Trình duyệt không hỗ trợ MediaRecorder. Vui lòng dùng Chrome hoặc Edge bản mới.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      runMeter();

      sessionIdRef.current = `${Date.now()}`;
      startedAtRef.current = new Date().toISOString();
      segmentIndexRef.current = 0;
      offsetMsRef.current = 0;
      segmentMsRef.current = 0;
      segmentsRef.current = [];
      setSegments([]);
      setTotalSec(0);
      setSegmentSec(0);
      setStatus("recording");
      startSegment();
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Bạn đã từ chối quyền dùng micro. Bấm vào biểu tượng ổ khoá trên thanh địa chỉ để cấp lại quyền, rồi thử lại.");
      } else if (name === "NotFoundError") {
        setError("Không tìm thấy micro nào trên máy. Hãy cắm micro hoặc tai nghe có mic rồi thử lại.");
      } else {
        setError(`Không khởi động được ghi âm: ${err?.message || name || "lỗi không rõ"}`);
      }
    }
  };

  const handlePause = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.pause();
      setStatus("paused");
    }
  };

  const handleResume = () => {
    if (recorderRef.current?.state === "paused") {
      recorderRef.current.resume();
      setStatus("recording");
    }
  };

  const handleStop = async () => {
    const ok = await dialog.confirm("Kết thúc ghi âm và bắt đầu gỡ băng cuộc họp?", {
      title: "Kết thúc ghi âm",
      confirmText: "Kết thúc & gỡ băng",
    });
    if (!ok) return;
    finishingRef.current = true;
    setStatus("finishing");
    continueAfterStopRef.current = false;

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      maybeFinish();
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    setLevel(0);
  };

  const isLive = status === "recording" || status === "paused";
  const remainingSec = Math.max(0, RECORDING_SEGMENT_MINUTES * 60 - segmentSec);
  const uploadedCount = segments.filter((s) => s.status === "done").length;
  const failedCount = segments.filter((s) => s.status === "error").length;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            Ghi âm trực tiếp
          </span>
          {isLive && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600">
              <Radio size={12} className="animate-pulse" />
              {status === "paused" ? "TẠM DỪNG" : "ĐANG GHI"}
            </span>
          )}
        </div>
        <span className="font-mono text-lg font-bold tabular-nums text-slate-800">
          {formatClock(totalSec)}
        </span>
      </div>

      {/* Vạch mức âm thanh */}
      {isLive && (
        <div className="mb-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                level < 4 ? "bg-slate-300" : level < 45 ? "bg-emerald-500" : "bg-amber-500"
              }`}
              style={{ width: `${Math.max(2, level)}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            {level < 4
              ? "Chưa nhận được âm thanh — kiểm tra lại micro trước khi họp tiếp."
              : `Đoạn hiện tại ${formatClock(segmentSec)} · tự cắt sau ${formatClock(remainingSec)}`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {status === "idle" && (
          <button
            onClick={handleStart}
            disabled={disabled}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Mic size={15} /> Bắt đầu ghi âm
          </button>
        )}

        {status === "recording" && (
          <button
            onClick={handlePause}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <Pause size={15} /> Tạm dừng
          </button>
        )}

        {status === "paused" && (
          <button
            onClick={handleResume}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:brightness-110"
          >
            <Play size={15} /> Ghi tiếp
          </button>
        )}

        {isLive && (
          <button
            onClick={handleStop}
            className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-900"
          >
            <Square size={14} /> Kết thúc & gỡ băng
          </button>
        )}

        {status === "finishing" && (
          <span className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <Loader2 size={14} className="animate-spin" /> Đang tải nốt đoạn cuối lên...
          </span>
        )}

        {segments.length > 0 && (
          <span className="ml-auto text-[11px] font-semibold text-slate-500">
            {uploadedCount}/{segments.length} đoạn đã lưu an toàn
            {failedCount > 0 && (
              <span className="ml-1 text-rose-600">· {failedCount} lỗi</span>
            )}
          </span>
        )}
      </div>

      {segments.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {segments.map((s) => (
            <div key={s.index} className="flex items-center gap-2 text-[11px] text-slate-600">
              {s.status === "uploading" && <Loader2 size={12} className="animate-spin text-blue-600" />}
              {s.status === "done" && <CheckCircle2 size={12} className="text-emerald-600" />}
              {s.status === "error" && <AlertTriangle size={12} className="text-rose-600" />}
              <span className="font-mono">Đoạn {s.index + 1}</span>
              <span className="text-slate-400">
                {formatClock(s.offsetSec)} → {formatClock(s.offsetSec + s.durationSec)}
              </span>
              <span className="text-slate-400">({(s.sizeBytes / (1024 * 1024)).toFixed(1)} MB)</span>
              {s.error && <span className="text-rose-600">{s.error}</span>}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

    </div>
  );
}
