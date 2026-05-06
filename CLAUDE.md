# Voice Analysis — CLAUDE.md

โปรเจกต์ภายใน TonghuaLab สำหรับวิเคราะห์คุณภาพบทสนทนาเสียงโดยอัตโนมัติ

## Tech Stack

- **Framework**: React Router v7 (SSR, framework mode) — ใช้ loader/action pattern เสมอ
- **Database**: Supabase (PostgreSQL) — ใช้ service role key ฝั่ง server เท่านั้น
- **Storage**: MinIO (S3-compatible) — bucket `voice-analysis`
- **AI (STT)**: LiteLLM → `gpt-4o-mini-transcribe` หรือ model ที่กำหนดใน `LITELLM_STT_MODEL`
- **AI (Analysis)**: LiteLLM proxy → Claude Sonnet
- **Automation**: direct Node.js background analysis (fire-and-forget ใน process เดียวกัน)
- **Audio processing**: ffmpeg + ffprobe (system binary) — ใช้ probe duration และ chunk ไฟล์ยาว
- **UI**: shadcn/ui + TailwindCSS v4 + Lucide icons
- **Language**: TypeScript strict mode

## โครงสร้างสำคัญ

```
app/
  routes/
    home.tsx              # หน้าแรก — upload
    analyses.tsx          # ประวัติการวิเคราะห์ (loader)
    analyses.$id.tsx      # รายละเอียด (loader) + RetryButton
    well-known.tsx        # /.well-known/* → 404 เงียบๆ
    api/upload.tsx        # POST /api/upload — MinIO + Supabase
    api/analyze.tsx       # POST /api/analyze — start analysis job (direct), return 202
    api/retry.tsx         # POST /api/retry/:id — ลบ result เก่า แล้วเริ่มใหม่
    api/status.tsx        # GET /api/status/:id — polling endpoint
    api/health.tsx        # GET — health check (MinIO + Supabase)
    api/search.tsx        # GET /api/search?q=... — semantic search ผ่าน MindsDB KB
    api/agent.tsx         # POST /api/agent { question } — NL analytics ผ่าน MindsDB Agent
  lib/
    supabase.server.ts    # DB operations (server only)
    minio.server.ts       # File storage (server only)
    litellm.server.ts     # AI calls — STT + LLM analysis (server only)
    audio.server.ts       # ffmpeg/ffprobe wrapper — probeDurationSec, chunkAudioToMp3
    analysis.server.ts    # runAnalysis() + isStuckProcessing() (server only)
    mindsdb.server.ts     # MindsDB integration — semanticSearch(), askAnalyticsAgent() (server only)
    error-utils.ts        # cleanErrorMessage(), extractErrorMessage() — ใช้ได้ทั้ง client และ server
    logger.ts             # Structured logging — ANSI color (dev) / JSON (production)
  components/
    audio-uploader.tsx    # Dropzone + upload/analyze flow + client polling
    audio-player.tsx      # HTML5 player ด้วย presigned URL
    emotion-badge.tsx     # แสดง positive/neutral/negative
    semantic-search.tsx   # MindsDB semantic search UI + results
  types/
    analysis.ts           # AudioFile, AnalysisResult, Emotion types
supabase/
  schema.sql                        # ✅ Fresh install — รันไฟล์เดียวจบ (public schema)
  migrations/
    001_initial.sql                 # audio_files + analysis_results tables (voice_analysis schema — legacy)
    002_add_summary_stt_model.sql   # เพิ่ม summary + stt_model_used columns
    004_add_user_id.sql             # user_id + RLS policies (public schema)
docs/
  architecture.md         # System architecture diagrams + data flow
  how-it-works.md         # Step-by-step walkthrough สำหรับ developer ใหม่
  auth-migration.md       # แผน migration เพิ่ม Supabase Auth
  metabase-dashboard.md   # Dashboard ID 317, SQL queries
  status.md               # Feature status tracking (อ่านก่อนเริ่ม session)
```

## Conventions

### Server vs Client

- ไฟล์ที่ลงท้าย `.server.ts` รันบน server เท่านั้น — ห้าม import ใน client component
- ทุก DB/storage/AI call ต้องอยู่ใน `.server.ts` หรือ route loader/action
- ใช้ `SUPABASE_SERVICE_ROLE_KEY` ฝั่ง server, `SUPABASE_ANON_KEY` ถ้าเพิ่ม client-side auth

### Database

