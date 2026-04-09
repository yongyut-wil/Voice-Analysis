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
    analyses.$id.tsx      # รายละเอียด (loader) + RetryButton
    well-known.tsx        # /.well-known/* → 404 เงียบๆ
    api/upload.tsx        # POST /api/upload — MinIO + Supabase
    api/analyze.tsx       # POST /api/analyze — fire-and-forget, return 202
    api/retry.tsx         # POST /api/retry/:id — ลบ result เก่า แล้วเริ่มใหม่
    api/status.tsx        # GET /api/status/:id — polling endpoint
  lib/
    supabase.server.ts    # DB operations (server only)
    minio.server.ts       # File storage (server only)
    litellm.server.ts     # AI calls (server only)
    analysis.server.ts    # runAnalysis() — shared logic สำหรับ analyze + retry
    error-utils.ts        # cleanErrorMessage() — ใช้ได้ทั้ง client และ server
  components/
    audio-uploader.tsx    # Dropzone + upload/analyze flow + client polling
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
- Font: Noto Sans Thai ผ่าน Google Fonts `<link>` ใน `root.tsx` — อย่าเพิ่ม font อื่น
- สี: ใช้ CSS variables (`--primary`, `--muted-foreground`) ไม่ hardcode สี

### Error Handling

- `cleanErrorMessage()` อยู่ใน `~/lib/error-utils.ts` — import ได้ทั้ง client และ server
- ห้าม import จาก `~/lib/analysis.server` ใน route component ที่ render บน client
  เพราะ Vite จะพัง (Server-only module referenced by client)

### TypeScript

- ใช้ types จาก `~/types/analysis.ts` — ไม่สร้าง inline type ซ้ำ
- Route types มาจาก `./+types/<route-name>` (auto-generated)
- ไม่ใช้ `any` — ใช้ `unknown` แล้ว narrow แทน

## Known Limitations (MVP)

1. **Server restart ระหว่าง analyze** — fire-and-forget รันใน Node.js process ถ้า server restart ไฟล์จะค้างที่ `processing`
   - Workaround: แก้ status เป็น `error` ใน Supabase แล้วกด Retry
   - แนวทางถาวร: ย้ายไปใช้ N8N workflow (trigger webhook แทน runAnalysis โดยตรง)
2. **Cloudflare 524 Timeout** — LiteLLM proxy อยู่หลัง Cloudflare timeout 100s ไฟล์เสียงยาวอาจ timeout
   - Workaround: ใช้ไฟล์ที่เล็กลง หรือ retry (server อาจไม่ยุ่งแล้ว)
   - แนวทางถาวร: เพิ่ม timeout ใน Cloudflare dashboard หรือ bypass ผ่าน Netbird IP
3. **ไม่มี Auth** — ทุกคนที่เข้าถึง URL เห็นข้อมูลทั้งหมด (ดู `docs/auth-migration.md`)
4. **หน้า /analyses ไม่ Real-time** — ต้อง refresh เองเพื่อเห็นสถานะใหม่

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

## Git Workflow

```
main ← staging ← develop ← yongyut/feat-xxx
```

- Branch ชื่อ: `<name>/<type>-<desc>` เช่น `yongyut/feat-add-delete-button`
- Conventional commit types: `feat`, `fix`, `refactor`, `docs`, `chore`
- PR flow: feature branch → develop → staging → main
- main = production, deploy อัตโนมัติผ่าน GitHub Actions + Coolify
