# Voice Analysis — กระบวนการทำงานของระบบ

> เอกสารนี้อธิบายการทำงานของระบบตั้งแต่ต้นจนจบ สำหรับ developer ที่เพิ่งเข้ามาในโปรเจกต์

---

## ภาพรวม (Big Picture)

```
Browser                  Server (React Router)         External Services
──────                   ─────────────────────         ─────────────────
User drop ไฟล์
    │
    ▼
POST /api/upload  ──────► validate + save ──────────► MinIO (เก็บไฟล์เสียง)
    │                           │                     Supabase (บันทึก record)
    │◄── { audioFileId } ───────┘
    │
    ▼
POST /api/analyze ──────► set status=processing
    │                     runAnalysis() ──────────────► MinIO (ดึงไฟล์กลับมา)
    │◄── 202 ทันที         (รันใน background)           Deepgram / LiteLLM (STT)
    │                           │                      LiteLLM / Claude (Analysis)
    ▼                           │                      Supabase (บันทึกผล)
poll /api/status ทุก 3s         │                      MinIO (ลบไฟล์)
    │◄── { status }  ◄──────────┘
    │
    ▼ (status = done)
navigate → /analyses/:id ──────► loader ───────────► Supabase (ดึงผล)
```

---

## ขั้นที่ 1 — User Drop ไฟล์ (Client)

**ไฟล์:** `app/components/audio-uploader.tsx`

User ลากไฟล์มาวางที่ dropzone — ระบบตรวจสอบฝั่ง client ก่อนส่ง:

- ประเภทไฟล์ต้องเป็น MP3, WAV, M4A, OGG, WebM
- ขนาดไม่เกิน 100 MB

ถ้าผ่าน → เรียก `processFile(file)` ซึ่งทำ 2 อย่างตามลำดับ:

1. POST ไฟล์ไปที่ `/api/upload`
2. พอ upload เสร็จ → POST ไปที่ `/api/analyze`

```
state machine ของ component:
idle → uploading → analyzing → done
                            ↘ error
```

---

## ขั้นที่ 2 — Upload ไฟล์ (Server)

**ไฟล์:** `app/routes/api/upload.tsx` → `app/lib/minio.server.ts` → `app/lib/supabase.server.ts`

Server รับไฟล์และทำ 2 สิ่งพร้อมกัน:

**2.1 เก็บไฟล์ใน MinIO**

```
ชื่อไฟล์จริง: "call-20240101.mp3"
             ↓ rename เป็น UUID เพื่อป้องกัน collision
ชื่อใน MinIO: "a3f9b2c1-xxxx-xxxx-xxxx-xxxxxxxxxxxx.mp3"
```

ทำไมต้อง rename? เพราะถ้า user อัพโหลดไฟล์ชื่อซ้ำ จะทับกัน

**2.2 บันทึก record ใน Supabase**

```sql
INSERT INTO audio_files (filename, original_name, file_size, storage_url, status)
VALUES ('a3f9b2c1...mp3', 'call-20240101.mp3', 1234567, 'http://...', 'pending')
```

ทำไมต้องบันทึก? เพื่อติดตาม status และดึงผลในภายหลัง

→ Server ตอบกลับ `{ audioFileId }` ให้ client

---

## ขั้นที่ 3 — Trigger Analysis (Server)

**ไฟล์:** `app/routes/api/analyze.tsx`

Client ส่ง `audioFileId` มา → Server ทำ 2 อย่าง:

```
1. UPDATE audio_files SET status = 'processing'  ← synchronous (รอ)
2. runAnalysis(...)                               ← fire-and-forget (ไม่รอ)
3. return 202 ทันที                               ← ตอบ client เลย
```

**ทำไมถึงตอบ 202 ทันทีแทนที่จะรอให้เสร็จ?**

เพราะ analysis ใช้เวลา 30–120 วินาที — ถ้า server รอ HTTP connection ค้างค่าไว้ตลอด:

- Browser อาจ timeout ก่อน
- Cloudflare ตัด connection ที่ ~60 วินาที
- User ไม่รู้ว่าเกิดอะไรขึ้น

แทนที่จะรอ → ให้ client poll status เองแทน

---

## ขั้นที่ 4 — Client Polling

**ไฟล์:** `app/components/audio-uploader.tsx` + `app/routes/api/status.tsx`

หลังจากได้ 202 → client เริ่ม poll ทุก 3 วินาที:

