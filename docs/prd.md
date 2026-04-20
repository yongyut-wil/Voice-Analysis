# Product Requirement Document

**วันที่จัดทำ (Date):** 20 เมษายน 2569  
**ผู้จัดทำ (Author):** Yongyut W.

---

## 1. Project Overview

**1.1 Problem Link:** FM-PE-01 Product Blueprint เพื่อการสืบย้อนข้อมูล — ปัจจุบันการตรวจสอบคุณภาพบทสนทนาเสียงต้องใช้คนฟังทีละไฟล์ ทำให้ใช้เวลามาก ประเมินไม่สม่ำเสมอระหว่างผู้ตรวจ ย้อนดูและเปรียบเทียบข้ามเคสได้ยาก และไม่สามารถคัดกรองเคสเสี่ยงได้รวดเร็วพอ

**1.2 Objective:** สร้างระบบภายใน (Voice Analysis) ที่ช่วยอัปโหลดไฟล์เสียงบทสนทนา ถอดข้อความอัตโนมัติ วิเคราะห์อารมณ์ ให้คะแนนความพึงพอใจ ตรวจจับเนื้อหาไม่เหมาะสม และเก็บประวัติผลวิเคราะห์ย้อนหลัง เพื่อลดเวลาตรวจสอบ เพิ่มความสม่ำเสมอ และทำให้ทีมระบุเคสเสี่ยงได้เร็วขึ้น

**1.3 Success Criteria:**

- ผู้ใช้สามารถอัปโหลดไฟล์เสียงและได้รับผลวิเคราะห์ end-to-end ใน flow เดียวได้สำเร็จ
- ระบบบันทึก metadata + ผลวิเคราะห์ลงฐานข้อมูลครบถ้วน (transcription, summary, emotion, satisfaction_score, illegal_detected)
- ผู้ใช้เปิดดูประวัติและรายละเอียดผลวิเคราะห์ย้อนหลังได้
- Retry ทำงานได้เมื่อ analysis ล้มเหลว
- Error message อยู่ในระดับที่ผู้ใช้เข้าใจได้
- Logging เพียงพอต่อการ debug ปัญหาหลักของ flow

---

## 2. Project In & Out-Scope

**2.1 In-Scope (ฟีเจอร์ในเฟส MVP):**

- หน้าแรก `/` สำหรับอัปโหลดไฟล์เสียง (drag-and-drop / file picker)
- รองรับไฟล์เสียง MP3, WAV, M4A/MP4, OGG, WebM ขนาดไม่เกิน 100 MB
- Upload ไฟล์ไปยัง MinIO (object storage) + บันทึก metadata ใน Supabase
- Trigger การวิเคราะห์แบบ asynchronous ผ่าน n8n workflow
  - Speech-to-Text ผ่าน LiteLLM (`gpt-4o-mini-transcribe` หรือ model ที่กำหนดใน `LITELLM_STT_MODEL`)
  - Thai text cleanup (`cleanThaiText` + `removeRepetitions`)
  - LLM Analysis ผ่าน LiteLLM proxy → Claude Sonnet (emotion, satisfaction, illegal content, summary)
- Client polling สถานะผลวิเคราะห์ทุก 3 วินาที
- หน้าประวัติ `/analyses` แสดงรายการไฟล์ทั้งหมด (SSR loader)
- หน้ารายละเอียด `/analyses/:id` แสดงผลวิเคราะห์เต็มรูปแบบ (summary, emotion badge, satisfaction score, illegal alert, transcription, model info)
- Retry การวิเคราะห์สำหรับไฟล์ที่ error
- ลบไฟล์เสียงจาก MinIO หลังวิเคราะห์เสร็จ (fire-and-forget)
- n8n callback endpoints สำหรับ orchestration (authenticated with `X-N8N-Secret`)
- Structured logging สำหรับ server-side operations
- n8n monitoring workflows (stuck-processing monitor, daily summary report, quality gate, post-call alerting)

**2.2 Out-Scope (ฟีเจอร์ที่ ไม่รวม ในเฟส MVP):**

