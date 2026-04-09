# Voice Analysis — เอกสารโปรเจกต์

> เอกสารนี้อธิบายกระบวนการคิด การออกแบบ และสิ่งที่สร้างขึ้นทั้งหมดในโปรเจกต์ Voice Analysis

---

## 1. ที่มาและเป้าหมาย

### โจทย์

TonghuaLab ต้องการระบบที่ช่วยตรวจสอบคุณภาพของบทสนทนา (call quality) โดยอัตโนมัติ แทนการให้คนฟังเสียงทีละไฟล์

### สิ่งที่ต้องการ

1. **ถอดข้อความ** จากไฟล์เสียงสนทนา (Speech-to-Text)
2. **วิเคราะห์อารมณ์** ของการสนทนา — ดี / ธรรมชาติ / ไม่ดี
3. **คะแนนความพึงพอใจ** 0–100 คะแนน
4. **ตรวจจับเนื้อหาไม่เหมาะสม** เช่น ยาเสพติด, การฉ้อโกง, การข่มขู่
5. **เก็บประวัติ** ให้ย้อนดูได้

---

## 2. วิธีคิดก่อนลงมือสร้าง

### 2.1 แยก Concern ออกเป็น 3 ส่วน

```
[User Interface]  ←→  [Business Logic]  ←→  [External Services]
   React UI           React Router           Whisper (STT)
   TailwindCSS        Server Actions         Claude (Analysis)
   shadcn/ui          Type Safety            MinIO (Storage)
                                             Supabase (Database)
```

แต่ละส่วนเปลี่ยนได้อิสระ เช่น เปลี่ยน LLM จาก Claude เป็น GPT-4 ก็แก้แค่ `.env` ไม่ต้องแตะ UI

### 2.2 เลือก Tech Stack

| ความต้องการ          | ตัวเลือก        | เหตุผลที่เลือก                                  |
| -------------------- | --------------- | ----------------------------------------------- |
| Full-stack framework | React Router v7 | SSR built-in, server actions, type-safe routes  |
| Database             | Supabase        | PostgreSQL managed, SDK ครบ, ไม่ต้องดูแล server |
| Object Storage       | MinIO           | S3-compatible, self-hosted, ควบคุมได้เอง        |
| AI Proxy             | LiteLLM         | สลับ model ได้โดยไม่แก้ code                    |
| UI Component         | shadcn/ui       | Copy-paste, ไม่ lock-in, ปรับ style ได้         |
| Styling              | TailwindCSS v4  | Utility-first, dark mode ง่าย                   |

### 2.3 ออกแบบ Data Model ก่อน

ก่อนเขียน code ตั้งคำถาม: **"ข้อมูลอะไรต้องเก็บ และเก็บยังไง?"**

```
audio_files          ← เก็บ metadata ของไฟล์ที่ upload
    │
    └── analysis_results  ← เก็บผลวิเคราะห์ (1-to-1 ในทางปฏิบัติ)
```

แยก 2 table เพราะ:

- `audio_files` มี lifecycle ของตัวเอง (pending → processing → done)
- `analysis_results` อาจเพิ่ม version การวิเคราะห์ในอนาคตได้
- ถ้าวิเคราะห์ซ้ำ ก็สร้าง result ใหม่ได้โดยไม่ต้องลบไฟล์

### 2.4 ออกแบบ User Flow

```
หน้าแรก (/)
    ↓ drag & drop / เลือกไฟล์
อัพโหลด → MinIO
    ↓
วิเคราะห์ → Whisper + Claude
    ↓
หน้าผลลัพธ์ (/analyses/:id)

[แยก] ดูประวัติ (/analyses) — ตารางไฟล์ทั้งหมด
```

Flow ตรงๆ ไม่ซับซ้อน เหมาะกับ MVP ที่ต้องการทดสอบความเป็นไปได้ก่อน

---

## 3. โครงสร้างโปรเจกต์