```
GET /api/status/:id → { status: "processing" } → รอต่อ
GET /api/status/:id → { status: "processing" } → รอต่อ
GET /api/status/:id → { status: "done", analysisId: "..." } → navigate ไปหน้าผล
GET /api/status/:id → { status: "error", error: "..." } → แสดง error
```

ระหว่างรอ progress bar จะเลื่อนจาก 50% → 95% ทีละ 3% ต่อ poll เพื่อให้ดู responsive ขึ้น (ไม่ได้สะท้อนความคืบหน้าจริง)

---

## ขั้นที่ 5 — runAnalysis() (Background)

**ไฟล์:** `app/lib/analysis.server.ts` → `app/lib/litellm.server.ts`

นี่คือหัวใจของระบบ รันใน Node.js background โดยไม่บล็อก HTTP response

### 5.1 ดึงไฟล์จาก MinIO

```
MinIO → buffer (binary data อยู่ใน RAM)
```

ทำไมไม่ส่ง buffer ต่อจาก upload เลย? เพราะ upload และ analyze เป็น HTTP request คนละตัว — state ไม่สามารถส่งผ่านกันได้

### 5.2 Speech-to-Text (STT)

ระบบเลือก provider อัตโนมัติจาก environment variable:

```
มี DEEPGRAM_API_KEY?
  ใช่ → Deepgram Nova-3 (เรียกตรง, ไม่ผ่าน Cloudflare, ดีกับภาษาไทย)
  ไม่  → LiteLLM → Whisper / GPT-4o-mini-transcribe
```

หลังได้ transcription ดิบจาก STT → ผ่าน post-processing 2 ขั้น:

```
raw text
   ↓ cleanThaiText()       — ลบช่องว่างระหว่างตัวอักษรไทย
                              เช่น "ส วั ส ดี" → "สวัสดี"
   ↓ removeRepetitions()   — ลบวลีซ้ำที่เกิดจาก Whisper hallucination
                              เช่น "โปรดติดตามตอนต่อไปโปรดติดตาม..." → "โปรดติดตามตอนต่อไป"
   ↓ transcription พร้อมใช้
```

### 5.3 LLM Analysis

ส่ง transcription ให้ Claude ผ่าน LiteLLM proxy พร้อม prompt ที่ขอ JSON กลับมา:

```json
{
  "emotion": "negative",
  "emotion_score": 0.85,
  "satisfaction_score": 32,
  "illegal_detected": false,
  "illegal_details": null,
  "summary": "ลูกค้าโทรมาร้องเรียนเรื่องการส่งสินค้าล่าช้า..."
}
```

- `temperature: 0.1` — ต้องการผลที่สม่ำเสมอ ไม่ต้องการให้ LLM สร้างสรรค์
- `max_tokens: 1024` — summary อาจยาว ถ้าตั้งน้อยเกินจะถูกตัดกลางคัน

### 5.4 บันทึกผลและ Cleanup

```
1. INSERT INTO analysis_results (...)      ← บันทึกผลทั้งหมด
2. UPDATE audio_files SET status='done'    ← บอก client ว่าเสร็จแล้ว
3. deleteAudio(filename) [fire-and-forget] ← ลบไฟล์จาก MinIO
```

ทำไมลบไฟล์? เพราะหลัง analyze เสร็จ ข้อมูลทั้งหมดอยู่ใน Supabase แล้ว ไม่จำเป็นต้องเก็บต้นฉบับ (ประหยัด storage)

ทำไม `deleteAudio` เป็น fire-and-forget? เพราะถ้าลบไม่สำเร็จ ผลการวิเคราะห์ยังสมบูรณ์อยู่ ไม่ควรทำให้ status กลับเป็น error แค่เพราะ cleanup ล้มเหลว

---

## ขั้นที่ 6 — แสดงผล

**ไฟล์:** `app/routes/analyses.$id.tsx`

เมื่อ client detect ว่า status = `done` → navigate ไป `/analyses/:id`

Route นี้มี loader ที่ดึงข้อมูลจาก Supabase แล้ว render:

- Summary card
- Transcription
- Emotion badge + score
- Satisfaction score
- Illegal content warning (ถ้ามี)
- STT model / LLM model ที่ใช้
- เวลาที่ใช้วิเคราะห์

---

## กรณีพิเศษ — Retry

**ไฟล์:** `app/routes/api/retry.tsx`

ถ้า analysis fail (status = `error`) → user กด Retry:

