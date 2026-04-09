import { data } from "react-router";
import {
  getAudioFileById,
  updateAudioFileStatus,
  deleteAnalysisResultByFileId,
} from "~/lib/supabase.server";
import { runAnalysis, cleanErrorMessage } from "~/lib/analysis.server";
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

  if (audioFile.status === "processing") {
    return data({ error: "กำลังวิเคราะห์อยู่แล้ว" }, { status: 409 });
  }

  // ลบ analysis_results เก่า (ถ้ามี) แล้วเริ่มใหม่
  await deleteAnalysisResultByFileId(id);
  await updateAudioFileStatus(id, "processing");

  logger.info("retry:queued", { audioFileId: id, name: audioFile.original_name });

  runAnalysis(id, audioFile.filename, audioFile.original_name).catch(async (err) => {
    const message = cleanErrorMessage(err instanceof Error ? err.message : "Unknown error");
    logger.error("retry:failed", { audioFileId: id, error: message });
    await updateAudioFileStatus(id, "error", message);
  });

  return data({ audioFileId: id, status: "processing" }, { status: 202 });
}
