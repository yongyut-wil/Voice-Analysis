# MindsDB Integration Guide — Voice Analysis Project

## MindsDB คืออะไร?

MindsDB คือ **AI layer ที่วางซ้อนบน database** — แทนที่จะต้องเขียนโค้ด Python เพื่อเรียก AI model แล้วเอาผลลัพธ์ไปเก็บ database, MindsDB ให้เราใช้ SQL เรียก AI ได้โดยตรง

ตัวอย่างเช่น แทนที่จะทำแบบนี้:

```
Python → เรียก OpenAI API → parse response → INSERT ลง PostgreSQL
```

ใน MindsDB ทำได้แค่:

```sql
SELECT answer FROM my_ai_model WHERE question = 'คำถาม';
```

ในโปรเจกต์นี้ MindsDB เพิ่ม 3 capabilities บน Supabase ที่ระบบปัจจุบันไม่มี:

| Capability         | คืออะไร                                          | ประโยชน์                                              | ความคุ้มค่า |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------- | ----------- |
| **Knowledge Base** | Vector database สำหรับ semantic search           | หา calls ที่คล้ายกันโดย "ความหมาย" ไม่ใช่แค่ keyword  | สูงมาก      |
| **Agent**          | AI ที่ query database ได้เองจากคำถามภาษาธรรมชาติ | Supervisor ถามว่า "สายลบวันนี้กี่สาย" แทนการเขียน SQL | สูง         |
| **Forecast Model** | ML model พยากรณ์ time-series                     | คาดการณ์ satisfaction trend ล่วงหน้า                  | ปานกลาง     |

**pipeline หลักไม่เปลี่ยนแปลง** — MindsDB เป็น layer เสริมที่อ่านข้อมูลจาก Supabase เท่านั้น

```
Upload → n8n → LiteLLM STT → Claude Analysis → Supabase  ← ไม่เปลี่ยน
                                                    ↓
                                                MindsDB
                                                    ├── Knowledge Base (semantic search)
                                                    ├── Analytics Agent (NL → SQL)
                                                    └── Forecast Models
                                                    ↓
                                          React Router API
                                          GET /api/search
                                          POST /api/agent
```

---

## ข้อจำกัดที่ต้องรู้ก่อนเริ่ม

สิ่งเหล่านี้พบจากการทดลองใช้จริง ไม่ได้อยู่ใน docs ของ MindsDB — อ่านก่อนเพื่อไม่ต้องเจอ error ซ้ำ

| ข้อจำกัด                                                                        | สาเหตุ                                                                                                                                                          | วิธีรับมือ                                                                                                                                                |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CREATE MODEL` + `CREATE AGENT` แยกกัน ใช้ไม่ได้ กับ LiteLLM proxy              | MindsDB ต้องการ "model instances" ซึ่ง `litellm` และ `openai` engine ที่ชี้ไป custom endpoint ไม่รองรับ                                                         | ใช้ `model = {...}` inline ตรงใน `CREATE AGENT` แทน (ทดสอบแล้วใช้งานได้)                                                                                  |
| `openai` engine + `CREATE ML_ENGINE` กับ LiteLLM — ขึ้นอยู่กับสิทธิ์ของ API key | MindsDB เรียก `GET /v1/models/test` เป็น health check — key ที่ไม่มี management routes จะ 403 และสร้างไม่สำเร็จ                                                 | ถ้า key มีสิทธิ์ครบ (ทดสอบแล้วใช้งานได้) ใช้ ML Engine ได้ตามปกติ — ถ้า key จำกัดเฉพาะ `llm_api_routes` ให้ใช้ `model = {...}` inline ใน CREATE AGENT แทน |
| ใช้ `text-embedding-3-large` กับ ivfflat index ไม่ได้                           | model นี้มี 3072 dimensions แต่ ivfflat รองรับสูงสุด 2000                                                                                                       | ใช้ `text-embedding-3-small` (1536 dims) แทน                                                                                                              |
| column ที่ SELECT ออกมาจาก KB ชื่อต่างจาก docs เก่า                             | MindsDB เปลี่ยน naming ใหม่                                                                                                                                     | ใช้ `chunk_id`, `chunk_content`, `relevance` เท่านั้น                                                                                                     |
| INSERT metadata เป็น JSON blob แล้ว filter ไม่ได้                               | MindsDB แปลง boolean ใน JSON เป็น INTEGER ซึ่ง fail กับค่า `"false"`                                                                                            | INSERT แต่ละ field เป็น column แยก เช่น `emotion`, `satisfaction_score`                                                                                   |
| filter boolean column ใน KB ไม่ได้ทุกกรณี                                       | MindsDB เก็บ boolean ลง JSONB เป็น string `"true"`/`"false"` แล้ว `CAST(...AS INTEGER)` scan ทุก row ทำให้ fail กับค่า `"false"` เสมอ แม้จะใช้ `= 1` หรือ `= 0` | อย่า filter boolean ใน KB query — query โดยไม่มี boolean filter แล้ว filter ใน TypeScript แทน                                                             |
| JOIN ระหว่าง KB กับ database ทำไม่ได้                                           | MindsDB internal error `Column A_kb_metadata_X not found`                                                                                                       | ทำ 2 query แยก: KB ก่อน → เอา IDs → query Supabase ต่อ                                                                                                    |

---

## 1. ติดตั้ง MindsDB

MindsDB รันเป็น container แยกต่างหาก มี Web UI ให้เขียน SQL ทดสอบได้ที่ port 47334

เพิ่มใน `docker-compose.yml`:

```yaml
mindsdb:
  image: mindsdb/mindsdb:latest
  container_name: mindsdb
  ports:
    - "47334:47334" # HTTP API + Web GUI (เปิด browser มาที่นี่)
    - "47335:47335" # MySQL protocol (ถ้าต้องการ connect จาก MySQL client)
  volumes:
    - mindsdb_data:/root/mindsdb_storage # เก็บ state ของ models, KB ไว้ที่นี่
  environment:
    MINDSDB_STORAGE_DIR: /root/mindsdb_storage
  restart: unless-stopped

volumes:
  mindsdb_data:
```

```bash
docker-compose up -d mindsdb

# ตรวจสอบว่า ready แล้ว (status ควรเป็น "ok")
curl http://localhost:47334/api/status

