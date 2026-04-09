import { data } from "react-router";
import { getAudioFileById, updateAudioFileStatus } from "~/lib/supabase.server";
import { runAnalysis, cleanErrorMessage } from "~/lib/analysis.server";
import type { Route } from "./+types/analyze";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json()) as { audioFileId?: string };
  const { audioFileId } = body;

  if (!audioFileId) {
    return data({ error: "audioFileId is required" }, { status: 400 });
  }

  const audioFile = await getAudioFileById(audioFileId);
  if (!audioFile) {
    return data({ error: "Audio file not found" }, { status: 404 });
  }

  await updateAudioFileStatus(audioFileId, "processing");

  runAnalysis(audioFileId, audioFile.filename, audioFile.original_name).catch(async (err) => {
    const message = cleanErrorMessage(err instanceof Error ? err.message : "Unknown error");
    await updateAudioFileStatus(audioFileId, "error", message);
  });

  return data({ audioFileId, status: "processing" }, { status: 202 });
}