```
Voice Analysis/
├── app/
│   ├── components/           # UI Components
│   │   ├── audio-player.tsx  # เล่นเสียงจาก MinIO
│   │   ├── audio-uploader.tsx# Dropzone + progress + polling
│   │   ├── emotion-badge.tsx # แสดงอารมณ์ (สี + label)
│   │   └── ui/               # shadcn base components
│   ├── lib/
│   │   ├── supabase.server.ts  # Database operations (server only)
│   │   ├── minio.server.ts     # File storage operations (server only)
│   │   ├── litellm.server.ts   # AI (Whisper + Claude) (server only)
│   │   ├── analysis.server.ts  # runAnalysis() shared logic (server only)
│   │   ├── error-utils.ts      # cleanErrorMessage() (client + server)
│   │   └── utils.ts            # ฟังก์ชันทั่วไป
│   ├── routes/
│   │   ├── home.tsx            # หน้าแรก
│   │   ├── analyses.tsx        # ประวัติการวิเคราะห์
│   │   ├── analyses.$id.tsx    # รายละเอียด + RetryButton
│   │   ├── well-known.tsx      # จัดการ /.well-known/* (return 404 เงียบๆ)
│   │   └── api/
│   │       ├── upload.tsx      # POST /api/upload
│   │       ├── analyze.tsx     # POST /api/analyze (fire-and-forget, return 202)
│   │       ├── retry.tsx       # POST /api/retry/:id (ลบ result เก่า + เริ่มใหม่)
│   │       └── status.tsx      # GET /api/status/:id (polling)
│   ├── types/
│   │   └── analysis.ts         # TypeScript types
│   ├── app.css                 # Global styles + theme
│   ├── root.tsx                # Root layout + Google Fonts
│   └── routes.ts               # Route definitions
├── supabase/
│   └── migrations/
│       └── 001_initial.sql     # Database schema
├── docs/                       # เอกสารโปรเจกต์
├── docker-compose.yml          # MinIO local dev
├── Dockerfile                  # Production container (multi-stage, yarn)
└── package.json
```

**หลักการจัดโครงสร้าง:**

- `.server.ts` — ไฟล์ที่รันบน server เท่านั้น (มี secrets, DB connections)
- `api/` routes — endpoint สำหรับ fetch จาก client
- `components/ui/` — primitive components จาก shadcn
- `components/` — business components เฉพาะโปรเจกต์

---

## 4. Database Schema

### วิธีคิด

ออกแบบ schema โดยถามว่า "สถานะ lifecycle ของไฟล์เป็นยังไง?"

```
pending → processing → done
                    ↘ error
```

```sql
CREATE TABLE audio_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,      -- ชื่อใน MinIO (UUID.ext)
  original_name TEXT NOT NULL,      -- ชื่อไฟล์ต้นฉบับ
  file_size     BIGINT,             -- ขนาดไฟล์ (bytes)
  duration      FLOAT,             -- ความยาวเสียง (seconds)
  mime_type     TEXT,              -- audio/mpeg, audio/wav, ...
  storage_url   TEXT NOT NULL,      -- URL ใน MinIO
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message TEXT,              -- รายละเอียดข้อผิดพลาด
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE analysis_results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_file_id      UUID NOT NULL REFERENCES audio_files(id) ON DELETE CASCADE,
  transcription      TEXT,          -- ข้อความถอดจากเสียง
  emotion            TEXT CHECK (emotion IN ('neutral', 'positive', 'negative')),
  emotion_score      FLOAT,         -- ความมั่นใจ 0.0–1.0
  satisfaction_score INT,           -- คะแนนความพึงพอใจ 0–100
  illegal_detected   BOOLEAN NOT NULL DEFAULT false,
  illegal_details    TEXT,          -- รายละเอียดหากพบเนื้อหาไม่เหมาะสม
  model_used         TEXT,          -- claude-sonnet-4-6, gpt-4o, ...
  processing_time_ms INT,           -- เวลาประมวลผล (ms)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Index ที่เพิ่ม:**

- `idx_audio_files_status` — สำหรับ filter ตาม status
- `idx_audio_files_created_at DESC` — สำหรับ order ล่าสุดก่อน
- `idx_analysis_audio_file_id` — สำหรับ JOIN

---

## 5. API Routes

### 5.1 POST /api/upload

**หน้าที่:** รับไฟล์เสียง, เก็บใน MinIO, สร้าง record ใน DB

```
Client → POST /api/upload (FormData)
              ↓
         ตรวจสอบ: type, size (max 100MB)
              ↓
         upload ไปยัง MinIO
         ชื่อไฟล์: {uuid}.{ext} (ป้องกัน collision)
              ↓
         สร้าง record ใน audio_files (status: 'pending')
              ↓
         return { audioFileId, filename }
