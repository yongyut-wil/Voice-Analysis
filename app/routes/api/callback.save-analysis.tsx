import { data } from "react-router";
import { cleanErrorMessage, extractErrorMessage } from "~/lib/error-utils";
import { logger } from "~/lib/logger";
import { validateCallbackSecret } from "~/lib/n8n.server";
import { createAnalysisResult } from "~/lib/supabase.server";
import type { AnalysisResult } from "~/types/analysis";
import type { Route } from "./+types/callback.save-analysis";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  if (!validateCallbackSecret(request)) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<Omit<AnalysisResult, "id" | "created_at">>;

  if (!body.audio_file_id) {
    return data({ error: "audio_file_id is required" }, { status: 400 });
  }

  try {
    const row = await createAnalysisResult({
      audio_file_id: body.audio_file_id,
      transcription: body.transcription ?? null,
      summary: body.summary ?? null,
      emotion: body.emotion ?? null,
      emotion_score: body.emotion_score ?? null,
      satisfaction_score: body.satisfaction_score ?? null,
      illegal_detected: body.illegal_detected ?? false,
      illegal_details: body.illegal_details ?? null,
      model_used: body.model_used ?? null,
      stt_model_used: body.stt_model_used ?? null,
      processing_time_ms: body.processing_time_ms ?? null,
    });

    logger.info("callback:analysis_saved", {
      audioFileId: row.audio_file_id,
      analysisId: row.id,
    });

    return data({ ok: true, analysisId: row.id });
  } catch (err) {
    const message = cleanErrorMessage(extractErrorMessage(err));

    logger.error("callback:analysis_save_failed", {
      audioFileId: body.audio_file_id,
      error: message,
    });

    return data({ error: message }, { status: 500 });
  }
}
