import OpenAI from "openai";
import type { AnalysisOutput, Emotion } from "~/types/analysis";
import { logger } from "~/lib/logger";

// Whisper แยก syllable ภาษาไทยด้วยช่องว่าง — ต้องต่อกลับคืน
function cleanThaiText(text: string): string {
  return text.replaceAll(/(?<=[\u0E00-\u0E7F]) (?=[\u0E00-\u0E7F])/g, "");
}

// Whisper/GPT-4o hallucination — วนซ้ำวลีเดิมตอน audio เงียบ
function removeRepetitions(text: string): string {
  // จับวลีที่ยาว 5+ ตัวอักษรแล้วซ้ำ 3+ ครั้งติดกัน
  return text.replaceAll(/(.{5,}?)\1{2,}/g, "$1");
}

function getMimeType(ext: string | undefined): string {
  if (ext === "wav") {
    return "audio/wav";
  }
  if (ext === "mp4" || ext === "m4a") {
    return "audio/mp4";
  }
  return "audio/mpeg";
}

function getLiteLLMClient() {
  const baseURL = process.env.LITELLM_BASE_URL ?? "http://localhost:4000";
  const apiKey = process.env.LITELLM_API_KEY ?? "sk-placeholder";
  return new OpenAI({ baseURL, apiKey, timeout: 90_000, maxRetries: 0 });
}

