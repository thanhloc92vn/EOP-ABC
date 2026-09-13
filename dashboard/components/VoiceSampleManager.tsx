"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDialog } from "@/components/DialogProvider";
import { MAX_KNOWN_SPEAKERS, RECORDING_BITS_PER_SECOND } from "@/lib/meetingModels";
import { Mic, Square, Trash2, Volume2, Loader2, Search, X, AlertTriangle, CheckCircle2 } from "lucide-react";

// ============================================================
// QUẢN LÝ MẪU GIỌNG NGƯỜI DỰ HỌP
//
// Mẫu giọng 2-10 giây của một người được nạp vào tham số
// known_speaker_references của API gỡ băng. Nhờ đó bản gỡ băng ghi thẳng
// "Huỳnh Giáp Nhân:" thay vì "Speaker 1:" — thư ký khỏi phải ngồi nghe rồi gán
// tên thủ công sau mỗi cuộc họp.
//
// OpenAI nhận tối đa 4 mẫu mỗi lần gỡ băng, nên chỉ cần lưu cho người chủ trì
// và vài người phát biểu thường xuyên. Những người còn lại vẫn được tách giọng
// bình thường, chỉ mang nhãn máy để gán tên sau.
//
// QUYỀN: ghi vào bảng `employees` bị khoá theo cờ can_manage_employees
// (migration 007). Người không có quyền vẫn mở được bảng này để xem ai đã có
// mẫu, nhưng khi lưu sẽ nhận thông báo rõ ràng thay vì lỗi kỹ thuật khó hiểu.
// ============================================================

const MIN_SAMPLE_MS = 2000;
const MAX_SAMPLE_MS = 10000;

type Props = {
  employees: any[];
  onClose: () => void;
  onChanged: () => void;
};

