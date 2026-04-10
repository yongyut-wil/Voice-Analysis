# Migration Guide — Voice Analysis

คู่มือสำหรับ setup โปรเจกต์ใหม่หรือ deploy ไปยัง environment ใหม่ ทำตามลำดับขั้นตอน

---

## Prerequisites

| สิ่งที่ต้องมี    | Version     |
| ---------------- | ----------- |
| Node.js          | 20+         |
| yarn             | 1.22+       |
| Docker           | 24+         |
| Supabase account | —           |
| LiteLLM proxy    | รันอยู่แล้ว |

---

## ขั้นตอนที่ 1 — Clone & Install

```bash
git clone <repo-url>
cd "Voice Analysis"
yarn install
```

---

## ขั้นตอนที่ 2 — Environment Variables

คัดลอกและแก้ไข `.env`:

```bash
cp .env.example .env
```

แก้ไขค่าแต่ละตัว:

```env
# ── Supabase ──────────────────────────────────────
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# ── MinIO ─────────────────────────────────────────
MINIO_ENDPOINT=localhost          # หรือ IP/domain ของ MinIO server
MINIO_PORT=9000
MINIO_USE_SSL=false               # true ถ้าใช้ HTTPS
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET_NAME=voice-analysis

# ── LiteLLM (ใช้สำหรับ analysis เสมอ) ────────────
LITELLM_BASE_URL=https://models.thcloud.ai/v1
LITELLM_API_KEY=sk-...
LITELLM_STT_MODEL=openai/whisper-1   # ใช้เป็น STT fallback ถ้าไม่มี Deepgram
LITELLM_ANALYSIS_MODEL=claude-sonnet-4-6

# ── Deepgram (optional — แนะนำสำหรับ Thai STT) ───
# ถ้าตั้งค่าจะใช้แทน Whisper → เร็วกว่า, Thai ดีกว่า, ไม่ผ่าน Cloudflare
DEEPGRAM_API_KEY=

# ── App ───────────────────────────────────────────
NODE_ENV=development
```

### STT Provider Selection

| ตัวเลือก          | วิธีตั้งค่า                                    |
| ----------------- | ---------------------------------------------- |
| Deepgram Nova-3   | ตั้งค่า `DEEPGRAM_API_KEY=dg_...`              |
| LiteLLM / Whisper | เว้นว่าง `DEEPGRAM_API_KEY=` (ใช้ LiteLLM แทน) |

### หา Supabase Keys

