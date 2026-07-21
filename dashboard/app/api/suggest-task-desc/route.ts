import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";

export const maxDuration = 60; // Allow enough time for AI response

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const { title } = await req.json();
    if (!title) {
      return NextResponse.json({ error: "Tên công việc là bắt buộc" }, { status: 400 });
    }

    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ 
        error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng nhập trong mục Cài đặt hệ thống." 
      }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });
    const tenantCfg = await getTenantConfigServer();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Bạn là một trợ lý AI quản lý công việc Hành chính Nhân sự tại ${tenantCfg.company_name}. Hãy viết bản mô tả công việc (khoảng 3-5 gạch đầu dòng chi tiết và thực tế) cho tên công việc được cung cấp. Ngôn ngữ tiếng Việt, ngắn gọn, chuyên nghiệp.`
        },
        {
          role: "user",
          content: `Hãy viết mô tả công việc cho nhiệm vụ: "${title}".`
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const description = completion.choices[0]?.message?.content || "";
    return NextResponse.json({ description });
  } catch (err: any) {
    console.error("Error generating task description:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi gọi OpenAI API" }, { status: 500 });
  }
}
