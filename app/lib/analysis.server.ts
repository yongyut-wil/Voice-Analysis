import { downloadAudio } from "~/lib/minio.server";
import { transcribeAudio, analyzeTranscription } from "~/lib/litellm.server";
import { updateAudioFileStatus, createAnalysisResult } from "~/lib/supabase.server";
import { cleanErrorMessage } from "~/lib/error-utils";

export { cleanErrorMessage };

export async function runAnalysis(
  audioFileId: string,
  filename: string,
  originalName: string
): Promise<void> {
  const startTime = Date.now();

  const buffer = await downloadAudio(filename);
  const transcription = await transcribeAudio(buffer, originalName);
  const analysisOutput = await analyzeTranscription(transcription);
  const processingTime = Date.now() - startTime;

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
}
