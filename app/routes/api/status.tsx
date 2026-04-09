import { data } from "react-router";
import { getAudioFileById } from "~/lib/supabase.server";
import type { Route } from "./+types/status";

export async function loader({ params }: Route.LoaderArgs) {
  const { id } = params;
  if (!id) return data({ error: "Missing id" }, { status: 400 });

  const file = await getAudioFileById(id);
  if (!file) return data({ error: "Not found" }, { status: 404 });

  const analysis = file.analysis_results?.[0] ?? null;

  return data({
    status: file.status,
    error: file.error_message ?? null,
    analysisId: analysis?.id ?? null,
  });
}
