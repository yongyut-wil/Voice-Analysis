import { createClient } from "@supabase/supabase-js";
import type { AudioFile, AnalysisResult, AudioFileWithAnalysis } from "~/types/analysis";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  // const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = process.env.SUPABASE_ANON_KEY; // เปลี่ยนตรงนี้ด้วย
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  // return createClient(url, key);
  return createClient(url, key, { db: { schema: "voice_analysis" } });
}

export async function createAudioFile(
  data: Omit<AudioFile, "id" | "created_at" | "error_message">
): Promise<AudioFile> {
  const supabase = getSupabaseClient();
  const { data: row, error } = await supabase.from("audio_files").insert(data).select().single();
  if (error) throw error;
  return row;
}

export async function updateAudioFileStatus(
  id: string,
  status: AudioFile["status"],
  errorMessage?: string
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("audio_files")
    .update({ status, error_message: errorMessage ?? null })
    .eq("id", id);
  if (error) throw error;
}

export async function createAnalysisResult(
  data: Omit<AnalysisResult, "id" | "created_at">
): Promise<AnalysisResult> {
  const supabase = getSupabaseClient();
  const { data: row, error } = await supabase
    .from("analysis_results")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return row;
}

export async function getAudioFiles(): Promise<AudioFileWithAnalysis[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("audio_files")
    .select("*, analysis_results(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deleteAnalysisResultByFileId(audioFileId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("analysis_results")
    .delete()
    .eq("audio_file_id", audioFileId);
  if (error) throw error;
}

export async function getAudioFileById(id: string): Promise<AudioFileWithAnalysis | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("audio_files")
    .select("*, analysis_results(*)")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}