# เปิด Web GUI เพื่อเขียน SQL
open http://localhost:47334
```

ทุกคำสั่ง SQL ในเอกสารนี้รันได้ที่ **MindsDB Web GUI** (`http://localhost:47334`) ในช่อง SQL Editor เว้นแต่จะระบุว่าให้รันที่ Supabase

---

## 2. เชื่อมต่อ Supabase → MindsDB

MindsDB ไม่ได้เก็บข้อมูลเอง แต่ต่อเข้า database ที่มีอยู่แล้ว — ในที่นี้คือ Supabase

ใน MindsDB การ "ต่อเข้า database" เรียกว่าสร้าง **DATABASE** ซึ่งทำหน้าที่เป็น pointer ไปยัง database จริง หลังจากสร้างแล้ว MindsDB query ข้อมูลแบบ real-time ผ่าน connection นั้น ไม่ได้ copy ข้อมูลมาเก็บไว้ใหม่

### 2.1 เชื่อมต่อ Supabase PostgreSQL

รันใน **MindsDB SQL Editor**:

```sql
-- "supabase_voice" คือชื่อที่เราตั้งเอง ใช้อ้างอิงใน query ทีหลัง
-- schema ต้องเป็น "voice_analysis" ตาม project นี้ (ไม่ใช่ "public")
CREATE DATABASE supabase_voice_analysis
WITH ENGINE = 'postgres',
PARAMETERS = {
    "host": "db.<your-project-ref>.supabase.co",
    "port": 5432,
    "database": "postgres",
    "user": "postgres",
    "password": "<SUPABASE_SERVICE_ROLE_KEY>",
    "schema": "voice_analysis"
};
```

ตรวจสอบว่าต่อได้:

```sql
-- ควรเห็น audio_files และ analysis_results
SHOW TABLES FROM supabase_voice_analysis;

-- ลอง query ข้อมูลจริง
SELECT af.original_name, ar.emotion, ar.satisfaction_score
FROM supabase_voice.audio_files af
LEFT JOIN supabase_voice.analysis_results ar ON af.id = ar.audio_file_id
WHERE af.status = 'done'
LIMIT 5;
```

### 2.2 ML Engine

> **ข้ามได้** — Agent ใช้ `model = {...}` inline โดยตรง, Knowledge Base ใช้ `embedding_model = {...}` inline เช่นกัน ทั้งสองไม่ต้องผ่าน ML Engine
>
> **ถ้าต้องการสร้าง ML Engine:** ทำได้ถ้า LiteLLM key มีสิทธิ์ management routes (`GET /v1/models/test`) — ดูวิธีทดสอบใน section 8  
> ถ้า key จำกัดเฉพาะ `llm_api_routes` MindsDB จะ 403 ตอน health check และสร้างไม่สำเร็จ

---

## 3. Knowledge Base (Semantic Search)

### Knowledge Base คืออะไร?

Knowledge Base คือ database พิเศษที่เก็บข้อความเป็น **vector embeddings** — ตัวเลขที่แทน "ความหมาย" ของข้อความ ทำให้ค้นหาด้วยความหมายได้แทนที่จะค้นหาด้วย keyword

ตัวอย่าง: ถ้า INSERT transcription ที่มีคำว่า "ลูกค้าไม่พอใจกับค่าบริการ" ไว้ แล้ว query ด้วย "ลูกค้าโกรธเรื่องราคา" — KB จะหาเจอ เพราะทั้งสองมีความหมายใกล้เคียงกัน แม้ไม่มีคำเดียวกันเลย

**Flow การทำงาน:**

```
transcription text
      ↓
Embedding model (text-embedding-3-small)
      ↓
vector [0.12, -0.34, 0.89, ...] (1536 ตัวเลข)
      ↓
เก็บใน pgvector table ใน Supabase
      ↓
ตอน query: แปลง query เป็น vector แล้วหา vector ที่ใกล้ที่สุด (cosine similarity)
```

### ขั้นตอนที่ 1 — สร้าง vector table ใน Supabase

MindsDB ไม่ได้เก็บ vectors เอง ต้องมี vector database รองรับ — ใช้ pgvector ที่ Supabase มีอยู่แล้ว

#### ทำไม custom schema ถึงต้อง grant เองทุกครั้ง?

Supabase จัดการสิทธิ์ schema `public` ให้อัตโนมัติ แต่ schema ที่สร้างเอง (เช่น `voice_analysis`) ไม่มีสิทธิ์ใดๆ ตั้งแต่แรก ต้อง grant เองทุก role ที่จะเข้าถึง

request ของ app วิ่งผ่านลำดับนี้:

```
supabase-js (JWT)
    ↓
PostgREST (ต่อ DB ในฐานะ "authenticator")
    ↓
switch role ตาม JWT claim → service_role / anon / authenticated
    ↓
query PostgreSQL
```

| Role            | ทำไมต้อง grant                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `authenticator` | PostgREST ใช้ role นี้ต่อ DB ก่อนเสมอ — ถ้าไม่มี USAGE จะ `permission denied` ก่อนถึง role อื่นเลย |
| `service_role`  | app server-side ส่ง `SUPABASE_SERVICE_ROLE_KEY` → PostgREST switch มา role นี้                     |
| `anon`          | unauthenticated request ใช้ role นี้                                                               |
| `authenticated` | ครอบคลุม session ที่ login แล้ว (เผื่ออนาคต)                                                       |
| `postgres`      | MindsDB ต่อ Supabase โดยตรงในฐานะ postgres user — ไม่ผ่าน PostgREST                                |

> **หมายเหตุ:** ต้องรัน grants เหล่านี้ทุกครั้งที่สร้าง schema ใหม่ หรือสร้าง table ใหม่ใน schema

#### SQL ทั้งหมด (รันใน Supabase SQL Editor)

