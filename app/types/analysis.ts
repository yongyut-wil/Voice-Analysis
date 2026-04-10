export type AudioFileStatus = "pending" | "processing" | "done" | "error";
export type Emotion = "neutral" | "positive" | "negative";

export interface AudioFile {
  id: string;
  filename: string;
  original_name: string;
  file_size: number | null;
  duration: number | null;
  mime_type: string | null;
  storage_url: string;
  status: AudioFileStatus;
  error_message: string | null;
  created_at: string;
}

export interface AnalysisResult {
  id: string;
  audio_file_id: string;
  transcription: string | null;
  summary: string | null;
  emotion: Emotion | null;
  emotion_score: number | null;
  satisfaction_score: number | null;
  illegal_detected: boolean;
  illegal_details: string | null;
  model_used: string | null;
  stt_model_used: string | null;
  processing_time_ms: number | null;
  created_at: string;
}

export interface AudioFileWithAnalysis extends AudioFile {
  analysis_results: AnalysisResult[];
}

export interface AnalysisOutput {
  emotion: Emotion;
  emotion_score: number;
  satisfaction_score: number;
  illegal_detected: boolean;
  illegal_details: string | null;
  summary: string | null;
}

export const EMOTION_LABELS: Record<Emotion, string> = {
  positive: "ดี",
  neutral: "ธรรมชาติ",
  negative: "ไม่ดี",
};

export const EMOTION_COLORS: Record<Emotion, string> = {
  positive: "bg-green-100 text-green-800 border-green-200",
  neutral: "bg-yellow-100 text-yellow-800 border-yellow-200",
  negative: "bg-red-100 text-red-800 border-red-200",
};
