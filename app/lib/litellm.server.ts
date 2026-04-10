import OpenAI from "openai";
import type { AnalysisOutput, Emotion } from "~/types/analysis";
import { logger } from "~/lib/logger";

// Whisper แยก syllable ภาษาไทยด้วยช่องว่าง — ต้องต่อกลับคืน
function cleanThaiText(text: string): string {
  return text.replace(/(?<=[\u0E00-\u0E7F]) (?=[\u0E00-\u0E7F])/g, "");
}

// Whisper/GPT-4o hallucination — วนซ้ำวลีเดิมตอน audio เงียบ
function removeRepetitions(text: string): string {
  // จับวลีที่ยาว 5+ ตัวอักษรแล้วซ้ำ 3+ ครั้งติดกัน
  return text.replace(/(.{5,}?)\1{2,}/g, "$1");
}

function getLiteLLMClient() {
  const baseURL = process.env.LITELLM_BASE_URL ?? "http://localhost:4000";
  const apiKey = process.env.LITELLM_API_KEY ?? "sk-placeholder";
  return new OpenAI({ baseURL, apiKey, timeout: 90_000, maxRetries: 0 });
}

async function transcribeWithDeepgram(buffer: Buffer, filename: string): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY!;
  const model = "nova-3";
  const ext = filename.split(".").pop()?.toLowerCase();
  const contentType = ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : "audio/mp4";

  logger.info("stt:start", { provider: "deepgram", model, filename, bytes: buffer.length });
  const t0 = Date.now();

  const heartbeat = setInterval(() => {
    logger.warn("stt:waiting", { provider: "deepgram", elapsed_ms: Date.now() - t0 });
  }, 15_000);

  try {
    const res = await fetch(
      `https://api.deepgram.com/v1/listen?model=${model}&language=th&smart_format=true&punctuate=true`,
      {
        method: "POST",
        headers: { Authorization: `Token ${apiKey}`, "Content-Type": contentType },
        body: new Uint8Array(buffer),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Deepgram error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      results: { channels: { alternatives: { transcript: string }[] }[] };
    };
    return removeRepetitions(
      cleanThaiText(json.results.channels[0]?.alternatives[0]?.transcript ?? "")
    );
  } finally {
    clearInterval(heartbeat);
  }
}

async function transcribeWithLiteLLM(buffer: Buffer, filename: string): Promise<string> {
  const client = getLiteLLMClient();
  const model = process.env.LITELLM_STT_MODEL ?? "whisper-1";

  logger.info("stt:start", { provider: "litellm", model, filename, bytes: buffer.length });
  const t0 = Date.now();

  const heartbeat = setInterval(() => {
    logger.warn("stt:waiting", { provider: "litellm", elapsed_ms: Date.now() - t0 });
  }, 15_000);

  try {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeType =
      ext === "wav" ? "audio/wav" : ext === "mp4" || ext === "m4a" ? "audio/mp4" : "audio/mpeg";
    const file = new File([new Uint8Array(buffer)], filename, { type: mimeType });

    const transcription = await client.audio.transcriptions.create({
      file,
      model,
      language: "th",
      response_format: "text",
    });

    const raw =
      typeof transcription === "string" ? transcription : (transcription as { text: string }).text;
    return removeRepetitions(cleanThaiText(raw));
  } finally {
    clearInterval(heartbeat);
  }
}

export async function transcribeAudio(
  buffer: Buffer,
  filename: string
): Promise<{ transcription: string; sttModel: string }> {
  if (process.env.DEEPGRAM_API_KEY) {
    const transcription = await transcribeWithDeepgram(buffer, filename);
    return { transcription, sttModel: "deepgram/nova-3" };
  }
  const transcription = await transcribeWithLiteLLM(buffer, filename);
  return { transcription, sttModel: process.env.LITELLM_STT_MODEL ?? "openai/whisper-1" };
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
  "illegal_details": "<รายละเอียดถ้าพบ หรือ null>",
  "summary": "<สรุปบทสนทนา 2-3 ประโยค: เรื่องที่คุย, ผลลัพธ์หรือข้อตกลง, และจุดน่าสังเกต (ถ้ามี)>"
}

คำจำกัดความ:
- "positive" = น้ำเสียงดี พึงพอใจ ให้ความร่วมมือ
- "negative" = น้ำเสียงไม่ดี ไม่พึงพอใจ โกรธ หรือพูดถึงสิ่งผิดกฎหมาย
- "neutral" = น้ำเสียงธรรมชาติ ปกติ ไม่มีอารมณ์พิเศษ
- illegal_detected = true หากมีการพูดถึงยาเสพติด การฟอกเงิน การโกง การข่มขู่ หรือสิ่งผิดกฎหมายอื่นๆ
- summary = สรุปสั้นๆ เป็นภาษาไทย ครอบคลุมเรื่องที่คุย ผลลัพธ์ และจุดน่าสังเกต`;

function parseAnalysisResponse(raw: string): AnalysisOutput {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM did not return valid JSON");

  const parsed = JSON.parse(jsonMatch[0]) as {
    emotion: string;
    emotion_score: number;
    satisfaction_score: number;
    illegal_detected: boolean;
    illegal_details: string | null;
    summary: string | null;
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
    summary: parsed.summary ?? null,
  };
}

export async function analyzeTranscription(transcription: string): Promise<AnalysisOutput> {
  const client = getLiteLLMClient();
  const model = process.env.LITELLM_ANALYSIS_MODEL ?? "claude-3-5-sonnet-20241022";

  logger.info("llm:start", { model, input_chars: transcription.length });

  const prompt = ANALYSIS_PROMPT.replace("{TRANSCRIPTION}", transcription);

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 1024,
  });

  const raw = response.choices[0]?.message?.content ?? "";
  return parseAnalysisResponse(raw);
}