```sql
-- pgvector เป็น PostgreSQL extension สำหรับเก็บและค้นหา vectors
-- Supabase enable ไว้ให้แล้วโดยปกติ
CREATE EXTENSION IF NOT EXISTS vector;

-- สร้าง table สำหรับเก็บ vector embeddings ของ transcriptions
-- embeddings vector(1536) — ใช้ text-embedding-3-small ซึ่งมี 1536 dimensions
-- ** text-embedding-3-large ใช้ไม่ได้ เพราะมี 3072 dims เกิน limit 2000 ของ ivfflat **
CREATE TABLE IF NOT EXISTS mindsdb_data.kb_transcriptions (
  id         TEXT PRIMARY KEY,   -- analysis_results.id ที่แปลงเป็น TEXT
  content    TEXT,               -- transcription text (MindsDB เก็บ raw text ไว้ด้วย)
  metadata   JSONB,              -- MindsDB ใช้ column นี้ภายใน (ไม่ต้องยุ่ง)
  embeddings vector(1536)        -- vector ของ transcription นั้น
);

-- ivfflat index ทำให้ค้นหา vector เร็วขึ้นมาก (approximate nearest neighbor)
-- lists = 100 คือจำนวน cluster ที่แบ่ง — ปรับเพิ่มได้ถ้ามีข้อมูลเยอะ (rule of thumb: rows/1000)
CREATE INDEX IF NOT EXISTS kb_transcriptions_emb_idx
  ON mindsdb_data.kb_transcriptions
  USING ivfflat (embeddings vector_cosine_ops)
  WITH (lists = 100);

-- ── Grants สำหรับ schema ทั้งหมด (app + MindsDB) ────────────────────────────
-- ต้องรันก่อน table-level grants เสมอ เพราะ USAGE บน schema เป็น prerequisite

-- app ผ่าน PostgREST
GRANT USAGE ON SCHEMA voice_analysis TO authenticator, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA voice_analysis TO authenticator, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA voice_analysis TO authenticator, anon, authenticated, service_role;

-- MindsDB ต่อตรงผ่าน postgres user (ไม่ผ่าน PostgREST)
GRANT USAGE ON SCHEMA voice_analysis TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA voice_analysis TO postgres;

-- default privileges: table ใหม่ที่สร้างทีหลังจะได้รับ grant อัตโนมัติ
ALTER DEFAULT PRIVILEGES IN SCHEMA voice_analysis
  GRANT ALL ON TABLES TO authenticator, anon, authenticated, service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA voice_analysis
  GRANT ALL ON SEQUENCES TO authenticator, anon, authenticated, service_role, postgres;
```

### ขั้นตอนที่ 2 — เชื่อมต่อ pgvector ใน MindsDB

ต้องสร้าง database connection แยกสำหรับ pgvector เพราะใช้ engine คนละประเภทกับ postgres connection ใน 2.1

รันใน **MindsDB SQL Editor**:

```sql
-- "supabase_pgvector" คือชื่อที่เราตั้งเอง ใช้อ้างอิงตอนสร้าง Knowledge Base
-- ชี้ไปที่ Supabase เหมือนกัน แต่ใช้ engine = 'pgvector' แทน 'postgres'
CREATE DATABASE supabase_pgvector
WITH ENGINE = 'pgvector',
PARAMETERS = {
    "host": "db.<your-project-ref>.supabase.co",
    "port": 5432,
    "database": "postgres",
    "user": "postgres",
    "password": "<SUPABASE_SERVICE_ROLE_KEY>",
    "schema": "voice_analysis"
};
```

### ขั้นตอนที่ 3 — สร้าง Knowledge Base

**Knowledge Base** ใน MindsDB คือ object ที่ผูก embedding model เข้ากับ vector storage — เวลา INSERT ข้อความเข้าไป MindsDB จะแปลงเป็น vector ให้อัตโนมัติ แล้วเก็บไว้ใน table ที่ระบุ

```sql
-- "call_transcriptions" คือชื่อ Knowledge Base ที่เราตั้งเอง
-- embedding_model: model ที่ใช้แปลง text เป็น vector
--   - ต้องเป็น JSON inline (MindsDB เวอร์ชันใหม่ไม่รองรับการ reference model แยก)
--   - base_url ไม่ใช่ api_base — MindsDB ใช้ OpenAI Python SDK ซึ่งใช้ชื่อ base_url
-- storage: ชี้ไปที่ vector table ที่สร้างไว้ในขั้นตอนที่ 1
--   - format: <database_connection_name>.<table_name>
--   - ถ้าไม่ระบุ storage จะ error "Vector table is not defined"
CREATE KNOWLEDGE BASE call_transcriptions
USING
  embedding_model = {
    "provider": "openai",
    "model_name": "text-embedding-3-small",
    "api_key": "<LITELLM_API_KEY>",
    "base_url": "<LITELLM_BASE_URL>"
  },
  storage = supabase_vectors.kb_transcriptions,
  metadata_columns = ['audio_file_id', 'emotion', 'satisfaction_score', 'illegal_detected'];
  -- metadata_columns จำเป็น — ถ้าไม่ใส่ MindsDB เก็บ metadata เป็น JSON blob
  -- แล้ว SELECT emotion, audio_file_id ฯลฯ จะ error "column not found"
```

### ขั้นตอนที่ 4 — Insert transcriptions เข้า Knowledge Base

เมื่อ INSERT ข้อมูลเข้า Knowledge Base MindsDB จะ:

1. ส่ง `content` ไปให้ embedding model แปลงเป็น vector
2. เก็บ vector + ข้อมูลทั้งหมดลงใน `kb_transcriptions` table ใน Supabase

```sql
-- INSERT แต่ละ field เป็น column แยก (ไม่ใช่ JSON blob ใน metadata)
-- เหตุผล: ถ้าใช้ JSON blob — MindsDB จะแปลง boolean เป็น INTEGER (0/1)
--         แล้ว fail กับค่า "false" ด้วย error "invalid input syntax for type integer"
--         การใส่เป็น column แยกทำให้ MindsDB รู้ type จริงของแต่ละ field
--
-- ต้องใส่ AS alias ทุกครั้งที่ใช้ ::TEXT cast
-- เหตุผล: MindsDB เปลี่ยนชื่อ column ที่ cast เป็น cast_0, cast_1, ...
--         ทำให้ content column หายไป → error "Content columns None not found in dataset"
INSERT INTO call_transcriptions (id, content, emotion, satisfaction_score, illegal_detected, audio_file_id)
SELECT
  ar.id::TEXT              AS id,             -- ต้อง AS id ไม่งั้น MindsDB เรียก cast_0
  ar.transcription         AS content,        -- ต้อง AS content เพราะ KB ต้องการชื่อนี้โดยเฉพาะ
  ar.emotion,
  ar.satisfaction_score,
  ar.illegal_detected,
  ar.audio_file_id::TEXT   AS audio_file_id   -- ต้อง AS audio_file_id ไม่งั้น MindsDB เรียก cast_1
FROM supabase_voice.analysis_results ar
WHERE ar.transcription IS NOT NULL;  -- ข้ามแถวที่ยัง transcribe ไม่สำเร็จ
```

