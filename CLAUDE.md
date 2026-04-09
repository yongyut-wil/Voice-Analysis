# Voice Analysis — CLAUDE.md

โปรเจกต์ภายใน TonghuaLab สำหรับวิเคราะห์คุณภาพบทสนทนาเสียงโดยอัตโนมัติ

## Tech Stack

- **Framework**: React Router v7 (SSR, framework mode) — ใช้ loader/action pattern เสมอ
- **Database**: Supabase (PostgreSQL) — ใช้ service role key ฝั่ง server เท่านั้น
- **Storage**: MinIO (S3-compatible) — bucket `voice-analysis`
- **AI**: LiteLLM proxy → Whisper (STT) + Claude Sonnet (analysis)
- **UI**: shadcn/ui + TailwindCSS v4 + Lucide icons
- **Language**: TypeScript strict mode

## โครงสร้างสำคัญ

```
app/
  routes/
    home.tsx              # หน้าแรก — upload
    analyses.tsx          # ประวัติการวิเคราะห์ (loader)
    analyses.$id.tsx      # รายละเอียด (loader)
    api/upload.tsx        # POST /api/upload — MinIO + Supabase
    api/analyze.tsx       # POST /api/analyze — Whisper + Claude
  lib/
    supabase.server.ts    # DB operations (server only)
    minio.server.ts       # File storage (server only)
    litellm.server.ts     # AI calls (server only)
  components/
    audio-uploader.tsx    # Dropzone + upload/analyze flow
    audio-player.tsx      # HTML5 player ด้วย presigned URL
    emotion-badge.tsx     # แสดง positive/neutral/negative
  types/
    analysis.ts           # AudioFile, AnalysisResult, Emotion types
supabase/
  migrations/
    001_initial.sql       # audio_files + analysis_results tables
docs/
  migration.md            # วิธี setup โปรเจกต์จากศูนย์
  auth-migration.md       # แผน migration เพิ่ม Supabase Auth
  metabase-dashboard.md   # Dashboard ID 317, SQL queries
  project-overview.md     # เอกสารอธิบายโครงสร้างและ design decisions
```

## Conventions

### Server vs Client

- ไฟล์ที่ลงท้าย `.server.ts` รันบน server เท่านั้น — ห้าม import ใน client component
- ทุก DB/storage/AI call ต้องอยู่ใน `.server.ts` หรือ route loader/action
- ใช้ `SUPABASE_SERVICE_ROLE_KEY` ฝั่ง server, `SUPABASE_ANON_KEY` ถ้าเพิ่ม client-side auth

### Database

- Tables: `audio_files`, `analysis_results`
- Status lifecycle: `pending → processing → done | error`
- Emotion values: `'positive' | 'neutral' | 'negative'` (lowercase เสมอ)
- ไม่มี migration tool — run SQL ตรงใน Supabase SQL Editor

### Routing

- ใช้ `route()` และ `index()` จาก `@react-router/dev/routes` ใน `app/routes.ts`
- API routes อยู่ใน `app/routes/api/` — export `action()` เท่านั้น (ไม่มี default component)
- Loader ต้องไม่ throw error ที่ยังไม่ได้ handle — ใช้ `return null` แทน

### UI

- ใช้ shadcn components จาก `~/components/ui/` ก่อนสร้างใหม่
- Icons: Lucide React เท่านั้น ห้ามใช้ emoji ใน component
- Font: Geist Variable (Latin) + Noto Sans Thai — อย่าเพิ่ม Google Fonts อื่น
- สี: ใช้ CSS variables (`--primary`, `--muted-foreground`) ไม่ hardcode สี

### TypeScript

- ใช้ types จาก `~/types/analysis.ts` — ไม่สร้าง inline type ซ้ำ
- Route types มาจาก `./+types/<route-name>` (auto-generated)
- ไม่ใช้ `any` — ใช้ `unknown` แล้ว narrow แทน

## Known Limitations (MVP)

1. **Synchronous analyze** — ถ้า browser ปิดระหว่าง process ไฟล์จะค้างที่ `processing`
   - แก้ด้วยการเปลี่ยน status เป็น `error` ใน Supabase แล้ว upload ใหม่
2. **ไม่มี Auth** — ทุกคนที่เข้าถึง URL เห็นข้อมูลทั้งหมด (ดู `docs/auth-migration.md`)
3. **ไม่มี Polling** — หน้า /analyses ต้อง refresh เองเพื่อเห็นสถานะใหม่

## Environment Variables ที่จำเป็น

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MINIO_ENDPOINT
MINIO_PORT
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
MINIO_BUCKET_NAME
LITELLM_BASE_URL
LITELLM_API_KEY
LITELLM_STT_MODEL
LITELLM_ANALYSIS_MODEL
```

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