- ระบบ Authentication / Authorization (ดูแผนที่ `docs/auth-migration.md`)
- Real-time subscription บนหน้าประวัติ (ปัจจุบันต้อง refresh เอง)
- Batch upload หลายไฟล์พร้อมกัน
- การแก้ไขผลวิเคราะห์ด้วยมือใน UI
- Export รายงานเป็น PDF/CSV
- Search/filter ขั้นสูงในหน้าประวัติ
- Audio playback ย้อนหลัง (ไฟล์ถูกลบจาก MinIO หลัง analyze)
- Notification ทาง email/Slack เป็นฟีเจอร์มาตรฐานของแอป (มีใน n8n workflow แยก)
- Public API สำหรับ third-party
- Multi-tenant / user-specific data isolation
- การรับประกันความถูกต้องระดับ compliance-grade

---

## 3. Feature/Functional Requirement

### FR-1: Audio Upload

**User Story:** ในฐานะเจ้าหน้าที่ตรวจคุณภาพ ฉันต้องการอัปโหลดไฟล์เสียงได้ง่ายผ่าน drag-and-drop เพื่อเริ่มการวิเคราะห์โดยไม่ต้องใช้เครื่องมือหลายตัว

**Acceptance Criteria:**

- รองรับไฟล์ `audio/mpeg`, `audio/wav`, `audio/mp4`, `audio/ogg`, `audio/webm`, `audio/x-m4a`
- จำกัดขนาดไฟล์ไม่เกิน 100 MB
- ถ้าไฟล์ไม่ถูกต้อง (ผิดประเภทหรือเกินขนาด) ระบบแจ้ง error ที่เข้าใจได้ทันที
- เมื่อ upload สำเร็จ ระบบส่งกลับ `audioFileId`
- ระบบ rename ไฟล์เป็น UUID.ext เพื่อป้องกัน collision ใน MinIO
- สร้าง record ใน `audio_files` โดย status = `pending`

### FR-2: Trigger Async Analysis

**User Story:** ในฐานะผู้ใช้ ฉันต้องการให้ระบบเริ่มวิเคราะห์ทันทีหลังอัปโหลด โดยไม่ต้องรอจนกว่าจะเสร็จ เพื่อไม่ต้องค้างอยู่ที่หน้าจอ

**Acceptance Criteria:**

- Endpoint `POST /api/analyze` ตอบกลับทันทีด้วย `202` พร้อม `{ audioFileId, status: "processing" }`
- ระบบอัปเดต `audio_files.status` เป็น `processing` ก่อนเริ่มงานเบื้องหลัง
- งานเบื้องหลังถูก orchestrate ผ่าน n8n webhook (`triggerAnalysis()`)
- หากงานล้มเหลว ระบบอัปเดต status เป็น `error` พร้อม `error_message` ที่สะอาดพอสำหรับ UI

### FR-3: Speech-to-Text

**User Story:** ในฐานะผู้ตรวจ ฉันต้องการเห็นข้อความถอดเสียงที่อ่านได้ เพื่อไม่ต้องฟังไฟล์เสียงทั้งหมดด้วยตัวเอง

**Acceptance Criteria:**

- ระบบถอดเสียงผ่าน LiteLLM STT model ที่กำหนดใน `LITELLM_STT_MODEL` (เช่น `gpt-4o-mini-transcribe`)
- ฟังก์ชัน STT คืนค่าทั้ง `transcription` และ `sttModel` identifier
- ระบบรัน Thai text cleanup pipeline: `removeRepetitions(cleanThaiText(rawText))`
- ลบช่องว่างระหว่างตัวอักษรไทยที่ STT แทรกผิด เช่น `การ จัด เย บ` → `การจัดเย็บ`
- ลบวลีซ้ำจาก STT hallucination

### FR-4: Conversation Analysis

**User Story:** ในฐานะผู้ตรวจ ฉันต้องการเห็นสรุปบทสนทนา อารมณ์ คะแนนความพึงพอใจ และการแจ้งเตือนเนื้อหาเสี่ยง เพื่อประเมินคุณภาพเชิงภาพรวมได้เร็วขึ้น