### ขั้นตอนที่ 5 — Auto-index ข้อมูลใหม่ทุกชั่วโมง

**MindsDB Job** คือ scheduled task ที่รัน SQL ตามเวลาที่กำหนด คล้ายกับ cron job แต่เขียนเป็น SQL

`LAST` เป็น keyword พิเศษของ MindsDB ที่หมายถึง "timestamp ของ job รอบที่แล้ว" ทำให้ดึงแค่ records ใหม่แทนที่จะดึงทั้งหมดซ้ำทุกรอบ

```sql
-- syntax: CREATE JOB name (query) EVERY period;
-- ไม่ใช้ REPEAT EVERY หรือ AS (...)
CREATE JOB index_new_transcriptions (
  INSERT INTO call_transcriptions (id, content, emotion, satisfaction_score, illegal_detected, audio_file_id)
  SELECT
    ar.id::TEXT              AS id,
    ar.transcription         AS content,
    ar.emotion,
    ar.satisfaction_score,
    ar.illegal_detected,
    ar.audio_file_id::TEXT   AS audio_file_id
  FROM supabase_voice.analysis_results ar
  WHERE ar.transcription IS NOT NULL
    AND ar.created_at > LAST   -- ดึงเฉพาะ records ที่เพิ่มมาหลัง job รอบก่อน
)
EVERY hour;
```

### ทดสอบ Semantic Search

หลัง INSERT สำเร็จ ลองค้นหา — KB จะคืน columns เหล่านี้:

- `chunk_id` — ID ของ record ที่ match (คือ `analysis_results.id` ที่เราใส่เข้าไป)
- `chunk_content` — เนื้อหา transcription
- `relevance` — คะแนนความเกี่ยวข้อง 0-1 (ยิ่งใกล้ 1 ยิ่งเกี่ยวข้อง)

```sql
-- ค้นหาด้วยความหมาย — ไม่ต้องรู้คำแน่ชัด
SELECT chunk_id, chunk_content, relevance
FROM call_transcriptions
WHERE content = 'ลูกค้าร้องเรียนเรื่องบริการ'
LIMIT 10;

-- เพิ่ม filter บน metadata columns (ใช้ชื่อ column ตรงๆ ห้ามใช้ JSON_EXTRACT)
SELECT chunk_id, chunk_content, relevance, emotion, satisfaction_score
FROM call_transcriptions
WHERE content = 'ลูกค้าไม่พอใจ'
  AND emotion = 'negative'
  AND satisfaction_score < 50
LIMIT 5;

-- ❌ filter boolean ใน KB ไม่ได้ — ทั้ง = true, = false, = 1, = 0 ล้วน fail
-- เหตุผล: MindsDB เก็บ boolean ลง JSONB เป็น string "true"/"false"
--         แล้ว CAST(... AS INTEGER) scan ทุก row → fail ทันทีที่เจอค่า "false"
-- วิธีแก้: query KB โดยไม่ filter boolean แล้ว filter ใน application code แทน
SELECT chunk_id, chunk_content, relevance
FROM call_transcriptions
WHERE content = 'ข้อเสนอที่ผิดกฎหมาย'
LIMIT 20;
-- จากนั้นใน TypeScript: results.filter(r => r.illegal_detected)
```

> **ข้อสำคัญ:** KB ไม่รองรับ JOIN กับ database โดยตรง (MindsDB internal error)
> ถ้าต้องการข้อมูลเพิ่มเติม เช่น `summary` หรือ `original_name` ให้เอา `chunk_id` ไป query Supabase แยก
> ดูตัวอย่าง code ใน section 5 (`semanticSearchWithDetails`)

---

## 4. Analytics Agent (NL → SQL)

### Agent คืออะไร?

Agent คือ AI ที่รับคำถามภาษาธรรมชาติ แล้วตัดสินใจเองว่าจะใช้ tool ไหน (SQL query หรือ semantic search) เพื่อหาคำตอบ — ไม่ต้องเขียน SQL เอง

**ตัวอย่าง flow:**

```
คำถาม: "สัปดาห์นี้มีสายที่ satisfaction ต่ำกว่า 30 กี่สาย?"
    ↓
Agent คิด: "ต้องนับ rows จาก database — ใช้ sql_analytics skill"
    ↓
Agent สร้าง SQL: SELECT COUNT(*) FROM analysis_results WHERE satisfaction_score < 30
                 AND created_at >= CURRENT_DATE - INTERVAL '7 days'
    ↓
Agent ตอบ: "สัปดาห์นี้มีสาย 12 สายที่คะแนน satisfaction ต่ำกว่า 30"
```

### สร้าง Agent

> **สำคัญ:** ใช้ `model = {...}` inline ตรงใน CREATE AGENT เท่านั้น  
> ห้ามใช้ `CREATE MODEL` แยกก่อน แล้วอ้างชื่อ model — วิธีนั้นจะ error  
> `"Failed to create model instance: MindsDB provider is not yet supported for model instances"`

