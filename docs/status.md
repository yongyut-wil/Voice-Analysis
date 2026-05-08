# Voice Analysis — Feature Status

> อัพเดทล่าสุด: 2026-05-06
> ไฟล์นี้ track สถานะ feature จริงของระบบ ใช้เป็น reference ก่อนเริ่ม session ใหม่

---

## Core App ✅ Done

| Feature                      | Route / File                                    | หมายเหตุ                                                                          |
| ---------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| Audio Upload (drag-and-drop) | `POST /api/upload`                              | MP3/WAV/M4A/OGG/WebM, max 100MB → MinIO                                           |
| Speech-to-Text               | `transcribeAudio()` ใน `litellm.server.ts`      | LiteLLM STT + Thai text cleanup; auto-chunk ไฟล์ > 5 นาที ผ่าน ffmpeg             |
| Long-Audio Chunking          | `audio.server.ts` (ffmpeg/ffprobe)              | แบ่ง 5 นาที/chunk re-encode mp3 16k mono → parallel-3 transcribe                  |
| Conversation Analysis        | `analyzeTranscription()` ใน `litellm.server.ts` | emotion, satisfaction, illegal, summary (Claude Sonnet)                           |
| Analysis History             | `GET /analyses`                                 | loader-based, manual refresh                                                      |
| Result Detail                | `GET /analyses/:id`                             | summary, emotion badge, satisfaction score, transcription, duration               |
| Retry                        | `POST /api/retry/:id`                           | ลบ result เก่า + reset created_at; ใช้ได้ทั้ง status='error' และ stuck-processing |
| Auto Cleanup                 | `deleteAudio()` ใน `runAnalysis` finally        | ลบไฟล์เสียงจาก MinIO หลัง done (try/catch ไม่กระทบ status)                        |
| Status Polling               | `GET /api/status/:id`                           | client polls ทุก 3 วินาที, return `{ status, error, analysisId, stuck }`          |
| Stuck-Processing Detection   | `isStuckProcessing()` ใน `analysis.server.ts`   | flag ถ้า processing > 30 นาที → UI แสดงปุ่ม retry manual                          |
| Health Check                 | `GET /api/health`                               | ตรวจ MinIO + Supabase                                                             |

---

## MindsDB Analytics ✅ Done

| Feature         | Route / Resource                       | หมายเหตุ                                                     |
| --------------- | -------------------------------------- | ------------------------------------------------------------ |
| Knowledge Base  | MindsDB `call_kb`                      | pgvector ใน Supabase (`supabase_pgvector.kb_transcriptions`) |
| Semantic Search | `GET /api/search?q=...`                | dedup by `audio_file_id`, คืน N unique files                 |
| Analytics Chat  | `POST /api/agent`                      | MindsDB Agent `call_analytics_agent` → ตอบภาษาไทย            |
| Auto-index Job  | MindsDB Job `index_new_transcriptions` | รันทุก 1 ชั่วโมง                                             |

**KB Syntax ที่ใช้ได้จริง:**

```sql
CREATE KNOWLEDGE BASE call_kb
USING
  embedding_model = {
    "provider": "openai",
    "model_name": "text-embedding-3-small",
    "api_key": "<LITELLM_API_KEY>",
    "base_url": "<LITELLM_BASE_URL>/v1"
  },
  storage = supabase_pgvector.kb_transcriptions,
  metadata_columns = ['audio_file_id', 'emotion', 'satisfaction_score', 'illegal_detected'];
```

> `metadata_columns` จำเป็น — ถ้าไม่ใส่ column เหล่านี้จะไม่ query ได้โดยตรง

---

## Orchestration

ปัจจุบันใช้ direct Node.js fire-and-forget เท่านั้น (`runAnalysis()` ใน `app/lib/analysis.server.ts`) — `n8n.server.ts` และ callback routes ทั้งหมดถูกถอดออกแล้ว

Stuck-processing detection (30 นาที threshold) + ปุ่ม retry manual ทดแทนเป็น recovery mechanism

---

## Metabase Dashboard ✅ Done

- Dashboard ID: **317**
- เชื่อมต่อกับ Supabase โดยตรง
- ดู SQL queries ได้ที่ `docs/metabase-dashboard.md`

---

## Auth 🔄 In Progress

