import { data } from "react-router";
import { getPresignedUrl } from "~/lib/minio.server";
import { validateCallbackSecret } from "~/lib/n8n.server";
import { logger } from "~/lib/logger";
import type { Route } from "./+types/callback.audio-download-url";

/**
 * GET /api/callback/audio-download-url?filename=...
 *
 * Called by n8n workflow to get a presigned download URL for an audio file.
 * This avoids n8n needing MinIO credentials directly.
 * Authenticated with X-N8N-Secret header.
 */
export async function loader({ request }: Route.LoaderArgs) {
  if (!validateCallbackSecret(request)) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filename = url.searchParams.get("filename");

  if (!filename) {
    return data({ error: "filename is required" }, { status: 400 });
  }

  try {
    const downloadUrl = await getPresignedUrl(filename);
    logger.info("callback:presigned_url_generated", { filename });
    return data({ downloadUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("callback:presigned_url_failed", { filename, error: message });
    return data({ error: "Failed to generate download URL" }, { status: 500 });
  }
}