**Acceptance Criteria:**

- วิเคราะห์ผ่าน LiteLLM proxy → Claude Sonnet (`LITELLM_ANALYSIS_MODEL`)
- ผลลัพธ์ต้องมี: `summary`, `emotion`, `emotion_score`, `satisfaction_score`, `illegal_detected`, `illegal_details`
- `emotion` เป็น lowercase ในชุด `positive | neutral | negative`
- `emotion_score` อยู่ในช่วง 0.0–1.0
- `satisfaction_score` อยู่ในช่วง 0–100
- `temperature: 0.1` เพื่อผลที่สม่ำเสมอ
- `max_tokens: 1024` เพื่อ summary ไม่ถูกตัดกลางคัน

### FR-5: Save Analysis Result

**User Story:** ในฐานะผู้ใช้ ฉันต้องการให้ผลวิเคราะห์ถูกบันทึกถาวร เพื่อเปิดดูย้อนหลังได้แม้ปิด browser ไปแล้ว

**Acceptance Criteria:**

- บันทึกผลลง `analysis_results` พร้อมเชื่อมโยง `audio_file_id`
- บันทึกทั้ง `summary` และ `stt_model_used`
- เมื่อบันทึกสำเร็จ อัปเดต `audio_files.status` เป็น `done`
- บันทึก `processing_time_ms` และ `model_used`

### FR-6: Status Polling

**User Story:** ในฐานะผู้ใช้ ฉันต้องการเห็นสถานะการวิเคราะห์แบบ real-time (เกือบ) เพื่อรู้ว่าต้องรอนานแค่ไหน

**Acceptance Criteria:**

- Endpoint `GET /api/status/:id` คืนค่า `{ status, error, analysisId }`
- Client poll ทุก 3 วินาที
- เมื่อ `status = done` → client navigate ไปหน้ารายละเอียด
- เมื่อ `status = error` → client แสดงข้อความ error
- Progress bar เลื่อนจาก 50% → 95% ทีละ 3% ต่อ poll (simulated progress)

### FR-7: Result Detail Page

**User Story:** ในฐานะผู้ตรวจ ฉันต้องการเห็นผลวิเคราะห์แบบเต็มรูปแบบในหน้าเดียว เพื่อประเมินคุณภาพได้โดยไม่ต้องสลับหน้า

**Acceptance Criteria:**

- แสดงชื่อไฟล์ วันที่ ขนาด metadata หลัก
- แสดง summary card
- แสดง emotion badge พร้อม score (สี: green=positive, yellow=neutral, red=negative)
- แสดง satisfaction score (progress bar 0–100)
- แสดง illegal content alert เมื่อ `illegal_detected = true`
- แสดง transcription แบบอ่านย้อนหลังได้
- แสดง model info (`stt_model_used`, `model_used`, `processing_time_ms`)
- มีปุ่ม Retry สำหรับไฟล์ที่ error

### FR-8: Analysis History

**User Story:** ในฐานะผู้ใช้ ฉันต้องการเปิดดูประวัติผลวิเคราะห์ย้อนหลัง เพื่อกลับมาตรวจเคสเดิมได้

**Acceptance Criteria:**

- หน้า `/analyses` โหลดข้อมูลผ่าน SSR loader
- แสดงรายการล่าสุดก่อน (ORDER BY created_at DESC)
- แสดงคอลัมน์: ชื่อไฟล์, วันที่, ขนาด, สถานะ, อารมณ์, เนื้อหาผิดกฎหมาย, คะแนน
- กดแถวใดก็ navigate ไปหน้ารายละเอียดได้

### FR-9: Retry Failed Analysis

**User Story:** ในฐานะผู้ใช้ ฉันต้องการ retry การวิเคราะห์เมื่อระบบล้มเหลว เพื่อไม่ต้องอัปโหลดไฟล์ใหม่ทุกครั้ง

**Acceptance Criteria:**

