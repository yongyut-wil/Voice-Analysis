# Voice Analysis — Feature Status

> อัพเดทล่าสุด: 2026-05-06
> ไฟล์นี้ track สถานะ feature จริงของระบบ ใช้เป็น reference ก่อนเริ่ม session ใหม่

---

## Core App ✅ Done

| Feature                      | Route / File                                | หมายเหตุ                                                  |
| ---------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| Audio Upload (drag-and-drop) | `POST /api/upload`                          | MP3/WAV/M4A/OGG/WebM, max 100MB → MinIO                   |
| Speech-to-Text               | n8n → `POST /api/callback/transcribe-audio` | LiteLLM STT + Thai text cleanup                           |
| Conversation Analysis        | n8n → `POST /api/callback/save-analysis`    | emotion, satisfaction, illegal, summary                   |
| Analysis History             | `GET /analyses`                             | loader-based, manual refresh                              |
| Result Detail                | `GET /analyses/:id`                         | summary, emotion badge, satisfaction score, transcription |
| Retry                        | `POST /api/retry/:id`                       | ลบ result เก่า แล้ว trigger n8n ใหม่                      |
| Auto Cleanup                 | n8n → `POST /api/callback/delete-audio`     | ลบไฟล์เสียงจาก MinIO หลัง done                            |
| Status Polling               | `GET /api/status/:id`                       | client polls ทุก 2 วินาที                                 |
| Health Check                 | `GET /api/health`                           | ตรวจ n8n + MinIO + Supabase                               |

---

## MindsDB Analytics ✅ Done

| Feature         | Route / Resource                       | หมายเหตุ                                                     |
| --------------- | -------------------------------------- | ------------------------------------------------------------ |
| Knowledge Base  | MindsDB `call_transcriptions`          | pgvector ใน Supabase (`supabase_pgvector.kb_transcriptions`) |
| Semantic Search | `GET /api/search?q=...`                | dedup by `audio_file_id`, คืน N unique files                 |
| Analytics Chat  | `POST /api/agent`                      | MindsDB Agent `call_analytics_agent` → ตอบภาษาไทย            |
| Auto-index Job  | MindsDB Job `index_new_transcriptions` | รันทุก 1 ชั่วโมง                                             |

**KB Syntax ที่ใช้ได้จริง:**

```sql
CREATE KNOWLEDGE BASE call_transcriptions
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

## n8n Workflows

| Workflow                           | สถานะ          | หน้าที่                                      |
| ---------------------------------- | -------------- | -------------------------------------------- |
| `00-voice-analysis-pipeline.json`  | ✅ Deployed    | Core STT + LLM analysis                      |
| `04-stuck-processing-monitor.json` | ✅ Deployed    | ตรวจไฟล์ค้าง >10 นาที → เปลี่ยนเป็น error    |
| `01-post-call-processing.json`     | ⏸ Not deployed | Alerting: negative/illegal/low score → Slack |
| `02-daily-summary-report.json`     | ⏸ Not deployed | Cron: daily stats → Slack                    |
| `03-quality-gate.json`             | ⏸ Not deployed | ตรวจ transcription quality                   |

---

## Metabase Dashboard ✅ Done

- Dashboard ID: **317**
- เชื่อมต่อกับ Supabase โดยตรง
- ดู SQL queries ได้ที่ `docs/metabase-dashboard.md`

---

## Pending / In Progress 🔄

ไม่มี

---

## ยังไม่ได้ทำ ❌

| Feature                               | เหตุผลที่รอ                                            |
| ------------------------------------- | ------------------------------------------------------ |
| Auth (Supabase Auth)                  | ดู `docs/auth-migration.md`                            |
| MindsDB Forecasting                   | ต้องมีข้อมูล 30+ วันก่อน                               |
| MindsDB Batch Re-analysis (AI Tables) | ยังไม่ได้ prioritize                                   |
| Audio Playback ใน UI                  | `audio-player.tsx` มีอยู่แล้วแต่ไฟล์ถูกลบหลัง analysis |

---

## Known Issues / Limitations

| ปัญหา                                                     | สถานะ                         |
| --------------------------------------------------------- | ----------------------------- |
| Cloudflare ตัด connection ~60s — ไฟล์ >5MB มักจะ fail STT | Known, no fix yet             |
| `/analyses` ไม่ real-time — ต้อง refresh เอง              | Known, won't fix (MVP)        |
| ไม่มี auth — ทุกคนที่เข้า URL เห็นข้อมูลทั้งหมด           | Known, ดู auth-migration plan |
