import { data } from "react-router";
import { updateAudioFileStatus } from "~/lib/supabase.server";
import { validateCallbackSecret } from "~/lib/n8n.server";
import { logger } from "~/lib/logger";
import type { Route } from "./+types/callback.status";

/**
 * POST /api/callback/status
 *
 * Called by n8n workflow to update audio file status after analysis.
 * Authenticated with X-N8N-Secret header.
 *
 * Body: { audioFileId: string, status: "done" | "error", errorMessage?: string }
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  if (!validateCallbackSecret(request)) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    audioFileId?: string;
    status?: string;
    errorMessage?: string;
  };

  const { audioFileId, status, errorMessage } = body;

  if (!audioFileId || !status) {
    return data({ error: "audioFileId and status are required" }, { status: 400 });
  }

  if (status !== "done" && status !== "error") {
    return data({ error: 'status must be "done" or "error"' }, { status: 400 });
  }

  await updateAudioFileStatus(audioFileId, status, errorMessage);

  logger.info("callback:status_updated", {
    audioFileId,
    status,
    errorMessage: errorMessage?.slice(0, 100),
  });

  return data({ ok: true, audioFileId, status });
}