```sql
-- model = {...} inline — ระบุ provider, model, api_key, base_url ตรงในนี้เลย
-- data = {"tables": [...]} — ระบุ tables ที่ agent เข้าถึงได้
-- ไม่ต้องสร้าง ML Engine ก่อน
-- prompt_template ส่งเป็น system prompt ให้ Claude ทุกครั้งที่มีคำถามเข้ามา
--   ต้องอธิบาย schema + ค่าที่เป็นไปได้ของแต่ละ column ให้ครบ
--   ไม่งั้น agent เดา SQL ผิดได้ เช่น ใช้ emotion = 'bad' แทน emotion = 'negative'
CREATE AGENT call_analytics_agent
USING
  model = {
    "provider": "openai",
    "model_name": "claude-sonnet-4-6",
    "api_key": "<LITELLM_API_KEY>",
    "base_url": "<LITELLM_BASE_URL>"
  },
  data = {
    "tables": [
      "supabase_voice.audio_files",
      "supabase_voice.analysis_results"
    ]
  },
  prompt_template = "คุณเป็น analytics assistant สำหรับระบบวิเคราะห์คุณภาพบทสนทนาของ call center

## โครงสร้างข้อมูล

ตาราง audio_files — ข้อมูลไฟล์เสียงที่อัปโหลด:
- id: UUID ของไฟล์
- original_name: ชื่อไฟล์ต้นฉบับ
- status: สถานะการประมวลผล (pending=รอ, processing=กำลังวิเคราะห์, done=เสร็จแล้ว, error=ผิดพลาด)
- created_at: วันเวลาที่อัปโหลด

ตาราง analysis_results — ผลการวิเคราะห์:
- audio_file_id: อ้างอิงไปยัง audio_files.id
- transcription: ข้อความที่ถอดจากเสียง
- emotion: อารมณ์โดยรวม (positive=ดี, neutral=กลางๆ, negative=ไม่ดี)
- satisfaction_score: คะแนนความพึงพอใจ 0-100 (ยิ่งสูงยิ่งดี)
- illegal_detected: พบเนื้อหาผิดกฎหมายหรือไม่ (true/false)
- summary: สรุปบทสนทนาโดย AI

## แนวทางตอบ
- ตอบเป็นภาษาไทยเสมอ
- ระบุตัวเลขให้ชัดเจน เช่น จำนวนสาย, เปอร์เซ็นต์, คะแนนเฉลี่ย
- ถ้าไม่มีข้อมูลให้บอกตรงๆ ว่าไม่พบข้อมูล
- ใช้เฉพาะข้อมูล status = 'done' เมื่อวิเคราะห์ผลการสนทนา เพราะ status อื่นยังไม่มีผลวิเคราะห์

## คำที่มักพิมพ์ผิด
- neutral มักถูกพิมพ์เป็น netural, nuteral, neutal
- positive มักถูกพิมพ์เป็น positve, postive, possitive
- negative มักถูกพิมพ์เป็น negitive, negtive, negativ
กรุณาตีความคำที่พิมพ์ผิดให้ถูกต้องก่อนสร้าง SQL query";
```

> **หมายเหตุเรื่องความคงที่:** MindsDB ไม่รองรับ `temperature` parameter ใน `model = {...}` inline config — agent จึงใช้ default temperature ของ LLM ซึ่งทำให้ผลลัพธ์อาจต่างกันเมื่อถามซ้ำ แอปจึงใช้ **answer caching** (LRU cache TTL 5 นาที) เป็นกลไกหลักในการรับประกันความคงที่แทน
>
> **App-level defense:** นอกจาก prompt แล้ว app ยังมี 2 ชั้นป้องกันใน `mindsdb.server.ts`:
>
> - **Typo normalization** — แก้คำผิดก่อนส่งให้ agent (เช่น netural → neutral)
> - **Answer caching** — LRU cache TTL 5 นาที ถามซ้้าได้คำตอบเดิมทันที ไม่ต้องรอ LLM
>
> **ถ้าสร้างไปแล้วและต้องการแก้ prompt:** MindsDB ไม่มี `ALTER AGENT` ต้อง drop แล้วสร้างใหม่
>
> ```sql
> DROP AGENT IF EXISTS call_analytics_agent;
> -- แล้วรัน CREATE AGENT ใหม่
> ```
>
> การ drop agent ไม่กระทบ Knowledge Base หรือข้อมูลที่ INSERT ไว้แล้ว

---

## 5. TypeScript Integration (React Router App)

MindsDB มี HTTP API — เราเรียกผ่าน `POST /api/sql/query` ด้วย SQL เป็น string

### `app/lib/mindsdb.server.ts`

```typescript
const MINDSDB_BASE = process.env.MINDSDB_HOST ?? "http://localhost:47334";

// helper function สำหรับส่ง SQL ไปรันที่ MindsDB แล้วรับผลลัพธ์กลับมา
async function mindsdbQuery(sql: string): Promise<unknown[]> {
  const resp = await fetch(`${MINDSDB_BASE}/api/sql/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MINDSDB_API_KEY ?? ""}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!resp.ok) throw new Error(`MindsDB query failed: ${resp.statusText}`);
  const data = (await resp.json()) as { data?: unknown[] };
  return data.data ?? [];
}

// columns ที่ Knowledge Base คืนกลับมา
export interface KBResult {
  chunk_id: string; // analysis_results.id ที่เราใส่เข้าไปตอน INSERT
  chunk_content: string; // transcription text
  relevance: number; // คะแนนความเกี่ยวข้อง 0-1
  emotion?: string;
  satisfaction_score?: number;
  illegal_detected?: boolean;
  audio_file_id?: string;
}

// semantic search — คืนแค่ข้อมูลใน KB (ไม่มี summary หรือ original_name)
// หมายเหตุ: KB chunks transcription ยาวๆ เป็นหลาย rows — 4 records อาจได้ 9+ rows
//           ต้อง deduplicate โดย audio_file_id เก็บแค่ chunk relevance สูงสุดต่อ 1 ไฟล์
export async function semanticSearch(query: string, limit = 10): Promise<KBResult[]> {
  const rows = await mindsdbQuery(`
    SELECT chunk_id, chunk_content, relevance, emotion, satisfaction_score, illegal_detected, audio_file_id
    FROM call_transcriptions
    WHERE content = ${JSON.stringify(query)}
    LIMIT ${limit * 10}
  `);

  // Deduplicate: 1 audio file → 1 result (highest relevance chunk)
  const seen = new Map<string, KBResult>();
  for (const row of rows as KBResult[]) {
    const key = row.audio_file_id ?? row.chunk_id;
    const existing = seen.get(key);
    if (!existing || (row.relevance ?? 0) > (existing.relevance ?? 0)) {
      seen.set(key, row);
    }
  }
  return Array.from(seen.values())
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, limit);
}

// semantic search พร้อมข้อมูลครบจาก Supabase
// ทำ 2 query แยกเพราะ KB ไม่รองรับ JOIN กับ database โดยตรง:
//   1. query KB → ได้ chunk_ids + relevance scores
//   2. query Supabase ด้วย IDs → ได้ full records (summary, original_name ฯลฯ)
//   3. merge relevance กลับเข้า result แล้ว sort ตาม relevance
export async function semanticSearchWithDetails(
  query: string,
  supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>,
  limit = 10
) {
  const kbResults = await semanticSearch(query, limit);
  if (kbResults.length === 0) return [];

  const ids = kbResults.map((r) => r.chunk_id);
  const { data } = await supabase
    .from("analysis_results")
    .select("id, emotion, satisfaction_score, summary, audio_file_id, illegal_detected")
    .in("id", ids);

  const relevanceMap = new Map(kbResults.map((r) => [r.chunk_id, r.relevance]));
  return (data ?? [])
    .map((row) => ({ ...row, relevance: relevanceMap.get(row.id) ?? 0 }))
    .sort((a, b) => b.relevance - a.relevance);
}

