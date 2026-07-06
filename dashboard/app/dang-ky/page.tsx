"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { useSearchParams } from "next/navigation";
import {
  CarFront,
  DoorOpen,
  Users,
  Search,
  X,
  Send,
  CalendarClock,
  ClipboardList,
  Trash2,
  UserRound,
  Building2,
  StickyNote,
  Handshake,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type BookingType = "xe" | "phong_hop";

interface EmployeeOption {
  name: string;
  email: string;
  department: string;
  role: string;
}

interface BookingRow {
  id: string;
  created_at: string;
  booking_type: BookingType;
  resource_name: string;
  host_name: string;
  requester_name: string;
  requester_email: string;
  department: string;
  start_time: string;
  end_time: string;
  content: string;
  attendees: string[];
  attendee_count: number;
  participant_type: "noi_bo" | "khach_hang";
  customer_info: string | null;
  notes: string | null;
  status: "pending_manager" | "pending_hcns" | "approved" | "rejected";
  manager_approved_by: string | null;
  final_decision_by: string | null;
  reject_reason: string | null;
}

const VEHICLES = ["Fortuner (7 chỗ)", "Xpander (7 chỗ)"];
const ROOMS = ["Phòng họp lớn", "Phòng họp nhỏ"];

// Khung giờ 24h, bước 30 phút (00:00 → 23:30)
const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

// Cộng thêm 1 giờ vào chuỗi "HH:mm" (dùng gợi ý giờ kết thúc)
function addOneHour(clock: string): string {
  const [h, m] = clock.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending_manager: { label: "Chờ Trưởng phòng xác nhận", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pending_hcns: { label: "Chờ HCNS duyệt", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  approved: { label: "Đã duyệt", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Từ chối", cls: "bg-rose-50 text-rose-600 border-rose-200" },
};

function formatDateTime(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) +
    " " +
    d.toLocaleDateString("vi-VN")
  );
}

function BookingContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const bookingType: BookingType = tabParam === "xe" ? "xe" : "phong_hop";
  const isVehicle = bookingType === "xe";
  const resources = isVehicle ? VEHICLES : ROOMS;

  // email: email đăng nhập Google (nhận diện người dùng); contactEmail: email trong hồ sơ
  // nhân viên (thường gồm email công ty, cách nhau dấu phẩy) — dùng để nhận mail kết quả.
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string; department: string; contactEmail: string } | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Form state
  const [hostName, setHostName] = useState("");
  const [resourceName, setResourceName] = useState(resources[0]);
  const [department, setDepartment] = useState("");
  // Ngày + giờ tách riêng, giờ chọn theo khung 24h (bước 30 phút) cho trực quan
  const [startDate, setStartDate] = useState("");
  const [startClock, setStartClock] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endClock, setEndClock] = useState("");
  const [content, setContent] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [attendeeCount, setAttendeeCount] = useState<number>(0);
  const [participantType, setParticipantType] = useState<"noi_bo" | "khach_hang">("noi_bo");
  const [customerInfo, setCustomerInfo] = useState("");
  const [notes, setNotes] = useState("");

  // Attendee picker state
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [showAttendeeDropdown, setShowAttendeeDropdown] = useState(false);
  const attendeePickerRef = useRef<HTMLDivElement>(null);

  // Reset resource when switching tab
  useEffect(() => {
    setResourceName(isVehicle ? VEHICLES[0] : ROOMS[0]);
  }, [bookingType, isVehicle]);

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email || "";
        if (email) {
          const { data: empData } = await supabase
            .from("employees")
            .select("name, department, email")
            .like("email", `%${email}%`)
            .maybeSingle();
          const me = {
            email,
            name: empData?.name || session?.user?.user_metadata?.full_name || "Người dùng",
            department: empData?.department || "Chưa xếp phòng",
            contactEmail: empData?.email || email,
          };
          setCurrentUser(me);
          setDepartment((prev) => prev || me.department);
          setHostName((prev) => prev || me.name);
        }

        const { data: empList } = await supabase
          .from("employees")
          .select("name, email, department, role")
          .order("name", { ascending: true });
        if (empList) setEmployees(empList.filter((e: any) => e.name));
      } catch (err) {
        console.error("Error initializing booking page:", err);
      }
    };
    init();
  }, []);

  const fetchBookings = async () => {
    try {
      setLoadingList(true);
      const { data, error } = await supabase
        .from("resource_bookings")
        .select("*")
        .order("start_time", { ascending: false });
      if (error) throw error;
      if (data) setBookings(data as BookingRow[]);
    } catch (err) {
      console.error("Error fetching resource bookings:", err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  // Close attendee dropdown when clicking outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (attendeePickerRef.current && !attendeePickerRef.current.contains(e.target as Node)) {
        setShowAttendeeDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => e.department && set.add(e.department));
    if (currentUser?.department) set.add(currentUser.department);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  }, [employees, currentUser]);

  const filteredEmployees = useMemo(() => {
    const q = attendeeSearch.trim().toLowerCase();
    return employees
      .filter((e) => !attendees.includes(e.name))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || (e.department || "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [employees, attendees, attendeeSearch]);

  const addAttendee = (name: string) => {
    setAttendees((prev) => {
      const next = [...prev, name];
      setAttendeeCount(next.length); // phần mềm tự tính khi chọn từ danh sách
      return next;
    });
    setAttendeeSearch("");
  };

  const removeAttendee = (name: string) => {
    setAttendees((prev) => {
      const next = prev.filter((n) => n !== name);
      setAttendeeCount(next.length || 0);
      return next;
    });
  };

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const resetForm = () => {
    setResourceName(resources[0]);
    setStartDate("");
    setStartClock("");
    setEndDate("");
    setEndClock("");
    setContent("");
    setAttendees([]);
    setAttendeeCount(0);
    setParticipantType("noi_bo");
    setCustomerInfo("");
    setNotes("");
    if (currentUser) {
      setHostName(currentUser.name);
      setDepartment(currentUser.department);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast("error", "Không xác định được người dùng đăng nhập!");
      return;
    }
    if (!hostName.trim() || !resourceName || !startDate || !startClock || !endDate || !endClock || !content.trim() || !department) {
      showToast("error", "Vui lòng điền đầy đủ: người chủ trì, " + (isVehicle ? "xe" : "phòng họp") + ", ngày giờ bắt đầu/kết thúc, nội dung và phòng ban!");
      return;
    }
    const startISO = new Date(`${startDate}T${startClock}:00`).toISOString();
    const endISO = new Date(`${endDate}T${endClock}:00`).toISOString();
    if (endISO <= startISO) {
      showToast("error", "Thời gian kết thúc phải sau thời gian bắt đầu!");
      return;
    }
    if (participantType === "khach_hang" && !customerInfo.trim()) {
      showToast("error", "Vui lòng nhập thông tin khách hàng cho cuộc họp có khách bên ngoài!");
      return;
    }
    const finalCount = attendeeCount || attendees.length;
    if (!finalCount || finalCount < 1) {
      showToast("error", "Vui lòng nhập số lượng người tham dự (hoặc chọn nhân viên từ danh sách)!");
      return;
    }

    try {
      setSubmitting(true);

      // Kiểm tra trùng lịch với các đăng ký chưa bị từ chối của cùng xe/phòng
      const { data: conflicts } = await supabase
        .from("resource_bookings")
        .select("id, host_name, start_time, end_time, status")
        .eq("resource_name", resourceName)
        .neq("status", "rejected")
        .lt("start_time", endISO)
        .gt("end_time", startISO);

      if (conflicts && conflicts.length > 0) {
        const c = conflicts[0];
        const cMeta = STATUS_META[c.status]?.label || c.status;
        const ok = window.confirm(
          `⚠️ ${resourceName} đã có đăng ký trùng khung giờ (${formatDateTime(c.start_time)} → ${formatDateTime(c.end_time)}, chủ trì: ${c.host_name}, trạng thái: ${cMeta}).\n\nBạn vẫn muốn gửi đăng ký này để cấp duyệt xem xét?`
        );
        if (!ok) {
          setSubmitting(false);
          return;
        }
      }

      const { error } = await supabase.from("resource_bookings").insert([
        {
          booking_type: bookingType,
          resource_name: resourceName,
          host_name: hostName.trim(),
          requester_name: currentUser.name,
          requester_email: currentUser.contactEmail,
          department,
          start_time: startISO,
          end_time: endISO,
          content: content.trim(),
          attendees,
          attendee_count: finalCount,
          participant_type: participantType,
          customer_info: participantType === "khach_hang" ? customerInfo.trim() : null,
          notes: notes.trim() || null,
          status: "pending_manager",
        },
      ]);
      if (error) throw error;

      showToast("success", "Đã gửi đăng ký thành công! Yêu cầu đang chờ Trưởng phòng xác nhận.");
      resetForm();
      fetchBookings();
    } catch (err: any) {
      console.error("Error submitting booking:", err);
      showToast("error", "Lỗi khi gửi đăng ký: " + (err.message || "không xác định"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBooking = async (id: string) => {
    if (!window.confirm("Bạn chắc chắn muốn huỷ đăng ký này?")) return;
    try {
      const { error } = await supabase.from("resource_bookings").delete().eq("id", id);
      if (error) throw error;
      showToast("success", "Đã huỷ đăng ký.");
      fetchBookings();
    } catch (err: any) {
      console.error("Error cancelling booking:", err);
      showToast("error", "Lỗi khi huỷ đăng ký!");
    }
  };

  const myBookings = useMemo(() => {
    if (!currentUser) return [];
    const loginEmail = currentUser.email.toLowerCase();
    // requester_email có thể là chuỗi nhiều email (hồ sơ nhân viên) nên so bằng includes
    return bookings.filter(
      (b) =>
        b.booking_type === bookingType &&
        ((b.requester_email || "").toLowerCase().includes(loginEmail) || b.requester_name === currentUser.name)
    );
  }, [bookings, bookingType, currentUser]);

  const upcomingBookings = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((b) => b.booking_type === bookingType && b.status !== "rejected" && new Date(b.end_time).getTime() >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 12);
  }, [bookings, bookingType]);

  const TabIcon = isVehicle ? CarFront : DoorOpen;

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header
          title={isVehicle ? "Đăng ký xe" : "Đăng ký phòng họp"}
          subtitle={
            isVehicle
              ? "Đăng ký sử dụng xe công tác (Fortuner / Xpander) — duyệt qua Trưởng phòng và HCNS"
              : "Đăng ký phòng họp lớn / nhỏ — duyệt qua Trưởng phòng và HCNS"
          }
        />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Toast */}
          {toast && (
            <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div
                className={`${
                  toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
                } text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 font-semibold text-sm max-w-md`}
              >
                {toast.msg}
              </div>
            </div>
          )}

          {/* Form đăng ký */}
          <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
            <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-sm">
                <TabIcon size={16} className="text-white" />
              </span>
              Tạo đăng ký {isVehicle ? "xe công tác" : "phòng họp"} mới
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5 text-xs text-slate-600 font-semibold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Người chủ trì */}
                <div className="space-y-1">
                  <label className="text-slate-500 flex items-center gap-1.5">
                    <UserRound size={12} /> Người chủ trì <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="employee-name-list"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    placeholder="Nhập hoặc chọn tên người chủ trì..."
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                  />
                  <datalist id="employee-name-list">
                    {employees.map((e) => (
                      <option key={e.name + e.email} value={e.name}>{e.department}</option>
                    ))}
                  </datalist>
                </div>

                {/* Xe / Phòng họp */}
                <div className="space-y-1">
                  <label className="text-slate-500 flex items-center gap-1.5">
                    <TabIcon size={12} /> {isVehicle ? "Chọn xe" : "Chọn phòng họp"} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={resourceName}
                    onChange={(e) => setResourceName(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer bg-white"
                  >
                    {resources.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Thời gian bắt đầu: ngày + giờ 24h */}
                <div className="space-y-1">
                  <label className="text-slate-500 flex items-center gap-1.5">
                    <CalendarClock size={12} /> Thời gian bắt đầu <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        // Tự gợi ý ngày kết thúc cùng ngày
                        if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                      }}
                      className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                    />
                    <select
                      value={startClock}
                      onChange={(e) => {
                        setStartClock(e.target.value);
                        // Tự gợi ý giờ kết thúc = giờ bắt đầu + 1 tiếng
                        if (!endClock && e.target.value) setEndClock(addOneHour(e.target.value));
                      }}
                      className="w-28 px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer bg-white font-mono font-bold text-[#005BAC]"
                    >
                      <option value="">Giờ</option>
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[10px] text-slate-400 font-normal">Giờ hiển thị theo khung 24h (vd: 14:00 = 2 giờ chiều).</p>
                </div>

                {/* Thời gian kết thúc: ngày + giờ 24h */}
                <div className="space-y-1">
                  <label className="text-slate-500 flex items-center gap-1.5">
                    <CalendarClock size={12} /> Thời gian kết thúc <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                    />
                    <select
                      value={endClock}
                      onChange={(e) => setEndClock(e.target.value)}
                      className="w-28 px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer bg-white font-mono font-bold text-[#005BAC]"
                    >
                      <option value="">Giờ</option>
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Phòng ban */}
                <div className="space-y-1">
                  <label className="text-slate-500 flex items-center gap-1.5">
                    <Building2 size={12} /> Phòng ban đăng ký <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer bg-white"
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* Số lượng người */}
                <div className="space-y-1">
                  <label className="text-slate-500 flex items-center gap-1.5">
                    <Users size={12} /> Số lượng người tham dự <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={attendeeCount || ""}
                    onChange={(e) => setAttendeeCount(Number(e.target.value))}
                    placeholder="Tự điền tay hoặc tự tính khi chọn nhân viên"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                  />
                  <p className="text-[10px] text-slate-400 font-normal">
                    Hệ thống tự cập nhật theo số nhân viên đã chọn bên dưới; vẫn có thể sửa tay nếu cần.
                  </p>
                </div>
              </div>

              {/* Nội dung cuộc họp / mục đích */}
              <div className="space-y-1">
                <label className="text-slate-500 flex items-center gap-1.5">
                  <ClipboardList size={12} /> {isVehicle ? "Mục đích sử dụng xe / lộ trình" : "Nội dung cuộc họp"} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={2}
                  placeholder={isVehicle ? "Vd: Đưa đoàn công tác đi kiểm tra hiện trường DA. Cống Vàm Lẽo - Bạc Liêu..." : "Vd: Họp giao ban tiến độ dự án tuần 28..."}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 resize-y"
                />
              </div>

              {/* Nhân viên tham dự - searchable multi-select */}
              <div className="space-y-1" ref={attendeePickerRef}>
                <label className="text-slate-500 flex items-center gap-1.5">
                  <Users size={12} /> Nhân viên tham dự (chọn từ danh sách công ty)
                </label>
                <div className="relative">
                  <div className="w-full min-h-[42px] px-3 py-2 border border-slate-200 rounded-xl flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/40 bg-white">
                    {attendees.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1 text-[10px] font-bold"
                      >
                        {name}
                        <button type="button" onClick={() => removeAttendee(name)} className="hover:text-rose-500 transition-colors cursor-pointer">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                      <Search size={12} className="text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={attendeeSearch}
                        onChange={(e) => {
                          setAttendeeSearch(e.target.value);
                          setShowAttendeeDropdown(true);
                        }}
                        onFocus={() => setShowAttendeeDropdown(true)}
                        placeholder={attendees.length === 0 ? "Tìm tên nhân viên hoặc bấm để chọn nhanh..." : "Thêm người..."}
                        className="flex-1 py-1 outline-none text-xs font-semibold placeholder:font-normal"
                      />
                    </div>
                  </div>

                  {showAttendeeDropdown && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-premium z-20 max-h-56 overflow-y-auto animate-in fade-in duration-150">
                      {filteredEmployees.length === 0 ? (
                        <p className="text-center text-slate-400 text-[11px] italic py-4">Không tìm thấy nhân viên phù hợp.</p>
                      ) : (
                        filteredEmployees.map((emp) => (
                          <button
                            key={emp.name + emp.email}
                            type="button"
                            onClick={() => addAttendee(emp.name)}
                            className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                          >
                            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                              {emp.name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-bold text-slate-700 truncate">{emp.name}</span>
                              <span className="block text-[10px] text-slate-400 font-semibold truncate">{emp.department || "Chưa xếp phòng"}{emp.role ? ` • ${emp.role}` : ""}</span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Nội bộ / Khách hàng */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-slate-500 flex items-center gap-1.5">
                    <Handshake size={12} /> Thành phần tham dự
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setParticipantType("noi_bo")}
                      className={`flex-1 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all active:scale-[0.97] cursor-pointer ${
                        participantType === "noi_bo"
                          ? "bg-gradient-to-r from-[#005BAC] to-[#00AEEF] border-transparent text-white shadow-md shadow-blue-500/15"
                          : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      Nội bộ công ty
                    </button>
                    <button
                      type="button"
                      onClick={() => setParticipantType("khach_hang")}
                      className={`flex-1 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all active:scale-[0.97] cursor-pointer ${
                        participantType === "khach_hang"
                          ? "bg-gradient-to-r from-[#005BAC] to-[#00AEEF] border-transparent text-white shadow-md shadow-blue-500/15"
                          : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      Có khách hàng bên ngoài
                    </button>
                  </div>
                </div>

                {/* Ghi chú hậu cần */}
                <div className="space-y-1">
                  <label className="text-slate-500 flex items-center gap-1.5">
                    <StickyNote size={12} /> Ghi chú (nước, trà, bánh kẹo, trái cây...)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Vd: Chuẩn bị nước suối, trà và trái cây cho 8 người..."
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                  />
                </div>
              </div>

              {/* Thông tin khách hàng (khi có khách bên ngoài) */}
              {participantType === "khach_hang" && (
                <div className="space-y-1 animate-in fade-in duration-200">
                  <label className="text-slate-500 flex items-center gap-1.5">
                    <Handshake size={12} /> Thông tin khách hàng <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={customerInfo}
                    onChange={(e) => setCustomerInfo(e.target.value)}
                    rows={2}
                    placeholder="Tên đơn vị / khách hàng, số lượng khách, người đại diện, liên hệ..."
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 resize-y"
                  />
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-[10px] text-slate-400 font-normal leading-relaxed max-w-md">
                  Sau khi gửi, yêu cầu sẽ được chuyển đến <strong>Trưởng phòng</strong> của bạn xác nhận, sau đó
                  <strong> Phòng HCNS</strong> (điều phối xe & phòng họp) duyệt cuối. Kết quả sẽ được gửi về email của bạn.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl active:scale-95 transition-all shadow-md shadow-blue-500/10 flex items-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Gửi duyệt
                </button>
              </div>
            </form>
          </div>

          {/* Lịch sắp tới của xe / phòng họp */}
          <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
            <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
              <CalendarClock size={16} className="text-blue-600" />
              Lịch {isVehicle ? "xe" : "phòng họp"} sắp tới
            </h2>
            {upcomingBookings.length === 0 ? (
              <p className="text-center text-slate-400 text-xs italic py-6">Chưa có lịch đăng ký nào sắp tới.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">{isVehicle ? "Xe" : "Phòng"}</th>
                      <th className="py-3 px-4">Thời gian</th>
                      <th className="py-3 px-4">Chủ trì</th>
                      <th className="py-3 px-4">Phòng ban</th>
                      <th className="py-3 px-4">{isVehicle ? "Mục đích" : "Nội dung"}</th>
                      <th className="py-3 px-4">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                    {upcomingBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/50 transition-all duration-150">
                        <td className="py-3 px-4 font-bold text-slate-800">{b.resource_name}</td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[10px] whitespace-nowrap">
                          {formatDateTime(b.start_time)} ➔ {formatDateTime(b.end_time)}
                        </td>
                        <td className="py-3 px-4">{b.host_name}</td>
                        <td className="py-3 px-4 text-slate-500">{b.department}</td>
                        <td className="py-3 px-4 text-slate-450 font-normal max-w-[220px] truncate" title={b.content}>{b.content}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2.5 py-1 rounded-full border text-[9px] font-extrabold uppercase ${STATUS_META[b.status]?.cls || ""}`}>
                            {STATUS_META[b.status]?.label || b.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Đăng ký của tôi */}
          <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
            <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
              <ClipboardList size={16} className="text-blue-600" />
              Đăng ký của tôi
            </h2>
            {loadingList ? (
              <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-semibold gap-2">
                <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                Đang tải danh sách đăng ký...
              </div>
            ) : myBookings.length === 0 ? (
              <p className="text-center text-slate-400 text-xs italic py-6">Bạn chưa có đăng ký {isVehicle ? "xe" : "phòng họp"} nào.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">{isVehicle ? "Xe" : "Phòng"}</th>
                      <th className="py-3 px-4">Thời gian</th>
                      <th className="py-3 px-4">Chủ trì</th>
                      <th className="py-3 px-4">Số người</th>
                      <th className="py-3 px-4">Trạng thái</th>
                      <th className="py-3 px-4 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                    {myBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/50 transition-all duration-150">
                        <td className="py-3 px-4 font-bold text-slate-800">{b.resource_name}</td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[10px] whitespace-nowrap">
                          {formatDateTime(b.start_time)} ➔ {formatDateTime(b.end_time)}
                        </td>
                        <td className="py-3 px-4">{b.host_name}</td>
                        <td className="py-3 px-4 text-center">{b.attendee_count}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full border text-[9px] font-extrabold uppercase ${STATUS_META[b.status]?.cls || ""}`}
                            title={b.status === "rejected" && b.reject_reason ? `Lý do: ${b.reject_reason}` : undefined}
                          >
                            {STATUS_META[b.status]?.label || b.status}
                          </span>
                          {b.status === "rejected" && b.reject_reason && (
                            <p className="text-[10px] text-rose-500 font-normal mt-1 max-w-[200px]">Lý do: {b.reject_reason}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {b.status === "pending_manager" ? (
                            <button
                              type="button"
                              onClick={() => handleCancelBooking(b.id)}
                              className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer"
                            >
                              <Trash2 size={11} /> Huỷ
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen bg-[#F7F9FC] items-center justify-center">
          <span className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      }
    >
      <BookingContent />
    </Suspense>
  );
}