```

**เหตุผลที่แยก upload กับ analyze:**

- Upload เร็ว (เพียงเขียนไฟล์)
- Analyze ช้า (อาจใช้ 1–3 นาที)
- แยกออกมาทำให้ track progress ได้และ error ชัดเจนกว่า

### 5.2 POST /api/analyze

**หน้าที่:** เริ่มกระบวนการวิเคราะห์แบบ async — return ทันที ไม่รอผล

```
Client → POST /api/analyze { audioFileId }
              ↓
         ดึง record จาก DB
              ↓
         อัพเดต status → 'processing'
              ↓
         runAnalysis() — fire-and-forget (ไม่ await)
              ↓
         return 202 { audioFileId, status: "processing" } ← ทันที

         [background]
         downloadAudio() → Whisper → Claude → saveResult()
         → อัพเดต status 'done' หรือ 'error'
```

**ทำไมใช้ fire-and-forget?**

- LiteLLM proxy อยู่หลัง Cloudflare ที่มี timeout ~100 วินาที
- ไฟล์เสียงยาวอาจใช้เวลา 1–3 นาที → เกิน timeout
- การ return ทันทีแล้วให้ client polling แก้ปัญหานี้ได้โดยไม่ต้องเปลี่ยน infrastructure

### 5.3 POST /api/retry/:id

**หน้าที่:** วิเคราะห์ใหม่สำหรับไฟล์ที่ error — ลบ result เก่าแล้วเริ่ม background job ใหม่

```
Client → POST /api/retry/:id
              ↓
         ตรวจสอบ: ไม่อนุญาตถ้า status = 'processing' (409)
              ↓
         deleteAnalysisResultByFileId() — ลบ result เก่า
              ↓
         updateStatus → 'processing'
              ↓
         runAnalysis() — fire-and-forget (ไม่ await)
              ↓
         return 202 { audioFileId, status: "processing" }
```

Client จะ poll `/api/status/:id` ทุก 3 วินาทีหลังได้รับ 202 เช่นเดียวกับ analyze

### 5.4 GET /api/status/:id

**หน้าที่:** ให้ client poll สถานะของ audioFile

```
Client → GET /api/status/:id (ทุก 3 วินาที)
              ↓
         query audio_files + analysis_results
              ↓
         return { status, error, analysisId }

         status = 'done'       → client navigate ไปหน้าผล
         status = 'error'      → client แสดง error
         status = 'processing' → client poll ต่อ
```

---

## 6. External Services

### 6.1 MinIO (Object Storage)

**ทำไมไม่ใช้ local filesystem?**

- Docker/production ไม่มี persistent filesystem
- MinIO เป็น S3-compatible ใช้งานง่าย เปลี่ยนเป็น AWS S3 ได้ทันทีแค่เปลี่ยน env

**การทำงาน:**

```typescript
// สร้าง filename ไม่ให้ซ้ำกัน
const ext = path.extname(originalName);
const filename = `${crypto.randomUUID()}${ext}`;

// Upload
await minioClient.putObject(bucket, filename, buffer, size, { "Content-Type": mimeType });

