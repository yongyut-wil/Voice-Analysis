import OpenAI from "openai";
import type { AnalysisOutput, Emotion } from "~/types/analysis";

function getLiteLLMClient() {
  const baseURL = process.env.LITELLM_BASE_URL ?? "http://localhost:4000";
  const apiKey = process.env.LITELLM_API_KEY ?? "sk-placeholder";
  return new OpenAI({ baseURL, apiKey, timeout: 90_000, maxRetries: 0 });
}

export async function transcribeAudio(buffer: Buffer, filename: string): Promise<string> {
  const client = getLiteLLMClient();
  const model = process.env.LITELLM_STT_MODEL ?? "whisper-1";

  const file = new File([new Uint8Array(buffer)], filename, { type: "audio/mpeg" });

  const transcription = await client.audio.transcriptions.create({
    file,
    model,
    language: "th",
    response_format: "text",
  });

  return typeof transcription === "string"
    ? transcription
    : (transcription as { text: string }).text;
}

const ANALYSIS_PROMPT = `คุณคือผู้เชี่ยวชาญด้านการวิเคราะห์เสียงสนทนา วิเคราะห์ข้อความต่อไปนี้จากการถอดเสียง แล้วตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น

ข้อความ:
{TRANSCRIPTION}

ตอบในรูปแบบ JSON ดังนี้:
{
  "emotion": "neutral" | "positive" | "negative",
  "emotion_score": <0.0 ถึง 1.0>,
  "satisfaction_score": <0 ถึง 100>,
  "illegal_detected": true | false,
  "illegal_details": "<รายละเอียดถ้าพบ หรือ null>"
}

คำจำกัดความ:
- "positive" = น้ำเสียงดี พึงพอใจ ให้ความร่วมมือ
- "negative" = น้ำเสียงไม่ดี ไม่พึงพอใจ โกรธ หรือพูดถึงสิ่งผิดกฎหมาย
- "neutral" = น้ำเสียงธรรมชาติ ปกติ ไม่มีอารมณ์พิเศษ
- illegal_detected = true หากมีการพูดถึงยาเสพติด การฟอกเงิน การโกง การข่มขู่ หรือสิ่งผิดกฎหมายอื่นๆ`;

function parseAnalysisResponse(raw: string): AnalysisOutput {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM did not return valid JSON");

  const parsed = JSON.parse(jsonMatch[0]) as {
    emotion: string;
    emotion_score: number;
    satisfaction_score: number;
    illegal_detected: boolean;
    illegal_details: string | null;
  };

  const validEmotions: Emotion[] = ["neutral", "positive", "negative"];
  const emotion: Emotion = validEmotions.includes(parsed.emotion as Emotion)
    ? (parsed.emotion as Emotion)
    : "neutral";

  return {
    emotion,
    emotion_score: Math.min(1, Math.max(0, Number(parsed.emotion_score) || 0.5)),
    satisfaction_score: Math.min(
      100,
      Math.max(0, Math.round(Number(parsed.satisfaction_score) || 50))
    ),
    illegal_detected: Boolean(parsed.illegal_detected),
    illegal_details: parsed.illegal_details ?? null,
  };
}

export async function analyzeTranscription(transcription: string): Promise<AnalysisOutput> {
  const client = getLiteLLMClient();
  const model = process.env.LITELLM_ANALYSIS_MODEL ?? "claude-3-5-sonnet-20241022";

  const prompt = ANALYSIS_PROMPT.replace("{TRANSCRIPTION}", transcription);

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 512,
  });

  const raw = response.choices[0]?.message?.content ?? "";
  return parseAnalysisResponse(raw);
}