- ไม่อนุญาต retry ถ้า `status = processing` (ตอบ `409`)
- ระบบลบผลวิเคราะห์เก่าจาก `analysis_results` ก่อนเริ่มใหม่
- อัปเดต status เป็น `processing` และเริ่ม flow เดียวกับ analyze ปกติ
- **ข้อจำกัด:** ถ้าไฟล์เสียงถูกลบจาก MinIO ไปแล้ว (รอบก่อนเสร็จสมบูรณ์) retry จะ fail

### FR-10: Storage Cleanup

**User Story:** ในฐานะทีมดูแลระบบ ฉันต้องการให้ไฟล์เสียงชั่วคราวถูกลบอัตโนมัติหลังวิเคราะห์เสร็จ เพื่อประหยัด storage

**Acceptance Criteria:**

- เมื่อ analysis สำเร็จ ระบบเรียก `deleteAudio()` แบบ fire-and-forget
- หากลบไม่สำเร็จ ระบบ log warning โดยไม่ทำให้ผลวิเคราะห์หลักล้มเหลว
- ข้อมูลทั้งหมดยังคงอยู่ใน Supabase แม้ไฟล์ต้นฉบับถูกลบ

---

## 4. Business Logic & WorkFlow

### 4.1 System Logic

**Status Lifecycle:**

```
pending → processing → done
                    ↘ error → (retry) → processing → ...
```

| From → To            | เกิดเมื่อ               | Route / Function                                              |
| -------------------- | ----------------------- | ------------------------------------------------------------- |
| → pending            | สร้าง audio_file record | `POST /api/upload` → `createAudioFile()`                      |
| pending → processing | เริ่ม analyze           | `POST /api/analyze` → `updateAudioFileStatus("processing")`   |
| processing → done    | analysis สำเร็จ         | `POST /api/callback/status` หลัง `save-analysis`              |
| processing → error   | analysis ล้มเหลว        | `POST /api/callback/status` จาก n8n callback                  |
| error → processing   | user กด Retry           | `POST /api/retry/:id` → `updateAudioFileStatus("processing")` |

**Analysis Pipeline (n8n orchestration):**

```
1. n8n เรียก GET /api/callback/audio-download-url → ได้ presigned URL
2. n8n ดาวน์โหลด audio จาก MinIO โดยตรง
3. n8n เรียก POST /api/callback/transcribe-audio → app server ทำ STT + Thai cleanup → คืน { transcription, sttModel }
4. n8n ส่ง transcription ไป LiteLLM → Claude (analysis) → ได้ AnalysisOutput JSON
5. n8n เรียก POST /api/callback/save-analysis → บันทึกลง Supabase
6. n8n เรียก POST /api/callback/status → อัปเดต status = done
7. n8n เรียก POST /api/callback/delete-audio → ลบไฟล์จาก MinIO (fire-and-forget)
8. n8n เรียก POST /webhook/post-call-processing → alerting workflow (fire-and-forget)
```

**Data Model:**

- `audio_files`: id (UUID), filename, original_name, file_size, duration, mime_type, storage_url, status, error_message, n8n_execution_id, created_at
- `analysis_results`: id (UUID), audio_file_id (FK), transcription, summary, emotion, emotion_score, satisfaction_score, illegal_detected, illegal_details, model_used, stt_model_used, processing_time_ms, created_at

**Emotion Classification:**

| ค่า      | ความหมาย | สีใน UI | Label    |
| -------- | -------- | ------- | -------- |
| positive | ดี       | green   | ดี       |
| neutral  | ธรรมชาติ | yellow  | ธรรมชาติ |
| negative | ไม่ดี    | red     | ไม่ดี    |

**Callback Authentication:**

- ทุก callback endpoint ตรวจ `X-N8N-Secret` header กับ `N8N_CALLBACK_SECRET` env var
- ถ้า secret ไม่ตรง → ตอบ `401`

### 4.2 Edge Cases

