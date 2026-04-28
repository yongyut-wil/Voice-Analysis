# System Architecture — Voice Analysis

> เอกสารนี้อธิบายสถาปัตยกรรมรวมของระบบ Voice Analysis — service ทุกตัวเชื่อมกันอย่างไร และข้อมูลไหลผ่านระบบยังไง

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser (Client)                               │
│                                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                     │
│  │  Home (/)    │   │ /analyses    │   │ /analyses/:id│                     │
│  │  Dropzone    │   │  History     │   │  Detail      │                     │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘                     │
│         │                  │                   │                             │
│  AudioUploader       Loader (SSR)        Loader (SSR)                       │
│  + Polling (3s)                              + RetryButton                 │
└─────────┼──────────────────┼───────────────────┼─────────────────────────────┘
          │ HTTP              │                   │
          ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     React Router v7 (Server)                                │
│                     Node.js · SSR + API Routes                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Routes                                                            │    │
│  │                                                                    │    │
│  │  Page Routes              API Routes                               │    │
│  │  ┌────────────────┐      ┌──────────────────────────────────────┐  │    │
│  │  │ home.tsx       │      │ /api/upload              POST        │  │    │
│  │  │ analyses.tsx   │      │ /api/analyze             POST → 202  │  │    │
│  │  │ analyses.$id   │      │ /api/retry/:id           POST → 202  │  │    │
│  │  └────────────────┘      │ /api/status/:id          GET poll    │  │    │
│  │                          │ /api/health              GET         │  │    │
│  │                          │ /api/callback/status     POST ← n8n  │  │    │
│  │                          │ /api/callback/audio-download-url GET  │  │    │
│  │                          │ /api/callback/transcribe-audio POST  │  │    │
│  │                          │ /api/callback/save-analysis  POST    │  │    │
│  │                          │ /api/callback/delete-audio   POST    │  │    │
│  │                          └──────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Server Modules (.server.ts)                                       │    │
│  │                                                                    │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │    │
│  │  │ minio.server.ts  │  │ supabase.server  │  │ litellm.server   │  │    │
│  │  │                  │  │     .ts          │  │     .ts          │  │    │
│  │  │ uploadAudio()    │  │ createAudioFile()│  │ transcribeAudio()│  │    │
│  │  │ downloadAudio()  │  │ updateStatus()   │  │ analyzeTranscr() │  │    │
│  │  │ deleteAudio()    │  │ createResult()   │  │ cleanThaiText()  │  │    │
│  │  │ getPresignedUrl()│  │ getAudioFiles()  │  │ removeRepetit()  │  │    │
│  │  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │    │
│  └───────────┼─────────────────────┼──────────────────────┼────────────┘    │
│              │                     │                      │                  │
│  ┌───────────┼─────────────────────┼──────────────────────┼────────────┐    │
│  │           │   analysis.server.ts / n8n.server.ts       │            │    │
│  │           │   runAnalysis() — direct orchestration     │            │    │
│  │           │   triggerAnalysis() — optional n8n path    │            │    │
│  │           │   validateCallbackSecret() — auth guard    │            │    │
│  └───────────┼─────────────────────┼──────────────────────┼────────────┘    │
│              │                     │                      │                  │
└──────────────┼─────────────────────┼──────────────────────┼──────────────────┘
               │                     │                      │
               ▼                     ▼                      ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────────┐
│                      │ │                      │ │                          │
│   MinIO (S3)         │ │   Supabase (PG)      │ │   AI Services            │
│                      │ │                      │ │                          │
│  Bucket:             │ │  audio_files         │ │  ┌────────────────────┐  │
│  voice-analysis      │ │  ├─ id (UUID)        │ │  │  direct Node.js    │  │
│                      │ │  ├─ filename         │ │  │  analysis path     │  │
│  Lifecycle:          │ │  ├─ original_name    │ │  │  (`n8n` optional)  │  │
│  1. Upload → store   │ │  ├─ status           │ │  │                    │  │
│  2. Analyze → direct │ │  └─ ...              │ │  │  STT model         │  │
│  3. Done → delete    │ │                      │ │  │  └─ gpt-4o-mini-   │  │
│                      │ │  analysis_results    │ │  │     transcribe     │  │
│  Presigned URL:      │ │  ├─ id (UUID)        │ │  │                    │  │
│  optional callback   │ │  ├─ audio_file_id FK │ │  │  Analysis model:   │  │
│  fetches when needed │ │  ├─ transcription    │ │  │  └─ claude-sonnet  │  │
│                      │ │  ├─ emotion          │ │  │                    │  │
│                      │ │  ├─ satisfaction_score│ │  │                    │  │
│                      │ │  └─ ...              │ │  │                    │  │
│                      │ │                      │ │  │                    │  │
│                      │ └──────────────────────┘ │  │                    │  │
│                      │                        │  │                    │  │
│                      │                        │  ⚠ Behind           │  │
│                      │                        │  Cloudflare CDN     │  │
│                      │                        │  timeout ~60-100s   │  │
│                      └──────────────────────┘ │  └────────────────────┘  │
│                                                   │                      │
│                                                  ┌──────────────┐   │
│                                                  │  Cloudflare  │   │
│                                                  │  CDN/Proxy   │   │
│                                                  │  (524 risk)  │   │
│                                                  └──────────────┘   │
│                                                      ▲                │
│                                                      │                │
│                                          All LiteLLM traffic        │
│                                          routes through CF          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Service Inventory