- Schema: **`public`** (Supabase expose ให้อัตโนมัติ ไม่ต้องตั้งค่าเพิ่ม)
- Tables: `audio_files`, `analysis_results`
- Status lifecycle: `pending → processing → done | error`
- Emotion values: `'positive' | 'neutral' | 'negative'` (lowercase เสมอ)
- `analysis_results` มี columns เพิ่มเติม: `summary TEXT`, `stt_model_used TEXT`
- Fresh install: รัน `supabase/schema.sql` ใน Supabase SQL Editor ไฟล์เดียวจบ
- ไม่มี migration tool — run SQL ตรงใน Supabase SQL Editor

### Routing

- ใช้ `route()` และ `index()` จาก `@react-router/dev/routes` ใน `app/routes.ts`
- API routes อยู่ใน `app/routes/api/` — export `action()` เท่านั้น (ไม่มี default component)
- Loader ต้องไม่ throw error ที่ยังไม่ได้ handle — ใช้ `return null` แทน

### UI

- ใช้ shadcn components จาก `~/components/ui/` ก่อนสร้างใหม่
- Icons: Lucide React เท่านั้น ห้ามใช้ emoji ใน component
- Font: Noto Sans Thai ผ่าน Google Fonts `<link>` ใน `root.tsx` — อย่าเพิ่ม font อื่น
- สี: ใช้ CSS variables (`--primary`, `--muted-foreground`) ไม่ hardcode สี

### Error Handling

- `extractErrorMessage(err)` — แปลง unknown error เป็น string รวม `err.body` (OpenAI SDK errors)
- `cleanErrorMessage(raw)` — แปลง raw error เป็นข้อความสั้นที่เหมาะกับ UI + DB
- ทั้งคู่อยู่ใน `~/lib/error-utils.ts` — import ได้ทั้ง client และ server
- ใน catch block ของ route ให้ใช้ `cleanErrorMessage(extractErrorMessage(err))` เสมอ
- ห้าม import จาก `~/lib/analysis.server` ใน route component ที่ render บน client
  เพราะ Vite จะพัง (Server-only module referenced by client)

### TypeScript

- ใช้ types จาก `~/types/analysis.ts` — ไม่สร้าง inline type ซ้ำ
- Route types มาจาก `./+types/<route-name>` (auto-generated)
- ไม่ใช้ `any` — ใช้ `unknown` แล้ว narrow แทน

### AI Pipeline

- `transcribeAudio(buffer, filename)` return `{ transcription, sttModel, duration }` — duration เป็นวินาที (probe ด้วย ffprobe)
- ไฟล์ยาว > 5 นาที → `chunkAudioToMp3` แบ่งเป็น chunk 5 นาที (mp3 mono 16kHz 32kbps) แล้ว parallel transcribe 3 chunks/batch แล้ว concat ด้วย `\n`
- ไฟล์ ≤ 5 นาที → single-shot ตรงๆ ผ่าน `transcribeWithLiteLLM` (zero overhead)
- `analyzeTranscription(text)` return `AnalysisOutput` ซึ่งรวม `summary` ด้วย
- `runAnalysis(audioFileId, filename, originalName)` — direct background analysis (fire-and-forget); บันทึก `audio_files.duration` หลัง probe
- Post-processing pipeline (LiteLLM path): `removeRepetitions(cleanThaiText(raw))` ทำต่อ chunk ก่อน concat
- `max_tokens: 1024` สำหรับ analysis — เพื่อให้ summary ไม่ถูกตัดกลางคัน
- Stuck-processing detection (`isStuckProcessing`): threshold 30 นาที — รองรับไฟล์ประชุมยาวที่ใช้เวลา transcribe + analyze หลายนาที

## Known Limitations (MVP)

1. **Direct analysis รันแบบ fire-and-forget ใน Node.js process** — ถ้า web process restart ระหว่างงานยาว งานที่กำลังรันอาจล้มเหลวหรือหายกลางทางได้ — UI มี stuck-detection (30 นาที) + ปุ่ม retry manual
2. **Cloudflare Connection Drop** — LiteLLM proxy อยู่หลัง Cloudflare ซึ่งตัด connection จริงที่ ~60s — **mitigate แล้วผ่าน chunking** (chunk 5 นาทีขนาดเล็ก response ไม่ถึง 60s) แต่กรณีไฟล์ ≤ 5 นาที ที่ STT response ตอบช้าเกิน 60s ยังเจอได้
3. **Auth ต้อง login** — ใช้ Supabase Auth + RLS (migration 004) บังคับ authenticated role ก่อนเข้าถึงข้อมูล
4. **หน้า /analyses ไม่ Real-time** — ต้อง refresh เองเพื่อเห็นสถานะใหม่
5. **MindsDB Agent API** — ใช้ `/a2a/` JSON-RPC endpoint (ไม่ใช่ SQL SDK) เพราะ:
   - SDK auth มีปัญหากับ agent queries (401 errors even after successful connection)
   - REST API `/api/sql/query` ต้อง session cookie ที่ยุ่งยาก
   - `/a2a/` เป็น official agent endpoint ที่ UI ใช้ — ต้อง login ก่อนแล้วใช้ Bearer token + session cookie
   - ใช้ callback ที่มี `ensureMindsDBAuth()` เพื่อรักษา session