// ส่งคำถามให้ Analytics Agent ตอบ
// มี 2 ชั้นป้องกันก่อนส่งให้ agent:
//   1. normalizeQuestion() — แก้ typo ของ domain terms (netural → neutral ฯลฯ)
//   2. answerCache — LRU cache TTL 5 นาที ถามซ้้าได้คำตอบเดิมทันที
export async function askAnalyticsAgent(question: string): Promise<string> {
  // 1. แก้ typo ก่อน
  const { normalized } = normalizeQuestion(question);

  // 2. เช็ค cache
  const cached = answerCache.get(normalized);
  if (cached && Date.now() < cached.expiry) return cached.answer;

  // 3. ถาม agent
  const rows = await mindsdbQuery(`
    SELECT answer FROM call_analytics_agent
    WHERE question = ${JSON.stringify(normalized)}
  `);
  const answer = (rows[0] as { answer?: string })?.answer ?? "ไม่สามารถตอบได้";

  // 4. เก็บ cache (เฉพาะที่ตอบได้)
  if (answer !== "ไม่สามารถตอบได้") {
    answerCache.set(normalized, { answer, expiry: Date.now() + 5 * 60_000 });
  }
  return answer;
}

// ดึง satisfaction forecast จาก forecasting model
export async function getSatisfactionForecast(days = 14) {
  return mindsdbQuery(`
    SELECT ds, avg_satisfaction, lower_bound, upper_bound
    FROM satisfaction_forecast
    WHERE ds > CURRENT_DATE
    ORDER BY ds
    LIMIT ${days}
  `);
}
```

### `app/routes/api/search.tsx`

```typescript
import type { Route } from "./+types/search";
import { semanticSearch } from "~/lib/mindsdb.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (!q) return Response.json({ results: [] });
  const results = await semanticSearch(q, 10);
  return Response.json({ results });
}
```

### `app/routes/api/agent.tsx`

```typescript
import type { Route } from "./+types/agent";
import { askAnalyticsAgent } from "~/lib/mindsdb.server";
import { extractErrorMessage } from "~/lib/error-utils";

export async function action({ request }: Route.ActionArgs) {
  const { question } = (await request.json()) as { question?: string };
  if (!question) return Response.json({ error: "Missing question" }, { status: 400 });
  try {
    const answer = await askAnalyticsAgent(question);
    return Response.json({ answer });
  } catch (err) {
    return Response.json({ error: extractErrorMessage(err) }, { status: 500 });
  }
}
```

เพิ่มใน `app/routes.ts`:

```typescript
route("api/search", "routes/api/search.tsx"),
route("api/agent",  "routes/api/agent.tsx"),
```

---

## 6. Time-Series Forecasting

### Forecasting คืออะไร?

MindsDB สามารถสร้าง ML model สำหรับ time-series forecasting ได้ผ่าน SQL — ระบุว่าข้อมูล historical อยู่ที่ไหน, column ไหนคือ timestamp, column ไหนคือค่าที่อยากพยากรณ์ MindsDB จะ train model และคืน prediction ออกมา

> **หมายเหตุ:** ต้องมีข้อมูลอย่างน้อย 30 วันขึ้นไปจึงจะ accurate

### สร้าง Satisfaction Forecast Model

```sql
-- FROM supabase_voice_analysis (...) คือ training data — query ที่ดึงข้อมูล historical
-- PREDICT avg_satisfaction — column ที่ต้องการพยากรณ์
-- horizon = 14 — พยากรณ์ล่วงหน้า 14 วัน
-- AutoARIMA — ให้ MindsDB เลือก ARIMA parameters ที่ดีที่สุดเอง
CREATE MODEL satisfaction_forecast
FROM supabase_voice_analysis (
  SELECT
    DATE_TRUNC('day', af.created_at)::DATE AS ds,          -- timestamp column ต้องชื่อ "ds"
    AVG(ar.satisfaction_score)             AS avg_satisfaction  -- ค่าที่จะ predict ต้องชื่อตรงกับ PREDICT
  FROM audio_files af
  JOIN analysis_results ar ON af.id = ar.audio_file_id
  WHERE af.status = 'done'
  GROUP BY 1 ORDER BY 1
)
PREDICT avg_satisfaction
USING engine = 'statsforecast', model = 'AutoARIMA', horizon = 14;
```

```sql
-- Negative emotion ratio forecast
CREATE MODEL negative_ratio_forecast
FROM supabase_voice_analysis (
  SELECT
    DATE_TRUNC('day', af.created_at)::DATE AS ds,
    ROUND(100.0 * COUNT(CASE WHEN ar.emotion = 'negative' THEN 1 END)
          / NULLIF(COUNT(*), 0), 1)        AS negative_pct
  FROM audio_files af
  JOIN analysis_results ar ON af.id = ar.audio_file_id
  WHERE af.status = 'done'
  GROUP BY 1 ORDER BY 1
)
PREDICT negative_pct
USING engine = 'statsforecast', model = 'AutoETS', horizon = 7;
```

### ดู Forecast

```sql
-- lower_bound และ upper_bound คือ confidence interval (ช่วงความเชื่อมั่น)
SELECT ds, avg_satisfaction, lower_bound, upper_bound
FROM satisfaction_forecast
WHERE ds > CURRENT_DATE
ORDER BY ds;
```

```sql
-- Retrain ทุกสัปดาห์เพื่อให้ model อัพเดทกับข้อมูลใหม่
CREATE JOB retrain_forecasts_weekly (
  RETRAIN satisfaction_forecast;
  RETRAIN negative_ratio_forecast;
)
EVERY week;
```

---

## 7. Environment Variables

เพิ่มใน `.env.example` และ `CLAUDE.md`:

```env
MINDSDB_HOST=http://localhost:47334  # MindsDB server URL (self-hosted)
MINDSDB_API_KEY=                     # ปล่อยว่างสำหรับ self-hosted, ใส่ key สำหรับ MindsDB Cloud
```

---

## 8. ML Engine — ทดสอบและจัดการ

ML Engine คือ object ที่เก็บ connection config ไปยัง LLM provider — แยกต่างหากจาก Agent และ Knowledge Base ทำให้ทดสอบได้อิสระโดยไม่กระทบสิ่งที่ใช้งานอยู่

> **หมายเหตุ:** setup ปัจจุบันไม่จำเป็นต้องใช้ ML Engine เพราะ Agent ใช้ `model = {...}` inline และ KB ใช้ `embedding_model = {...}` inline — ML Engine มีไว้สำหรับทดสอบหรือ reuse config ข้าม model หลายตัว

### สร้าง ML Engine (ทดสอบ)

```sql
CREATE ML_ENGINE test_litellm
FROM openai
USING
  openai_api_key = '<LITELLM_API_KEY>',
  api_base = '<LITELLM_BASE_URL>/v1';
