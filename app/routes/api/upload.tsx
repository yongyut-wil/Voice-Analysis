import { data } from "react-router";
import { cleanErrorMessage, extractErrorMessage } from "~/lib/error-utils";
import { uploadAudio } from "~/lib/minio.server";
import { createAudioFile } from "~/lib/supabase.server";
import { logger } from "~/lib/logger";
import type { Route } from "./+types/upload";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/x-m4a",
];

function getUploadErrorMessage(err: unknown): string {
  console.log("getUploadErrorMessage", err);
  const raw = extractErrorMessage(err);

  if (raw.includes("ECONNREFUSED") && raw.includes("9000")) {
    return "ไม่สามารถเชื่อมต่อระบบจัดเก็บไฟล์เสียงได้ กรุณาตรวจสอบ MinIO ว่ากำลังทำงานอยู่";
  }

  return cleanErrorMessage(raw);
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return data({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("audio");
  if (!(file instanceof File)) {
    return data({ error: "No audio file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return data({ error: "File too large (max 100MB)" }, { status: 400 });
  }

  const mimeType = file.type || "audio/mpeg";
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return data({ error: `Unsupported file type: ${mimeType}` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  logger.info("upload:start", { name: file.name, size: file.size, mime: mimeType });

  try {
    const { filename, storageUrl } = await uploadAudio(buffer, file.name, mimeType);

    const audioFile = await createAudioFile({
      filename,
      original_name: file.name,
      file_size: file.size,
      duration: null,
      mime_type: mimeType,
      storage_url: storageUrl,
      status: "pending",
    });

    logger.info("upload:done", { audioFileId: audioFile.id, filename, name: file.name });

    return data({ audioFileId: audioFile.id, filename }, { status: 201 });
  } catch (err) {
    const message = getUploadErrorMessage(err) || "อัพโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
    logger.error("upload:failed", { name: file.name, mime: mimeType, error: message });
    return data({ error: message }, { status: 500 });
  }
}