## Environment Variables ที่จำเป็น

```
SUPABASE_URL
SUPABASE_ANON_KEY                # ใช้สำหรับ auth (SSR session)
SUPABASE_SERVICE_ROLE_KEY        # ใช้สำหรับ DB operations ฝั่ง server (bypass RLS)
MINIO_ENDPOINT
MINIO_PORT
MINIO_USE_SSL
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
MINIO_BUCKET_NAME
LITELLM_BASE_URL
LITELLM_API_KEY
LITELLM_STT_MODEL        # เช่น gpt-4o-mini-transcribe
LITELLM_ANALYSIS_MODEL   # เช่น claude-sonnet-4-6
ANALYSIS_PROMPT_TEMPLATE # optional; ถ้าตั้งค่า จะ override prompt วิเคราะห์ (ใช้ `{TRANSCRIPTION}` เป็น placeholder ได้)

# MindsDB Integration (optional — semantic search + analytics agent)
MINDSDB_HOST             # MindsDB server URL เช่น http://localhost:47334
MINDSDB_USERNAME         # username สำหรับ login (default: "admin")
MINDSDB_PASSWORD         # password สำหรับ login (default: "admin123")
MINDSDB_API_KEY          # ปล่อยว่างสำหรับ self-hosted, ใส่ key สำหรับ MindsDB Cloud

# Authentik OIDC SSO (optional — Phase 2)
# ⚠️ READ โดย Supabase GoTrue ไม่ใช่ Node app โดยตรง
# - Self-hosted Supabase: ใส่ใน supabase-auth service env
# - Supabase Cloud: ใส่ใน Dashboard → Auth → Providers → Custom OIDC Provider
# - ค่าได้มาจาก Authentik Admin → Applications → Providers → <Voice Analysis>
AUTHENTIK_CLIENT_ID=
AUTHENTIK_CLIENT_SECRET=
AUTHENTIK_ISSUER_URL=    # https://<authentik-domain>/application/o/voice-analysis/ (ต้องมี trailing slash)
AUTHENTIK_REDIRECT_URI=  # <supabase-url>/auth/v1/callback
```

### STT Provider

ระบบใช้ LiteLLM เป็น STT provider เพียงทางเดียว ผ่าน `LITELLM_STT_MODEL` env var

| Setting                  | หน้าที่                                            |
| ------------------------ | -------------------------------------------------- |
| `LITELLM_STT_MODEL`      | model สำหรับ STT เช่น `gpt-4o-mini-transcribe`     |
| `LITELLM_ANALYSIS_MODEL` | model สำหรับ LLM analysis เช่น `claude-sonnet-4-6` |

## Commands

```bash
yarn dev          # Dev server (localhost:5173)
yarn dev --host   # Dev server แชร์บน network
yarn build        # Production build
yarn typecheck    # TypeScript check
docker-compose up -d  # Start MinIO
```

## Package Manager

ใช้ **yarn** เท่านั้น — ห้ามใช้ `npm install` หรือ `npx`

- ติดตั้ง package: `yarn add <package>`
- ติดตั้ง dev package: `yarn add -D <package>`
- Lock file: `yarn.lock` (ห้าม commit `package-lock.json`)

## Git Workflow

```
main ← staging ← develop ← yongyut/feat-xxx
```

- Branch ชื่อ: `<name>/<type>-<desc>` เช่น `yongyut/feat-add-delete-button`
- Conventional commit types: `feat`, `fix`, `refactor`, `docs`, `chore`
- PR flow: feature branch → develop → staging → main
- main = production, deploy อัตโนมัติผ่าน GitHub Actions + Coolify

## Deployment

### Docker Compose Files

