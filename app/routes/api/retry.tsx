import { data } from "react-router";
import {
  getAudioFileById,
  updateAudioFileStatus,
  deleteAnalysisResultByFileId,
  resetAudioFileForRetry,
} from "~/lib/supabase.server";
import { audioExists } from "~/lib/minio.server";
import { runAnalysis, cleanErrorMessage, isStuckProcessing } from "~/lib/analysis.server";
import { extractErrorMessage } from "~/lib/error-utils";
import { logger } from "~/lib/logger";
import type { Route } from "./+types/retry";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const { id } = params;
  if (!id) return data({ error: "Missing id" }, { status: 400 });

  const audioFile = await getAudioFileById(id);
  if (!audioFile) return data({ error: "Audio file not found" }, { status: 404 });

  if (audioFile.status === "processing" && !isStuckProcessing(audioFile)) {
    return data({ error: "กำลังวิเคราะห์อยู่แล้ว" }, { status: 409 });
  }

  const exists = await audioExists(audioFile.filename);
  if (!exists) {
    return data(
      { error: "ไฟล์เสียงต้นฉบับถูกลบไปแล้ว ไม่สามารถวิเคราะห์ใหม่ได้ กรุณาอัพโหลดไฟล์อีกครั้ง" },
      { status: 422 }
    );
  }

  // ลบ analysis_results เก่า (ถ้ามี) แล้วเริ่มใหม่
  await deleteAnalysisResultByFileId(id);
  await resetAudioFileForRetry(id);

  logger.info("retry:queued", { audioFileId: id, name: audioFile.original_name });

  runAnalysis(id, audioFile.filename, audioFile.original_name).catch(async (err: unknown) => {
    const message = cleanErrorMessage(extractErrorMessage(err));
    logger.error("retry:failed", { audioFileId: id, error: message });
    await updateAudioFileStatus(id, "error", message);
  });

  return data({ audioFileId: id, status: "processing" }, { status: 202 });
}