| Edge Case                          | พฤติกรรมที่คาดไว้                                        | การจัดการ                                                                                                     |
| ---------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| ไฟล์เสียงถูกลบจาก MinIO ก่อน retry | Retry จะ fail เพราะ `downloadAudio()` หาไฟล์ไม่เจอ       | แสดง error แนะนำให้อัปโหลดใหม่                                                                                |
| Status ค้างที่ `processing` ตลอด   | n8n workflow ไม่มี error callback ครบ หรือ workflow ค้าง | Stuck Processing Monitor (n8n Workflow 4) ตรวจจับไฟล์ค้างเกิน 10 นาที → เปลี่ยน status เป็น `error` อัตโนมัติ |
| LiteLLM timeout (Cloudflare 524)   | ไฟล์ใหญ่ (>5MB) หรือ STT ใช้เวลาเกิน ~60s                | n8n workflow ส่ง error callback → status = `error` → user กด retry                                            |
| User ปิด browser ระหว่าง polling   | งานเบื้องหลังยังทำต่อใน n8n                              | ผลบันทึกใน DB ผู้ใช้เปิดกลับมาดูได้ที่หน้า `/analyses`                                                        |
| `delete-audio` callback fail       | ไฟล์ค้างใน MinIO แต่ผลวิเคราะห์ยังสมบูรณ์                | log warning โดยไม่เปลี่ยน status                                                                              |
| Upload ไฟล์ชื่อซ้ำ                 | ระบบ rename เป็น UUID.ext อัตโนมัติ                      | ไม่มีปัญหา collision                                                                                          |
| ระบบไม่มี Auth                     | ทุกคนที่เข้าถึง URL เห็นข้อมูลทั้งหมด                    | จำกัดการใช้งานเป็น internal network เท่านั้น                                                                  |

---

## 5. Feasibility Review & Signoff

**5.1 ความเห็นจาก Engineer/Design:**

- **Build ได้** — ระบบ MVP สร้างเสร็จแล้วและ deploy อยู่บน production (Coolify + Docker)
- Tech stack ทั้งหมดทำงานร่วมกันได้: React Router v7 + Supabase + MinIO + n8n + LiteLLM
- ข้อจำกัดหลัก: Cloudflare timeout (~60s) ต่อหน้า LiteLLM proxy — แก้ด้วย async polling pattern
- ข้อจำกัดรอง: ไม่มี Auth — ต้องจำกัดเป็น internal-only จนกว่าจะเพิ่ม Supabase Auth (ดู `docs/auth-migration.md`)
- ข้อจำกัดรอง: ไม่สามารถเล่นเสียงย้อนหลังหรือ retry หลังไฟล์ถูกลบจาก MinIO — ต้องอัปโหลดใหม่

**5.2 Sign-off & KPI Tracking**

ลงชื่อ ................................................ (**Client**) วันที่ ......... / ......... / .........  
 (................................................)

ลงชื่อ ................................................ (**PM**) วันที่ ......... / ......... / .........  
 (................................................)

ลงชื่อ ................................................ (**CTO**) วันที่ ......... / ......... / .........  
 (................................................)

---

### ภาคผนวก: Tech Stack Reference

| ส่วน           | เทคโนโลยี                                 | หน้าที่                                  |
| -------------- | ----------------------------------------- | ---------------------------------------- |
| Framework      | React Router v7 (SSR, framework mode)     | SSR + API routes + loader/action         |
| Database       | Supabase (PostgreSQL)                     | เก็บ metadata + ผลวิเคราะห์              |
| Object Storage | MinIO (S3-compatible)                     | เก็บไฟล์เสียงชั่วคราว                    |
| AI (STT)       | LiteLLM → `gpt-4o-mini-transcribe`        | ถอดเสียงเป็นข้อความ                      |
| AI (Analysis)  | LiteLLM proxy → Claude Sonnet             | วิเคราะห์อารมณ์/คะแนน/เนื้อหาเสี่ยง/สรุป |
| Orchestration  | n8n                                       | Workflow engine สำหรับ analysis pipeline |
| UI             | shadcn/ui + TailwindCSS v4 + Lucide React | Component + styling + icons              |
| Language       | TypeScript strict mode                    | Type safety                              |
| Deployment     | Docker (multi-stage) + Coolify            | Production hosting                       |