```

> **สิ่งที่อาจเจอ:** MindsDB health check ด้วย `GET /v1/models/test` ตอนสร้าง — ถ้า LiteLLM key ไม่มีสิทธิ์ route นั้นจะ 403 และสร้างไม่สำเร็จ แต่ไม่กระทบ Agent หรือ KB ที่ใช้งานอยู่

### ดู ML Engines ทั้งหมด

```sql
SHOW ML_ENGINES;
```

### สร้าง test model จาก ML Engine

```sql
CREATE MODEL test_litellm_model
PREDICT answer
USING
  engine = 'test_litellm',
  model_name = 'claude-sonnet-4-6',
  prompt_template = 'ตอบคำถามนี้สั้นๆ: {{question}}';
```

### ตรวจสอบสถานะ model

```sql
DESCRIBE test_litellm_model;
-- ดู column STATUS ต้องเป็น "complete" ก่อน query ได้
-- ถ้า fail จะเห็น error ที่ column ERROR
```

### ทดสอบ query

```sql
SELECT answer
FROM test_litellm_model
WHERE question = 'สวัสดี ทดสอบการเชื่อมต่อ';
```

ถ้าได้คำตอบกลับมา แสดงว่า ML Engine เชื่อมต่อ LiteLLM ได้ปกติ

### ลบ test objects หลังทดสอบ

```sql
-- ลบ model ก่อน (ต้องลบก่อน engine)
DROP MODEL IF EXISTS test_litellm_model;

-- ลบ ML Engine
DROP ML_ENGINE IF EXISTS test_litellm;
```

---

## 9. Reset — ลบทุกอย่างแล้วเริ่มใหม่

### ล้าง MindsDB ทั้งหมด

รันใน **MindsDB SQL Editor** — ต้องรันตามลำดับนี้ (ลบ dependencies ก่อน parent):

```sql
-- Phase 2: Agent
DROP AGENT IF EXISTS call_analytics_agent;
```

```sql
-- Phase 3: Forecasting
DROP JOB IF EXISTS retrain_forecasts_weekly;
DROP MODEL IF EXISTS satisfaction_forecast;
DROP MODEL IF EXISTS negative_ratio_forecast;
```

```sql
-- Phase 1: Knowledge Base
DROP JOB IF EXISTS index_new_transcriptions;
DROP KNOWLEDGE BASE IF EXISTS call_transcriptions;
```

```sql
-- Database connections (ไม่มี ML Engine ให้ลบ)
DROP DATABASE IF EXISTS supabase_pgvector;
DROP DATABASE IF EXISTS supabase_voice_analysis;
```

### ล้าง Supabase

รันใน **Supabase SQL Editor**:

```sql
-- vector table ที่ KB ใช้เก็บ embeddings
DROP TABLE IF EXISTS mindsdb_data.kb_transcriptions;
```

---

## Checklist

### Phase 1 — Knowledge Base (ทำตามลำดับ)

- [ ] เพิ่ม MindsDB ใน `docker-compose.yml` แล้ว `docker-compose up -d mindsdb`
- [ ] สร้าง `mindsdb_data.kb_transcriptions` table + index + GRANT ใน **Supabase**
- [ ] `CREATE DATABASE supabase_voice_analysis` ใน MindsDB
- [ ] `CREATE DATABASE supabase_pgvector` ใน MindsDB
- [ ] `CREATE KNOWLEDGE BASE call_transcriptions` ใน MindsDB
- [ ] INSERT transcriptions (columns แยก ไม่ใช่ JSON blob)
- [ ] ทดสอบ semantic search — ต้องได้ `chunk_id`, `chunk_content`, `relevance` กลับมา
- [ ] `CREATE JOB index_new_transcriptions`
- [ ] สร้าง `app/lib/mindsdb.server.ts`, `api/search.tsx`, อัพเดท `routes.ts`
- [ ] เพิ่ม env vars ใน `.env.example` + `CLAUDE.md`

### Phase 2 — Analytics Agent

> **วิธีที่ใช้งานได้:** `model = {...}` inline ใน CREATE AGENT — ห้ามใช้ CREATE MODEL แยกแล้วอ้างชื่อ

- [ ] `CREATE AGENT call_analytics_agent` (inline model syntax)
- [ ] ทดสอบ NL queries
- [ ] สร้าง `api/agent.tsx` ใน React Router app

### Phase 3 — Forecasting (เมื่อมีข้อมูล 30+ วัน)

- [ ] `CREATE MODEL satisfaction_forecast`
- [ ] `CREATE MODEL negative_ratio_forecast`
- [ ] `CREATE JOB retrain_forecasts_weekly`

---

## วิธีทางเลือก: ใช้ ML Engine (ถ้า LiteLLM key มีสิทธิ์ครบ)

> **เงื่อนไข:** ต้องทดสอบ ML Engine ผ่านก่อน (section 8) — ถ้าสร้างไม่สำเร็จให้ใช้วิธี inline ตาม section 3–4 แทน

วิธีนี้ต่างจาก inline ตรงที่ config API key และ endpoint ไว้ที่ ML Engine ที่เดียว แล้ว model ต่างๆ อ้างถึงได้โดยไม่ต้องระบุซ้ำทุกครั้ง — สะดวกกว่าเมื่อมีหลาย model หรือต้องการเปลี่ยน key ที่เดียว

### ภาพรวมเปรียบเทียบ

|              | วิธี inline (section 3–4)              | วิธี ML Engine                                                         |
| ------------ | -------------------------------------- | ---------------------------------------------------------------------- |
| KB embedding | `embedding_model = {...}` inline       | `embedding_model = {...}` inline (เหมือนกัน — ML Engine ไม่ช่วยตรงนี้) |
| Agent        | `model = {...}` inline ใน CREATE AGENT | CREATE MODEL จาก ML Engine → อ้างชื่อ model ใน CREATE AGENT            |
| เปลี่ยน key  | แก้ทุก object ที่ใช้                   | แก้ที่ ML Engine ที่เดียว                                              |

---

### ขั้นตอนที่ 1 — สร้าง ML Engine

รันใน **MindsDB SQL Editor**:

```sql
CREATE ML_ENGINE litellm_engine
FROM openai
USING
  openai_api_key = '<LITELLM_API_KEY>',
  api_base = '<LITELLM_BASE_URL>/v1';
