export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    // OpenAI SDK errors มี .message และอาจมี .body เป็น HTML
    const e = err as Record<string, unknown>;
    const msg = typeof e["message"] === "string" ? e["message"] : "";
    const body = typeof e["body"] === "string" ? e["body"] : "";
    return body ? `${msg} ${body}`.trim() : msg || String(err);
  }
  return String(err);
}

export function cleanErrorMessage(raw: string): string {
  if (
    raw.includes("<!DOCTYPE") ||
    raw.includes("<html") ||
    raw.includes("524") ||
    raw.includes("timeout occurred") ||
    raw.includes("Request timed out") ||
    raw.includes("timed out")
  ) {
    return "AI service timeout — ไฟล์อาจใหญ่เกินไปหรือ server ยุ่ง กรุณาลองใหม่ด้วยไฟล์ที่เล็กกว่า";
  }
  if (raw.includes("ECONNREFUSED")) {
    return "ไม่สามารถเชื่อมต่อ AI service ได้ กรุณาตรวจสอบ LITELLM_BASE_URL";
  }
  if (raw.includes("Connection error")) {
    return "AI service ตัด connection กลางคัน — ไฟล์อาจใหญ่เกินไปสำหรับ LiteLLM proxy กรุณาลองใหม่ด้วยไฟล์ที่เล็กกว่า หรือเปิดใช้ DEEPGRAM_API_KEY";
  }
  // Safety net: ตัดข้อความยาวเกิน (เช่น HTML ที่ไม่ถูก detect ด้านบน)
  return raw.split("\n")[0].slice(0, 200);
}
