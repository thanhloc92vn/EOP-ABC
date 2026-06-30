import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export const maxDuration = 60; // Allow enough time for AI response

const SALARY_KEYWORDS = [
  "lương", "salary", "thu nhập", "thu nhap", "income", 
  "phụ cấp", "phu cap", "allowance", "bảo hiểm", "bao hiem", 
  "insurance", "bonus", "thưởng", "thuong", "tiền lương", "tien luong"
];

export async function POST(req: NextRequest) {
  try {
    const { query, history, currentUser } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Câu hỏi tìm kiếm là bắt buộc" }, { status: 400 });
    }

    if (!currentUser) {
      return NextResponse.json({ error: "Không tìm thấy thông tin tài khoản người dùng" }, { status: 401 });
    }

    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ 
        error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng nhập trong mục Cài đặt hệ thống." 
      }, { status: 500 });
    }

    // Initialize authenticated Supabase client for RLS
    const supabaseToken = req.headers.get("x-supabase-auth");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    const dbClient = (supabaseToken && supabaseUrl && supabaseAnonKey)
      ? createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${supabaseToken}`
            }
          }
        })
      : supabase;

    // 1. Check permissions
    const isAdmin = currentUser.isAdmin || currentUser.role?.toLowerCase() === "admin";
    const isHRManager = (currentUser.role?.toLowerCase()?.includes("trưởng phòng") || currentUser.role?.toLowerCase()?.includes("truong phong")) && 
                        (currentUser.department?.toLowerCase()?.includes("hành chính") || currentUser.department?.toLowerCase()?.includes("hcns"));
    const hasSalaryAccess = isAdmin || isHRManager;

    const lowercaseQuery = query.toLowerCase();
    const isSalaryQuery = SALARY_KEYWORDS.some(kw => lowercaseQuery.includes(kw));

    // 2. Reject salary query for unauthorized users immediately
    if (isSalaryQuery && !hasSalaryAccess) {
      return NextResponse.json({
        answer: "🔒 **Bảo mật tuyệt đối:** Bạn không có quyền truy cập hoặc tìm kiếm thông tin liên quan đến lương, thưởng và thu nhập cá nhân. Chỉ có Trưởng phòng HCNS và Admin mới được cấp quyền này."
      });
    }

    // 3. Query internal database to build context
    // Query Employees table (Visible to anyone who is logged in, but we exclude cccd for safety if not HR/Admin)
    const employeeFields = hasSalaryAccess 
      ? "employee_code, name, department, role, gender, date_of_birth, phone, email, cccd, cccd_date, cccd_place, permanent_address, temporary_address, degree, status, notes"
      : "employee_code, name, department, role, gender, date_of_birth, phone, email, degree, status";
      
    const { data: dbEmployeesData } = await dbClient
      .from("employees")
      .select(employeeFields as any);
    const dbEmployees = dbEmployeesData as any[] | null;

    // Query Contracts table (Exclude salary columns completely for non-authorized users)
    const contractFields = hasSalaryAccess 
      ? "employee_code, employee_name, type, sign_date, expiration_date, base_salary_insurance, performance_bonus, allowances, total_income"
      : "employee_code, employee_name, type, sign_date, expiration_date";

    const { data: dbContractsData } = await dbClient
      .from("contracts")
      .select(contractFields as any);
    const dbContracts = dbContractsData as any[] | null;

    // Query Tasks (Limit to 50 for token saving)
    const { data: dbTasks } = await dbClient
      .from("tasks")
      .select("title, employee_name, status, due_date, description")
      .limit(50);

    // Query Attendance Justifications (Limit to 50)
    const { data: dbJustifications } = await dbClient
      .from("attendance_justifications")
      .select("employee_name, date, reason, status")
      .limit(50);

    // 4. Format context text
    let context = "";

    if (dbEmployees && dbEmployees.length > 0) {
      context += "=== DANH SÁCH NHÂN VIÊN ===\n";
      dbEmployees.forEach(emp => {
        context += `- Mã NV: ${emp.employee_code || "—"}, Tên: ${emp.name}, Phòng ban: ${emp.department || "—"}, Chức danh: ${emp.role || "—"}, Giới tính: ${emp.gender || "—"}, Ngày sinh: ${emp.date_of_birth || "—"}, ĐT: ${emp.phone || "—"}, Email: ${emp.email || "—"}, Học vấn: ${emp.degree || "—"}, Trạng thái: ${emp.status || "Chính thức"}`;
        if (hasSalaryAccess) {
          context += `, CCCD: ${emp.cccd || "—"} (Cấp ngày: ${emp.cccd_date || "—"}, tại: ${emp.cccd_place || "—"}), Thường trú: ${emp.permanent_address || "—"}, Tạm trú: ${emp.temporary_address || "—"}, Ghi chú: ${emp.notes || "—"}`;
        }
        context += "\n";
      });
      context += "\n";
    }

    if (dbContracts && dbContracts.length > 0) {
      context += "=== DANH SÁCH HỢP ĐỒNG LAO ĐỘNG ===\n";
      dbContracts.forEach(c => {
        context += `- Mã NV: ${c.employee_code || "—"}, Nhân viên: ${c.employee_name}, Loại HĐ: ${c.type || "—"}, Ngày ký: ${c.sign_date || "—"}, Ngày hết hạn: ${c.expiration_date || "—"}`;
        if (hasSalaryAccess) {
          context += `, Lương đóng BH: ${c.base_salary_insurance || 0} VND, Thưởng hiệu suất: ${c.performance_bonus || 0} VND, Phụ cấp: ${c.allowances || 0} VND, Tổng thu nhập: ${c.total_income || 0} VND`;
        }
        context += "\n";
      });
      context += "\n";
    }

    if (dbTasks && dbTasks.length > 0) {
      context += "=== DANH SÁCH CÔNG VIỆC ===\n";
      dbTasks.forEach(t => {
        context += `- Việc: ${t.title}, Giao cho: ${t.employee_name || "—"}, Trạng thái: ${t.status || "—"}, Hạn chót: ${t.due_date || "—"}, Mô tả: ${t.description || "—"}\n`;
      });
      context += "\n";
    }

    if (dbJustifications && dbJustifications.length > 0) {
      context += "=== DANH SÁCH GIẢI TRÌNH CHẤM CÔNG ===\n";
      dbJustifications.forEach(j => {
        context += `- Nhân viên: ${j.employee_name}, Ngày giải trình: ${j.date || "—"}, Lý do: ${j.reason || "—"}, Trạng thái: ${j.status || "—"}\n`;
      });
      context += "\n";
    }

    // 5. Call OpenAI API
    const openai = new OpenAI({ apiKey });
    
    const systemPrompt = `Bạn là Trợ lý Trí tuệ Nhân tạo chuyên nghiệp quản lý dữ liệu nội bộ của công ty Trung Nam E&C.
