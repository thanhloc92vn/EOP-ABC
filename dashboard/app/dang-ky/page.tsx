"use client";

import { apiFetch } from "@/lib/apiClient";
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
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  XCircle,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  getGroupLeaderNameForMember,
  isBookingCap1Approver,
  isDepartmentManagerRole,
} from "@/lib/approvers";
import { useCurrentUser } from "@/lib/useCurrentUser";

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
  pending_manager: { label: "Chờ duyệt", cls: "bg-red-50 text-red-600 border-red-200" },
  pending_hcns: { label: "Đã phê duyệt", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Điều phối Hành chính", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Từ chối", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

// Màu khối trên timeline theo đúng 3 trạng thái (đỏ -> xanh dương -> xanh lá)
const TIMELINE_STATUS_COLOR: Record<string, string> = {
  pending_manager: "bg-red-500",
  pending_hcns: "bg-blue-500",
  approved: "bg-emerald-500",
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

// ━━━ Lịch timeline theo ngày (dạng lịch phòng họp cổ điển: hàng = xe/phòng, cột = giờ) ━━━
const TIMELINE_START_HOUR = 6; // 06:00
const TIMELINE_END_HOUR = 22; // 22:00 (không bao gồm)
const TIMELINE_HOURS = Array.from({ length: TIMELINE_END_HOUR - TIMELINE_START_HOUR }, (_, i) => TIMELINE_START_HOUR + i);

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function formatDateVi(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

function BookingContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const bookingType: BookingType = tabParam === "xe" ? "xe" : "phong_hop";
  const isVehicle = bookingType === "xe";
  const resources = isVehicle ? VEHICLES : ROOMS;

  // email: email đăng nhập Google (nhận diện người dùng); contactEmail: email trong hồ sơ
  // nhân viên (thường gồm email công ty, cách nhau dấu phẩy) — dùng để nhận mail kết quả.
  // role/isAdmin dùng để xác định quyền Trưởng bộ phận / Hành chính (HCNS) trong modal duyệt nhanh.
  // Danh tính người dùng — hook chung (email đăng nhập, contactEmail = email danh bạ
  // để nhận mail kết quả, role/isAdmin cho quyền duyệt nhanh, perms cho HCNS).
  const user = useCurrentUser();
  const currentUser = user.authenticated ? user : null;
  const approvalPerms = user.perms;
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Modal chi tiết đăng ký (mở khi click vào khối trên timeline) — duyệt nhanh không cần vào tab "Duyệt yêu cầu"
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const [modalResourceName, setModalResourceName] = useState("");
  const [processingAction, setProcessingAction] = useState(false);

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

  // Lịch timeline theo ngày
  const [viewDate, setViewDate] = useState<string>(() => toDateKey(new Date()));
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const isViewingToday = viewDate === todayKey;

  const shiftViewDate = (deltaDays: number) => {
    const d = new Date(`${viewDate}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    setViewDate(toDateKey(d));
  };

  // Reset resource when switching tab
  useEffect(() => {
    setResourceName(isVehicle ? VEHICLES[0] : ROOMS[0]);
  }, [bookingType, isVehicle]);

  // Điền sẵn người chủ trì + phòng ban theo danh tính (hook) khi đã tải xong.
  useEffect(() => {
    if (!currentUser) return;
    setDepartment((prev) => prev || currentUser.department);
    setHostName((prev) => prev || currentUser.name);
  }, [currentUser]);

  useEffect(() => {
    const init = async () => {
      try {
        const { data: empList } = await supabase
          .from("employees_directory")
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

  // Mở thẳng popup chi tiết khi đến từ link trong email (?bookingId=...) — không bắt người
  // duyệt phải tự tìm trên timeline. Chỉ tự mở 1 lần cho mỗi id để không bật lại sau khi đóng.
  const autoOpenedBookingId = useRef<string | null>(null);
  useEffect(() => {
    const bookingId = searchParams.get("bookingId");
    if (!bookingId || bookings.length === 0 || autoOpenedBookingId.current === bookingId) return;
    const target = bookings.find((b) => b.id === bookingId);
    if (target) {
      autoOpenedBookingId.current = bookingId;
      setViewDate(toDateKey(new Date(target.start_time)));
      openBookingModal(target);
    }
  }, [bookings, searchParams]);

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

      const { data: inserted, error } = await supabase
        .from("resource_bookings")
        .insert([
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
        ])
        .select();
      if (error) throw error;

      // Gửi email báo người duyệt cấp 1 (Trưởng phòng cùng phòng ban; thành viên nhóm
      // duyệt riêng trong bảng approval_groups — VD tổ Marketing — thì báo tổ trưởng nhóm).
      // Chạy nền, lỗi không chặn việc gửi đăng ký.
      try {
        let approverEmails = "";
        const groupLeaderName = getGroupLeaderNameForMember(currentUser.name);
        if (groupLeaderName) {
          approverEmails = employees
            .filter((e) => e.name.trim().toLowerCase() === groupLeaderName.trim().toLowerCase())
            .map((e) => e.email)
            .filter(Boolean)
            .join(", ");
        } else {
          // Chưa xếp tổ -> Trưởng/Phó phòng cùng đơn vị. Dùng chung
          // isDepartmentManagerRole() với bộ lọc trên giao diện để người nhận
          // mail đúng là người bấm duyệt được (trước đây là 2 danh sách chức
          // danh chép tay, lệch nhau ở Kế toán trưởng/Chỉ huy trưởng).
          approverEmails = employees
            .filter((e) => e.department === department && !!e.email && isDepartmentManagerRole(e.role))
            .map((e) => e.email)
            .join(", ");
        }

        if (approverEmails && inserted && inserted[0]) {
          apiFetch("/api/send-booking-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "notify_approver",
              stage: "manager",
              smtpConfig: {
                user: localStorage.getItem("tnec_cb_smtp_user") || "",
                pass: localStorage.getItem("tnec_cb_smtp_pass") || "",
                host: localStorage.getItem("tnec_cb_smtp_host") || "smtp.gmail.com",
                port: Number(localStorage.getItem("tnec_cb_smtp_port")) || 465,
                secure: localStorage.getItem("tnec_cb_smtp_secure") !== "false",
              },
              booking: inserted[0],
              approverEmails,
              siteUrl: window.location.origin,
            }),
          }).catch((e) => console.warn("Không gửi được email báo người duyệt cấp 1:", e));
        }
      } catch (notifyErr) {
        console.warn("Bỏ qua lỗi gửi email báo duyệt cấp 1:", notifyErr);
      }

      showToast("success", "Đã gửi đăng ký thành công! Yêu cầu đang chờ Trưởng phòng phê duyệt.");
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

  // Đọc SMTP dùng chung (giống trang Cài đặt hệ thống / C&B) từ localStorage
  const readSmtpConfig = () => ({
    user: localStorage.getItem("tnec_cb_smtp_user") || "",
    pass: localStorage.getItem("tnec_cb_smtp_pass") || "",
    host: localStorage.getItem("tnec_cb_smtp_host") || "smtp.gmail.com",
    port: Number(localStorage.getItem("tnec_cb_smtp_port")) || 465,
    secure: localStorage.getItem("tnec_cb_smtp_secure") !== "false",
  });

  // Admin: cờ isAdmin (bảng allowed_users) HOẶC role hiển thị là "Admin" (bảng employees) —
  // đúng quy ước đã dùng ở Header.tsx/settings/page.tsx, tránh bỏ sót tài khoản Admin nội bộ.
  const isUserAdmin = !!currentUser && (currentUser.isAdmin || (currentUser.role || "").toLowerCase() === "admin");

  // Người duyệt cấp 1 của ĐÚNG đơn này: tổ trưởng của tổ người đăng ký, hoặc
  // Trưởng/Phó phòng cùng đơn vị khi người đăng ký chưa xếp tổ, hoặc Admin.
  // VẪN GIỮ quyền Từ chối/Xoá lịch ngay cả sau khi đã chuyển sang "Đã phê duyệt".
  const isDeptManagerFor = (b: BookingRow) => {
    if (!currentUser) return false;
    return isBookingCap1Approver({
      currentUserName: currentUser.name,
      currentUserRole: currentUser.role,
      currentUserIsAdmin: isUserAdmin,
      currentUserDepartment: currentUser.department,
      requesterName: b.requester_name,
      requesterDepartment: b.department,
    });
  };

  // Hành chính (HCNS) điều phối xe/phòng cụ thể — chỉ thao tác được khi đã "Đã phê duyệt"
  const isHcnsApproverUser = !!currentUser && (isUserAdmin || approvalPerms.canApproveBooking);

  const canActOn = (b: BookingRow) => isDeptManagerFor(b) || isHcnsApproverUser;

  const openBookingModal = (b: BookingRow) => {
    setSelectedBooking(b);
    setModalResourceName(b.resource_name);
  };

  const closeBookingModal = () => {
    setSelectedBooking(null);
    setModalResourceName("");
  };

  // Trưởng bộ phận phê duyệt cấp 1: Chờ duyệt -> Đã phê duyệt + báo email cho Hành chính (HCNS)
  const handleManagerApprove = async (b: BookingRow) => {
    if (!currentUser || processingAction) return;
    try {
      setProcessingAction(true);
      const { error } = await supabase
        .from("resource_bookings")
        .update({
          status: "pending_hcns",
          resource_name: modalResourceName || b.resource_name,
          manager_approved_by: currentUser.name,
          manager_approved_at: new Date().toISOString(),
        })
        .eq("id", b.id);
      if (error) throw error;

      showToast("success", "Đã phê duyệt! Yêu cầu chuyển sang phòng HCNS xác nhận & điều phối.");
      closeBookingModal();
      fetchBookings();

      // Tra cứu người duyệt + gửi mail đều chạy nền, không giữ popup lại
      void (async () => {
        try {
          const { data: perms } = await supabase
            .from("approval_permissions")
            .select("email, can_approve_booking");
          const approverEmails = (perms || [])
            .filter((p: any) => p.can_approve_booking && p.email)
            .map((p: any) => p.email)
            .join(", ");
          if (!approverEmails) return;
          sendBookingEmailInBackground(
            {
              mode: "notify_approver",
              stage: "final",
              smtpConfig: readSmtpConfig(),
              booking: { ...b, resource_name: modalResourceName || b.resource_name, manager_approved_by: currentUser.name },
              approverEmails,
              siteUrl: window.location.origin,
            },
            "Chưa gửi được email báo Hành chính"
          );
        } catch (mailErr: any) {
          showToast("error", `Chưa gửi được email báo Hành chính: ${mailErr.message || "lỗi kết nối"}`);
        }
      })();
    } catch (err: any) {
      console.error("Error manager-approving booking:", err);
      showToast("error", "Lỗi khi phê duyệt đăng ký!");
    } finally {
      setProcessingAction(false);
    }
  };

  // Hành chính (HCNS) điều phối cuối: Đã phê duyệt -> Điều phối Hành chính (approved) + báo email kết quả cho người đăng ký
  const handleHcnsDispatch = async (b: BookingRow) => {
    if (!currentUser || processingAction) return;
    try {
      setProcessingAction(true);
      const finalResource = modalResourceName || b.resource_name;
      const { error } = await supabase
        .from("resource_bookings")
        .update({
          status: "approved",
          resource_name: finalResource,
          final_decision_by: currentUser.name,
          final_decision_at: new Date().toISOString(),
          reject_reason: null,
        })
        .eq("id", b.id);
      if (error) throw error;

      showToast("success", `Đã điều phối ${finalResource} cho ${b.host_name}. Đang gửi email báo người đăng ký...`);
      closeBookingModal();
      fetchBookings();

      sendBookingEmailInBackground(
        {
          smtpConfig: readSmtpConfig(),
          booking: { ...b, resource_name: finalResource },
          decision: "approved",
          rejectReason: "",
          approverName: currentUser.name,
        },
        "Chưa gửi được email kết quả",
        // Chỉ đánh dấu email_sent khi mail thật sự gửi được
        () => { void supabase.from("resource_bookings").update({ email_sent: true }).eq("id", b.id); }
      );
    } catch (err: any) {
      console.error("Error dispatching booking:", err);
      showToast("error", "Lỗi khi điều phối đăng ký!");
    } finally {
      setProcessingAction(false);
    }
  };

  // Gửi email KHÔNG chặn giao diện.
  // Trước đây mỗi nút duyệt/từ chối đều `await` lời gọi này, mà bắt tay SMTP với
  // Gmail mất vài giây -> popup đứng im, người dùng tưởng bấm hụt rồi bấm lại.
  // Nay: ghi DB xong là đóng popup ngay, email chạy nền; chỉ báo thêm khi LỖI.
  const sendBookingEmailInBackground = (payload: any, failPrefix: string, onSent?: () => void) => {
    void (async () => {
      try {
        const res = await apiFetch("/api/send-booking-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (res.ok) {
          onSent?.();
        } else {
          showToast("error", `${failPrefix}: ${result.error}`);
        }
      } catch (mailErr: any) {
        showToast("error", `${failPrefix}: ${mailErr.message || "lỗi kết nối"}`);
      }
    })();
  };

  // Từ chối — dùng chung cho cả Trưởng bộ phận (ở mọi giai đoạn) và Hành chính
  const handleRejectBooking = async (b: BookingRow) => {
    if (!currentUser || processingAction) return;
    const rejectReason = window.prompt("Nhập lý do từ chối (sẽ được gửi trong email cho người đăng ký):") || "";
    if (!rejectReason.trim()) {
      showToast("error", "Vui lòng nhập lý do từ chối để người đăng ký nắm thông tin.");
      return;
    }
    try {
      setProcessingAction(true);
      const { error } = await supabase
        .from("resource_bookings")
        .update({
          status: "rejected",
          final_decision_by: currentUser.name,
          final_decision_at: new Date().toISOString(),
          reject_reason: rejectReason.trim(),
        })
        .eq("id", b.id);
      if (error) throw error;

      showToast("success", `Đã từ chối đăng ký của ${b.host_name}. Đang gửi email báo người đăng ký...`);
      closeBookingModal();
      fetchBookings();

      sendBookingEmailInBackground(
        {
          smtpConfig: readSmtpConfig(),
          booking: b,
          decision: "rejected",
          rejectReason: rejectReason.trim(),
          approverName: currentUser.name,
        },
        "Chưa gửi được email kết quả"
      );
    } catch (err: any) {
      console.error("Error rejecting booking:", err);
      showToast("error", "Lỗi khi từ chối đăng ký!");
    } finally {
      setProcessingAction(false);
    }
  };

  // Xoá hẳn lịch book (dùng khi lỡ book nhầm) — Trưởng bộ phận và Hành chính đều có quyền, mọi trạng thái
  // Vẫn báo email cho người đăng ký như khi Từ chối/Phê duyệt, để họ biết lịch không còn hiệu lực.
  const handleDeleteFromModal = async (b: BookingRow) => {
    if (!currentUser || processingAction) return;
    if (!window.confirm(`Xoá hẳn lịch book "${b.host_name}" (${b.resource_name})? Hành động này không thể hoàn tác.`)) return;
    const defaultNote = `${isVehicle ? "Xe" : "Phòng họp"} ưu tiên Ban lãnh đạo`;
    const note = window.prompt("Ghi chú lý do xoá (sẽ gửi kèm email báo cho người đăng ký):", defaultNote) || "";
    try {
      setProcessingAction(true);
      const { error } = await supabase.from("resource_bookings").delete().eq("id", b.id);
      if (error) throw error;

      showToast("success", "Đã xoá lịch book. Đang gửi email báo người đăng ký...");
      closeBookingModal();
      fetchBookings();

      sendBookingEmailInBackground(
        {
          smtpConfig: readSmtpConfig(),
          booking: b,
          decision: "deleted",
          rejectReason: note.trim(),
          approverName: currentUser.name,
        },
        "Chưa gửi được email báo xoá lịch"
      );
    } catch (err: any) {
      console.error("Error deleting booking from modal:", err);
      showToast("error", "Lỗi khi xoá lịch book!");
    } finally {
      setProcessingAction(false);
    }
  };

  const myBookings = useMemo(() => {
    if (!currentUser) return [];
    // Admin và người được cấp cờ "Duyệt đăng ký xe / phòng họp" xem FULL danh sách
    // đăng ký, không giới hạn ở đăng ký của chính mình.
    if (isHcnsApproverUser) return bookings.filter((b) => b.booking_type === bookingType);
    const loginEmail = currentUser.email.toLowerCase();
    // requester_email có thể là chuỗi nhiều email (hồ sơ nhân viên) nên so bằng includes
    return bookings.filter(
      (b) =>
        b.booking_type === bookingType &&
        ((b.requester_email || "").toLowerCase().includes(loginEmail) || b.requester_name === currentUser.name)
    );
  }, [bookings, bookingType, currentUser, isHcnsApproverUser]);

  const upcomingBookings = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((b) => b.booking_type === bookingType && b.status !== "rejected" && new Date(b.end_time).getTime() >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 12);
  }, [bookings, bookingType]);

  // Đăng ký trùng ngày đang xem trên timeline (bao gồm cả booking nhiều ngày đè qua ngày này)
  const timelineBookings = useMemo(() => {
    const dayStart = new Date(`${viewDate}T00:00:00`);
    const dayEnd = new Date(`${viewDate}T23:59:59`);
    return bookings.filter(
      (b) =>
        b.booking_type === bookingType &&
        b.status !== "rejected" &&
        new Date(b.start_time) <= dayEnd &&
        new Date(b.end_time) >= dayStart
    );
  }, [bookings, bookingType, viewDate]);

  const timelineWindowStartMin = TIMELINE_START_HOUR * 60;
  const timelineWindowEndMin = TIMELINE_END_HOUR * 60;
  const timelineTotalMin = timelineWindowEndMin - timelineWindowStartMin;

  const getTimelineBlockStyle = (b: BookingRow) => {
    const dayStart = new Date(`${viewDate}T00:00:00`).getTime();
    const startMinRaw = Math.round((new Date(b.start_time).getTime() - dayStart) / 60000);
    const endMinRaw = Math.round((new Date(b.end_time).getTime() - dayStart) / 60000);
    const startMin = clamp(startMinRaw, timelineWindowStartMin, timelineWindowEndMin);
    let endMin = clamp(endMinRaw, timelineWindowStartMin, timelineWindowEndMin);
    if (endMin <= startMin) endMin = Math.min(startMin + 20, timelineWindowEndMin);
    const leftPct = ((startMin - timelineWindowStartMin) / timelineTotalMin) * 100;
    const widthPct = ((endMin - startMin) / timelineTotalMin) * 100;
    return { left: `${leftPct}%`, width: `${widthPct}%` };
  };

  const nowLinePct = useMemo(() => {
    if (!isViewingToday) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < timelineWindowStartMin || nowMin > timelineWindowEndMin) return null;
    return ((nowMin - timelineWindowStartMin) / timelineTotalMin) * 100;
  }, [isViewingToday, timelineWindowStartMin, timelineTotalMin, timelineWindowEndMin]);

  const TabIcon = isVehicle ? CarFront : DoorOpen;

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header
          title={isVehicle ? "Đăng ký xe" : "Đăng ký phòng họp"}
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

          {/* Modal chi tiết đăng ký — duyệt nhanh ngay tại lịch, không cần vào tab "Duyệt yêu cầu" */}
          {selectedBooking && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
              onClick={closeBookingModal}
            >
              <div
                className="bg-white w-full max-w-lg rounded-2xl shadow-premium overflow-hidden animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-[#005BAC] text-white px-6 py-4 flex items-center justify-between gap-3 shrink-0">
                  <h3 className="font-heading font-bold text-sm flex items-center gap-2">
                    <TabIcon size={16} />
                    Chi tiết đăng ký {isVehicle ? "xe" : "phòng họp"}
                  </h3>
                  <button type="button" onClick={closeBookingModal} className="text-white/80 hover:text-white cursor-pointer">
                    <X size={18} />
                  </button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-block px-2.5 py-1 rounded-full border text-[9px] font-extrabold uppercase ${STATUS_META[selectedBooking.status]?.cls || ""}`}>
                      {STATUS_META[selectedBooking.status]?.label || selectedBooking.status}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">Gửi lúc {formatDateTime(selectedBooking.created_at)}</span>
                  </div>

                  {/* Bộ lọc xe/phòng — đổi nhanh sang xe/phòng khác trước khi phê duyệt/điều phối */}
                  <div className="space-y-1">
                    <label className="text-slate-500 font-bold flex items-center gap-1.5">
                      <TabIcon size={12} /> {isVehicle ? "Xe" : "Phòng họp"}
                    </label>
                    {canActOn(selectedBooking) && selectedBooking.status !== "rejected" ? (
                      <select
                        value={modalResourceName}
                        onChange={(e) => setModalResourceName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer bg-white font-bold text-slate-700"
                      >
                        {resources.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="font-bold text-slate-700">{selectedBooking.resource_name}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-slate-400 font-bold">Người chủ trì</p>
                      <p className="font-bold text-slate-700">{selectedBooking.host_name}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-bold">Phòng ban</p>
                      <p className="font-bold text-slate-700">{selectedBooking.department}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-slate-400 font-bold">Thời gian</p>
                      <p className="font-bold text-slate-700 font-mono">
                        {formatDateTime(selectedBooking.start_time)} ➔ {formatDateTime(selectedBooking.end_time)}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-slate-400 font-bold">{isVehicle ? "Mục đích / lộ trình" : "Nội dung cuộc họp"}</p>
                      <p className="font-semibold text-slate-600">{selectedBooking.content}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-bold">Số người tham dự</p>
                      <p className="font-bold text-slate-700">{selectedBooking.attendee_count}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-bold">Thành phần</p>
                      <p className="font-semibold text-slate-600">{selectedBooking.participant_type === "khach_hang" ? "Có khách bên ngoài" : "Nội bộ công ty"}</p>
                    </div>
                    {selectedBooking.attendees && selectedBooking.attendees.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-slate-400 font-bold">Nhân viên tham dự</p>
                        <p className="font-semibold text-slate-600">{selectedBooking.attendees.join(", ")}</p>
                      </div>
                    )}
                    {selectedBooking.customer_info && (
                      <div className="col-span-2">
                        <p className="text-slate-400 font-bold">Thông tin khách hàng</p>
                        <p className="font-semibold text-slate-600">{selectedBooking.customer_info}</p>
                      </div>
                    )}
                    {selectedBooking.notes && (
                      <div className="col-span-2">
                        <p className="text-slate-400 font-bold">Ghi chú</p>
                        <p className="font-semibold text-slate-600">{selectedBooking.notes}</p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <p className="text-slate-400 font-bold">Người đăng ký</p>
                      <p className="font-semibold text-slate-600">{selectedBooking.requester_name}</p>
                    </div>
                    {selectedBooking.manager_approved_by && (
                      <div className="col-span-2">
                        <p className="text-slate-400 font-bold">Trưởng bộ phận đã phê duyệt</p>
                        <p className="font-semibold text-emerald-600">{selectedBooking.manager_approved_by}</p>
                      </div>
                    )}
                    {selectedBooking.status === "rejected" && selectedBooking.reject_reason && (
                      <div className="col-span-2">
                        <p className="text-slate-400 font-bold">Lý do từ chối</p>
                        <p className="font-semibold text-rose-600">{selectedBooking.reject_reason}</p>
                      </div>
                    )}
                  </div>

                  {!canActOn(selectedBooking) && (
                    <p className="text-[10px] text-slate-400 italic pt-2 border-t border-slate-100">
                      Bạn chỉ có thể xem — chỉ Trưởng bộ phận ({selectedBooking.department}) hoặc Hành chính mới thao tác được đăng ký này.
                    </p>
                  )}
                </div>

                {/* Nút hành động */}
                <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 flex-wrap bg-slate-50/60 shrink-0">
                  {(isDeptManagerFor(selectedBooking) || isHcnsApproverUser) && selectedBooking.status !== "rejected" && (
                    <button
                      type="button"
                      disabled={processingAction}
                      onClick={() => handleDeleteFromModal(selectedBooking)}
                      className="inline-flex items-center gap-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-bold px-3.5 py-2 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 size={13} /> Xoá lịch (book nhầm)
                    </button>
                  )}

                  {isDeptManagerFor(selectedBooking) && (selectedBooking.status === "pending_manager" || selectedBooking.status === "pending_hcns") && (
                    <button
                      type="button"
                      disabled={processingAction}
                      onClick={() => handleRejectBooking(selectedBooking)}
                      className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[11px] font-bold px-3.5 py-2 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle size={13} /> Từ chối
                    </button>
                  )}

                  {isDeptManagerFor(selectedBooking) && selectedBooking.status === "pending_manager" && (
                    <button
                      type="button"
                      disabled={processingAction}
                      onClick={() => handleManagerApprove(selectedBooking)}
                      className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-3.5 py-2 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      <CheckCircle2 size={13} /> Phê duyệt
                    </button>
                  )}

                  {isHcnsApproverUser && selectedBooking.status === "pending_hcns" && (
                    <button
                      type="button"
                      disabled={processingAction}
                      onClick={() => handleHcnsDispatch(selectedBooking)}
                      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3.5 py-2 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      <ShieldCheck size={13} /> Điều phối
                    </button>
                  )}
                </div>
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

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-4 flex-wrap">
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

          {/* Lịch timeline trực quan theo ngày: hàng = xe/phòng, cột = giờ, màu theo trạng thái */}
          <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
                <CalendarDays size={16} className="text-blue-600" />
                Lịch {isVehicle ? "xe" : "phòng họp"} theo ngày
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftViewDate(-1)}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
                  title="Ngày trước"
                >
                  <ChevronLeft size={14} />
                </button>
                <input
                  type="date"
                  value={viewDate}
                  onChange={(e) => e.target.value && setViewDate(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg outline-none text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                />
                <button
                  type="button"
                  onClick={() => shiftViewDate(1)}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
                  title="Ngày sau"
                >
                  <ChevronRight size={14} />
                </button>
                {!isViewingToday && (
                  <button
                    type="button"
                    onClick={() => setViewDate(todayKey)}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-[#005BAC] border border-blue-200 text-[10px] font-bold hover:bg-blue-100 transition-all active:scale-95 cursor-pointer"
                  >
                    Hôm nay
                  </button>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-semibold capitalize">{formatDateVi(viewDate)}</p>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500 inline-block shrink-0" /> Chờ duyệt</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500 inline-block shrink-0" /> Đã phê duyệt</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500 inline-block shrink-0" /> Điều phối Hành chính</span>
              <span className="text-[9px] font-semibold text-slate-400 normal-case">— Bấm vào khối lịch để xem chi tiết & duyệt nhanh</span>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                {/* Hàng giờ (header) */}
                <div className="flex pl-32">
                  {TIMELINE_HOURS.map((h) => (
                    <div key={h} className="flex-1 text-[10px] font-bold text-slate-400 border-l border-slate-100 pl-1.5 pb-1">
                      {String(h).padStart(2, "0")}h
                    </div>
                  ))}
                </div>

                {/* Các hàng xe / phòng họp */}
                <div className="space-y-2">
                  {resources.map((res) => {
                    const rowBookings = timelineBookings.filter((b) => b.resource_name === res);
                    return (
                      <div key={res} className="flex items-center gap-2">
                        <div className="w-32 shrink-0 text-xs font-bold text-slate-700 truncate pr-2" title={res}>
                          {res}
                        </div>
                        <div className="relative flex-1 h-11 bg-slate-50 rounded-lg border border-slate-100 overflow-hidden">
                          {/* Đường kẻ dọc mỗi giờ */}
                          <div className="absolute inset-0 flex pointer-events-none">
                            {TIMELINE_HOURS.map((h, i) => (
                              <div key={h} className={`flex-1 ${i !== 0 ? "border-l border-slate-150" : ""}`} />
                            ))}
                          </div>

                          {/* Vạch giờ hiện tại */}
                          {nowLinePct !== null && (
                            <div
                              className="absolute top-0 bottom-0 w-[2px] bg-rose-400 z-20"
                              style={{ left: `${nowLinePct}%` }}
                              title="Giờ hiện tại"
                            />
                          )}

                          {/* Khối đăng ký — bấm để mở modal chi tiết & duyệt nhanh, không cần vào tab "Duyệt yêu cầu" */}
                          {rowBookings.map((b) => (
                            <button
                              type="button"
                              key={b.id}
                              onClick={() => openBookingModal(b)}
                              title={`${b.host_name} • ${formatDateTime(b.start_time)} ➔ ${formatDateTime(b.end_time)} • ${b.content} • ${STATUS_META[b.status]?.label || b.status} (bấm để xem chi tiết)`}
                              className={`absolute top-1 bottom-1 rounded-md px-2 flex items-center text-[10px] font-bold text-white truncate shadow-sm cursor-pointer z-10 hover:brightness-95 active:scale-[0.98] transition-all ${
                                TIMELINE_STATUS_COLOR[b.status] || "bg-slate-400"
                              }`}
                              style={getTimelineBlockStyle(b)}
                            >
                              {b.host_name}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
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
              {isHcnsApproverUser ? `Toàn bộ đăng ký ${isVehicle ? "xe" : "phòng họp"}` : "Đăng ký của tôi"}
            </h2>
            {loadingList ? (
              <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-semibold gap-2">
                <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                Đang tải danh sách đăng ký...
              </div>
            ) : myBookings.length === 0 ? (
              <p className="text-center text-slate-400 text-xs italic py-6">
                {isHcnsApproverUser
                  ? `Chưa có đăng ký ${isVehicle ? "xe" : "phòng họp"} nào.`
                  : `Bạn chưa có đăng ký ${isVehicle ? "xe" : "phòng họp"} nào.`}
              </p>
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
                        {/* Căn trái cho thẳng lề với tiêu đề cột (cả bảng là text-left) */}
                        <td className="py-3 px-4">{b.attendee_count}</td>
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
                        {/* Xoá đăng ký: CHỈ Admin và người có cờ "Duyệt đăng ký xe /
                            phòng họp". Tài khoản thường chỉ xem, không xoá được dòng
                            nào — kể cả đăng ký do chính họ tạo. */}
                        <td className="py-3 px-4 text-center">
                          {isHcnsApproverUser ? (
                            <button
                              type="button"
                              onClick={() => handleCancelBooking(b.id)}
                              className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer"
                            >
                              <Trash2 size={11} /> Xoá
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