// Presigned URL สำหรับเล่นเสียง (1 ชั่วโมง)
const url = await minioClient.presignedGetObject(bucket, filename, 3600);
```

### 6.2 LiteLLM Proxy

**ทำไมใช้ LiteLLM แทนเรียก OpenAI/Anthropic โดยตรง?**

- เปลี่ยน model ได้โดยแก้แค่ `LITELLM_ANALYSIS_MODEL` ใน `.env`
- ไม่ต้องแก้ code เลย
- Centralize API key management
- Rate limiting, logging, fallback อยู่ที่ proxy

**Whisper (Speech-to-Text):**

```typescript
const response = await openai.audio.transcriptions.create({
  file: new File([buffer], filename, { type: "audio/mpeg" }),
  model: process.env.LITELLM_STT_MODEL, // openai/whisper-1
  language: "th",
  response_format: "text",
});
```

**Claude (Analysis):**

```typescript
// Prompt สั่งให้ output เป็น JSON เสมอ
const systemPrompt = `วิเคราะห์บทสนทนาและตอบเป็น JSON เท่านั้น:
{
  "emotion": "positive" | "negative" | "neutral",
  "emotion_score": 0.0–1.0,
  "satisfaction_score": 0–100,
  "illegal_detected": boolean,
  "illegal_details": string | null
}`;

// temperature: 0.1 — ต้องการผลที่ deterministic
// max_tokens: 512 — JSON สั้น ไม่ต้องการมาก
```

---

## 7. Frontend Components

### 7.1 AudioUploader

Component หลักที่จัดการ UX ทั้งหมดของการ upload

```
States:
  idle      → แสดง dropzone
  uploading → spinner + progress bar (10–40%)
  analyzing → spinner + "กำลังวิเคราะห์..." + polling (50–95%)
  done      → navigate ไปหน้าผล
  error     → แสดง error message สีแดง
```

**Upload Flow (2 step + polling):**

1. `POST /api/upload` → ได้ `audioFileId`
2. `POST /api/analyze` → server return 202 ทันที (fire-and-forget)
3. client เริ่ม poll `GET /api/status/:id` ทุก 3 วินาที
4. เมื่อ status = `done` → navigate ไปหน้าผล

**ทำไมทำ 2 step (upload แล้วค่อย analyze)?**

- Upload เร็ว (เพียงเขียนไฟล์) / Analyze ช้า (1–3 นาที) — error แยกกันชัดเจน
- Polling ป้องกัน Cloudflare timeout (524) จาก LiteLLM proxy
- ถ้า user ปิด browser ระหว่าง polling — server ยังทำงานต่อ, ผลบันทึกใน DB เมื่อเสร็จ

### 7.2 EmotionBadge

```typescript
const EMOTION_CONFIG = {
  positive: { label: "ดี", color: "green", emoji: "😊" },
  neutral: { label: "ธรรมชาติ", color: "yellow", emoji: "😐" },
  negative: { label: "ไม่ดี", color: "red", emoji: "😞" },
};
```

แสดงสีต่างกันชัดเจน ให้ scan ด้วยตาได้เร็ว

### 7.3 AudioPlayer

ใช้ presigned URL จาก MinIO เล่นเสียงตรงในหน้า detail  
URL มีอายุ 1 ชั่วโมง เพียงพอสำหรับการตรวจสอบ

---

## 8. หน้าแต่ละหน้า

### หน้าแรก (/)

```
[Title: Voice Analysis]
[Subtitle]
[AudioUploader — dropzone]
[Link → ดูประวัติ]
[Feature cards: Speech-to-Text | วิเคราะห์อารมณ์ | ตรวจจับ]
```

Feature cards ใช้ Lucide icons + สี circle background:

- `AudioLines` (น้ำเงิน) — Speech-to-Text
- `BrainCircuit` (ม่วง) — วิเคราะห์อารมณ์
- `ShieldAlert` (แดง) — ตรวจจับเนื้อหาไม่เหมาะสม

### หน้าประวัติ (/analyses)

ใช้ **loader pattern** ของ React Router — โหลดข้อมูลฝั่ง server ก่อน render

```typescript
export async function loader() {
  const files = await getAudioFiles(); // SELECT * JOIN analysis_results ORDER BY created_at DESC
  return { files };
}
```

ตารางแสดง: ชื่อไฟล์, วันที่, ขนาด, สถานะ, อารมณ์, เนื้อหาผิดกฎหมาย, คะแนน

กดแถวใดก็ navigate ไปหน้า detail

### หน้า Detail (/analyses/:id)

```
[← กลับ]
[ชื่อไฟล์] [วันที่] [ขนาด] [ความยาว]
[Audio Player]
[สถานะ / Error alert]
─────────────────────
[⚠️ พบเนื้อหาไม่เหมาะสม] (ถ้ามี)
[อารมณ์: badge + score]
[ความพึงพอใจ: progress bar]
[ข้อความถอด: textarea]
[Meta: model, เวลาประมวลผล]
```

---

## 9. TypeScript Types

กำหนด types ชัดเจนตั้งแต่แรกเพื่อป้องกัน runtime error

```typescript
// Status lifecycle
type AudioFileStatus = 'pending' | 'processing' | 'done' | 'error';