| Feature                                      | ไฟล์                                   | สถานะ        | หมายเหตุ                               |
| -------------------------------------------- | -------------------------------------- | ------------ | -------------------------------------- |
| `@supabase/ssr` install                      | `package.json`                         | ✅ Done      | v0.10.2                                |
| `createSupabaseServerClient` + `requireAuth` | `app/lib/auth.server.ts`               | ✅ Done      | SSR cookie session                     |
| Login page (Email/Password)                  | `app/routes/auth.login.tsx`            | ✅ Done      | พร้อม SSO slot สำหรับ Phase 2          |
| OAuth callback handler                       | `app/routes/auth.callback.tsx`         | ✅ Done      | รองรับทั้ง password + OAuth            |
| Logout                                       | `app/routes/auth.logout.tsx`           | ✅ Done      | POST action + clear cookie             |
| Route protection                             | `analyses.tsx`, `analyses.$id.tsx`     | ✅ Done      | `requireAuth()` + logout button        |
| Database migration (RLS)                     | `supabase/migrations/002_add_auth.sql` | ❌ ยังไม่รัน | ดู `docs/auth-migration.md`            |
| Authentik OIDC Provider setup                | Authentik Admin + GoTrue env vars      | ❌ Phase 2   | ดู `docs/authentik-sso-integration.md` |
| Enable SSO button ใน login page              | `app/routes/auth.login.tsx`            | ❌ Phase 2   | uncomment เมื่อ Authentik พร้อม        |

> ดูรายละเอียดทั้งหมดได้ที่ `docs/authentik-sso-integration.md`

## Pending / In Progress 🔄

ไม่มี (นอกจาก Auth ด้านบน)

---

## ยังไม่ได้ทำ ❌

| Feature                               | เหตุผลที่รอ                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| MindsDB Forecasting                   | ต้องมีข้อมูล 30+ วันก่อน                                                                                  |
| MindsDB Batch Re-analysis (AI Tables) | ยังไม่ได้ prioritize                                                                                      |
| Audio Playback ใน UI                  | `audio-player.tsx` มีอยู่แล้วแต่ไฟล์ถูกลบหลัง analysis                                                    |
| Analytics Chat — แปล column headers   | แนวทาง: เพิ่ม `COLUMN_LABELS` map ใน `analytics-chat.tsx` แล้วใช้ตอน render `<th>` — ดูรายละเอียดด้านล่าง |

### แนวทาง: แปล column headers ใน Analytics Chat

เมื่อ MindsDB agent ตอบกลับเป็น markdown table เช่น `illegal_call_count`, `avg_satisfaction_score`
ต้องการ map เป็นชื่อภาษาไทยหรือชื่อที่อ่านง่ายขึ้น

**ไฟล์ที่ต้องแก้:** `app/components/analytics-chat.tsx`

เพิ่ม `COLUMN_LABELS` map ก่อน `renderMarkdownContent`:

```ts
const COLUMN_LABELS: Record<string, string> = {
  avg_satisfaction_score: "คะแนนความพึงพอใจเฉลี่ย",
  total_calls: "จำนวนสายทั้งหมด",
  illegal_call_count: "สายผิดกฎหมาย",
  illegal_count: "สายผิดกฎหมาย",
  negative_count: "สาย emotion ลบ",
  positive_count: "สาย emotion บวก",
  neutral_count: "สาย emotion กลาง",
  call_count: "จำนวนสาย",
  count: "จำนวน",
  audio_file_id: "ไฟล์",
  original_name: "ชื่อไฟล์",
  emotion: "อารมณ์",
  satisfaction_score: "คะแนนความพึงพอใจ",
  illegal_detected: "ตรวจพบผิดกฎหมาย",
  created_at: "วันที่",
  status: "สถานะ",
};
```

แล้วใน `renderMarkdownContent` ตอน render `<th>`:

```tsx
// จาก
<th key={i}>{h}</th>
// เป็น
<th key={i}>{COLUMN_LABELS[h.toLowerCase()] ?? h}</th>
```

Column ที่ไม่มีใน map จะแสดง original name ตามเดิม

---

## Known Issues / Limitations

| ปัญหา                                           | สถานะ                                                  |
| ----------------------------------------------- | ------------------------------------------------------ |
| Cloudflare ตัด connection ~60s                  | ✅ Mitigated ผ่าน chunking (chunk เล็ก response < 60s) |
| Status ค้าง processing เมื่อ Node restart       | ✅ Mitigated ผ่าน stuck-detection 30 นาที + ปุ่ม retry |
| `/analyses` ไม่ real-time — ต้อง refresh เอง    | Known, won't fix (MVP)                                 |
| ไม่มี auth — ทุกคนที่เข้า URL เห็นข้อมูลทั้งหมด | 🔄 Auth Phase 1 implement แล้ว รอรัน RLS migration     |