Nhiệm vụ của bạn là trả lời các câu hỏi tìm kiếm của nhân sự dựa trên dữ liệu hệ thống được cung cấp làm Ngữ cảnh bên dưới.

QUY TẮC BẢO MẬT & VẬN HÀNH QUAN TRỌNG:
1. **Chỉ dùng dữ liệu trong Ngữ cảnh**: Tuyệt đối KHÔNG sử dụng thông tin bên ngoài hệ thống. Nếu dữ liệu không có sẵn, hãy lịch sự trả lời: "Hệ thống không tìm thấy thông tin này trong cơ sở dữ liệu nội bộ."
2. **Không bịa đặt thông tin**: Luôn trả lời trung thực dựa trên các trường thông tin hiển thị trong ngữ cảnh.
3. **Phân quyền và bảo mật**:
   - Hiện tại tài khoản hỏi là: "${currentUser.name}" (Chức vụ: ${currentUser.role || "Chưa rõ"}, Phòng ban: ${currentUser.department || "Chưa rõ"}).
   - Quyền hạn truy cập Lương: ${hasSalaryAccess ? "ĐÃ CẤP QUYỀN (Admin/Trưởng phòng HCNS)" : "TỪ CHỐI (Nhân viên thông thường)"}.
   - Nếu bạn thấy trong câu hỏi có ý định dò hỏi mức lương hay thu nhập của nhân sự khác mà quyền truy cập là TỪ CHỐI, bạn phải từ chối trả lời ngay lập tức.
4. **Phong cách trả lời**: 
   - Giao tiếp thân thiện, thông minh, chuyên nghiệp như ChatGPT.
   - Luôn tóm tắt nội dung câu trả lời ở phần đầu.
   - Sử dụng định dạng Markdown sinh động (in đậm, danh sách gạch đầu dòng, bảng biểu HTML/Markdown) để làm nổi bật kết quả giúp người đọc dễ quan sát. Cố gắng sử dụng các bảng biểu khi liệt kê danh sách nhân sự hoặc thời hạn hợp đồng.`;

    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "system", content: `=== NGỮ CẢNH DỮ LIỆU NỘI BỘ ===\n${context}` }
    ];

    // Append history if available
    if (history && Array.isArray(history)) {
      history.forEach((msg: any) => {
        if (msg.role === "user" || msg.role === "assistant") {
          chatMessages.push({ role: msg.role, content: msg.content });
        }
      });
    }

    // Append user query
    chatMessages.push({ role: "user", content: query });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: chatMessages,
      temperature: 0.3,
      max_tokens: 1500
    });

    const answer = completion.choices[0]?.message?.content || "Không có phản hồi từ trợ lý AI.";
    
    return NextResponse.json({ answer });
  } catch (err: any) {
    console.error("Error in AI Search API:", err);
    return NextResponse.json({ error: err.message || "Lỗi xử lý tìm kiếm AI" }, { status: 500 });
  }
}
