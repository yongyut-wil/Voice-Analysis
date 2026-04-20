import { logger } from "~/lib/logger";

function normalizeBaseUrl(value: string | undefined, envName: string): string {
  if (!value) {
    throw new Error(`${envName} is not set`);
  }

  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1")
      ? `http://${trimmed}`
      : `https://${trimmed}`;

  try {
    return new URL(withProtocol).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${envName} must be a valid absolute URL: ${value}`);
  }
}

/**
 * Trigger analysis via n8n webhook instead of running in Node.js process.
 * n8n workflow will call back to /api/callback/* endpoints to update status.
 */
export async function triggerAnalysis(
  audioFileId: string,
  filename: string,
  originalName: string
): Promise<void> {
  const webhookBaseUrl = normalizeBaseUrl(process.env.N8N_WEBHOOK_URL, "N8N_WEBHOOK_URL");
  const webhookPath = process.env.N8N_ANALYSIS_WEBHOOK_PATH ?? "/webhook/voice-analysis";
  const webhookUrl = `${webhookBaseUrl}${webhookPath.startsWith("/") ? webhookPath : `/${webhookPath}`}`;
  const sttProvider = "litellm";
  const callbackBaseUrl = normalizeBaseUrl(
    process.env.N8N_CALLBACK_BASE_URL ?? "http://localhost:3000",
    "N8N_CALLBACK_BASE_URL"
  );
  const callbackSecret = process.env.N8N_CALLBACK_SECRET ?? "";

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-N8N-Secret": callbackSecret,
    },
    body: JSON.stringify({
      audioFileId,
      filename,
      originalName,
      sttProvider,
      callbackBaseUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`n8n webhook failed: ${response.status} ${response.statusText}`);
  }

  logger.info("n8n:analysis_triggered", { audioFileId, sttProvider });
}

/**
 * Trigger Post-Call Processing workflow after analysis completes.
 * Fire-and-forget — errors are logged but not propagated.
 */
export async function triggerPostCallProcessing(
  audioFileId: string,
  result: {
    emotion: string | null;
    emotion_score: number | null;
    satisfaction_score: number | null;
    illegal_detected: boolean;
    illegal_details: string | null;
    summary: string | null;
    transcription: string | null;
  }
): Promise<void> {
  const webhookBaseUrl = normalizeBaseUrl(process.env.N8N_WEBHOOK_URL, "N8N_WEBHOOK_URL");
  const webhookUrl = `${webhookBaseUrl}/webhook/post-call-processing`;
  const callbackSecret = process.env.N8N_CALLBACK_SECRET ?? "";

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-N8N-Secret": callbackSecret,
    },
    body: JSON.stringify({
      audioFileId,
      emotion: result.emotion,
      emotion_score: result.emotion_score,
      satisfaction_score: result.satisfaction_score,
      illegal_detected: result.illegal_detected,
      illegal_details: result.illegal_details,
      summary: result.summary,
      transcription_preview: result.transcription?.slice(0, 200) ?? null,
    }),
  }).catch((err: unknown) => {
    logger.warn("n8n:post_call_trigger_failed", {
      audioFileId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * Validate X-N8N-Secret header from n8n callback requests.
 * Returns true if the secret matches N8N_CALLBACK_SECRET.
 */
export function validateCallbackSecret(request: Request): boolean {
  const secret = request.headers.get("X-N8N-Secret");
  const expected = process.env.N8N_CALLBACK_SECRET ?? "";
  if (!expected) return false;
  return secret === expected;
}