1. เข้า [Supabase Dashboard](https://supabase.com/dashboard)
2. เลือก Project → **Settings** → **API**
3. คัดลอก:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY`
   - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY`

---

## ขั้นตอนที่ 3 — Database Migration (Supabase)

### 3.1 Run 001_initial.sql

1. เข้า Supabase Dashboard → **SQL Editor**
2. คลิก **New query**
3. วาง SQL จากไฟล์ `supabase/migrations/001_initial.sql`:

```sql
CREATE TABLE IF NOT EXISTS audio_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size     BIGINT,
  duration      FLOAT,
  mime_type     TEXT,
  storage_url   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_file_id      UUID NOT NULL REFERENCES audio_files(id) ON DELETE CASCADE,
  transcription      TEXT,
  emotion            TEXT CHECK (emotion IN ('neutral', 'positive', 'negative')),
  emotion_score      FLOAT CHECK (emotion_score BETWEEN 0 AND 1),
  satisfaction_score INT  CHECK (satisfaction_score BETWEEN 0 AND 100),
  illegal_detected   BOOLEAN NOT NULL DEFAULT false,
  illegal_details    TEXT,
  model_used         TEXT,
  processing_time_ms INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_files_status     ON audio_files(status);
CREATE INDEX IF NOT EXISTS idx_audio_files_created_at ON audio_files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_audio_file_id ON analysis_results(audio_file_id);
```

4. คลิก **Run** (หรือ `Ctrl+Enter`)
5. ตรวจสอบว่า **Table Editor** เห็น `audio_files` และ `analysis_results`

### 3.2 Run 002_add_summary_stt_model.sql

1. คลิก **New query**
2. วาง SQL จากไฟล์ `supabase/migrations/002_add_summary_stt_model.sql`:

```sql
ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS summary       TEXT,
  ADD COLUMN IF NOT EXISTS stt_model_used TEXT;
```

3. คลิก **Run**

### 3.3 ตรวจสอบหลัง Run

ไปที่ **Table Editor** ใน Supabase — ควรเห็น:

| Table              | Columns                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `audio_files`      | id, filename, original_name, file_size, duration, mime_type, storage_url, status, error_message, created_at                                                                          |
| `analysis_results` | id, audio_file_id, transcription, emotion, emotion_score, satisfaction_score, illegal_detected, illegal_details, summary, model_used, stt_model_used, processing_time_ms, created_at |

---

## ขั้นตอนที่ 4 — MinIO (Object Storage)

### 4.1 Start MinIO ด้วย Docker

**วิธีที่ 1 — docker-compose (แนะนำสำหรับ dev)**

```bash
docker-compose up -d
```

ตรวจสอบ:

```bash
docker ps
# ควรเห็น voice-analysis-minio กำลัง running
```

**วิธีที่ 2 — docker run (standalone ไม่ต้องมี compose)**

```bash
docker run -d \
    --name minio \
    -p 9000:9000 \
    -p 9001:9001 \
    -e MINIO_ROOT_USER=minioadmin \
    -e MINIO_ROOT_PASSWORD=minioadmin123 \
    -v ~/minio-data:/data \
    minio/minio server /data --console-address ":9001"
```

ข้อมูลจะเก็บที่ `~/minio-data` บน host — ไม่หายเมื่อ container หยุด

### 4.2 สร้าง Bucket

**วิธีที่ 1 — Web Console (ง่ายสุด)**

1. เปิด [http://localhost:9001](http://localhost:9001)
2. Login: `minioadmin` / `minioadmin123`
3. คลิก **Buckets** → **Create Bucket**
4. ตั้งชื่อ: `voice-analysis`
5. คลิก **Create Bucket**

**วิธีที่ 2 — Auto-create**

ระบบจะสร้าง bucket อัตโนมัติตอน upload ไฟล์แรก ถ้า key มีสิทธิ์

### 4.3 ตรวจสอบ

```bash
curl http://localhost:9000/minio/health/live
# ควรได้ 200 OK
```

---

## ขั้นตอนที่ 5 — รัน Dev Server

```bash
yarn dev
```

เปิด [http://localhost:5173](http://localhost:5173) — ควรเห็นหน้า Voice Analysis

---

## ขั้นตอนที่ 6 — ทดสอบ End-to-End

1. เตรียมไฟล์เสียง MP3/WAV ขนาดเล็ก (~1 นาที)
2. Drag & drop ที่หน้าแรก
3. รอ upload เสร็จ
4. รอ analyze เสร็จ (อาจใช้เวลา 30–120 วินาที)
5. ตรวจสอบผลลัพธ์:
   - Transcription ถูกต้อง
   - Emotion แสดงผล
   - Satisfaction score มีค่า
6. ดู Supabase Table Editor — ควรเห็น record ใน `audio_files` และ `analysis_results`
7. ดู MinIO Console — ควรเห็นไฟล์เสียงใน bucket `voice-analysis`

---

## การ Deploy Production (Docker)

```bash
# Build image
docker build -t voice-analysis .

# Run container
docker run -p 3000:3000 \
  --env-file .env \
  voice-analysis
```

หรือใช้ docker-compose เพิ่ม service:

```yaml
# เพิ่มใน docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      minio:
        condition: service_healthy
```

---

## Migrations ถัดไป

| ไฟล์                            | สถานะ   | เมื่อต้องการ                                           |
| ------------------------------- | ------- | ------------------------------------------------------ |
| `002_add_summary_stt_model.sql` | ✅ Done | เพิ่ม summary + stt_model_used ใน analysis_results     |
| `003_add_auth.sql`              | Pending | เมื่อเพิ่ม Supabase Auth (ดู `docs/auth-migration.md`) |

---

## Git Workflow

```bash
# Clone แล้วสร้าง local branches ให้ครบ
git checkout -b develop
git checkout -b staging
git checkout master  # หรือ main

# สร้าง feature branch จาก develop
git checkout develop
git checkout -b yongyut/feat-my-feature

# หลัง commit เสร็จ push ขึ้น remote
git push origin yongyut/feat-my-feature

# สร้าง PR: yongyut/feat-xxx → develop
```

**Convention ชื่อ branch:** `<name>/<type>-<desc>`  
**Conventional commit types:** `feat`, `fix`, `refactor`, `docs`, `chore`

---

## Troubleshooting

| ปัญหา                                   | สาเหตุ                                    | วิธีแก้                                                                         |
| --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `SUPABASE_URL is not defined`           | ไม่มีไฟล์ `.env`                          | `cp .env.example .env` แล้วกรอกค่า                                              |
| `MinIO connection refused`              | Docker ไม่ได้รัน                          | `docker-compose up -d`                                                          |
| `524 Timeout` จาก LiteLLM STT           | ไฟล์ใหญ่เกิน / Cloudflare timeout 100s    | ใช้ Deepgram (`DEEPGRAM_API_KEY`) — ไม่ผ่าน Cloudflare หรือลองไฟล์เล็กลง        |
| Status ค้างที่ `processing`             | Server restart ระหว่าง analyze            | ไปที่ Supabase → แก้ status เป็น `error` แล้วกด Retry ใน UI                     |
| Table ไม่มีใน Supabase                  | ยังไม่ได้ run migration                   | ทำขั้นตอนที่ 3                                                                  |
| ESLint error pre-commit hook            | `eslint-plugin-react` ไม่รองรับ ESLint 10 | ตรวจสอบ `eslint.config.js` ว่าไม่ได้ใช้ `reactPlugin.configs.recommended`       |
| Thai transcription ดูแปลกๆ แยก syllable | Whisper bug กับภาษาไทย                    | ปกติ `cleanThaiText()` แก้ให้อัตโนมัติ ถ้ายังมีปัญหาให้ลองเปลี่ยนไปใช้ Deepgram |