```
1. ตรวจว่า status ไม่ใช่ "processing" (ถ้ากำลังทำอยู่ห้าม retry ซ้ำ)
2. DELETE FROM analysis_results WHERE audio_file_id = :id  ← ลบผลเก่า
3. UPDATE status = 'processing'
4. runAnalysis() ← เริ่มใหม่จาก MinIO
```

> **ข้อควรระวัง:** ถ้าไฟล์เสียงถูกลบจาก MinIO ไปแล้ว (analyze เสร็จในรอบก่อนแล้ว) การ retry จะ fail เพราะหาไฟล์ไม่เจอ

---

## Known Limitations ที่ควรรู้

| ปัญหา                               | สาเหตุ                                                                        | Workaround                                          |
| ----------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Status ค้างที่ `processing` ตลอด    | Server restart ระหว่าง analyze — Node.js process ตายแต่ DB ยังเป็น processing | แก้ status เป็น `error` ใน Supabase แล้วกด Retry    |
| STT fail กับไฟล์ใหญ่ (LiteLLM path) | Cloudflare ตัด connection ที่ ~60 วินาที                                      | ใช้ `DEEPGRAM_API_KEY` (เรียกตรงไม่ผ่าน Cloudflare) |
| Retry ไม่ได้ผล                      | ไฟล์เสียงถูกลบจาก MinIO ไปแล้ว                                                | ต้องอัพโหลดใหม่                                     |

---

## แนวทางเพิ่มเติม — Audio Playback (ยังไม่ได้ implement)

ปัจจุบันไฟล์เสียงถูกลบจาก MinIO ทันทีหลัง analyze เสร็จ ทำให้ไม่สามารถเล่นเสียงย้อนหลังได้
`AudioPlayer` component ยังมีอยู่ใน `app/components/audio-player.tsx` และสามารถนำกลับมาใช้ได้

### วิธี re-enable Audio Playback

**ขั้นที่ 1 — หยุดลบไฟล์หลัง analyze**

ใน `app/lib/analysis.server.ts` ลบหรือ comment บรรทัด `deleteAudio(...)` ออก:

```ts
// ลบส่วนนี้ออก
deleteAudio(filename)
  .then(() => {})
  .catch(...)
```

**ขั้นที่ 2 — คืน presignedUrl ใน loader**

ใน `app/routes/analyses.$id.tsx` เพิ่มกลับ:

```ts
import { getPresignedUrl } from "~/lib/minio.server";

// ใน loader:
let presignedUrl: string | null = null;
try {
  presignedUrl = await getPresignedUrl(file.filename);
} catch {
  // ไฟล์ถูกลบหรือ MinIO ไม่พร้อม — ไม่ crash
}
return { file: cleanedFile, analysis, presignedUrl };
```

**ขั้นที่ 3 — แสดง AudioPlayer ใน UI**

```tsx
import { AudioPlayer } from "~/components/audio-player";

// ใน component:
{
  presignedUrl && (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <AudioPlayer src={presignedUrl} />
      </CardContent>
    </Card>
  );
}
```

### สิ่งที่ต้องทำเพิ่มถ้าเปิดใช้

| รายการ                    | รายละเอียด                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| นโยบายลบไฟล์              | ไฟล์จะสะสมใน MinIO ไม่มีสิ้นสุด — ควรตั้ง lifecycle rule ลบอัตโนมัติเช่น 30 วัน หรือให้ user กดลบเอง |
| Presigned URL หมดอายุ     | default 1 ชั่วโมง — ถ้าเปิดหน้าค้างไว้นานกว่านั้น player จะ error ต้อง refresh                       |
| Retry กับไฟล์ที่ยังมีอยู่ | ปัจจุบัน retry ล้มเหลวถ้าไฟล์ถูกลบ — ถ้าเก็บไฟล์ไว้ retry จะทำงานได้ตามปกติ                          |

---

## สรุป Flow ทั้งหมด

```
upload   → pending
         → [server] upload MinIO + insert Supabase(pending)

analyze  → processing
         → [background] download MinIO
                      → STT (Deepgram หรือ LiteLLM)
                      → cleanThaiText + removeRepetitions
                      → LLM analysis (Claude via LiteLLM)
                      → insert analysis_results
                      → update status = done
                      → delete MinIO (fire-and-forget)

poll     → done  → navigate /analyses/:id → แสดงผล
         → error → แสดง error + ปุ่ม Retry
```
