import { data } from "react-router";
import { deleteAudio } from "~/lib/minio.server";
import { validateCallbackSecret } from "~/lib/n8n.server";
import { logger } from "~/lib/logger";
import type { Route } from "./+types/callback.delete-audio";

/**
 * POST /api/callback/delete-audio
 *
 * Called by n8n workflow to delete an audio file from MinIO after analysis.
 * Authenticated with X-N8N-Secret header.
 *
 * Body: { filename: string }
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  if (!validateCallbackSecret(request)) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { filename?: string };
  const { filename } = body;

  if (!filename) {
    return data({ error: "filename is required" }, { status: 400 });
  }

  try {
    await deleteAudio(filename);
    logger.info("callback:audio_deleted", { filename });
    return data({ ok: true });
  } catch (err) {
    // Fire-and-forget: log warning but don't fail the callback
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("callback:audio_delete_failed", { filename, error: message });
    return data({ ok: true, warning: "Delete failed but analysis is complete" });
  }
}