| Service               | ประเภท                | Host                       | Protocol               | หน้าที่                                                |
| --------------------- | --------------------- | -------------------------- | ---------------------- | ------------------------------------------------------ |
| React Router v7       | Application           | Node.js                    | HTTP                   | SSR + API routes + direct background analysis          |
| MinIO                 | Object Storage        | Docker (local) / S3 (prod) | S3 API                 | เก็บไฟล์เสียงชั่วคราว (upload → analyze → delete)      |
| Supabase (PostgreSQL) | Database              | Cloud (supabase.co)        | HTTPS/REST             | เก็บ metadata + ผลวิเคราะห์ถาวร                        |
| n8n                   | Workflow Orchestrator | Cloud (`n8n.thcloud.ai`)   | HTTPS/Webhook          | optional orchestration path, callback, monitoring      |
| LiteLLM Proxy         | AI API Gateway        | Cloud (models.thcloud.ai)  | HTTPS (via Cloudflare) | STT + LLM analysis สำหรับ direct และ optional n8n path |
| Cloudflare CDN        | Reverse Proxy         | Edge                       | HTTPS                  | หน้า LiteLLM proxy — มี timeout risk                   |

---

## 3. Data Flow — Upload & Analyze

```
         Browser            React Router Server         External Services
         ───────            ───────────────────         ─────────────────

Step 1: Upload
──────────────
  User ──POST /api/upload────────►  validate type/size
         (FormData: audio)          │
                                    ├─uploadAudio()──────────► MinIO
                                    │  (rename UUID.ext)
                                    │
                                    ├─createAudioFile()──────► Supabase
                                    │  (status: pending)
                                    │
                         ◄──────────┘ { audioFileId }

 Step 2: Trigger Analysis
 ────────────────────────
  ──POST /api/analyze──────────────►  updateStatus(processing)──► Supabase
         { audioFileId }              │
                                      ├─analysisJob() ──► runAnalysis() by default
                                      │
                          ◄────────────┘ 202 { status: processing }

Step 3: Background Analysis (direct path by default)
───────────────────────────────────────────────
                                      │
                    runAnalysis() → downloadAudio()────────────► MinIO
                          ◄─────────── binary                  │
                                      │
                    transcribeAudio()──────────────────────────► LiteLLM STT
                          ◄─── { transcription, sttModel }    │
                                      │
                    analyzeTranscription()────────────────────► LiteLLM → Claude
                          ◄─── AnalysisOutput (JSON)          │
                                      │
                    createAnalysisResult()────────────────────► Supabase
                                      │
                    updateAudioFileStatus(done)───────────────► Supabase
                                      │
                    deleteAudio()─────────────────────────────► MinIO
                                      │
Optional path: if `SKIP_N8N=false`, `analysisJob()` switches to `triggerAnalysis()` and the `n8n` workflow uses callback routes for STT/save/status/cleanup.
                                      │
                                      ├─deleteAnalysisResult()──► Supabase
                                      │  (ลบ result เก่า)
                                      │
                                      ├─updateStatus(processing)► Supabase
                                      │
                                      ├─triggerAnalysis() ──► n8n webhook
                                      │
                         ◄────────────┘ 202 { status: processing }

Step 4: Client Polling
──────────────────────
  ──GET /api/status/:id─────────────►  query Supabase
  ◄── { status: processing }              │
  ... (ทุก 3 วินาที) ...                   │
  ──GET /api/status/:id─────────────►     │
  ◄── { status: done, analysisId }        │
                                         │
  navigate → /analyses/:id ─────────► loader (SSR)
                                        │
                                        └─getAudioFileById()──► Supabase
```

---

## 4. Data Flow — Retry

