export function extractErrorMessage(err: unknown): string {
  console.log("extractErrorMessage", err);
  if (err instanceof AggregateError) {
    const nested = err.errors
      .map((item) => extractErrorMessage(item))
      .filter((message) => message.trim().length > 0)
      .join(" ");

    return nested || err.message || "Unknown error";
  }

  if (err instanceof Error) return err.message || err.name || "Unknown error";
  if (typeof err === "object" && err !== null) {
    // OpenAI SDK errors มี .message และอาจมี .body เป็น HTML
    const e = err as Record<string, unknown>;
    const msg = typeof e["message"] === "string" ? e["message"] : "";
    const body = typeof e["body"] === "string" ? e["body"] : "";

    if (Array.isArray(e["errors"])) {
      const nested = (e["errors"] as unknown[])
        .map((item) => extractErrorMessage(item))
        .filter((message) => message.trim().length > 0)
        .join(" ");

      if (nested) return nested;
    }

    return body ? `${msg} ${body}`.trim() : msg || String(err) || "Unknown error";
  }

  return String(err) || "Unknown error";
}

export function cleanErrorMessage(raw: string): string {
  const normalized = raw.trim();

  if (!normalized) {
    return "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ กรุณาลองใหม่อีกครั้ง";
  }

  if (
    normalized.includes("<!DOCTYPE") ||
    normalized.includes("<html") ||
    normalized.includes("524") ||
    normalized.includes("timeout occurred") ||
    normalized.includes("Request timed out") ||
    normalized.includes("timed out")
  ) {
    return "AI service timeout — ไฟล์อาจใหญ่เกินไปหรือ server ยุ่ง กรุณาลองใหม่ด้วยไฟล์ที่เล็กกว่า";
  }
  if (normalized.includes("ECONNREFUSED")) {
    return "ไม่สามารถเชื่อมต่อ AI service ได้ กรุณาตรวจสอบ LITELLM_BASE_URL";
  }
  if (normalized.includes("Connection error")) {
    return "AI service ตัด connection กลางคัน — ไฟล์อาจใหญ่เกินไปสำหรับ LiteLLM proxy กรุณาลองใหม่ด้วยไฟล์ที่เล็กกว่า หรือใช้ internal LiteLLM endpoint";
  }
  // Safety net: ตัดข้อความยาวเกิน (เช่น HTML ที่ไม่ถูก detect ด้านบน)
  return normalized.split("\n")[0].slice(0, 200);
}
