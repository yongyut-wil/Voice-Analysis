import { downloadAudio } from "~/lib/minio.server";
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

  const transcription = await transcribeAudio(buffer, originalName);
  logger.info("analysis:transcribed", {
    audioFileId,
    chars: transcription.length,
    elapsed_ms: Date.now() - startTime,
  });

  const analysisOutput = await analyzeTranscription(transcription);
  const processingTime = Date.now() - startTime;
  logger.info("analysis:analyzed", {
    audioFileId,
    emotion: analysisOutput.emotion,
    satisfaction: analysisOutput.satisfaction_score,
    illegal: analysisOutput.illegal_detected,
    elapsed_ms: processingTime,
  });

  await createAnalysisResult({
    audio_file_id: audioFileId,
    transcription,
    emotion: analysisOutput.emotion,
    emotion_score: analysisOutput.emotion_score,
    satisfaction_score: analysisOutput.satisfaction_score,
    illegal_detected: analysisOutput.illegal_detected,
    illegal_details: analysisOutput.illegal_details,
    model_used: process.env.LITELLM_ANALYSIS_MODEL ?? null,
    processing_time_ms: processingTime,
  });

  await updateAudioFileStatus(audioFileId, "done");
  logger.info("analysis:done", { audioFileId, total_ms: processingTime });
}