```
         Browser            React Router Server         External Services
         ───────            ───────────────────         ─────────────────

  ──POST /api/retry/:id─────────────►  check status ≠ processing
                                      │
                                      ├─deleteAnalysisResult()──► Supabase
                                      │  (ลบ result เก่า)
                                      │
                                      ├─updateStatus(processing)► Supabase
                                      │
                                      ├─analysisJob() ──► runAnalysis() by default
                                      │
                         ◄────────────┘ 202 { status: processing }

  (เหมือนเดิม: poll → done → navigate)
```

**ข้อควรระวัง:** ถ้าไฟล์เสียงถูกลบจาก MinIO ไปแล้ว (analyze รอบก่อนเสร็จแล้ว) retry จะ fail เพราะ `downloadAudio()` หาไฟล์ไม่เจอ

---

## 5. Internal Module Dependencies

```
┌─────────────────────────────────────────────────────┐
│                   API Routes                        │
│                                                     │
│  api/upload.tsx ─────┬──────────────────────────┐   │
│  api/analyze.tsx ────┤                          │   │
│  api/retry.tsx ──────┤                          │   │
│  api/status.tsx ─────┤                          │   │
│                      │                          │   │
│                      ▼                          ▼   │
│              ┌───────────────┐    ┌───────────────┐  │
│              │ minio.server  │    │ supabase.     │  │
│              │               │    │ server        │  │
│              │ upload, dl,   │    │ CRUD, status  │  │
│              │ delete, url   │    │               │  │
│              └───────┬───────┘    └───────────────┘  │
│                      │                               │
│  ┌───────────────────┼───────────────────────────┐   │
│  │   analysis.server.ts (direct trigger)         │   │
│  │                                               │   │
│  │   runAnalysis(id, filename, originalName)     │   │
│  │     1. download from MinIO                    │   │
│  │     2. STT + LLM analysis via LiteLLM         │   │
│  │     3. save result + update status + cleanup  │   │
│  └───────────────────┼───────────────────────────┘   │
│                      │                               │
│              ┌───────┴─────────────┐                 │
│              │ LiteLLM STT         │                 │
│              │ LiteLLM Analysis    │                 │
│              └─────────────────────┘                 │
│  ┌───────────────┐    ┌───────────────┐             │
│  │ error-utils   │    │ logger        │             │
│  │ (client+svr)  │    │ (server only) │             │
│  └───────────────┘    └───────────────┘             │
└─────────────────────────────────────────────────────┘
```

**กฎการ import:**

- `.server.ts` → ห้าม import ใน client component (จะทำให้ Vite พัง)
- `error-utils.ts` + `logger.ts` → ใช้ได้ทั้ง client และ server
- `analysis.server.ts` → orchestration path หลักเมื่อ `SKIP_N8N=true`; `n8n.server.ts` ใช้เมื่อเปิด optional workflow path

---

## 6. STT Provider Selection Logic

```
                    LiteLLM STT node
                           │
                           ▼
                 LITELLM_STT_MODEL
                           │
                           ▼
                 cleanThaiText()
                 removeRepetitions()
                           │
                           ▼
                 { transcription, sttModel }
```

---

## 7. Status Lifecycle

```
                    ┌─────────┐
                    │ pending │  ← audio_files สร้างใหม่ (POST /api/upload)
                    └────┬────┘
                         │ POST /api/analyze หรือ POST /api/retry/:id
                         ▼
                   ┌────────────┐
                   │ processing │  ← direct background job หรือ optional n8n workflow กำลังทำงาน
                   └─┬────────┬─┘
                     │        │
              สำเร็จ  │        │  ล้มเหลว
                     ▼        ▼
                ┌────────┐  ┌───────┐
                │  done  │  │ error │  ← error_message ถูกเก็บใน audio_files
                └────────┘  └───┬───┘
                                │
                                │ POST /api/retry/:id → กลับไป processing
                                └──────► (loop)
```

**การเปลี่ยน status ใน code:**

| From → To            | เกิดเมื่อ               | Route / Function                                               |
| -------------------- | ----------------------- | -------------------------------------------------------------- |
| → pending            | สร้าง audio_file record | `api/upload` → `createAudioFile()`                             |
| pending → processing | เริ่ม analyze           | `api/analyze` → `updateAudioFileStatus("processing")`          |
| processing → done    | analysis สำเร็จ         | `analysis.server.ts` หรือ `api/callback/status`                |
| processing → error   | analysis ล้มเหลว        | catch block ใน `api/analyze` / `api/retry` หรือ `n8n` callback |
| error → processing   | user กด Retry           | `api/retry` → `updateAudioFileStatus("processing")`            |

