import { data } from "react-router";
import { cleanErrorMessage, extractErrorMessage } from "~/lib/error-utils";
import { transcribeAudio } from "~/lib/litellm.server";
import { downloadAudio } from "~/lib/minio.server";
import { validateCallbackSecret } from "~/lib/n8n.server";
import { logger } from "~/lib/logger";
import type { Route } from "./+types/callback.transcribe-audio";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  if (!validateCallbackSecret(request)) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    filename?: string;
    originalName?: string;
  };

  const { filename, originalName } = body;

  if (!filename || !originalName) {
    return data({ error: "filename and originalName are required" }, { status: 400 });
  }

  try {
    const buffer = await downloadAudio(filename);
    const { transcription, sttModel } = await transcribeAudio(buffer, originalName);

    logger.info("callback:audio_transcribed", {
      filename,
      originalName,
      sttModel,
      chars: transcription.length,
    });

    return data({ transcription, sttModel });
  } catch (err) {
    const message = cleanErrorMessage(extractErrorMessage(err));

    logger.error("callback:audio_transcribe_failed", {
      filename,
      originalName,
      error: message,
    });

    return data({ error: message }, { status: 500 });
  }
}
