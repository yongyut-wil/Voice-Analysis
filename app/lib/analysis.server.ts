import { downloadAudio, deleteAudio } from "~/lib/minio.server";
import { transcribeAudio, analyzeTranscription } from "~/lib/litellm.server";
import { updateAudioFileStatus, createAnalysisResult } from "~/lib/supabase.server";
import { cleanErrorMessage } from "~/lib/error-utils";
import { logger } from "~/lib/logger";

export { cleanErrorMessage };

export async function runAnalysis(
  audioFileId: string,
  filename: string,
  originalName: string
): Promise<void> {
  const startTime = Date.now();
  logger.info("analysis:start", { audioFileId, filename: originalName });

  const buffer = await downloadAudio(filename);
  logger.info("analysis:downloaded", { audioFileId, bytes: buffer.length });

  const { transcription, sttModel } = await transcribeAudio(buffer, originalName);
  logger.info("analysis:transcribed", {
    audioFileId,
    sttModel,
    chars: transcription.length,
    preview: transcription.slice(0, 80).replace(/\n/g, " "),
    elapsed_ms: Date.now() - startTime,
  });

  const analysisOutput = await analyzeTranscription(transcription);
  const processingTime = Date.now() - startTime;
  logger.info("analysis:analyzed", {
    audioFileId,
    emotion: analysisOutput.emotion,
    emotion_score: analysisOutput.emotion_score,
    satisfaction: analysisOutput.satisfaction_score,
    illegal: analysisOutput.illegal_detected,
    illegal_details: analysisOutput.illegal_details ?? undefined,
    elapsed_ms: processingTime,
  });

  const t0save = Date.now();
  await createAnalysisResult({
    audio_file_id: audioFileId,
    transcription,
    summary: analysisOutput.summary,
    emotion: analysisOutput.emotion,
    emotion_score: analysisOutput.emotion_score,
    satisfaction_score: analysisOutput.satisfaction_score,
    illegal_detected: analysisOutput.illegal_detected,
    illegal_details: analysisOutput.illegal_details,
    model_used: process.env.LITELLM_ANALYSIS_MODEL ?? null,
    stt_model_used: sttModel,
    processing_time_ms: processingTime,
  });

  logger.info("analysis:saved", { audioFileId, save_ms: Date.now() - t0save });

  await updateAudioFileStatus(audioFileId, "done");
  logger.info("analysis:done", { audioFileId, total_ms: processingTime });

  // ลบไฟล์เสียงออกจาก MinIO หลัง analyze เสร็จ — ไม่จำเป็นต้องเก็บไว้อีกต่อไป
  deleteAudio(filename)
    .then(() => {
      logger.info("analysis:audio_deleted", { audioFileId, filename });
    })
    .catch((err: unknown) => {
      logger.warn("analysis:audio_delete_failed", {
        audioFileId,
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
