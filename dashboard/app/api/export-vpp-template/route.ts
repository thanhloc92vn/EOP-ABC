import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { targetName, type, receiverName, items = [] } = data;

    if (!targetName) {
      return new NextResponse("Missing targetName", { status: 400 });
    }

    // 1. Path to template
    const templateFileName = "phieu_cap_phat_vpp.docx";
    const templatePath = path.join(process.cwd(), "public", "templates", templateFileName);

    if (!fs.existsSync(templatePath)) {
      return new NextResponse(
        JSON.stringify({ error: "template_not_found", fileName: templateFileName }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use OS temp directory for writing temporary files
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const tempJsonPath = path.join(tempDir, `vpp_data_${timestamp}.json`);
    const tempDocxPath = path.join(tempDir, `vpp_output_${timestamp}.docx`);

    // Write JSON data to temp file
    fs.writeFileSync(tempJsonPath, JSON.stringify(data, null, 2), "utf-8");

    // 2. Execute Python script to fill the docx template (script is read-only from project folder)
    const scriptPath = path.join(process.cwd(), "scratch", "fill_docx.py");
    const pythonCmd = `python "${scriptPath}" "${tempJsonPath}" "${tempDocxPath}"`;
    
    await execAsync(pythonCmd);

    if (!fs.existsSync(tempDocxPath)) {
      throw new Error("Python script failed to generate output docx file.");
    }

    // 3. Read output file buffer
    const buffer = fs.readFileSync(tempDocxPath);

    // Clean up temp files
    try {
      fs.unlinkSync(tempJsonPath);
      fs.unlinkSync(tempDocxPath);
    } catch (cleanupError) {
      console.error("Temp file cleanup error:", cleanupError);
    }

    // 4. Return document response
    const outputFilename = `Phieu_Cap_Phat_VPP_${targetName.replace(/\s+/g, "_")}.docx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(outputFilename)}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });

  } catch (error: any) {
    console.error("Export Word VPP error:", error);
    return new NextResponse(`Error exporting Word: ${error.message || error}`, { status: 500 });
  }
}