// Emotion classification
type Emotion = 'neutral' | 'positive' | 'negative';

// DB record
interface AudioFile { ... }
interface AnalysisResult { ... }

// JOIN query result
interface AudioFileWithAnalysis extends AudioFile {
  analysis_results: AnalysisResult[];
}

// LLM output (สำหรับ parse JSON จาก Claude)
interface AnalysisOutput {
  emotion: Emotion;
  emotion_score: number;
  satisfaction_score: number;
  illegal_detected: boolean;
  illegal_details: string | null;
}
```

---

## 10. Styling & Fonts

### Font Strategy

ใช้ **Noto Sans Thai** จาก Google Fonts โหลดผ่าน `<link>` preconnect ใน `root.tsx`:

```typescript
// root.tsx
export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600&display=swap",
  },
];
```

```css
--font-sans: "Noto Sans Thai", ui-sans-serif, system-ui, sans-serif;
```

**หมายเหตุ:** เดิมพยายามใช้ `@fontsource/noto-sans-thai` (self-hosted) แต่ต้อง install package แยก
ปัจจุบันใช้ Google Fonts ซึ่งไม่ต้อง install อะไรเพิ่ม

### Color System

ใช้ **OKLch color space** แทน HEX/RGB เพราะ:

- Perceptually uniform — สีดูสม่ำเสมอกว่า
- Dark mode ทำได้ง่ายกว่า

```css
:root {
  --background: oklch(1 0 0); /* ขาว */
  --foreground: oklch(0.145 0 0); /* ดำเกือบสนิท */
  --primary: oklch(0.205 0 0); /* ดำ */
}

.dark {
  --background: oklch(0.145 0 0); /* ดำ */
  --foreground: oklch(0.985 0 0); /* ขาว */
}
```

---

## 11. Docker & Deployment

### Local Development

```bash
# 1. Start MinIO
docker-compose up -d

# 2. Install dependencies
yarn install

# 3. Setup .env
cp .env.example .env
# แก้ไข SUPABASE_URL, SUPABASE_ANON_KEY, LITELLM_BASE_URL, ...

# 4. Run migration
# ไปที่ Supabase Dashboard → SQL Editor → paste supabase/migrations/001_initial.sql

# 5. Start dev server
yarn dev
```

### Production (Docker)

Dockerfile ใช้ **multi-stage build** เพื่อลดขนาด image:

```dockerfile
# Stage 1: ติดตั้ง deps ทั้งหมด
FROM node:20-alpine AS development-dependencies-env
RUN corepack enable && yarn install --frozen-lockfile

# Stage 2: production deps เท่านั้น
FROM node:20-alpine AS production-dependencies-env
RUN corepack enable && yarn install --frozen-lockfile --production

# Stage 3: build
FROM node:20-alpine AS build-env
RUN yarn build