| ไฟล์                             | ใช้สำหรับ                     | หมายเหตุ                                                                            |
| -------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| `docker-compose-dev.yml`         | Local dev (สำหรับ developers) | เอา Supabase, MinIO, MindsDB มาใน compose                                           |
| `docker-compose-sit.yml`         | SIT environment               | ใช้ external Supabase, หลัก MinIO เก่าใน compose                                    |
| `docker-compose.demo-dev.yml`    | Demo dev (local)              | voice-app + postgres + mindsdb + external services                                  |
| `docker-compose.demo-prod.yml`   | ⚠️ Broken                     | มี `depends_on: postgres` แต่ไม่มี service → ห้ามใช้                                |
| **`docker-compose.coolify.yml`** | **Coolify Production**        | ✅ **Production-ready** — 2 services เท่านั้น: voice-app + mindsdb (ที่เป็นมาตรฐาน) |
| `docker-compose.authentik.yml`   | Local Authentik IdP           | รัน Authentik สำหรับ SSO testing — ใช้ร่วมกับ `.env.authentik.example`              |

### Coolify Deployment (Production)

สำหรับ deploy บน Coolify ใช้ `docker-compose.coolify.yml` กับ external services (Supabase, MinIO, LiteLLM)

**คู่มือ Step-by-Step:** → `docs/coolify-quickstart.md`

**ตัวอย่าง env vars:** → `.env.coolify.example`

**สถาปัตยกรรมและ post-deployment MindsDB setup:** → `docs/coolify-deployment.md`

**ข้อควรรู้:**

- compose file ใช้ `SUPABASE_ANON_KEY` เท่านั้น (`SERVICE_ROLE_KEY` ไม่ต้อง)
- MindsDB ใช้ named volume `voice-analysis-mindsdb-data` สำหรับ persistence
- health check รอ MindsDB ให้ ready (`start_period: 90s`) ก่อน voice-app start
- MindsDB post-deployment setup (semantic search + analytics agent) ต้องการ Postgres password จาก Supabase admin (optional)

## Rules สำหรับ Claude — Documentation Must Stay In Sync

เมื่อมีการเปลี่ยนแปลงที่กระทบสิ่งต่อไปนี้ **ต้องอัพเดทเอกสารด้วยเสมอ** ในครั้งเดียวกัน:

| การเปลี่ยนแปลง                                     | เอกสารที่ต้องอัพเดท                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| เพิ่ม/ลบ/เปลี่ยน environment variable              | `.env.example` + `CLAUDE.md` (Environment Variables section)                                        |
| เพิ่ม/เปลี่ยน DB schema                            | สร้าง migration SQL ใน `supabase/migrations/` + `docs/metabase-dashboard.md` (ถ้ากระทบ SQL queries) |
| เพิ่ม/ลบ route หรือ API endpoint                   | `CLAUDE.md` (โครงสร้าง)                                                                             |
| เปลี่ยน AI pipeline (model, provider, return type) | `CLAUDE.md` (AI Pipeline section) + `docs/how-it-works.md`                                          |
| เปลี่ยน architecture หรือเพิ่ม component สำคัญ     | `docs/architecture.md` + `docs/how-it-works.md`                                                     |
| แก้ Known Limitation หรือพบ limitation ใหม่        | `CLAUDE.md` (Known Limitations section)                                                             |
| เริ่ม implement auth                               | `docs/auth-migration.md` (อัพเดทจาก "แผน" เป็น "วิธีทำจริง")                                        |

**ไม่ต้องอัพเดทเอกสาร:** bug fix ภายใน, refactor โดยไม่เปลี่ยน interface, เปลี่ยน UI สีหรือ style

---

## Rules สำหรับ Claude — Actions ที่ต้องถามก่อนเสมอ

ห้ามทำสิ่งต่อไปนี้โดยไม่ได้รับคำสั่งชัดเจน:

| Action                                          | เหตุผล                          |
| ----------------------------------------------- | ------------------------------- |
| `git commit`                                    | อาจ commit ไฟล์ที่ยังไม่พร้อม   |
| `git push`                                      | ส่งขึ้น remote กลับยาก          |
| `git reset --hard` / `git checkout .`           | ลบ changes ที่ยังไม่ได้ save    |
| `git merge` / `git rebase`                      | เปลี่ยน history อาจยุ่งยาก      |
| รัน SQL `DROP` / `ALTER` / `DELETE` บน Supabase | แก้ไข production DB             |
| แก้ไขไฟล์ `.env`                                | อาจกระทบ environment ที่รันอยู่ |
| ลบไฟล์จาก MinIO โดยตรง                          | ข้อมูลหายถาวร                   |
| ติดตั้ง package ใหม่ (`yarn add`)               | เปลี่ยน dependencies            |
