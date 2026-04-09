export function cleanErrorMessage(raw: string): string {
  if (
    raw.includes("<!DOCTYPE") ||
    raw.includes("524") ||
    raw.includes("timeout occurred") ||
    raw.includes("Request timed out") ||
    raw.includes("timed out")
  ) {
    return "AI service timeout — ไฟล์อาจใหญ่เกินไปหรือ server ยุ่ง กรุณาลองใหม่ด้วยไฟล์ที่เล็กกว่า";
  }
  if (raw.includes("Connection error") || raw.includes("ECONNREFUSED")) {
    return "ไม่สามารถเชื่อมต่อ AI service ได้ กรุณาตรวจสอบ LITELLM_BASE_URL";
  }
  return raw.split("\n")[0].slice(0, 200);
}