---

## 8. Network Topology

```
┌─────────────────────────────────────────────────────────────┐
│                      Production Network                     │
│                                                             │
│  ┌──────────────┐        ┌──────────────────────────────┐  │
│  │   Coolify    │        │       Cloudflare CDN          │  │
│  │   (Docker)   │        │                              │  │
│  │              │        │  models.thcloud.ai           │  │
│  │  ┌────────┐  │        │  │                          │  │
│  │  │ App    │──┼────────┼──┤  LiteLLM Proxy          │  │
│  │  │ :3000  │  │        │  │  ├─ STT (gpt-4o-mini-transcribe) │  │
│  │  └────────┘  │        │  │  └─ Analysis (Claude)   │  │
│  │              │        │  │                          │  │
│  │  ┌────────┐  │        │  └──────────────────────────┘  │
│  │  │ MinIO  │  │        │                              │  │
│  │  │ :9000  │  │        └──────────────────────────────┘  │
│  │  └────────┘  │                                           │
│  └──────────────┘                                           │
│         │                                                    │
│         │  HTTPS                                              │
│         │                                                    │
│         ├────────────────────► Supabase (supabase.co)       │
│         ├────────────────────► n8n.thcloud.ai               │
│         └────────────────────► models.thcloud.ai            │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                      Development Network                     │
│                                                              │
│  localhost:5173  (yarn dev — Vite)                           │
│       │                                                      │
│       ├──► localhost:9000  (MinIO — docker-compose)          │
│       ├──► supabase.co     (Supabase — remote)              │
│       ├──► n8n.thcloud.ai  (n8n — remote webhook/callback)  │
│       ├──► models.thcloud.ai  (LiteLLM — remote via CF)     │
│       └──► localhost:5173/api/*  (callback routes)          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. Key Design Decisions

### 9.1 Fire-and-Forget Analysis

**ปัญหา:** LLM analysis ใช้เวลา 30–120 วินาที ซึ่งเกิน Cloudflare timeout (~60s)

**ทางเลือก:**
| วิธี | ข้อดี | ข้อเสีย |
|------|-------|---------|
| Await analysis ใน request | ง่าย, code ตรง | Timeout, bad UX |
| Fire-and-forget + Polling ใน Node.js | ตอบไว, resilient | เสี่ยงค้างเมื่อ process restart |
| `n8n workflow + Polling` | Robust, restart-safe | ต้องดูแล webhook/callback contract |

**ที่เลือกปัจจุบัน:** Fire-and-forget + Polling ใน Node.js เป็นค่าเริ่มต้นเพื่อให้ flow เรียบง่ายขึ้น โดยยังคง `n8n` ไว้เป็นทางเลือกเมื่ออยากแยก orchestration ออกจาก web process

### 9.2 แยก Upload กับ Analyze

**เหตุผล:**

- Upload เร็ว (~1s) / Analyze ช้า (~30-120s) — error แยกกันชัดเจน
- ถ้ารวม: upload fail = ต้องเริ่มใหม่หมด, analyze fail = ต้อง upload ใหม่ด้วย
- แยก: upload fail → upload ใหม่, analyze fail → retry โดยไม่ต้อง upload ใหม่

### 9.3 ลบไฟล์เสียงหลัง Analyze

**เหตุผล:**

- ข้อมูลทั้งหมดอยู่ใน Supabase แล้ว (transcription + analysis)
- ประหยัด MinIO storage
- `deleteAudio()` เป็น fire-and-forget — ถ้าลบไม่สำเร็จ ผลวิเคราะห์ยังสมบูรณ์

**Trade-off:** ไม่สามารถเล่นเสียงย้อนหลังหรือ retry ได้ (ไฟล์หายจาก MinIO แล้ว)

### 9.4 LiteLLM เป็นเส้นทาง AI หลัก ส่วน orchestration เลือกได้

| หัวข้อ        | สถานะปัจจุบัน                                                           |
| ------------- | ----------------------------------------------------------------------- |
| STT path      | LiteLLM ผ่าน `LITELLM_STT_MODEL`                                        |
| Orchestration | direct Node.js เมื่อ `SKIP_N8N=true`, หรือ `n8n` เมื่อ `SKIP_N8N=false` |
| Timeout risk  | ยังมีถ้า LiteLLM อยู่หลัง Cloudflare                                    |
| การตั้งค่า    | ใช้ `LITELLM_*` เสมอ และ `N8N_*` เมื่อเปิด optional path                |
| เหตุผล        | ใช้ AI provider เดียว แต่คง flexibility เรื่อง orchestration            |