# Stage 4: runtime
FROM node:20-alpine
CMD ["yarn", "start"]
```

ผล: image เล็กลงมาก ไม่มี devDependencies ใน production  
**Package manager: yarn เท่านั้น** — ไม่ใช้ npm

---

## 12. สิ่งที่ยังไม่ได้ทำ (Known Limitations)

### Server Restart ระหว่าง Analyze

ปัจจุบัน fire-and-forget ทำงานใน Node.js process — ถ้า **server restart** ระหว่าง analyze ไฟล์จะค้างที่ `processing` ตลอดไป

**Workaround:** แก้ status ด้วยมือใน Supabase เป็น `error` แล้วกด Retry ใน UI  
**แนวทางแก้ถาวร:** ย้ายไปใช้ **N8N workflow** — app trigger webhook ไป N8N แทน `runAnalysis()` โดยตรง, N8N จัดการ retry และ error handling เอง

### Cloudflare 524 Timeout

LiteLLM proxy บน `models.thcloud.ai` อยู่หลัง Cloudflare ที่มี timeout 100 วินาที ไฟล์เสียงที่ยาวมากอาจ timeout

**Workaround:** ลดขนาดไฟล์ หรือ retry (server อาจไม่ยุ่งแล้ว)  
**แนวทางแก้ถาวร:**

- เพิ่ม timeout ใน Cloudflare dashboard ของ `models.thcloud.ai`
- หรือ bypass ผ่าน Netbird IP ตรงโดยไม่ผ่าน Cloudflare

### ไม่มี Authentication

ระบบยังไม่มี login/auth — ทุกคนที่เข้าถึง URL เห็นข้อมูลทั้งหมด

**แนวทางแก้:** เพิ่ม Supabase Auth + Row Level Security (ดู `docs/auth-migration.md`)

### หน้า /analyses ไม่ Real-time

ถ้าเปิดหน้าประวัติค้างไว้ ต้อง reload เองเพื่อเห็นไฟล์ที่วิเคราะห์เสร็จใหม่

**แนวทางแก้:** Supabase Realtime subscription

---

## 13. Environment Variables

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET_NAME=voice-analysis

# LiteLLM
LITELLM_BASE_URL=https://models.thcloud.ai/v1
LITELLM_API_KEY=sk-...
LITELLM_STT_MODEL=openai/whisper-1
LITELLM_ANALYSIS_MODEL=claude-sonnet-4-6

# App
NODE_ENV=development
```

---

## 14. Dependencies หลัก

| Package               | Version | ใช้ทำอะไร                                |
| --------------------- | ------- | ---------------------------------------- |
| react-router          | 7.14.0  | SSR framework + routing + server actions |
| @supabase/supabase-js | 2.x     | PostgreSQL client                        |
| minio                 | 8.x     | Object storage client                    |
| openai                | 6.x     | LiteLLM/OpenAI API client                |
| react-dropzone        | 15.x    | Drag & drop file upload                  |
| lucide-react          | 1.x     | Icons                                    |
| tailwindcss           | 4.x     | Utility CSS                              |
| shadcn                | 4.x     | UI component system                      |

---

---

## 15. Git Workflow

```
main ← staging ← develop ← yongyut/feat-xxx
```

| Branch           | ใช้ทำอะไร                                                  |
| ---------------- | ---------------------------------------------------------- |
| `main`           | Production — deploy อัตโนมัติผ่าน GitHub Actions + Coolify |
| `staging`        | ทดสอบกับ environment ใกล้ production ก่อน merge            |
| `develop`        | รวม feature ก่อน test                                      |
| `name/type-desc` | Feature branch ของแต่ละคน                                  |

**Convention ชื่อ branch:** `<name>/<type>-<desc>` เช่น `yongyut/feat-add-delete-button`  
**Conventional commit types:** `feat`, `fix`, `refactor`, `docs`, `chore`

---

## 16. Code Quality

| Tool       | ใช้ทำอะไร                                     |
| ---------- | --------------------------------------------- |
| ESLint     | Linting — flat config (`eslint.config.js`)    |
| Prettier   | Code formatting (`.prettierrc`)               |
| Husky      | Pre-commit hook — รัน lint + format อัตโนมัติ |
| TypeScript | Type checking (`yarn typecheck`)              |

**หมายเหตุ ESLint:** ใช้ ESLint 10 + `eslint-plugin-react-hooks` เท่านั้น  
ไม่ใช้ `eslint-plugin-react` เพราะ v7.x ยังไม่รองรับ ESLint 10 (context API เปลี่ยน)

---

_สร้างเมื่อ 2026-04-09 · อัพเดตล่าสุด 2026-04-09_
