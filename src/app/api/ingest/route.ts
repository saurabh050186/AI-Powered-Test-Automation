import { NextResponse } from "next/server";

// Polyfills for pdf-parse/pdf.js in Node.js environments
if (typeof global.DOMMatrix === 'undefined') {
  (global as any).DOMMatrix = class DOMMatrix {};
}
if (typeof (global as any).ImageData === 'undefined') {
  (global as any).ImageData = class ImageData {};
}
if (typeof (global as any).Path2D === 'undefined') {
  (global as any).Path2D = class Path2D {};
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  console.log("--- [DEBUG] Ingest API: POST Started ---");
  
  try {
    // 1. Parse FormData
    let formData;
    try {
      formData = await request.formData();
    } catch (err: any) {
      console.error("--- [ERROR] Failed to parse FormData:", err);
      return NextResponse.json({ error: "Failed to parse form data: " + err.message }, { status: 400 });
    }

    const file = formData.get("file") as File;
    if (!file) {
      console.error("--- [ERROR] No file found in FormData ---");
      return NextResponse.json({ error: "No file found in upload" }, { status: 400 });
    }

    console.log(`--- [DEBUG] Processing file: ${file.name} (${file.size} bytes) ---`);

    // 2. Convert to Buffer
    let buffer: Buffer;
    try {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } catch (err: any) {
      console.error("--- [ERROR] Failed to convert file to buffer:", err);
      return NextResponse.json({ error: "Failed to read file buffer: " + err.message }, { status: 500 });
    }

    let text = "";

    // 3. Extract Text
    try {
      if (file.name.toLowerCase().endsWith(".pdf")) {
        console.log("--- [DEBUG] Loading pdfreader library ---");
        const { PdfReader } = require("pdfreader");
        
        console.log("--- [DEBUG] Extracting PDF text (using pdfreader) ---");
        
        text = await new Promise((resolve, reject) => {
          let fullText = "";
          new PdfReader().parseBuffer(buffer, (err: any, item: any) => {
            if (err) {
              console.error("--- [ERROR] pdfreader error:", err);
              reject(err);
            } else if (!item) {
              // End of file
              resolve(fullText);
            } else if (item.text) {
              fullText += item.text + " ";
            }
          });
        });

        console.log(`--- [DEBUG] Extraction complete: ${text.length} characters ---`);
      } else if (file.name.toLowerCase().endsWith(".docx")) {
        console.log("--- [DEBUG] Loading mammoth library ---");
        const mammoth = require("mammoth");
        console.log("--- [DEBUG] Extracting DOCX text ---");
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else if (file.name.toLowerCase().endsWith(".txt") || file.name.toLowerCase().endsWith(".md")) {
        console.log("--- [DEBUG] Reading as plain text ---");
        text = buffer.toString("utf-8");
      } else {
        return NextResponse.json({ error: "Unsupported file type: " + file.name }, { status: 400 });
      }
    } catch (err: any) {
      console.error("--- [ERROR] Text extraction failed:", err);
      // Fallback: If pdf-parse fails, try a simple string match as a last resort for very broken PDFs
      return NextResponse.json({ error: "Failed to extract text from file: " + err.message }, { status: 500 });
    }

    if (!text && file.size > 0) {
      console.warn("--- [WARN] Text extraction returned empty string ---");
    }

    console.log("--- [DEBUG] Ingest API: Success ---");
    return NextResponse.json({ 
      fileName: file.name,
      text: text,
      message: "Success"
    });

  } catch (error: any) {
    console.error("--- [CRITICAL] Unexpected Ingest Error:", error);
    return NextResponse.json({ error: "Critical server error: " + error.message }, { status: 500 });
  }
}
