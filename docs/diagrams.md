# Voice Analysis — System Diagrams

> ภาพรวมสถาปัตยกรรมและการไหลของข้อมูลทั้งระบบ
> ทุกไดอะแกรมใช้ [Mermaid](https://mermaid.js.org/) syntax — render ได้ใน GitHub, VS Code หรือ Mermaid Live Editor

---

## สารบัญ

1. [System Architecture](#1-system-architecture) — ภาพรวมโครงสร้างระบบ 5 ชั้น
2. [Database Schema](#2-database-schema) — ตารางหลัก 2 ตารางและความสัมพันธ์
3. [Status Lifecycle](#3-status-lifecycle) — วงจรสถานะ audio_files.status
4. [Data Flow — End-to-End](#4-data-flow--end-to-end) — ขั้นตอนทั้งหมดตั้งแต่ upload จนแสดงผล
5. [Retry Flow](#5-retry-flow) — การ retry เมื่อวิเคราะห์ล้มเหลว
6. [Internal Module Dependencies](#6-internal-module-dependencies) — ความสัมพันธ์ระหว่าง module ภายใน

---

## 1. System Architecture

ภาพรวมระบบแบ่งเป็น 5 ชั้น: **Client → App Server → Infrastructure / n8n → AI Services**

```mermaid
flowchart TB
    subgraph CLIENT["🖥️ Client Layer"]
        BR["Browser\nReact Router v7 SSR · shadcn/ui + Tailwind"]
    end

    subgraph APP["⚙️ App Server — Node.js / Vite SSR"]
        direction TB
        subgraph ROUTES["🔌 API Routes"]
            R1["POST /api/upload"]
            R2["POST /api/analyze"]
            R3["GET  /api/status/:id"]
            R4["POST /api/retry/:id"]
        end
        subgraph CALLBACKS["📞 Callback Routes"]
            CB1["POST /callback/transcribe-audio"]
            CB2["POST /callback/save-analysis"]
            CB3["POST /callback/status"]
            CB4["GET  /callback/audio-download-url"]
            CB5["POST /callback/delete-audio"]
        end
        subgraph LIBS["📦 Server Libraries"]
            L1["supabase.server"]
            L2["minio.server"]
            L3["n8n.server"]
            L4["litellm.server"]
            L5["analysis.server"]
            L6["logger"]
            L7["error-utils"]
        end
    end

    subgraph INFRA["🗄️ Infrastructure"]
        DB[("Supabase PostgreSQL\naudio_files · analysis_results")]
        MN[("MinIO\nObject Storage")]
    end

    subgraph N8N["🔄 n8n Workflow Engine"]
        W0["Voice Analysis Pipeline\n16 nodes · ID: Mhd9wQpiHKMYMIuT"]
    end

    subgraph AI["🤖 AI Services"]
        DG["Deepgram STT\nnova-3 · Thai"]
        STT["LiteLLM STT\ngpt-4o-mini-transcribe"]
        LLM["LiteLLM Analysis\nclaude-sonnet-4-6\nvia models.thcloud.ai"]
    end

    %% Client → App
    BR -->|"HTTP"| APP

    %% Internal wiring
    ROUTES --> LIBS
    CALLBACKS --> LIBS

    %% App ↔ Infrastructure
    L1 <-->|"SQL"| DB
    L2 <-->|"S3 API"| MN

    %% App → n8n
    L3 -->|"Webhook Trigger"| N8N

    %% n8n → App callbacks
    N8N -->|"GET  callback"| CB4
    N8N -->|"POST callback"| CB1
    N8N -->|"POST callback"| CB2
    N8N -->|"POST callback"| CB3
    N8N -->|"POST callback"| CB5

    %% n8n → AI (solid = request)
    N8N -->|"Direct API · sttProvider=deepgram"| DG
    N8N -->|"Direct API Call"| LLM

    %% Callback → LiteLLM STT
    CB1 -->|"via litellm.server · sttProvider=litellm"| STT

    %% AI → n8n/callback (dashed = response)
    DG -.->|"transcript"| N8N
    STT -.->|"transcript"| CB1
    LLM -.->|"analysis JSON"| N8N
```

---

## 2. Database Schema

ตารางหลัก 2 ตาราง — `audio_files` เก็บข้อมูลไฟล์เสียง, `analysis_results` เก็บผลวิเคราะห์ — ความสัมพันธ์แบบ **1-to-many**

```mermaid
erDiagram
    audio_files ||--o{ analysis_results : "has many"

    audio_files {
        uuid id PK
        text filename
        text original_name
        bigint file_size
        float duration
        text mime_type
        text storage_url
        text status
        text error_message
        text n8n_execution_id
        timestamptz created_at
    }

    analysis_results {
        uuid id PK
        uuid audio_file_id FK
        text transcription
        text summary
        text emotion
        float emotion_score
        int satisfaction_score
        boolean illegal_detected
        text illegal_details
        text model_used
        text stt_model_used
        int processing_time_ms
        timestamptz created_at
    }
```

<details>
<summary>📋 ค่าที่เป็นไปได้ของ field สำคัญ</summary>

| Field                      | Values                                       |
| -------------------------- | -------------------------------------------- |
| `audio_files.status`       | `pending` → `processing` → `done` \| `error` |
| `analysis_results.emotion` | `positive` · `neutral` · `negative`          |

</details>

---

## 3. Status Lifecycle

วงจรสถานะของ `audio_files.status` ตั้งแต่ upload จนถึง done หรือ error

```mermaid
stateDiagram-v2
    [*] --> pending : Upload สำเร็จ
    pending --> processing : Trigger analysis
    processing --> done : วิเคราะห์เสร็จ
    processing --> error : Pipeline ล้มเหลว
    error --> processing : Retry
    done --> [*]
```

---

## 4. Data Flow — End-to-End

ขั้นตอนการทำงานทั้งหมด แบ่งเป็น 5 phase

```mermaid
sequenceDiagram
    actor User
    participant App as ⚙️ App Server
    participant DB as 🗄️ Supabase
    participant MinIO as 📦 MinIO
    participant n8n as 🔄 n8n
    participant AI as 🤖 LiteLLM / AI

    rect rgb(30,60,90)
        Note over User,AI: ① Upload
        User->>App: POST /api/upload (audio file)
        App->>MinIO: Upload binary → UUID.ext
        MinIO-->>App: storage_url
        App->>DB: INSERT audio_files (status=pending)
        App-->>User: { audioFileId }
    end

    rect rgb(40,80,60)
        Note over User,AI: ② Trigger Analysis
        User->>App: POST /api/analyze { audioFileId }
        App->>DB: UPDATE status → processing
        App->>n8n: POST webhook/voice-analysis 🔥 fire-and-forget
        App-->>User: 202 { status: processing }
    end

    rect rgb(70,50,30)
        Note over User,AI: ③ n8n Pipeline (background)
        n8n->>App: GET /callback/audio-download-url
        App->>MinIO: Generate presigned URL
        App-->>n8n: { downloadUrl }
        n8n->>MinIO: Download audio
        MinIO-->>n8n: audio binary

        n8n->>App: POST /callback/transcribe-audio
        App->>MinIO: downloadAudio()
        MinIO-->>App: audio buffer
        App->>AI: transcribeAudio() — STT
        AI-->>App: raw transcript
        Note over App: cleanThaiText() + removeRepetitions()
        App-->>n8n: { transcription, sttModel }

        n8n->>AI: POST /chat/completions (analysis)
        AI-->>n8n: { emotion, scores, summary, illegal_* }
    end

    rect rgb(60,30,70)
        Note over User,AI: ④ Save & Cleanup
        n8n->>App: POST /callback/save-analysis
        App->>DB: INSERT analysis_results
        App-->>n8n: { ok, analysisId }

        n8n->>App: POST /callback/status { status: done }
        App->>DB: UPDATE audio_files → done
        App-->>n8n: { ok }

        n8n->>App: POST /callback/delete-audio
        App->>MinIO: deleteAudio()
        App-->>n8n: { ok }
    end

    rect rgb(30,30,70)
        Note over User,AI: ⑤ Client Polling & Display
        loop ทุก 3 วินาที จนกว่า status=done
            User->>App: GET /api/status/:id
            App->>DB: SELECT audio_files + analysis_results
            App-->>User: { status, analysisId? }
        end
        User->>App: GET /analyses/:id (SSR)
        App->>DB: getAudioFileById() + analysis_results
        App-->>User: หน้าผลวิเคราะห์เต็ม
    end
```

---

## 5. Retry Flow

เมื่อวิเคราะห์ล้มเหลว ผู้ใช้สามารถ retry ได้ — ระบบจะลบผลเก่าและเริ่ม pipeline ใหม่

```mermaid
sequenceDiagram
    actor User
    participant App as ⚙️ App Server
    participant DB as 🗄️ Supabase
    participant n8n as 🔄 n8n

    User->>App: POST /api/retry/:id
    App->>DB: ตรวจ status ≠ processing (ถ้าใช่ → 409)
    App->>DB: DELETE analysis_results WHERE audio_file_id = :id
    App->>DB: UPDATE status → processing
    App->>n8n: POST webhook/voice-analysis 🔥
    App-->>User: 202 { status: processing }

    Note over User,n8n: ⚠️ ถ้าไฟล์เสียงถูกลบจาก MinIO แล้ว retry จะ fail<br/>เพราะ downloadAudio() หาไฟล์ไม่เจอ

    Note over User,n8n: หลังจากนี้เข้า Phase ③-⑤ เหมือน analyze ปกติ
```

---

## 6. Internal Module Dependencies

ความสัมพันธ์ระหว่าง route, callback, server library และ shared utility ภายในโปรเจกต์

```mermaid
flowchart TD
    subgraph PAGES["📄 Page Routes — SSR"]
        P1["home.tsx"]
        P2["analyses.tsx"]
        P3["analyses.$id.tsx"]
    end

    subgraph API["🔌 API Routes"]
        A1["api/upload"]
        A2["api/analyze"]
        A3["api/retry/:id"]
        A4["api/status/:id"]
    end

    subgraph CB["📞 Callback Routes — from n8n"]
        C1["audio-download-url · GET"]
        C2["transcribe-audio · POST"]
        C3["save-analysis · POST"]
        C4["status · POST"]
        C5["delete-audio · POST"]
    end

    subgraph LIBS["📦 Server Libraries (.server.ts)"]
        L1["minio.server"]
        L2["supabase.server"]
        L3["n8n.server"]
        L4["litellm.server"]
        L5["analysis.server"]
    end

    subgraph SHARED["🛠️ Shared Utilities"]
        U1["error-utils"]
        U2["logger"]
    end

    %% Page dependencies
    PAGES -->|"reads"| L2

    %% API dependencies
    API --> L1 & L2 & L3
    API --> U1 & U2

    %% Callback dependencies
    CB --> L1 & L2 & L3 & L4
    CB --> U1 & U2

    %% Library cross-dependencies
    L5 --> L1 & L2 & L4
    L5 --> U1 & U2
```

<details>
<summary>📖 สรุป dependency แต่ละกลุ่ม</summary>

| Route Group         | Depends On                                                          |
| ------------------- | ------------------------------------------------------------------- |
| **Pages**           | `supabase.server`                                                   |
| **API Routes**      | `minio` · `supabase` · `n8n` · `error-utils` · `logger`             |
| **Callbacks**       | `minio` · `supabase` · `n8n` · `litellm` · `error-utils` · `logger` |
| **analysis.server** | `minio` · `supabase` · `litellm` · `error-utils` · `logger`         |

</details>