async function transcribeWithLiteLLM(buffer: Buffer, filename: string): Promise<string> {
  const client = getLiteLLMClient();
  const model = process.env.LITELLM_STT_MODEL ?? "gpt-4o-mini-transcribe";

  logger.info("stt:start", { provider: "litellm", model, filename, bytes: buffer.length });
  const t0 = Date.now();

  const heartbeat = setInterval(() => {
    logger.warn("stt:waiting", { provider: "litellm", elapsed_ms: Date.now() - t0 });
  }, 15_000);

  try {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeType = getMimeType(ext);
    const file = new File([new Uint8Array(buffer)], filename, { type: mimeType });

    const transcription = await client.audio.transcriptions.create({
      file,
      model,
      language: "th",
      response_format: "text",
      ...(model.includes("diarize") &&
        ({ chunking_strategy: { type: "auto" } } as Record<string, unknown>)),
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
  const transcription = await transcribeWithLiteLLM(buffer, filename);
  return { transcription, sttModel: process.env.LITELLM_STT_MODEL ?? "gpt-4o-mini-transcribe" };
}

const ANALYSIS_PROMPT_PLACEHOLDER = "{TRANSCRIPTION}";

const DEFAULT_ANALYSIS_SYSTEM_PROMPT = `คุณคือผู้เชี่ยวชาญด้านการวิเคราะห์คุณภาพการสนทนาทางโทรศัพท์ โดยเน้นการประเมินอารมณ์ ความพึงพอใจ การตรวจจับเนื้อหาผิดกฎหมาย และการสรุปบทสนทนา

หมายเหตุสำคัญ: อารมณ์ (emotion) และเนื้อหาผิดกฎหมาย (illegal_detected) เป็นสองมิติแยกกัน — การสนทนาที่พูดถึงสิ่งผิดกฎหมายอาจมีน้ำเสียงเป็นปกติ (neutral) ได้ และการสนทนาที่ไม่พึงพอใจไม่จำเป็นต้องมีเนื้อหาผิดกฎหมาย

━━━ คำจำกัดความและเกณฑ์การให้คะแนน ━━━

▸ emotion (วัดจากน้ำเสียง/ท่าทีของผู้พูดในบทสนทนา)
  - "positive" = พึงพอใจ ขอบคุณ ชื่นชม ยินดีให้ความร่วมมือ หรือน้ำเสียงร่าเริง
  - "negative" = ไม่พึงพอใจ ร้องเรียน โกรธ หงุดหงิด หรือน้ำเสียงไม่เป็นมิตร
  - "neutral"  = สนทนาทั่วไป สอบถามข้อมูล แจ้งเรื่องราว หรือไม่แสดงอารมณ์ชัดเจน

▸ emotion_score (0.0–1.0 ความเข้มข้นของอารมณ์)
  0.0–0.2 = แทบไม่มีอารมณ์ / สนทนาธรรมดา
  0.3–0.4 = มีอารมณ์เล็กน้อย แต่ไม่ชัดเจน
  0.5–0.6 = อารมณ์ปานกลาง พอสังเกตได้
  0.7–0.8 = อารมณ์ชัดเจน เช่น ชมเชยอย่างเห็นได้ หรือบ่นอย่างต่อเนื่อง
  0.9–1.0 = อารมณ์รุนแรง เช่น ดีใจมาก หรือโกรธมาก
  ⚠ หาก emotion = "neutral" ให้ score ไม่เกิน 0.4

▸ satisfaction_score (0–100 ประเมินจากมุมผู้ใช้บริการ)
  0–20  = ไม่ได้รับการแก้ไข ต้องติดตามเพิ่มเติม
  21–40 = แก้ไขได้บางส่วน ยังมีปัญหาค้างอยู่
  41–60 = ได้คำตอบแต่ยังไม่มั่นใจ หรือต้องดำเนินการเพิ่ม
  61–80 = แก้ไขได้ ดูพอใจ
  81–100= แก้ไขเรียบร้อย พึงพอใจมาก

▸ illegal_detected (ตรวจจับเนื้อหาผิดกฎหมาย — ไม่ขึ้นกับอารมณ์)
  ตั้งค่าเป็น true หากมีการพูดถึง: ยาเสพติด, การฟอกเงิน, การฉ้อโกง, การข่มขู่คุกคาม, การพนันผิดกฎหมาย, การค้ามนุษย์, หรือกิจกรรมผิดกฎหมายอื่นๆ
  หาก true ให้ระบุ illegal_details เป็นข้อความอธิบายสั้นๆ ว่าพบอะไร
  หากไม่พบ ให้ illegal_detected = false และ illegal_details = null

▸ summary (สรุปบทสนทนาเป็นภาษาไทย 2-3 ประโยค)
  ประโยคที่ 1: เรื่องที่ติดต่อ (หัวข้อหลัก)
  ประโยคที่ 2: ผลลัพธ์หรือข้อตกลงที่ได้ (ถ้ามี)
  ประโยคที่ 3: จุดน่าสังเกตหรือประเด็นสำคัญ (ถ้ามี)

━━━ กฎการตอบ ━━━
- ตอบเป็น JSON เท่านั้น
- ห้ามมีคำอธิบาย ข้อความนำ หรือ markdown fence
- หากข้อความสั้นมาก (เช่น ทักทาย) ให้ประเมิน emotion = "neutral", emotion_score = 0.1, satisfaction_score = 50`;

const DEFAULT_ANALYSIS_USER_TEMPLATE = `วิเคราะห์บทสนทนาต่อไปนี้จากการถอดเสียง:

{TRANSCRIPTION}

ตอบในรูปแบบ JSON ดังนี้:
{
  "emotion": "neutral" | "positive" | "negative",
  "emotion_score": <0.0 ถึง 1.0>,
  "satisfaction_score": <0 ถึง 100>,
  "illegal_detected": true | false,
  "illegal_details": "<รายละเอียดถ้าพบ หรือ null>",
  "summary": "<สรุปบทสนทนา 2-3 ประโยค>"
}

ตัวอย่างผลลัพธ์สำหรับบทสนทนาที่ลูกค้าร้องเรียน:
{"emotion":"negative","emotion_score":0.7,"satisfaction_score":25,"illegal_detected":false,"illegal_details":null,"summary":"ลูกค้าโทรมาร้องเรียนเรื่องสินค้าชำรุดที่ยังไม่ได้รับการเปลี่ยนคืน ฝ่ายบริการรับเรื่องและแจ้งจะดำเนินการภายใน 3 วัน ติดตามผลได้จากเลขรับเรื่อง"}

ตัวอย่างผลลัพธ์สำหรับบทสนทนาทั่วไป:
{"emotion":"neutral","emotion_score":0.1,"satisfaction_score":55,"illegal_detected":false,"illegal_details":null,"summary":"ลูกค้าสอบถามยอดคงเหลือในบัญชี เจ้าหน้าที่แจ้งยอดให้ทราบ ไม่มีประเด็นพิเศษ"}

ตัวอย่างผลลัพธ์สำหรับบทสนทนาที่พึงพอใจ:
{"emotion":"positive","emotion_score":0.6,"satisfaction_score":85,"illegal_detected":false,"illegal_details":null,"summary":"ลูกค้าโทรมาขอบคุณทีมบริการที่แก้ปัญหาได้รวดเร็ว ยืนยันว่าปัญหาได้รับการแก้ไขแล้ว ไม่มีประเด็นเพิ่มเติม"}`;

function getAnalysisPromptTemplate(): {
  systemPrompt: string;
  userTemplate: string;
  source: "default" | "env";
} {
  const customTemplate = process.env.ANALYSIS_PROMPT_TEMPLATE?.trim();

  if (!customTemplate) {
    return {
      systemPrompt: DEFAULT_ANALYSIS_SYSTEM_PROMPT,
      userTemplate: DEFAULT_ANALYSIS_USER_TEMPLATE,
      source: "default",
    };
  }

  const resolved = customTemplate.replaceAll(String.raw`\n`, "\n");

  // If custom template has {TRANSCRIPTION}, split into system + user
  if (resolved.includes(ANALYSIS_PROMPT_PLACEHOLDER)) {
    return {
      systemPrompt:
        "คุณคือผู้เชี่ยวชาญด้านการวิเคราะห์คุณภาพการสนทนาทางโทรศัพท์ ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น",
      userTemplate: resolved,
      source: "env",
    };
  }

  return {
    systemPrompt: resolved,
    userTemplate: `วิเคราะห์บทสนทนาต่อไปนี้:\n\n{TRANSCRIPTION}`,
    source: "env",
  };
}

function buildAnalysisUserMessage(transcription: string, template: string): string {
  if (template.includes(ANALYSIS_PROMPT_PLACEHOLDER)) {
    return template.split(ANALYSIS_PROMPT_PLACEHOLDER).join(transcription);
  }

  return `${template.trim()}\n\nข้อความ:\n${transcription}`;
}

function parseAnalysisResponse(raw: string): AnalysisOutput {
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("LLM did not return valid JSON");
  }

  const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as {
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

  let emotionScore = Math.min(1, Math.max(0, Number(parsed.emotion_score) || 0.5));
  // Enforce: neutral emotion should not have score > 0.4
  if (emotion === "neutral" && emotionScore > 0.4) {
    emotionScore = Math.min(emotionScore, 0.4);
  }

  return {
    emotion,
    emotion_score: emotionScore,
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
  const { systemPrompt, userTemplate, source } = getAnalysisPromptTemplate();

  logger.info("llm:start", { model, input_chars: transcription.length, prompt_source: source });

  const userMessage = buildAnalysisUserMessage(transcription, userTemplate);

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.1,
    max_tokens: 1024,
  });

  const raw = response.choices[0]?.message?.content ?? "";
  return parseAnalysisResponse(raw);
}