```

ตรวจสอบ:

```sql
SHOW ML_ENGINES;
-- ต้องเห็น litellm_engine ในรายการ
```

---

### ขั้นตอนที่ 2 — เชื่อมต่อ Supabase (เหมือนเดิม)

วิธีนี้ไม่เปลี่ยนจาก section 2 — รันใน **MindsDB SQL Editor**:

```sql
CREATE DATABASE supabase_voice_analysis
WITH ENGINE = 'postgres',
PARAMETERS = {
    "host": "db.<your-project-ref>.supabase.co",
    "port": 5432,
    "database": "postgres",
    "user": "postgres",
    "password": "<DB_PASSWORD>",
    "schema": "voice_analysis"
};

CREATE DATABASE supabase_pgvector
WITH ENGINE = 'pgvector',
PARAMETERS = {
    "host": "db.<your-project-ref>.supabase.co",
    "port": 5432,
    "database": "postgres",
    "user": "postgres",
    "password": "<DB_PASSWORD>",
    "schema": "voice_analysis"
};
```

---

### ขั้นตอนที่ 3 — สร้าง Knowledge Base (embedding ยังคง inline)

ML Engine ไม่ได้เปลี่ยนวิธีสร้าง KB — `embedding_model` ยังต้องระบุ inline เหมือนเดิม:

```sql
CREATE KNOWLEDGE BASE call_transcriptions
USING
  embedding_model = {
    "provider": "openai",
    "model_name": "text-embedding-3-small",
    "api_key": "<LITELLM_API_KEY>",
    "base_url": "<LITELLM_BASE_URL>"
  },
  storage = supabase_vectors.kb_transcriptions,
  metadata_columns = ['audio_file_id', 'emotion', 'satisfaction_score', 'illegal_detected'];
```

---

### ขั้นตอนที่ 4 — สร้าง Model สำหรับ Agent

นี่คือส่วนที่ต่างจากวิธี inline — สร้าง model แยกจาก ML Engine ก่อน แล้วค่อยอ้างชื่อใน Agent:

```sql
-- สร้าง chat model จาก ML Engine
-- STATUS ต้องเป็น "complete" ก่อนใช้งาน — ตรวจด้วย DESCRIBE
CREATE MODEL litellm_claude
PREDICT answer
USING
  engine = 'litellm_engine',
  model_name = 'claude-sonnet-4-6',
  prompt_template = '{{question}}';
```

ตรวจสอบสถานะ:

```sql
DESCRIBE litellm_claude;
-- STATUS = complete → พร้อมใช้
-- STATUS = error    → ดู ERROR column
```

---

### ขั้นตอนที่ 5 — สร้าง Agent อ้างชื่อ Model

```sql
-- แทนที่จะใช้ model = {...} inline ให้ใช้ชื่อ model ที่สร้างไว้แทน
CREATE AGENT call_analytics_agent
USING
  model = 'litellm_claude',
  data = {
    "tables": [
      "supabase_voice.audio_files",
      "supabase_voice.analysis_results"
    ]
  },
  prompt_template = "คุณเป็น analytics assistant สำหรับระบบวิเคราะห์คุณภาพบทสนทนาของ call center

## โครงสร้างข้อมูล

ตาราง audio_files — ข้อมูลไฟล์เสียงที่อัปโหลด:
- id: UUID ของไฟล์
- original_name: ชื่อไฟล์ต้นฉบับ
- status: สถานะการประมวลผล (pending=รอ, processing=กำลังวิเคราะห์, done=เสร็จแล้ว, error=ผิดพลาด)
- created_at: วันเวลาที่อัปโหลด

ตาราง analysis_results — ผลการวิเคราะห์:
- audio_file_id: อ้างอิงไปยัง audio_files.id
- transcription: ข้อความที่ถอดจากเสียง
- emotion: อารมณ์โดยรวม (positive=ดี, neutral=กลางๆ, negative=ไม่ดี)
- satisfaction_score: คะแนนความพึงพอใจ 0-100 (ยิ่งสูงยิ่งดี)
- illegal_detected: พบเนื้อหาผิดกฎหมายหรือไม่ (true/false)
- summary: สรุปบทสนทนาโดย AI

## แนวทางตอบ
- ตอบเป็นภาษาไทยเสมอ
- ระบุตัวเลขให้ชัดเจน เช่น จำนวนสาย, เปอร์เซ็นต์, คะแนนเฉลี่ย
- ถ้าไม่มีข้อมูลให้บอกตรงๆ ว่าไม่พบข้อมูล
- ใช้เฉพาะข้อมูล status = 'done' เมื่อวิเคราะห์ผลการสนทนา เพราะ status อื่นยังไม่มีผลวิเคราะห์";
```

ทดสอบ:

```sql
SELECT answer
FROM call_analytics_agent
WHERE question = 'มีสายที่ emotion เป็น negative กี่สาย';
```

---

### Reset สำหรับวิธี ML Engine

ลบตามลำดับนี้ (dependencies ก่อน parent):

```sql
-- 1. Agent และ Job
DROP AGENT IF EXISTS call_analytics_agent;
DROP JOB IF EXISTS index_new_transcriptions;

-- 2. Knowledge Base
DROP KNOWLEDGE BASE IF EXISTS call_transcriptions;

-- 3. Model (ต้องลบก่อน ML Engine)
DROP MODEL IF EXISTS litellm_claude;

-- 4. ML Engine
DROP ML_ENGINE IF EXISTS litellm_engine;

-- 5. Database connections
DROP DATABASE IF EXISTS supabase_pgvector;
DROP DATABASE IF EXISTS supabase_voice_analysis;
```