export default function VoiceSampleManager({ employees, onClose, onChanged }: Props) {
  const dialog = useDialog();
  const [query, setQuery] = useState("");
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const withSample = employees.filter(e => e.voice_sample_path);

  const filtered = employees.filter(e => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (e.name || "").toLowerCase().includes(q) || (e.role || "").toLowerCase().includes(q);
  });

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const handleStartRecord = async (employee: any) => {
    setMessage(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMessage({ kind: "err", text: "Trình duyệt không hỗ trợ ghi âm, hoặc trang đang chạy qua HTTP (ghi âm cần HTTPS)." });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        stopTracks();
        setRecordingFor(null);
        setElapsedMs(0);

        if (durationMs < MIN_SAMPLE_MS) {
          setMessage({ kind: "err", text: "Mẫu giọng quá ngắn. Cần ít nhất 2 giây — hãy đọc một câu trọn vẹn." });
          return;
        }
        void saveSample(employee, blob);
      };

      startedAtRef.current = Date.now();
      recorder.start();
      recorderRef.current = recorder;
      setRecordingFor(employee.id);
      setElapsedMs(0);

      timerRef.current = setInterval(() => {
        const ms = Date.now() - startedAtRef.current;
        setElapsedMs(ms);
        // Tự dừng ở 10 giây — mẫu dài hơn không được API chấp nhận.
        if (ms >= MAX_SAMPLE_MS && recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      }, 100);
    } catch (err: any) {
      const name = err?.name || "";
      setMessage({
        kind: "err",
        text: name === "NotAllowedError"
          ? "Bạn đã từ chối quyền dùng micro. Bấm biểu tượng ổ khoá trên thanh địa chỉ để cấp lại quyền."
          : `Không mở được micro: ${err?.message || name}`,
      });
      stopTracks();
    }
  };

  const handleStopRecord = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const saveSample = async (employee: any, blob: Blob) => {
    setBusyId(employee.id);
    try {
      const path = `voice_samples/${employee.id}.webm`;
      const { error: upErr } = await supabase.storage
        .from("meetings")
        .upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
      if (upErr) throw new Error(`Không tải được mẫu giọng lên: ${upErr.message}`);

      const { data: updated, error: dbErr } = await supabase
        .from("employees")
        .update({ voice_sample_path: path })
        .eq("id", employee.id)
        .select("id");

      if (dbErr) throw new Error(dbErr.message);

      // RLS chặn thì không báo lỗi, chỉ khớp 0 dòng — phải bắt tường minh, nếu
      // không người dùng tưởng đã lưu xong mà thực ra chưa có gì.
      if (!updated || updated.length === 0) {
        throw new Error(
          "Bạn không có quyền sửa hồ sơ nhân sự nên chưa lưu được mẫu giọng. Vui lòng nhờ Quản trị viên (hoặc người có quyền Quản lý nhân sự) thực hiện."
        );
      }

      setMessage({ kind: "ok", text: `Đã lưu mẫu giọng cho ${employee.name}.` });
      onChanged();
    } catch (err: any) {
      setMessage({ kind: "err", text: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteSample = async (employee: any) => {
    const ok = await dialog.confirm(`Xoá mẫu giọng của ${employee.name}?`, {
      title: "Xoá mẫu giọng",
      tone: "danger",
      confirmText: "Xoá",
    });
    if (!ok) return;
    setBusyId(employee.id);
    setMessage(null);
    try {
      await supabase.storage.from("meetings").remove([employee.voice_sample_path]);
      const { data: updated, error } = await supabase
        .from("employees")
        .update({ voice_sample_path: null })
        .eq("id", employee.id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!updated || updated.length === 0) {
        throw new Error("Bạn không có quyền sửa hồ sơ nhân sự nên chưa xoá được mẫu giọng khỏi hồ sơ.");
      }
      setMessage({ kind: "ok", text: `Đã xoá mẫu giọng của ${employee.name}.` });
      onChanged();
    } catch (err: any) {
      setMessage({ kind: "err", text: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const playSample = async (employee: any) => {
    try {
      const { data } = await supabase.storage
        .from("meetings")
        .createSignedUrl(employee.voice_sample_path, 120);
      const url = data?.signedUrl
        || supabase.storage.from("meetings").getPublicUrl(employee.voice_sample_path).data.publicUrl;
      new Audio(url).play();
    } catch {
      setMessage({ kind: "err", text: "Không phát được mẫu giọng." });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
              <Volume2 size={16} className="text-[#005BAC]" /> Mẫu giọng người dự họp
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Ghi 2-10 giây giọng nói của người chủ trì và những người phát biểu thường xuyên.
              AI gỡ băng sẽ gọi thẳng tên thật thay vì &quot;Speaker 1&quot;.
              Mỗi cuộc họp dùng tối đa {MAX_KNOWN_SPEAKERS} mẫu — hiện đã có <b>{withSample.length}</b>.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc chức danh..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {message && (
          <div
            className={`mx-4 mt-3 flex items-start gap-2 rounded-xl border p-3 text-[11px] ${
              message.kind === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {message.kind === "ok" ? <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="flex-1 space-y-1 overflow-y-auto p-4">
          {filtered.map(emp => {
            const isRecording = recordingFor === emp.id;
            const isBusy = busyId === emp.id;
            return (
              <div
                key={`vs_${emp.id}`}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800">{emp.name}</p>
                  <p className="truncate text-[10px] text-slate-400">{emp.role}</p>
                </div>

                {isRecording && (
                  <span className="font-mono text-[11px] font-bold tabular-nums text-rose-600">
                    {(elapsedMs / 1000).toFixed(1)}s
                  </span>
                )}

                {emp.voice_sample_path && !isRecording && (
                  <button
                    onClick={() => playSample(emp)}
                    title="Nghe thử mẫu giọng"
                    className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100"
                  >
                    <Volume2 size={13} />
                  </button>
                )}

                {isBusy ? (
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                ) : isRecording ? (
                  <button
                    onClick={handleStopRecord}
                    className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-900"
                  >
                    <Square size={11} /> Dừng
                  </button>
                ) : (
                  <button
                    onClick={() => handleStartRecord(emp)}
                    disabled={recordingFor !== null}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Mic size={11} /> {emp.voice_sample_path ? "Ghi lại" : "Ghi mẫu"}
                  </button>
                )}

                {emp.voice_sample_path && !isRecording && !isBusy && (
                  <button
                    onClick={() => handleDeleteSample(emp)}
                    title="Xoá mẫu giọng"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-slate-400">Không tìm thấy nhân sự phù hợp.</p>
          )}
        </div>

        <div className="border-t border-slate-100 p-4 text-[10px] leading-relaxed text-slate-400">
          Mẹo: cho người đó đọc một câu bình thường trong 4-6 giây, ghi ngay tại phòng họp sẽ khớp
          nhất với điều kiện âm thanh lúc họp thật.
        </div>
      </div>
    </div>
  );
}
